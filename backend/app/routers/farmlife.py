"""Everyday farm life: animals grouped by place, the soil, and the weekly activity log."""
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import forecast, models, soils, water_need
from ..db import get_db
from ..rbac import check, current_user, farm_role, RANK

router = APIRouter(prefix="/api", tags=["farm-life"])

ActivityKind = Literal["irrigation", "harvest", "spraying", "fertilising", "planting", "maintenance", "animals", "note"]


# ------------------------------------------------------------------ animals grouped by place

def herd_box(h: models.Livestock) -> dict | None:
    """Where the farmer drew this herd's pen on their drawing, or None when it was not drawn."""
    values = (h.box_x, h.box_y, h.box_w, h.box_h)
    return None if any(v is None for v in values) else {"x": h.box_x, "y": h.box_y, "w": h.box_w, "h": h.box_h}


@router.get("/farms/{farm_id}/animals")
def animals(farm_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    """Animals of the same species are one group, listed by the place they are kept (barn, pasture, pen)."""
    check(db, user, farm_id, "farm:read")
    rows = db.scalars(select(models.Livestock).where(models.Livestock.farm_id == farm_id).order_by(models.Livestock.species, models.Livestock.place)).all()
    groups: dict[str, dict] = {}
    for h in rows:
        label, per_head = water_need.LIVESTOCK[h.species]
        g = groups.setdefault(h.species, {"species": h.species, "label": label, "total": 0, "litres_per_day": 0, "places": [],
                                         **models.estimate(f"Aqua estimates {per_head:g} L per animal per day.")})
        g["total"] += h.count
        g["litres_per_day"] += round(per_head * h.count)
        g["places"].append({"herd_id": h.id, "place": h.place, "count": h.count, "box": herd_box(h), **models.attribution(h)})
    out = sorted(groups.values(), key=lambda g: -g["total"])
    return {"groups": out, "total_animals": sum(g["total"] for g in out), "places": sorted({p["place"] for g in out for p in g["places"] if p["place"]})}


# ------------------------------------------------------------------ soil

class SoilIn(BaseModel):
    soil_key: str
    description: str = Field(default="", max_length=600)


@router.get("/soils")
def soil_catalog(_: models.User = Depends(current_user)):
    return {"soils": [soils.soil_card(k) for k in soils.SOILS]}


def _recent_irrigations(db: Session, farm_id: int, days: int = 14) -> int:
    since = models.now() - timedelta(days=days)
    return db.scalar(select(func.count(models.Decision.id)).join(models.Plot, models.Plot.id == models.Decision.plot_id)
                     .where(models.Plot.farm_id == farm_id, models.Decision.action == "irrigate", models.Decision.ts >= since)) or 0


def _latest_moisture(db: Session, farm: models.Farm) -> dict:
    vals = []
    for p in farm.plots:
        r = db.scalar(select(models.Reading).where(models.Reading.plot_id == p.id, models.Reading.soil_moisture.is_not(None)).order_by(models.Reading.ts.desc()).limit(1))
        if r is not None:
            vals.append(r.soil_moisture)
    return {"average_moisture": round(sum(vals) / len(vals), 1) if vals else None, "plots_with_readings": len(vals), "plots": len(farm.plots)}


@router.get("/farms/{farm_id}/soil")
def get_soil(farm_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    """The soil the farmer chose, or a prediction from place, plots and watering. The prediction is always returned so the farmer can compare."""
    check(db, user, farm_id, "farm:read")
    farm = db.get(models.Farm, farm_id)
    fc = forecast.get_forecast(*farm.weather_location)
    daily_rain = [d.get("rain_mm") for d in fc["daily"][:7]] if fc else []
    rain = round(sum(daily_rain), 1) if len(daily_rain) == 7 and all(mm is not None for mm in daily_rain) else None
    predicted = soils.predict(farm.region, farm.lat, farm.lon, [p.soil_type for p in farm.plots], _recent_irrigations(db, farm_id), rain)
    chosen = db.scalar(select(models.FarmSoil).where(models.FarmSoil.farm_id == farm_id))
    live = {**_latest_moisture(db, farm), "rain_next_7_days_mm": rain, "irrigations_last_14_days": _recent_irrigations(db, farm_id), "irrigations_basis": "aqua_recommendations",
            "forecast_source": fc.get("source") if fc else None, "forecast_stale": fc.get("stale", False) if fc else None}
    if chosen and chosen.soil_key in soils.SOILS:
        return {"source": "farmer", "soil": soils.soil_card(chosen.soil_key), "description": chosen.description, "updated_at": models.iso(chosen.updated_at),
                **models.attribution(chosen),
                "notes": soils.predict(farm.region, farm.lat, farm.lon, [soils.SOILS[chosen.soil_key]["texture"]], live["irrigations_last_14_days"], rain)["notes"],
                "predicted": {"soil": soils.soil_card(predicted["key"]), "confidence": predicted["confidence"],
                              **models.estimate("Aqua predicts soil from farm location and recorded farm data.")}, "live": live}
    return {"source": "predicted", "soil": soils.soil_card(predicted["key"]), "confidence": predicted["confidence"], "reasons": predicted["reasons"],
            "notes": predicted["notes"], "governorate": predicted["governorate"], "description": "", "live": live,
            **models.estimate("Aqua predicts soil from farm location and recorded farm data.")}


@router.put("/farms/{farm_id}/soil")
def set_soil(farm_id: int, body: SoilIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    role = check(db, user, farm_id, "water:manage")
    if body.soil_key not in soils.SOILS:
        raise HTTPException(422, "Choose a soil from the list")
    row = db.scalar(select(models.FarmSoil).where(models.FarmSoil.farm_id == farm_id))
    if row is None:
        row = models.FarmSoil(farm_id=farm_id, **models.entered(user, role))
    row.soil_key, row.description = body.soil_key, body.description.strip()
    if row.id is not None and db.is_modified(row):
        row.record_edit(user, role)
    db.add(row); db.commit()
    return get_soil(farm_id, user, db)


@router.delete("/farms/{farm_id}/soil", status_code=204)
def use_prediction(farm_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    """Go back to the automatic prediction."""
    check(db, user, farm_id, "water:manage")
    row = db.scalar(select(models.FarmSoil).where(models.FarmSoil.farm_id == farm_id))
    if row:
        db.delete(row); db.commit()


# ------------------------------------------------------------------ activity log

class ActivityIn(BaseModel):
    kind: ActivityKind = "note"
    title: str = Field(min_length=2, max_length=160)
    detail: str = Field(default="", max_length=800)
    plot_id: int | None = None


def _who(u: models.User | None) -> str | None:
    return (u.name or u.email.split("@")[0]) if u else None


def collect_activity(db: Session, farm_id: int, since: datetime, until: datetime | None = None) -> list[dict]:
    """Everything that happened on the farm in a period: what the system recorded and what people wrote down."""
    until = until or models.now() + timedelta(minutes=1)
    items: list[dict] = []
    plots = {p.id: p.name for p in db.scalars(select(models.Plot).where(models.Plot.farm_id == farm_id)).all()}
    for d in db.scalars(select(models.Decision).where(models.Decision.plot_id.in_(plots), models.Decision.ts >= since, models.Decision.ts < until)).all():
        verb = {"irrigate": "Irrigation advised", "wait": "Waiting advised", "skip": "Skipping irrigation advised", "light": "Light irrigation advised"}.get(d.action, d.action.title())
        items.append({"id": f"decision-{d.id}", "kind": "irrigation", "source": "system", "title": f"{verb} for {plots[d.plot_id]}", "detail": d.why,
                      "at": models.iso(d.ts), "plot": plots[d.plot_id], "who": None, "litres_saved": d.litres_saved,
                      "entered_by": None, "updated_by": None, **models.estimate("Aqua irrigation advice and estimated savings.")})
    dev_ids = [x.id for x in db.scalars(select(models.Device).where(models.Device.farm_id == farm_id)).all()]
    if dev_ids:
        for c in db.scalars(select(models.DeviceCommand).where(models.DeviceCommand.device_id.in_(dev_ids), models.DeviceCommand.created_at >= since,
                                                                 models.DeviceCommand.created_at < until, models.DeviceCommand.action.in_(["on", "off"]))).all():
            what = f"{c.actuator.label}: {c.action} command ({c.status})"
            items.append({"id": f"command-{c.id}", "kind": "irrigation" if c.actuator.kind in ("pump", "valve") else "maintenance", "source": "system", "title": what,
                          "detail": c.result or "", "at": models.iso(c.created_at), "plot": None, "who": _who(c.created_by), "run_s": c.duration_s if c.action == "on" else None,
                          "run_s_basis": "requested_duration", "status": c.status, **models.attribution(c)})
    for t in db.scalars(select(models.Task).where(models.Task.farm_id == farm_id, models.Task.created_at >= since, models.Task.created_at < until)).all():
        items.append({"id": f"task-{t.id}", "kind": "maintenance", "source": "system", "title": f"Task for {t.worker.name}: {t.title}", "detail": t.details or "",
                      "at": models.iso(t.done_at or t.created_at), "plot": t.plot.name if t.plot else None, "who": t.worker.name,
                      "status": t.status, **models.attribution(t)})
    for e in db.scalars(select(models.Engagement).where(models.Engagement.farm_id == farm_id, models.Engagement.created_at >= since, models.Engagement.created_at < until)).all():
        name = e.worker.name or e.worker.email.split("@")[0]
        items.append({"id": f"hire-{e.id}", "kind": "people", "source": "system", "title": f"{name} was hired for {e.title}", "detail": "Full time" if e.kind == "full_time" else "Temporary",
                      "at": models.iso(e.created_at), "plot": None, "who": name, **models.attribution(e)})
        if e.closed_at and since <= e.closed_at.replace(tzinfo=e.closed_at.tzinfo or models.now().tzinfo) < until:
            items.append({"id": f"hire-end-{e.id}", "kind": "people", "source": "system", "title": f"{name} {'finished' if e.status == 'finished' else 'left'}: {e.title}",
                          "detail": e.note or e.reason, "at": models.iso(e.closed_at), "plot": None, "who": name, **models.attribution(e)})
    for a in db.scalars(select(models.Activity).where(models.Activity.farm_id == farm_id, models.Activity.happened_at >= since, models.Activity.happened_at < until)).all():
        items.append({"id": f"note-{a.id}", "kind": a.kind, "source": "manual", "title": a.title, "detail": a.detail, "at": models.iso(a.happened_at),
                      "plot": a.plot.name if a.plot else None, "who": _who(a.user), **models.attribution(a)})
    items.sort(key=lambda i: i["at"], reverse=True)
    return items


@router.get("/farms/{farm_id}/activity")
def activity(farm_id: int, days: int = Query(default=7, ge=1, le=60), user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "farm:read")
    items = collect_activity(db, farm_id, models.now() - timedelta(days=days))
    counts: dict[str, int] = {}
    for i in items:
        counts[i["kind"]] = counts.get(i["kind"], 0) + 1
    return {"days": days, "total": len(items), "counts": counts, "items": items[:300]}


@router.post("/farms/{farm_id}/activity")
def add_activity(farm_id: int, body: ActivityIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    role = farm_role(db, user, farm_id)
    if role is None:
        raise HTTPException(404, "not found")
    if RANK[role] < RANK["technician"]:
        raise HTTPException(403, "needs farm role technician or higher")
    if body.plot_id is not None:
        p = db.get(models.Plot, body.plot_id)
        if not p or p.farm_id != farm_id:
            raise HTTPException(422, "That plot is not on this farm")
    a = models.Activity(farm_id=farm_id, user_id=user.id, plot_id=body.plot_id, kind=body.kind, title=body.title.strip(), detail=body.detail.strip(), **models.entered(user, role))
    db.add(a); db.commit(); db.refresh(a)
    return {"id": f"note-{a.id}", "kind": a.kind, "source": "manual", "title": a.title, "detail": a.detail, "at": models.iso(a.happened_at),
            "plot": a.plot.name if a.plot else None, "who": _who(user), **models.attribution(a)}


@router.delete("/farms/{farm_id}/activity/{note_id}", status_code=204)
def delete_activity(farm_id: int, note_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    role = farm_role(db, user, farm_id)
    a = db.get(models.Activity, note_id)
    if role is None or not a or a.farm_id != farm_id:
        raise HTTPException(404, "not found")
    if RANK[role] < RANK["manager"] and a.user_id != user.id:
        raise HTTPException(403, "only the author or a manager can delete a note")
    db.delete(a); db.commit()
