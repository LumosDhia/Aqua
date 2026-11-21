import base64
import binascii
import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import ai, forecast, models
from ..db import get_db
from ..rbac import check, current_user
from .farms import farm_overview
from .water import water_balance

router = APIRouter(prefix="/api", tags=["chat"])

MAX_FILES = 4
MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_HISTORY = 20
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
TEXT_TYPES = {"text/plain", "text/csv", "text/markdown"}

SYSTEM = """You are the Aqua advisor, a farming assistant for farmers in Tunisia, inside the Aqua water management app.
Answer about irrigation, soil, crops, weather, water sources (well, SONEDE network, rain tank), pests and plant health, using the farm data below. When the farmer has surplus water you can mention that Aqua has a water market where they can list it, and when they are short you can suggest looking there or for a delivery.
Reply in the language the farmer writes in (Tunisian Arabic, Arabic, French, English or Japanese). Be practical, short and concrete. Use short lists when useful.
For photos of plants, describe what you see, give likely causes and say how sure you are. Never claim certainty about a disease from one photo, and suggest asking a local agricultural technician for anything serious (chemical treatments, large losses).
Use only the farm data given. If a value is missing, say so instead of guessing. Do not invent sensor readings.

When the farmer asks you to check what needs doing, or to tell, send or assign work to the workers, put concrete tasks in the `tasks` field of your answer based on the farm data (dry plots, empty tanks, rain to wait for). You do not send anything yourself: the farmer reviews and approves each task. Use only worker names from the list below. If no worker fits, leave worker_name empty. Keep each task short and actionable, and mention in your reply what you proposed and why.

Team work. When the farmer wants the workers to do something, split it the way they say: "divide it" means one task per worker with a different part of the work each; "give each a role" means one task per worker named for that role; "both do the same" or "everyone" means the same task repeated once for each worker. Always one entry in `tasks` per worker, never one task for several workers. Spread work fairly when no split is given.

Changing the farm. You can prepare these changes in the `farm_changes` field, one entry per change: add_animals, set_animals (new total), remove_animals, add_plot (a plant or crop plot), update_plot, remove_plot, add_water_source, set_water_level, set_soil, add_worker, post_job (hire help), invite_worker (invite a person from the people list to one of the farm's open jobs), log_activity, ask_water_seller (message a seller from the water market list below). Use only the exact ids and names given: species ids dairy_cow, beef_cattle, sheep, goat, horse, donkey, camel, pig, chicken, turkey, rabbit; crops tomatoes, peppers, potatoes, olives, wheat, barley, citrus, dates, grapes, almonds; soil ids red_mediterranean, brown_calcareous, alluvial, vertisol, sandy_coastal, gypsum_steppe, saline, saharan_sand, mountain_rendzina; plot soil textures sand, sandy_loam, loam, clay_loam, clay; irrigation drip, sprinkler, flood; water source kinds tank, well, borehole, rain_tank, network, canal. A cow with no more detail is dairy_cow with count 1. Fill in only what the farmer said or what the farm data clearly shows, and never invent numbers: if something needed is missing (for example the area of a new plot), ask in your reply instead of preparing the change. You change nothing yourself: the farmer sees a card for each change and approves it. Say in your reply what you prepared and that it waits for approval. Removing things is allowed only when the farmer clearly asks for it.

Advice on buying water and hiring. When the farmer is short of water or wants water, look at the water market list below and recommend the best listings for their need (price, litres, distance, delivery), naming them exactly, and offer an ask_water_seller change with a short polite message. When the farmer wants to hire help, look at the people list below and recommend the best matches by skills and distance, naming them exactly, and offer an invite_worker change for each good match (use the exact job title from the open jobs list below, and a short friendly message), or a post_job change when there is no suitable open job yet. Use only people and listings from those lists, and say if a list is empty.

Farm data (live):
{context}"""

ANSWER_TOOL = {
    "name": "answer",
    "description": "The advisor's reply, with optional tasks for the farm's workers and optional farm changes. The farmer must approve both before anything happens.",
    "input_schema": {
        "type": "object",
        "properties": {"reply": {"type": "string", "description": "The reply to show the farmer, in the language they wrote in"},
                       "tasks": {"type": "array", "maxItems": 10, "items": {
            "type": "object",
            "properties": {
                "worker_name": {"type": "string", "description": "Exact name from the worker list, or empty"},
                "plot_name": {"type": "string", "description": "Exact plot name, or empty for the whole farm"},
                "title": {"type": "string", "description": "Short instruction, max 120 characters"},
                "details": {"type": "string", "description": "Optional extra detail"},
            },
            "required": ["title"],
        }},
                       "farm_changes": {"type": "array", "maxItems": 10, "items": {
            "type": "object",
            "properties": {
                "kind": {"type": "string", "enum": ["add_animals", "set_animals", "remove_animals", "add_plot", "update_plot", "remove_plot",
                                                    "add_water_source", "set_water_level", "set_soil", "add_worker", "post_job", "invite_worker", "log_activity", "ask_water_seller"]},
                "species": {"type": "string"}, "count": {"type": "integer", "description": "animals to add, or the new total for set_animals"},
                "place": {"type": "string", "description": "barn, pasture, pen or empty"},
                "plot_name": {"type": "string", "description": "exact plot name (update_plot, remove_plot, log_activity) or the name of a new plot (add_plot)"},
                "crop": {"type": "string"}, "area_m2": {"type": "number"}, "irrigation": {"type": "string"}, "soil_texture": {"type": "string"},
                "source_kind": {"type": "string"}, "source_name": {"type": "string", "description": "name of a new water source, or the exact name of an existing one for set_water_level"},
                "capacity_l": {"type": "number"}, "level_l": {"type": "number"}, "refill_l_per_day": {"type": "number"},
                "soil_key": {"type": "string"}, "soil_note": {"type": "string"},
                "worker_name": {"type": "string", "description": "new worker name (add_worker) or the exact name of a person from the people list (invite_worker)"}, "worker_role": {"type": "string"},
                "job_title": {"type": "string"}, "job_description": {"type": "string"}, "job_kind": {"type": "string", "enum": ["task", "period", "long_term"]},
                "job_start": {"type": "string", "description": "YYYY-MM-DD"}, "job_end": {"type": "string", "description": "YYYY-MM-DD"},
                "workers_needed": {"type": "integer"}, "pay_amount": {"type": "number"}, "pay_unit": {"type": "string", "enum": ["hour", "day", "task", "week", "month"]},
                "skills": {"type": "array", "items": {"type": "string"}},
                "activity_kind": {"type": "string", "enum": ["irrigation", "harvest", "spraying", "fertilising", "planting", "maintenance", "animals", "note"]},
                "title": {"type": "string"}, "detail": {"type": "string"},
                "listing_id": {"type": "integer"}, "message": {"type": "string", "description": "message to the water seller"},
            },
            "required": ["kind"],
        }}},
        "required": ["reply"],
    },
}


class Attachment(BaseModel):
    name: str = Field(max_length=200)
    media_type: str
    data: str


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=8000)


class ChatIn(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1)
    attachments: list[Attachment] = []


def _water_context(balance: dict, sources: list[models.WaterSource]) -> list[str]:
    lines = ["Water supply:" if sources else "Water supply: no sources listed yet"]
    for s in sources:
        level = f"{s.level_l:.0f} L stored" if s.level_recorded else "stored level unavailable"
        if s.capacity_l is not None:
            level += f", {s.capacity_l:.0f} L capacity"
        refill = f"refills {s.refill_l_per_day:.0f} L per day" if s.refill_recorded else "refill unavailable"
        lines.append(f"- {s.name} ({s.kind}): {level}, {refill}")
    w, d = balance["horizons"]["week"], balance["horizons"]["today"]
    lines.append(f"Estimated water need: today {d['total_l']:.0f} L, next 7 days {w['total_l']:.0f} L "
                 f"(crops {w['crops_l']:.0f} L, animals {w['animals_l']:.0f} L); supply over 7 days {_metric(w['supply_l'] if w['supply_estimate_available'] else None, '.0f', ' L')}")
    lines.append(f"Water outlook: {balance['verdict']['message']}")
    for p in balance["plots"]:
        lines.append(f"- {p['name']} water plan: {p['soil_label']} soil, irrigate about every {p['interval_days']} days, "
                     f"around {p['per_irrigation_l']:.0f} L each time")
    return lines


def _metric(value: float | None, spec: str, unit: str) -> str:
    return f"{value:{spec}}{unit}" if value is not None else "unavailable"


def _forecast_context(daily: list[dict] | None, alerts: list[dict]) -> list[str]:
    if not daily:
        return ["Forecast: unavailable right now"]
    lines = ["Forecast (next days):"]
    for d in daily[:5]:
        lines.append(f"- {d['date']}: {d['condition']}, {_metric(d['temp_min'], '.0f', ' C')} to "
                     f"{_metric(d['temp_max'], '.0f', ' C')}, rain {_metric(d['rain_mm'], '.1f', ' mm')} "
                     f"({_metric(d['rain_probability'], '.0f', '%')}), wind up to {_metric(d['wind_max_kmh'], '.0f', ' km/h')}")
    lines += [f"Alert {a['date']}: {a['title']}. {a['text']}" for a in alerts[:4]]
    return lines


def _farm_context(overview: dict, workers: list[models.Worker], water: list[str], weather: list[str]) -> str:
    w = overview["weather"]
    lines = [
        f"Farm: {overview['farm']['name']} ({overview['farm']['region'] or 'Tunisia'})",
        "Weather next 24 h: " + ("unavailable" if w.get("error") else
                                 f"max {_metric(w['max_temp'], '.0f', ' C')}, rain chance {_metric(w['rain_prob'], '.0f', '%')}, "
                                 f"rain {_metric(w['rain_mm'], '.1f', ' mm')}, wind up to {_metric(w['max_wind'], '.0f', ' km/h')}"),
        f"Estimated water savings from recommendations: {overview['litres_saved']:.0f} litres",
        "Plots:",
    ]
    for p in overview["plots"]:
        soil = "no reading" if p["soil_moisture"] is None else f"{p['soil_moisture']:.0f}%"
        tank = "n/a" if p["tank_level"] is None else f"{p['tank_level']:.0f}%"
        warn = "; ".join(p["warnings"]) or "none"
        lines.append(f"- {p['name']}: {p['crop_label']}, {p['area_m2']:.0f} m2, {p['irrigation']} irrigation, "
                     f"soil {soil} (target {p['target']}%), tank {tank}, status {p['status']}, warnings: {warn}")
    lines += water + weather
    lines.append("Workers:" if workers else "Workers: none added yet")
    for w in workers:
        lines.append(f"- {w.name}" + (f" ({w.role_label})" if w.role_label else ""))
    return "\n".join(lines)


def _proposed_tasks(tasks: list, workers: list[models.Worker], plots: list[dict]) -> list[dict]:
    by_worker = {w.name.strip().lower(): w for w in workers}
    by_plot = {p["name"].strip().lower(): p for p in plots}
    out: list[dict] = []
    for t in (tasks if isinstance(tasks, list) else [])[:10]:
        if not isinstance(t, dict):
            continue
        title = str(t.get("title", "")).strip()[:200]
        if not title:
            continue
        wname = str(t.get("worker_name", "")).strip()
        pname = str(t.get("plot_name", "")).strip()
        w = by_worker.get(wname.lower())
        p = by_plot.get(pname.lower())
        out.append({"worker_id": w.id if w else None, "worker_name": w.name if w else wname[:120],
                    "plot_id": p["id"] if p else None, "plot_name": p["name"] if p else None,
                    "title": title, "details": str(t.get("details", "")).strip()[:1000]})
    return out


def _num(v, lo: float, hi: float) -> float | None:
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if lo <= x <= hi else None


def _proposed_changes(changes: object, farm_id: int, db: Session, user: models.User) -> list[dict]:
    """Turn the model's farm_changes into approval cards. Nothing is written here. Each card carries the exact request
    (method, path, body) that the web app sends when the farmer approves, so the usual permission and validation
    rules of the normal screens apply, with the farmer's own login. The model never chooses a path: the server builds it."""
    from .. import crops, soils, water_need
    from .jobs import GOVERNORATES
    plots = {p.name.strip().lower(): p for p in db.scalars(select(models.Plot).where(models.Plot.farm_id == farm_id))}
    sources = {x.name.strip().lower(): x for x in db.scalars(select(models.WaterSource).where(models.WaterSource.farm_id == farm_id))}
    farm = db.get(models.Farm, farm_id)
    out: list[dict] = []

    def card(summary: str, method: str, path: str, body: dict | None, danger: bool = False, done: str = "Done") -> None:
        out.append({"kind": "change", "summary": summary, "danger": danger, "done": done,
                    "request": {"method": method, "path": path, "body": body}})

    for c in (changes if isinstance(changes, list) else [])[:10]:
        if not isinstance(c, dict):
            continue
        kind = str(c.get("kind", ""))
        text = lambda k, n=200: str(c.get(k, "") or "").strip()[:n]
        if kind in ("add_animals", "set_animals", "remove_animals"):
            species, place = text("species", 30), text("place", 60)
            if species not in water_need.LIVESTOCK:
                continue
            label = water_need.LIVESTOCK[species][0]
            n = _num(c.get("count"), 1 if kind != "set_animals" else 1, 100_000)
            existing = db.scalar(select(models.Livestock).where(models.Livestock.farm_id == farm_id,
                                                                models.Livestock.species == species, models.Livestock.place == place))
            where = f" in the {place}" if place else ""
            if kind == "remove_animals":
                if not existing:
                    continue
                card(f"Remove all {label.lower()}{where} ({existing.count})", "DELETE", f"/api/farms/{farm_id}/livestock/{existing.id}", None, True, "Removed")
                continue
            if n is None:
                continue
            n = int(n)
            one = label[:-1] if n == 1 and label.endswith("s") and label != "Sheep" else label
            if kind == "set_animals":
                if not existing:
                    card(f"Set {label.lower()}{where} to {n}", "POST", f"/api/farms/{farm_id}/livestock", {"species": species, "count": n, "place": place}, False, "Added")
                else:
                    card(f"Change {label.lower()}{where} from {existing.count} to {n}", "PATCH", f"/api/farms/{farm_id}/livestock/{existing.id}", {"count": n}, False, "Changed")
            elif existing:
                card(f"Add {n} {one.lower()}{where}: {existing.count} now, {existing.count + n} after", "PATCH",
                     f"/api/farms/{farm_id}/livestock/{existing.id}", {"count": existing.count + n}, False, "Added")
            else:
                card(f"Add {n} {one.lower()}{where}", "POST", f"/api/farms/{farm_id}/livestock", {"species": species, "count": n, "place": place}, False, "Added")
        elif kind == "add_plot":
            name, crop = text("plot_name", 120), text("crop", 30).lower()
            area = _num(c.get("area_m2"), 1, 100_000_000)
            if not name or crop not in crops.CROPS or area is None or name.lower() in plots:
                continue
            irr = text("irrigation", 12).lower()
            soil = text("soil_texture", 12).lower()
            body = {"name": name, "crop": crop, "area_m2": area,
                    "irrigation": irr if irr in water_need.IRRIGATION_EFFICIENCY else "drip",
                    "soil_type": soil if soil in ("sand", "sandy_loam", "loam", "clay_loam", "clay") else "loam"}
            card(f"Add plot {name}: {crops.CROPS[crop]['label']}, {area:g} m2, {body['irrigation']} irrigation", "POST", f"/api/farms/{farm_id}/plots", body, False, "Added")
        elif kind in ("update_plot", "remove_plot"):
            plot = plots.get(text("plot_name", 120).lower())
            if not plot:
                continue
            if kind == "remove_plot":
                card(f"Remove plot {plot.name} and everything recorded on it", "DELETE", f"/api/plots/{plot.id}", None, True, "Removed")
                continue
            body = {"name": plot.name, "crop": plot.crop, "area_m2": plot.area_m2, "irrigation": plot.irrigation, "soil_type": plot.soil_type}
            changed = []
            crop = text("crop", 30).lower()
            if crop in crops.CROPS and crop != plot.crop:
                body["crop"] = crop; changed.append(f"crop {crops.CROPS[crop]['label']}")
            area = _num(c.get("area_m2"), 1, 100_000_000)
            if area is not None and area != plot.area_m2:
                body["area_m2"] = area; changed.append(f"area {area:g} m2")
            irr = text("irrigation", 12).lower()
            if irr in water_need.IRRIGATION_EFFICIENCY and irr != plot.irrigation:
                body["irrigation"] = irr; changed.append(f"{irr} irrigation")
            soil = text("soil_texture", 12).lower()
            if soil in ("sand", "sandy_loam", "loam", "clay_loam", "clay") and soil != plot.soil_type:
                body["soil_type"] = soil; changed.append(f"{soil.replace('_', ' ')} soil")
            if changed:
                card(f"Change {plot.name}: " + ", ".join(changed), "PATCH", f"/api/plots/{plot.id}", body, False, "Changed")
        elif kind == "add_water_source":
            from .water import Kind
            name, sk = text("source_name", 120), text("source_kind", 20)
            if not name or sk not in Kind.__args__ or name.lower() in sources:
                continue
            cap, lvl, refill = _num(c.get("capacity_l"), 0, 1e9), _num(c.get("level_l"), 0, 1e9), _num(c.get("refill_l_per_day"), 0, 1e9)
            body = {"kind": sk, "name": name, "capacity_l": cap, "level_l": lvl or 0, "refill_l_per_day": refill or 0,
                    "level_recorded": lvl is not None, "refill_recorded": refill is not None}
            if cap is not None and lvl is not None and lvl > cap:
                continue
            card(f"Add water source {name} ({sk.replace('_', ' ')}" + (f", {cap:g} L" if cap else "") + ")", "POST", f"/api/farms/{farm_id}/water-sources", body, False, "Added")
        elif kind == "set_water_level":
            src = sources.get(text("source_name", 120).lower())
            lvl = _num(c.get("level_l"), 0, 1e9)
            if not src or lvl is None or (src.capacity_l is not None and lvl > src.capacity_l):
                continue
            card(f"Record {src.name} at {lvl:g} L", "PUT", f"/api/farms/{farm_id}/water-sources/{src.id}/level", {"level_l": lvl}, False, "Recorded")
        elif kind == "set_soil":
            key = text("soil_key", 40)
            if key not in soils.SOILS:
                continue
            card(f"Set the farm soil to {soils.SOILS[key]['name']}", "PUT", f"/api/farms/{farm_id}/soil", {"soil_key": key, "description": text("soil_note", 600)}, False, "Saved")
        elif kind == "add_worker":
            name = text("worker_name", 120)
            if not name:
                continue
            card(f"Add worker {name}" + (f" ({text('worker_role', 80)})" if text("worker_role", 80) else ""), "POST", f"/api/farms/{farm_id}/workers",
                 {"name": name, "role_label": text("worker_role", 80)}, False, "Added")
        elif kind == "post_job":
            title, gov = text("job_title", 120), farm.region if farm and farm.region in GOVERNORATES else text("detail", 40)
            jk = text("job_kind", 12) or "task"
            if len(title) < 3 or jk not in ("task", "period", "long_term"):
                continue
            body = {"title": title, "description": text("job_description", 2000), "kind": jk, "workers_needed": int(_num(c.get("workers_needed"), 1, 100) or 1),
                    "skills": [str(x).strip()[:30] for x in (c.get("skills") or []) if str(x).strip()][:8], "governorate": gov, "pay_mode": "negotiable"}
            if body["governorate"] not in GOVERNORATES:
                continue
            for k, src in (("start_date", "job_start"), ("end_date", "job_end")):
                if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text(src, 10)):
                    body[k] = text(src, 10)
            if jk == "period" and not (body.get("start_date") and body.get("end_date")):
                continue
            amt, unit = _num(c.get("pay_amount"), 0.01, 1_000_000), text("pay_unit", 8)
            if amt is not None and unit in ("hour", "day", "task", "week", "month"):
                body.update(pay_mode="fixed", pay_amount=amt, pay_unit=unit)
            card(f"Post a job: {title}" + (f", {body['workers_needed']} workers" if body["workers_needed"] > 1 else "") + f" in {body['governorate']}", "POST", f"/api/farms/{farm_id}/jobs", body, False, "Posted")
        elif kind == "invite_worker":
            from . import discovery
            try:
                people = discovery.candidates(farm_id=farm_id, radius_km=500, job_id=None, kinds="", skills="", q="", limit=100, offset=0, user=user, db=db)["items"]
            except HTTPException:
                continue
            who = next((x for x in people if x["name"].strip().lower() == text("worker_name", 120).lower()), None)
            job = db.scalar(select(models.JobPost).where(models.JobPost.farm_id == farm_id, models.JobPost.status == "open",
                                                         func.lower(models.JobPost.title) == text("job_title", 120).lower()))
            if not who or not job:
                continue
            card(f"Invite {who['name']} to work: {job.title}", "POST", f"/api/farms/{farm_id}/jobs/{job.id}/offers",
                 {"user_id": who["user_id"], "message": text("message", 1000)}, False, "Invited")
        elif kind == "log_activity":
            title = text("title", 160)
            if len(title) < 2:
                continue
            plot = plots.get(text("plot_name", 120).lower())
            ak = text("activity_kind", 14)
            body = {"kind": ak if ak in ("irrigation", "harvest", "spraying", "fertilising", "planting", "maintenance", "animals", "note") else "note",
                    "title": title, "detail": text("detail", 800), "plot_id": plot.id if plot else None}
            card(f"Write in the farm log: {title}", "POST", f"/api/farms/{farm_id}/activity", body, False, "Logged")
        elif kind == "ask_water_seller":
            lid, msg = c.get("listing_id"), text("message", 1000)
            listing = db.get(models.WaterListing, lid) if isinstance(lid, int) else None
            if not listing or listing.status != "active" or listing.farm_id == farm_id or len(msg) < 5:
                continue
            card(f"Message the seller of \"{listing.title}\" ({listing.litres_available:g} L): {msg[:120]}", "POST", f"/api/market/listings/{listing.id}/inquiries", {"message": msg}, False, "Sent")
    return out


def _market_and_people(farm_id: int, user: models.User, db: Session) -> list[str]:
    """Water for sale near the farm and people looking for work near it, for the advisor to recommend from."""
    from fastapi import HTTPException as _HTTP
    from . import discovery, market
    lines: list[str] = []
    try:
        res = market.browse(q="", governorate="", fulfilment="", source="", max_price=None, min_litres=None, sort="distance",
                            near_farm_id=farm_id, limit=8, offset=0, user=user, db=db)
        rows = [i for i in res["items"] if not i.get("is_mine")]
        lines.append("Water market, nearest first:" if rows else "Water market: nothing for sale right now")
        for i in rows:
            price = "free" if i["price_mode"] == "free" else (f"{i['price_per_m3']:g} TND per m3" if i["price_per_m3"] is not None else "price negotiable")
            lines.append(f"- listing_id {i['id']}: \"{i['title']}\", {i['litres_available']:g} L, {price}, {i['governorate']}"
                         + (f", {i['distance_km']} km away" if i.get("distance_km") is not None else "") + f", {i['fulfilment']}")
    except _HTTP:
        pass
    jobs = db.scalars(select(models.JobPost).where(models.JobPost.farm_id == farm_id, models.JobPost.status == "open")).all()
    lines.append("Open jobs of this farm (exact titles):" if jobs else "Open jobs of this farm: none yet")
    lines += [f"- {j.title} ({j.kind}, needs {j.workers_needed})" for j in jobs]
    try:
        res = discovery.candidates(farm_id=farm_id, radius_km=80, job_id=None, kinds="", skills="", q="", limit=8, offset=0, user=user, db=db)
        rows = res["items"]
        lines.append("People looking for work near the farm:" if rows else "People looking for work near the farm: none right now")
        for i in rows:
            who = i.get("user", i)
            lines.append(f"- {who.get('name', i.get('name', '?'))}: {i.get('headline', '')}; skills {', '.join(i.get('skills', [])) or 'not listed'}; "
                         f"{i.get('governorate', '')}" + (f", {i['distance_km']} km away" if i.get("distance_km") is not None else ""))
    except _HTTP:
        pass
    return lines


def _attachment_block(a: Attachment) -> dict:
    try:
        raw = base64.b64decode(a.data, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, f"{a.name}: not valid base64")
    if len(raw) > MAX_FILE_BYTES:
        raise HTTPException(413, f"{a.name} is larger than 5 MB")
    if a.media_type in IMAGE_TYPES:
        return {"type": "image", "source": {"type": "base64", "media_type": a.media_type, "data": a.data}}
    if a.media_type == "application/pdf":
        return {"type": "document", "source": {"type": "base64", "media_type": a.media_type, "data": a.data}}
    if a.media_type in TEXT_TYPES:
        text = raw.decode("utf-8", errors="replace")[:20000]
        return {"type": "text", "text": f"Content of the file {a.name}:\n{text}"}
    raise HTTPException(422, f"{a.name}: unsupported file type")


@router.post("/farms/{farm_id}/chat")
def chat(farm_id: int, body: ChatIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "farm:read")
    if not ai.configured():
        raise HTTPException(503, "Chatbot is not configured: set LLM_API_URL on the server")
    if len(body.attachments) > MAX_FILES:
        raise HTTPException(422, f"At most {MAX_FILES} files per message")
    if body.messages[-1].role != "user":
        raise HTTPException(422, "The last message must be from the user")

    history = body.messages[-MAX_HISTORY:]
    while history and history[0].role != "user":
        history = history[1:]
    earlier = "\n".join(("Farmer: " if m.role == "user" else "Advisor: ") + m.content for m in history[:-1])
    question = history[-1].content or "Please look at the attached file(s)."
    content = [_attachment_block(a) for a in body.attachments]
    content.append({"type": "text", "text": (f"Conversation so far:\n{earlier}\n\n" if earlier else "") + f"The farmer now writes: {question}\n\nWrite the advisor's next reply."})

    overview = farm_overview(farm_id, user, db)
    workers = db.scalars(select(models.Worker).where(models.Worker.farm_id == farm_id).order_by(models.Worker.name)).all()
    sources = db.scalars(select(models.WaterSource).where(models.WaterSource.farm_id == farm_id).order_by(models.WaterSource.name)).all()
    balance = water_balance(farm_id, user, db)
    farm = db.get(models.Farm, farm_id)
    fc = forecast.get_forecast(*farm.weather_location)
    context = _farm_context(overview, workers, _water_context(balance, sources),
                            _forecast_context(fc["daily"] if fc else None, fc["alerts"] if fc else []))
    context += "\n" + "\n".join(_market_and_people(farm_id, user, db))
    system = SYSTEM.format(context=context)
    try:
        out = ai.call_tool(system, content, ANSWER_TOOL)
    except ai.AiUnavailable as e:
        raise HTTPException(502, str(e))
    reply = str(out.get("reply", "")).strip()
    proposed = _proposed_tasks(out.get("tasks"), workers, overview["plots"])
    changes = _proposed_changes(out.get("farm_changes"), farm_id, db, user)
    if not reply:
        reply = "I prepared some changes. Check them below and approve the ones you want." if (proposed or changes) else \
            "I could not produce an answer. Please try again."
    asked = len(out.get("farm_changes") or []) if isinstance(out.get("farm_changes"), list) else 0
    if asked > len(changes):
        n = asked - len(changes)
        reply += f"\n\nNote: {n} of the changes I mentioned could not be prepared because something was missing or does not match the farm, so there is no card for {'it' if n == 1 else 'them'}."
    return {"reply": reply, **({"proposed_tasks": proposed} if proposed else {}),
            **({"proposed_changes": changes} if changes else {})}
