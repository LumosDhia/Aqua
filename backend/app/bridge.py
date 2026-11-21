"""Server-side connection to the stock AquaFarm ESP32 HTTP API."""
import ipaddress
import logging
import threading
import time
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Annotated
from urllib.parse import urlsplit

import httpx
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models
from .config import settings
from .db import SessionLocal

log = logging.getLogger("uvicorn.error").getChild("aquafarm")
BOARD_DURATIONS = (3, 5, 10, 15, 30, 0)
MANUAL_MAX_SEC = 30
HARD_CAP_SEC = 120
TANK_MIN_PCT = 15
SOIL_NEED_PCT = 35
AUTO_REFUSAL = "Auto mode: the system decides. Switch to Manual to use the button"
LOW_TANK_REFUSAL = "Blocked: tank level is too low"
BOARD_TIMEOUT = 2.5
READING_EVERY_SECONDS = 60
STOP_RETRY_SECONDS = 5
PUMP_KEY = "pump1"
lock = threading.RLock()
wake = threading.Event()
_last_reading: dict[int, tuple[int, float]] = {}


def forget_device(device_id: int) -> None:
    _last_reading.pop(device_id, None)

Percent = Annotated[float, Field(strict=True, ge=0, le=100)]
Flag = Annotated[int, Field(strict=True, ge=0, le=1)]


class BoardError(Exception):
    status_code = 502


class BoardUnreachable(BoardError):
    status_code = 503


class BoardRefused(BoardError):
    status_code = 409


class BoardData(BaseModel):
    tank: Percent
    tankFault: Flag
    soil: Percent
    soilRaw: int = Field(strict=True, ge=0)
    soilFault: Flag
    rain: Flag
    rainRaw: int = Field(strict=True, ge=0)
    temp: Annotated[float, Field(strict=True, ge=-40, le=100)] | None
    hum: Percent | None
    pump: Flag
    pumpLeft: int = Field(strict=True, ge=0)
    alarm: Flag
    auto: Flag
    status: str
    sinceWater: int = Field(strict=True, ge=-1)
    tankMin: Percent = TANK_MIN_PCT
    soilNeed: Percent = SOIL_NEED_PCT
    uptime: int = Field(strict=True, ge=0)
    manualMaxSec: int = Field(default=MANUAL_MAX_SEC, strict=True, gt=0)
    hardCapSec: int = Field(default=HARD_CAP_SEC, strict=True, gt=0)
    soilEmergency: Percent | None = None
    pumpMs: int | None = Field(default=None, strict=True, gt=0)
    emergencyMs: int | None = Field(default=None, strict=True, gt=0)
    soakWait: int | None = Field(default=None, strict=True, ge=0)
    hotC: float | None = None
    humidSkip: Percent | None = None
    apSsid: str | None = None
    version: str | None = None


def valid_base_url(url: str) -> str:
    try:
        parsed = urlsplit(url.strip())
        if (parsed.scheme != "http" or not parsed.hostname or parsed.username is not None
                or parsed.path not in ("", "/") or parsed.query or parsed.fragment):
            raise ValueError
        ip = ipaddress.ip_address(parsed.hostname)
        port = parsed.port
        if not ip.is_private or port == 0 or getattr(ip, "scope_id", None):
            raise ValueError
    except ValueError:
        raise ValueError("Use the board's private HTTP address, such as http://192.168.4.1") from None
    host = f"[{ip}]" if ip.version == 6 else str(ip)
    return f"http://{host}" + (f":{port}" if port else "")


@lru_cache(maxsize=4)
def _configured_url(url: str) -> str | None:
    try:
        return valid_base_url(url) if url.strip() else None
    except ValueError as exc:
        log.warning("AquaFarm bridge configuration: %s", exc)
        return None


def configured_url() -> str | None:
    return _configured_url(settings.aquafarm_bridge_url) if settings.aquafarm_bridge_enabled else None


def board_request(base_url: str, method: str, path: str, params: dict | None = None) -> dict:
    try:
        response = httpx.request(method, base_url + path, params=params, timeout=BOARD_TIMEOUT, trust_env=False)
    except httpx.TimeoutException as exc:
        raise BoardUnreachable("The AquaFarm board is unreachable (HTTP timeout)") from exc
    except httpx.RequestError as exc:
        raise BoardUnreachable("The AquaFarm board is unreachable (connection failed)") from exc
    if response.status_code != 200:
        raise BoardError(f"The AquaFarm board returned HTTP {response.status_code} for {path}")
    try:
        data = response.json()
    except ValueError as exc:
        raise BoardError(f"Bad AquaFarm payload from {path} (invalid JSON)") from exc
    if not isinstance(data, dict):
        raise BoardError(f"Bad AquaFarm payload from {path} (expected an object)")
    return data


def read_board(d: models.Device) -> BoardData:
    try:
        return BoardData.model_validate(board_request(d.base_url, "GET", "/data"))
    except ValidationError as exc:
        field = exc.errors()[0]["loc"][0]
        raise BoardError(f"Bad AquaFarm payload from /data (invalid or missing {field})") from exc


def write_board(d: models.Device, path: str, params: dict) -> str:
    reply = board_request(d.base_url, "POST", path, params)
    ok, msg = reply.get("ok"), reply.get("msg")
    if type(ok) is not int or ok not in (0, 1) or not isinstance(msg, str):
        raise BoardError(f"Bad AquaFarm payload from {path} (expected ok and msg)")
    if not ok:
        raise BoardRefused(msg or "The AquaFarm board refused the command")
    return msg


def aware(dt: datetime | None) -> datetime | None:
    # SQLite stores UTC without the timezone.
    return dt if dt is None or dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def pump_limit_s(pump: models.Actuator) -> int:
    data = pump.device.last_data or {}
    return min(pump.max_run_s, MANUAL_MAX_SEC, data.get("manualMaxSec", MANUAL_MAX_SEC), hard_cap_s(pump.device))


def hard_cap_s(d: models.Device) -> int:
    data = d.last_data or {}
    return min(data.get("hardCapSec") or HARD_CAP_SEC, int(settings.aquafarm_pump_max_minutes * 60))


def pump_for(d: models.Device) -> models.Actuator:
    pump = next((a for a in d.actuators if a.key == PUMP_KEY), None)
    if pump is None:
        pump = models.Actuator(key=PUMP_KEY, label="Pump", kind="pump", max_run_s=MANUAL_MAX_SEC)
        d.actuators.append(pump)
    return pump


def set_pump(pump: models.Actuator, on: bool, until: datetime | None = None) -> None:
    state = "on" if on else "off"
    if pump.state != state or pump.state_changed_at is None:
        pump.state, pump.state_changed_at = state, models.now()
    pump.on_until = until


def ingest(db: Session, d: models.Device, data: BoardData) -> None:
    now = models.now()
    pump = pump_for(d)
    was_on = pump.state == "on"
    previous = d.last_data or {}
    d.last_data = data.model_dump()
    deadline = None
    if data.pump:
        # The board reports whole seconds. Leave the final fractional second to its timer.
        runtime = min(data.pumpLeft + 1, hard_cap_s(d))
        deadline = now + timedelta(seconds=runtime)
        new_run = (data.pumpLeft > (previous.get("pumpLeft") or 0) or
                   0 <= data.sinceWater < previous.get("sinceWater", -1))
        if pump.on_until is not None and (not new_run or not was_on):
            deadline = min(aware(pump.on_until), deadline)
    set_pump(pump, bool(data.pump), deadline)
    d.last_seen, d.bridge_online = now, True
    d.status_text, d.alarm, d.mode_auto = data.status[:200], bool(data.alarm), bool(data.auto)
    for name in ("tankFault", "soilFault", "rain", "pump", "alarm", "auto"):
        d.last_data[name] = bool(d.last_data[name])

    last_plot, last_sample = _last_reading.get(d.id, (None, 0))
    save_sample = d.plot_id is not None and (
        d.plot_id != last_plot or was_on != bool(data.pump) or time.monotonic() - last_sample >= READING_EVERY_SECONDS
    )
    if save_sample:
        db.add(models.Reading(
            plot_id=d.plot_id, device_id=d.id, source="device", soil_moisture=None if data.soilFault else data.soil,
            tank_level=None if data.tankFault else data.tank,
            temperature=data.temp, humidity=data.hum, rain=bool(data.rain),
        ))
    db.commit()
    if save_sample:
        _last_reading[d.id] = (d.plot_id, time.monotonic())


def snapshot(db: Session, d: models.Device) -> BoardData:
    try:
        data = read_board(d)
    except BoardError:
        d.bridge_online = False
        db.commit()
        raise
    ingest(db, d, data)
    return data


def finish(c: models.DeviceCommand, status: str, result: str) -> None:
    c.status, c.result, c.finished_at = status, result[:200], models.now()


def refresh_after_command(db: Session, d: models.Device, pump: models.Actuator, *, on: bool) -> None:
    try:
        snapshot(db, d)
    except BoardError as exc:
        # The write succeeded. Keep the last sample marked offline until a read succeeds.
        set_pump(pump, on, pump.on_until if on else None)
        log.warning("AquaFarm %s read after command: %s", d.id, exc)


def stop_board(db: Session, d: models.Device, pump: models.Actuator, *, inhibit_auto: bool, verify: bool = False) -> str:
    if inhibit_auto:
        msg = write_board(d, "/mode", {"auto": 0})  # the firmware stops the pump on every mode change
        data = snapshot(db, d)
        if data.auto or data.pump:
            raise BoardError("The AquaFarm board did not confirm Manual mode with the pump off")
        d.bridge_stop_pending = False
        return msg
    msg = write_board(d, "/pump", {"action": "off"})
    if verify:
        if snapshot(db, d).pump:
            raise BoardError("The AquaFarm board still reports the pump running")
    else:
        refresh_after_command(db, d, pump, on=False)
    return msg


def _service_stop(db: Session, d: models.Device, pump: models.Actuator, reason: str) -> bool:
    c = models.DeviceCommand(device_id=d.id, actuator_id=pump.id, action="off",
                             status="delivered", delivered_at=models.now())
    db.add(c)
    db.commit()
    try:
        msg = stop_board(db, d, pump, inhibit_auto=d.bridge_stop_pending, verify=True)
    except BoardError as exc:
        if not isinstance(exc, BoardRefused):
            d.bridge_online = False
        log.warning("AquaFarm %s %s: %s", d.id, reason, exc)
        finish(c, "failed", f"{reason}: {exc}")
    else:
        log.info("AquaFarm %s %s: %s", d.id, reason, msg)
        finish(c, "done", f"{reason}: {msg}")
    db.commit()
    return c.status == "done"


def poll_once(*, poll: bool = True, retry_stop: bool = True, recover: bool = False, shutting_down: bool = False) -> tuple[float, bool]:
    """Service overdue stops and optionally poll telemetry. Return next stop delay and retry state."""
    url = configured_url()
    if url is None:
        return float("inf"), False
    with lock, SessionLocal() as db:
        d = db.scalar(select(models.Device).where(models.Device.base_url == url).order_by(models.Device.id))
        if d is None:
            return float("inf"), False
        pump = pump_for(d)
        if recover:
            interrupted = db.scalars(select(models.DeviceCommand).where(
                models.DeviceCommand.device_id == d.id,
                models.DeviceCommand.status.in_(("pending", "delivered")),
            ))
            for command in interrupted:
                finish(command, "failed", "The AquaFarm bridge restarted before the command was confirmed")
        db.commit()
        deadline = aware(pump.on_until)
        cutoff = deadline is not None and (shutting_down or deadline <= models.now())
        failed = False
        if (cutoff or d.bridge_stop_pending) and retry_stop:
            reason = "Stop everything retry" if d.bridge_stop_pending else "Server pump cutoff"
            if shutting_down and not d.bridge_stop_pending:
                reason = "Bridge shutdown"
            failed = not _service_stop(db, d, pump, reason)
        # Leave time for the stop when another HTTP request could overrun the deadline.
        if poll and (cutoff or deadline is None or (deadline - models.now()).total_seconds() > BOARD_TIMEOUT):
            try:
                data = snapshot(db, d)
            except BoardError as exc:
                log.warning("AquaFarm %s poll: %s", d.id, exc)
            else:
                log.info("AquaFarm %s poll: tank=%s%% soil=%s%% pump=%s auto=%s",
                         d.id, data.tank, data.soil, bool(data.pump), bool(data.auto))
        deadline = aware(pump.on_until)
        delay = (deadline - models.now()).total_seconds() if deadline else float("inf")
        if d.bridge_stop_pending:
            delay = 0
        return max(0, delay), failed


def _loop(stop: threading.Event) -> None:
    next_poll = next_retry = 0.0
    recover = True
    while not stop.is_set():
        wake.clear()
        now = time.monotonic()
        poll = now >= next_poll
        try:
            delay, failed = poll_once(poll=poll, retry_stop=now >= next_retry, recover=recover)
            recover = False
        except Exception:
            log.exception("AquaFarm bridge worker failed")
            wake.wait(STOP_RETRY_SECONDS)
            continue
        now = time.monotonic()
        if poll:
            next_poll = now + settings.aquafarm_bridge_interval
        if failed:
            next_retry = now + STOP_RETRY_SECONDS
        stop_delay = max(delay, next_retry - now)
        wake.wait(max(0, min(next_poll - now, stop_delay)))

    try:
        poll_once(poll=False, shutting_down=True)
    except Exception:
        log.exception("AquaFarm bridge shutdown stop failed")


def start() -> tuple[threading.Event, threading.Thread] | None:
    if configured_url() is None:
        return None
    stop = threading.Event()
    worker = threading.Thread(target=_loop, args=(stop,), name="aquafarm-bridge")
    worker.start()
    return stop, worker
