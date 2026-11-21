import asyncio
import hashlib
import secrets
import time
from contextlib import nullcontext
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import bridge, models
from ..config import settings
from ..db import get_db
from ..rbac import farm_role, PERMS, RANK, check, current_user

router = APIRouter(prefix="/api", tags=["devices"])

ONLINE_SECONDS = 90
COMMAND_TTL_S = 120
DEFAULT_RUN_S = 600
LOW_TANK_PERCENT = 10
KINDS = {"pump", "valve", "light", "fan", "relay"}


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _aware(dt: datetime | None) -> datetime | None:
    return dt if dt is None or dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def is_online(d: models.Device) -> bool:
    seen = _aware(d.last_seen)
    if d.base_url:
        if bridge.configured_url() != d.base_url or not d.bridge_online:
            return False
        limit = 2 * settings.aquafarm_bridge_interval + bridge.BOARD_TIMEOUT
    else:
        limit = ONLINE_SECONDS
    return bool(seen) and (models.now() - seen).total_seconds() <= limit


def _state(a: models.Actuator) -> str:
    until = _aware(a.on_until)
    if a.state == "on" and until and until < datetime.now(timezone.utc):
        return "off"
    return a.state


def actuator_out(a: models.Actuator, local: bool = False) -> dict:
    state = a.state if local else _state(a)
    maximum = bridge.pump_limit_s(a) if local else a.max_run_s
    durations = list(bridge.BOARD_DURATIONS) if local else None
    until = _aware(a.on_until)
    if local and state == "on":
        data = a.device.last_data or {}
        remaining = data.get("pumpLeft")
        seen = _aware(a.device.last_seen)
        until = seen + timedelta(seconds=remaining) if data.get("pump") and type(remaining) is int and remaining > 0 and seen else None
        if until and until <= models.now():
            until = None
    return {"durations": durations, "id": a.id, "key": a.key, "label": a.label, "kind": a.kind, "state": state,
            "on_until": models.iso(until) if state == "on" else None, "max_run_s": maximum,
            "state_changed_at": models.iso(a.state_changed_at), **models.attribution(a)}


def device_out(d: models.Device) -> dict:
    data = d.last_data
    if d.base_url and data is not None:
        data = {"tankMin": bridge.TANK_MIN_PCT, "soilNeed": bridge.SOIL_NEED_PCT, **data}
    return {"id": d.id, "name": d.name, "plot_id": d.plot_id, "plot_name": d.plot.name if d.plot else None,
            "firmware": d.firmware, "ip": d.ip, "rssi": d.rssi, "online": is_online(d),
            "last_seen": models.iso(d.last_seen), "token_hint": d.token_hint, "created_at": models.iso(d.created_at),
            "connection": "local" if d.base_url else "push", "base_url": d.base_url, "mode_auto": d.mode_auto,
            "status_text": d.status_text, "alarm": d.alarm, "data": data, **models.attribution(d),
            "actuators": [actuator_out(a, bool(d.base_url)) for a in sorted(d.actuators, key=lambda x: x.key)]}


def command_out(c: models.DeviceCommand) -> dict:
    return {"id": c.id, "device_id": c.device_id, "actuator_id": c.actuator_id, "actuator": c.actuator.label,
            "action": {"aut": "auto", "man": "manual"}.get(c.action, c.action), "duration_s": c.duration_s, "status": c.status, "result": c.result,
            "created_by": (c.created_by.name or c.created_by.email) if c.created_by else None,
            "created_at": models.iso(c.created_at), "delivered_at": models.iso(c.delivered_at),
            "finished_at": models.iso(c.finished_at), **models.attribution(c)}


# ---------------------------------------------------------------- device side (secret token)

def device_auth(x_device_token: str = Header(default=""), db: Session = Depends(get_db)) -> models.Device:
    d = db.scalar(select(models.Device).where(models.Device.token_hash == hash_token(x_device_token))) if x_device_token else None
    if not d or d.base_url:
        raise HTTPException(401, "bad device token")
    return d


def touch(db: Session, d: models.Device, **extra) -> None:
    d.last_seen = models.now()
    for k, v in extra.items():
        if v is not None:
            setattr(d, k, v)
    db.commit()


class HelloActuator(BaseModel):
    key: str = Field(min_length=1, max_length=30, pattern=r"^[A-Za-z0-9_-]+$")
    label: str = Field(default="", max_length=80)
    kind: str = "relay"
    state: Literal["on", "off"] = "off"


class HelloIn(BaseModel):
    firmware: str = Field(default="", max_length=40)
    rssi: int | None = Field(default=None, ge=-120, le=0)
    ip: str = Field(default="", max_length=45)
    actuators: list[HelloActuator] = Field(default=[], max_length=16)


class DeviceReadingIn(BaseModel):
    soil_moisture: float | None = Field(default=None, ge=0, le=100)
    tank_level: float | None = Field(default=None, ge=0, le=100)
    temperature: float | None = Field(default=None, ge=-40, le=100)


class AckIn(BaseModel):
    status: Literal["done", "failed"]
    result: str = Field(default="", max_length=200)


@router.post("/device/hello")
def hello(body: HelloIn, d: models.Device = Depends(device_auth), db: Session = Depends(get_db)):
    existing = {a.key: a for a in d.actuators}
    for item in body.actuators:
        a = existing.get(item.key)
        if a is None:
            a = models.Actuator(device_id=d.id, key=item.key, label=item.label or item.key,
                                kind=item.kind if item.kind in KINDS else "relay")
            db.add(a)
        a.state = item.state
        a.state_changed_at = models.now()
        if item.state == "off":
            a.on_until = None
    touch(db, d, firmware=body.firmware or None, rssi=body.rssi, ip=body.ip or None)
    return {"device_id": d.id, "name": d.name, "server_time": datetime.now(timezone.utc).isoformat(), "poll_wait_s": 20}


@router.post("/device/readings")
def device_readings(body: DeviceReadingIn, d: models.Device = Depends(device_auth), db: Session = Depends(get_db)):
    if d.plot_id is None:
        raise HTTPException(409, "Link this device to a plot first")
    db.add(models.Reading(plot_id=d.plot_id, device_id=d.id, source="device", **body.model_dump()))
    touch(db, d)
    return {"ok": True}


@router.get("/device/commands")
async def poll_commands(wait: int = Query(default=0, ge=0, le=25), d: models.Device = Depends(device_auth),
                        db: Session = Depends(get_db)):
    touch(db, d)
    deadline = time.monotonic() + wait
    while True:
        db.expire_all()
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=COMMAND_TTL_S)
        pending = db.scalars(select(models.DeviceCommand).where(
            models.DeviceCommand.device_id == d.id, models.DeviceCommand.status == "pending")
            .order_by(models.DeviceCommand.id)).all()
        fresh = []
        for c in pending:
            if _aware(c.created_at) < cutoff:
                c.status, c.result, c.finished_at = "expired", "The device did not collect it in time", models.now()
            else:
                fresh.append(c)
        db.commit()
        if fresh or time.monotonic() >= deadline:
            break
        await asyncio.sleep(1)
    for c in fresh:
        c.status, c.delivered_at = "delivered", models.now()
    touch(db, d)
    return {"commands": [{"id": c.id, "actuator": c.actuator.key, "action": c.action, "duration_s": c.duration_s} for c in fresh]}


@router.post("/device/commands/{command_id}/ack")
def ack(command_id: int, body: AckIn, d: models.Device = Depends(device_auth), db: Session = Depends(get_db)):
    c = db.get(models.DeviceCommand, command_id)
    if not c or c.device_id != d.id:
        raise HTTPException(404, "not found")
    if c.status not in ("pending", "delivered"):
        raise HTTPException(409, f"The command is already {c.status}")
    c.status, c.result, c.finished_at = body.status, body.result, models.now()
    if body.status == "done":
        a = c.actuator
        a.state, a.state_changed_at = c.action, models.now()
        a.on_until = models.now() + timedelta(seconds=c.duration_s) if c.action == "on" and c.duration_s else None
    touch(db, d)
    return {"ok": True}


# ---------------------------------------------------------------- user side

class DeviceIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    plot_id: int | None = None
    base_url: str | None = Field(default=None, max_length=200)


class ModeIn(BaseModel):
    auto: bool


def _clean_url(url: str | None) -> str | None:
    if not url:
        return None
    try:
        return bridge.valid_base_url(url)
    except ValueError as e:
        raise HTTPException(422, str(e))


def _check_board_registration(db: Session, url: str, device_id: int | None = None) -> None:
    pinned = bridge.configured_url()
    if pinned and pinned != url:
        raise HTTPException(422, f"This server only talks to the board at {pinned}")
    other = db.scalar(select(models.Device.id).where(models.Device.base_url == url, models.Device.id != device_id))
    if other is not None:
        raise HTTPException(409, "This AquaFarm board address is already registered")


class ActuatorPatch(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    max_run_s: int = Field(ge=10, le=14400)


class CommandIn(BaseModel):
    action: Literal["on", "off"]
    duration_s: int | None = None


def _plot_ok(db: Session, farm_id: int, plot_id: int | None) -> None:
    if plot_id is not None:
        p = db.get(models.Plot, plot_id)
        if not p or p.farm_id != farm_id:
            raise HTTPException(404, "plot not found")


def _device(db: Session, farm_id: int, device_id: int) -> models.Device:
    d = db.get(models.Device, device_id)
    if not d or d.farm_id != farm_id:
        raise HTTPException(404, "not found")
    return d


def _new_token() -> str:
    return "aqd_" + secrets.token_urlsafe(32)


@router.get("/farms/{farm_id}/board-address")
def board_address(farm_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "farm:read")
    return {"url": bridge.configured_url()}


@router.get("/farms/{farm_id}/devices")
def list_devices(farm_id: int, live: bool = False, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "farm:read")
    url = bridge.configured_url() if live else None
    with bridge.lock if url else nullcontext():
        rows = db.scalars(select(models.Device).where(models.Device.farm_id == farm_id).order_by(models.Device.name)).all()
        if url:
            for d in rows:
                if d.base_url != url:
                    continue
                seen = _aware(d.last_seen)
                if not d.bridge_online or seen is None or (models.now() - seen).total_seconds() >= 1:
                    try:
                        bridge.snapshot(db, d)
                    except bridge.BoardError:
                        pass  # the response includes the last known telemetry and marks the board offline
                    finally:
                        bridge.wake.set()
        return [device_out(d) for d in rows]


@router.post("/farms/{farm_id}/devices")
def add_device(farm_id: int, body: DeviceIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    role = check(db, user, farm_id, "device:manage")
    _plot_ok(db, farm_id, body.plot_id)
    token = _new_token()
    url = _clean_url(body.base_url)
    with bridge.lock:
        if url:
            _check_board_registration(db, url)
        d = models.Device(farm_id=farm_id, plot_id=body.plot_id, name=body.name.strip(), base_url=url,
                          token_hash=hash_token(token), token_hint=token[-4:], **models.entered(user, role))
        if url:
            bridge.pump_for(d)
        db.add(d)
        db.commit()
        if url:
            bridge.wake.set()
        return {**device_out(d), **({} if url else {"token": token})}


@router.patch("/farms/{farm_id}/devices/{device_id}")
def edit_device(farm_id: int, device_id: int, body: DeviceIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    role = check(db, user, farm_id, "device:manage")
    with bridge.lock:
        d = _device(db, farm_id, device_id)
        _plot_ok(db, farm_id, body.plot_id)
        d.name, d.plot_id = body.name.strip(), body.plot_id
        if d.base_url:
            url = _clean_url(body.base_url) or d.base_url
            if url != d.base_url:
                _check_board_registration(db, url, d.id)
                if d.bridge_stop_pending or any(a.on_until for a in d.actuators):
                    raise HTTPException(409, "Stop the pump before changing the board address")
                d.base_url = url
                d.bridge_online, d.last_seen, d.last_data, d.mode_auto = False, None, None, None
                d.status_text, d.alarm = "", False
        if db.is_modified(d):
            d.record_edit(user, role)
        db.commit()
        return device_out(d)


@router.post("/farms/{farm_id}/devices/{device_id}/rotate-token")
def rotate_token(farm_id: int, device_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    role = check(db, user, farm_id, "device:manage")
    d = _device(db, farm_id, device_id)
    if d.base_url:
        raise HTTPException(409, "This board is read by the server directly and has no key")
    token = _new_token()
    d.token_hash, d.token_hint = hash_token(token), token[-4:]
    d.record_edit(user, role)
    db.commit(); db.refresh(d)
    return {**device_out(d), "token": token}


@router.delete("/farms/{farm_id}/devices/{device_id}", status_code=204)
def delete_device(farm_id: int, device_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "device:manage")
    with bridge.lock:
        d = _device(db, farm_id, device_id)
        if d.base_url and (d.bridge_stop_pending or any(a.on_until for a in d.actuators)):
            raise HTTPException(409, "Confirm the pump has stopped before removing the board")
        db.delete(d)
        db.commit()
        bridge.forget_device(device_id)


@router.patch("/farms/{farm_id}/devices/{device_id}/actuators/{actuator_id}")
def edit_actuator(farm_id: int, device_id: int, actuator_id: int, body: ActuatorPatch,
                  user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    role = check(db, user, farm_id, "device:manage")
    with bridge.lock:
        d = _device(db, farm_id, device_id)
        a = next((x for x in d.actuators if x.id == actuator_id), None)
        if not a:
            raise HTTPException(404, "not found")
        a.label, a.max_run_s = body.label.strip(), body.max_run_s
        if d.base_url and a.on_until and a.state_changed_at:
            a.on_until = min(_aware(a.on_until), _aware(a.state_changed_at) + timedelta(seconds=bridge.pump_limit_s(a)))
            bridge.wake.set()
        if db.is_modified(a):
            a.record_edit(user, role)
        db.commit()
        return actuator_out(a, bool(d.base_url))


def _queue(db: Session, user: models.User, d: models.Device, a: models.Actuator, action: str, duration: int | None) -> models.DeviceCommand:
    db.flush()
    for old in db.scalars(select(models.DeviceCommand).where(
            models.DeviceCommand.actuator_id == a.id, models.DeviceCommand.status == "pending")).all():
        old.status, old.result, old.finished_at = "cancelled", "Replaced by a newer command", models.now()
    c = models.DeviceCommand(device_id=d.id, actuator_id=a.id, action=action, duration_s=duration, **models.entered(user, farm_role(db, user, d.farm_id)))
    db.add(c); db.flush()
    return c


@router.post("/farms/{farm_id}/devices/{device_id}/actuators/{actuator_id}/command")
def send_command(farm_id: int, device_id: int, actuator_id: int, body: CommandIn,
                 user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "device:control")
    d = _device(db, farm_id, device_id)
    if d.base_url:
        with bridge.lock:
            db.expire_all()
            d = _device(db, farm_id, device_id)
            pump = bridge.pump_for(d)
            if pump.id != actuator_id:
                raise HTTPException(404, "not found")
            duration = body.duration_s if body.duration_s is not None else 5
            duration = max(0, min(duration, bridge.MANUAL_MAX_SEC)) if body.action == "on" else None
            c = _queue(db, user, d, pump, body.action, duration)
            _run_on_board(db, d, pump, c)
            return command_out(c)

    a = next((x for x in d.actuators if x.id == actuator_id), None)
    if not a:
        raise HTTPException(404, "not found")
    if body.duration_s is not None and body.duration_s < 5:
        raise HTTPException(422, "Duration must be at least 5 seconds")
    if body.duration_s is not None and body.duration_s > 14400:
        raise HTTPException(422, "Duration must be at most 14400 seconds")
    if not is_online(d):
        raise HTTPException(409, "The device is offline, so it cannot get the command")
    duration = None
    if body.action == "on":
        duration = body.duration_s or min(DEFAULT_RUN_S, a.max_run_s)
        if duration > a.max_run_s:
            raise HTTPException(422, f"The longest run for {a.label} is {a.max_run_s // 60} minutes")
        if a.kind == "pump" and d.plot_id:
            last = db.scalars(select(models.Reading).where(models.Reading.plot_id == d.plot_id)
                              .order_by(models.Reading.ts.desc()).limit(1)).first()
            tank = last.tank_level if last else None
            if tank is not None and tank < LOW_TANK_PERCENT:
                raise HTTPException(409, f"The tank is almost empty ({tank:.0f}%), the pump is blocked")
    c = _queue(db, user, d, a, body.action, duration)
    db.commit()
    return command_out(c)


def _local_available(d: models.Device) -> None:
    if bridge.configured_url() != d.base_url:
        raise bridge.BoardUnreachable("The AquaFarm bridge is disabled or this address is not configured")


def _delivered(db: Session, c: models.DeviceCommand) -> None:
    c.status, c.delivered_at = "delivered", models.now()
    db.commit()


def _fail_on_board(db: Session, d: models.Device, c: models.DeviceCommand, exc: bridge.BoardError) -> None:
    if not isinstance(exc, bridge.BoardRefused):
        d.bridge_online = False
    bridge.finish(c, "failed", str(exc))
    db.commit()
    raise HTTPException(exc.status_code, str(exc))


def _run_on_board(db: Session, d: models.Device, pump: models.Actuator, c: models.DeviceCommand) -> None:
    starting = c.action == "on"
    previous_deadline = pump.on_until
    try:
        _local_available(d)
        if starting:
            if d.bridge_stop_pending:
                raise bridge.BoardRefused("Stop everything is awaiting board confirmation")
            data = bridge.snapshot(db, d)
            previous_deadline = pump.on_until
            if data.auto:
                raise bridge.BoardRefused(bridge.AUTO_REFUSAL)
            if data.tank < data.tankMin:
                raise bridge.BoardRefused(bridge.LOW_TANK_REFUSAL)
            if c.duration_s > 0:
                c.duration_s = min(c.duration_s, bridge.pump_limit_s(pump))
            run_seconds = c.duration_s or bridge.hard_cap_s(d)
            # Persist the watchdog before sending ON, even if the reply or API process is lost.
            pump.on_until = models.now() + timedelta(seconds=run_seconds)
        _delivered(db, c)
        if starting:
            msg = bridge.write_board(d, "/pump", {"action": "on", "sec": c.duration_s})
            # The board starts when it handles the write. An acknowledged run gets its full duration.
            pump.on_until = models.now() + timedelta(seconds=run_seconds)
            bridge.refresh_after_command(db, d, pump, on=True)
        else:
            msg = bridge.stop_board(db, d, pump, inhibit_auto=False)
    except bridge.BoardError as exc:
        if starting and c.delivered_at is not None:
            # An unacknowledged start may still have reached the board. Stop it in the worker.
            pump.on_until = previous_deadline if isinstance(exc, bridge.BoardRefused) else models.now()
        elif not starting and c.delivered_at is not None and not isinstance(exc, bridge.BoardRefused):
            pump.on_until = models.now()
        _fail_on_board(db, d, c, exc)
    else:
        bridge.finish(c, "done", msg)
        db.commit()
    finally:
        bridge.wake.set()


@router.post("/farms/{farm_id}/devices/{device_id}/mode")
def set_mode(farm_id: int, device_id: int, body: ModeIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "device:mode")
    with bridge.lock:
        d = _device(db, farm_id, device_id)
        if not d.base_url:
            raise HTTPException(409, "This device has no auto or manual mode")
        pump = bridge.pump_for(d)
        c = _queue(db, user, d, pump, "aut" if body.auto else "man", None)
        try:
            _local_available(d)
            if d.bridge_stop_pending:
                raise bridge.BoardRefused("Stop everything is awaiting board confirmation")
            _delivered(db, c)
            msg = bridge.write_board(d, "/mode", {"auto": int(body.auto)})
            d.mode_auto = body.auto
            pump.on_until = None
            bridge.refresh_after_command(db, d, pump, on=False)
        except bridge.BoardError as exc:
            if body.auto and c.delivered_at is not None and not isinstance(exc, bridge.BoardRefused):
                d.bridge_stop_pending = True
            _fail_on_board(db, d, c, exc)
        else:
            bridge.finish(c, "done", msg)
            db.commit()
        finally:
            bridge.wake.set()
        return {**device_out(d), "message": msg}


@router.post("/farms/{farm_id}/devices/stop-all")
def stop_all(farm_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    role = check(db, user, farm_id, "device:control")
    can_mode = RANK[role] >= RANK[PERMS["device:mode"]]  # Stop-all also flips boards to Manual: only those who may switch mode
    sent = 0
    failure = None
    with bridge.lock:
        for d in db.scalars(select(models.Device).where(models.Device.farm_id == farm_id)).all():
            if not d.base_url:
                for a in d.actuators:
                    if _state(a) == "on":
                        _queue(db, user, d, a, "off", None)
                        sent += 1
                continue
            pump = bridge.pump_for(d)
            c = _queue(db, user, d, pump, "off", None)
            try:
                _local_available(d)
                d.bridge_stop_pending = d.bridge_stop_pending or can_mode
                _delivered(db, c)
                msg = bridge.stop_board(db, d, pump, inhibit_auto=can_mode)
            except bridge.BoardError as exc:
                if not isinstance(exc, bridge.BoardRefused):
                    d.bridge_online = False
                bridge.finish(c, "failed", str(exc))
                failure = f"Stop unconfirmed for {d.name}. {exc}"
            else:
                bridge.finish(c, "done", msg)
                sent += 1
            db.commit()
        db.commit()
        bridge.wake.set()
    if failure:
        raise HTTPException(503, failure)
    return {"stopping": sent}


@router.get("/farms/{farm_id}/devices/{device_id}/commands")
def command_history(farm_id: int, device_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "farm:read")
    _device(db, farm_id, device_id)
    rows = db.scalars(select(models.DeviceCommand).where(models.DeviceCommand.device_id == device_id)
                      .order_by(models.DeviceCommand.id.desc()).limit(50)).all()
    return [command_out(c) for c in rows]
