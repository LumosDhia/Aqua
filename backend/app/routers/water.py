from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import forecast, models, water_need
from ..db import get_db
from ..crops import CROPS
from ..rbac import check, current_user

router = APIRouter(prefix="/api", tags=["water"])

Kind = Literal["tank", "well", "borehole", "rain_tank", "network", "canal"]


class SourceIn(BaseModel):
    kind: Kind
    name: str = Field(min_length=1, max_length=120)
    capacity_l: float | None = Field(default=None, ge=0, le=1e9)
    level_l: float = Field(default=0, ge=0, le=1e9)
    refill_l_per_day: float = Field(default=0, ge=0, le=1e9)
    notes: str = Field(default="", max_length=300)
    level_recorded: bool = True
    refill_recorded: bool = True


class LevelIn(BaseModel):
    level_l: float = Field(ge=0, le=1e9)


def _source_values(body: SourceIn, existing: models.WaterSource | None = None) -> dict[str, object]:
    values = body.model_dump()
    for key in ("level", "refill"):
        field = "level_l" if key == "level" else "refill_l_per_day"
        flag = f"{key}_recorded"
        if field not in body.model_fields_set:
            values[field] = getattr(existing, field) if existing else 0
            values[flag] = bool(existing and getattr(existing, flag) and values[flag])
    values.update(name=body.name.strip(), notes=body.notes.strip())
    return values


def _validate_level(capacity: float | None, level: float) -> None:
    if capacity is not None and level > capacity:
        raise HTTPException(422, "The level cannot be higher than the capacity")


def source_out(s: models.WaterSource) -> dict:
    fill = None if not s.capacity_l or not s.level_recorded else round(min(100.0, s.level_l / s.capacity_l * 100), 1)
    level_actor = models.actor_out(s.level_recorder, s.level_at, s.level_by_role) if s.level_recorded else None
    return {"id": s.id, "kind": s.kind, "name": s.name, "capacity_l": s.capacity_l,
            "level_l": s.level_l, "refill_l_per_day": s.refill_l_per_day,
            "recorded_level_l": s.level_l if s.level_recorded else None,
            "recorded_refill_l_per_day": s.refill_l_per_day if s.refill_recorded else None,
            "notes": s.notes, "fill_percent": fill,
            "level_recorded": s.level_recorded, "refill_recorded": s.refill_recorded,
            "level_entered_by": level_actor,
            "updated_at": models.iso(s.updated_at), **models.attribution(s),
            **models.estimate("Aqua calculates fill percentage from the recorded level and capacity.")}


def sources_summary(sources: list[models.WaterSource]) -> dict:
    return {"total_stored_l": round(sum(s.level_l for s in sources if s.level_recorded), 1),
            "total_capacity_l": round(sum(s.capacity_l for s in sources if s.capacity_l is not None), 1),
            "total_refill_l_per_day": round(sum(s.refill_l_per_day for s in sources if s.refill_recorded), 1),
            "count": len(sources)}


def _get(db: Session, farm_id: int, source_id: int) -> models.WaterSource:
    s = db.get(models.WaterSource, source_id)
    if not s or s.farm_id != farm_id:
        raise HTTPException(404, "not found")
    return s


@router.get("/farms/{farm_id}/water-sources")
def list_sources(farm_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "farm:read")
    rows = db.scalars(select(models.WaterSource).where(models.WaterSource.farm_id == farm_id)
                      .order_by(models.WaterSource.name)).all()
    return {"sources": [source_out(s) for s in rows], "summary": sources_summary(rows),
            "measurement_coverage": {"levels": sum(s.level_recorded for s in rows),
                                     "refills": sum(s.refill_recorded for s in rows),
                                     "capacities": sum(s.capacity_l is not None for s in rows)}}


@router.post("/farms/{farm_id}/water-sources")
def add_source(farm_id: int, body: SourceIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    role = check(db, user, farm_id, "water:manage")
    _validate_level(body.capacity_l, body.level_l)
    s = models.WaterSource(farm_id=farm_id, **_source_values(body), **models.entered(user, role))
    s.record_level(user, role)
    db.add(s); db.commit(); db.refresh(s)
    return source_out(s)


@router.patch("/farms/{farm_id}/water-sources/{source_id}")
def edit_source(farm_id: int, source_id: int, body: SourceIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    role = check(db, user, farm_id, "water:manage")
    s = _get(db, farm_id, source_id)
    values = _source_values(body, s)
    old_level = (s.level_l, s.level_recorded)
    for k, v in values.items():
        setattr(s, k, v)
    if s.level_recorded:
        _validate_level(s.capacity_l, s.level_l)
    if old_level != (s.level_l, s.level_recorded):
        s.record_level(user, role)
    if db.is_modified(s):
        s.record_edit(user, role)
    db.commit(); db.refresh(s)
    return source_out(s)


@router.put("/farms/{farm_id}/water-sources/{source_id}/level")
def set_level(farm_id: int, source_id: int, body: LevelIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    role = check(db, user, farm_id, "water:update")
    s = _get(db, farm_id, source_id)
    _validate_level(s.capacity_l, body.level_l)
    s.level_l, s.level_recorded = body.level_l, True
    s.record_level(user, role)
    s.record_edit(user, role, at=s.level_at)
    db.commit(); db.refresh(s)
    return source_out(s)


@router.delete("/farms/{farm_id}/water-sources/{source_id}", status_code=204)
def delete_source(farm_id: int, source_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "water:manage")
    db.delete(_get(db, farm_id, source_id)); db.commit()


Species = Literal["dairy_cow", "beef_cattle", "sheep", "goat", "horse", "donkey", "camel", "pig", "chicken", "turkey", "rabbit"]


class HerdIn(BaseModel):
    species: Species
    count: int = Field(ge=1, le=1_000_000)
    place: str = Field(default="", max_length=60)


class HerdPatch(BaseModel):
    count: int = Field(ge=1, le=1_000_000)
    place: str | None = Field(default=None, max_length=60)


def herd_out(h: models.Livestock) -> dict:
    label, per_head = water_need.LIVESTOCK[h.species]
    return {"id": h.id, "species": h.species, "label": label, "count": h.count, "place": h.place,
            "litres_per_head_per_day": per_head, "litres_per_day": round(per_head * h.count),
            **models.attribution(h), **models.estimate(f"Aqua estimates {per_head:g} L per animal per day.")}


@router.get("/farms/{farm_id}/livestock")
def list_livestock(farm_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "farm:read")
    rows = db.scalars(select(models.Livestock).where(models.Livestock.farm_id == farm_id).order_by(models.Livestock.species)).all()
    return {"herds": [herd_out(h) for h in rows],
            "species": [{"id": k, "label": v[0], "litres_per_head_per_day": v[1]} for k, v in water_need.LIVESTOCK.items()]}


@router.post("/farms/{farm_id}/livestock")
def add_herd(farm_id: int, body: HerdIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    role = check(db, user, farm_id, "water:manage")
    place = body.place.strip()
    if db.scalar(select(models.Livestock).where(models.Livestock.farm_id == farm_id, models.Livestock.species == body.species, models.Livestock.place == place)):
        raise HTTPException(409, "This species is already listed in that place. Edit its count instead.")
    h = models.Livestock(farm_id=farm_id, species=body.species, count=body.count, place=place, **models.entered(user, role))
    db.add(h); db.commit(); db.refresh(h)
    return herd_out(h)


def _herd(db: Session, farm_id: int, herd_id: int) -> models.Livestock:
    h = db.get(models.Livestock, herd_id)
    if not h or h.farm_id != farm_id:
        raise HTTPException(404, "not found")
    return h


@router.patch("/farms/{farm_id}/livestock/{herd_id}")
def edit_herd(farm_id: int, herd_id: int, body: HerdPatch, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    role = check(db, user, farm_id, "water:manage")
    h = _herd(db, farm_id, herd_id)
    if body.place is not None and body.place.strip() != h.place:
        clash = db.scalar(select(models.Livestock).where(models.Livestock.farm_id == farm_id, models.Livestock.species == h.species,
                                                          models.Livestock.place == body.place.strip(), models.Livestock.id != h.id))
        if clash:
            raise HTTPException(409, "This species is already listed in that place. Edit its count instead.")
        h.place = body.place.strip()
    h.count = body.count
    if db.is_modified(h):
        h.record_edit(user, role)
    db.commit(); db.refresh(h)
    return herd_out(h)


@router.delete("/farms/{farm_id}/livestock/{herd_id}", status_code=204)
def delete_herd(farm_id: int, herd_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "water:manage")
    db.delete(_herd(db, farm_id, herd_id)); db.commit()


NOTES = [
    "Crop need = crop factor (Kc) x reference evapotranspiration (ET0) from the forecast, minus useful rain, divided by how efficient the irrigation is.",
    "Soil changes the efficiency (sandy soil loses more water down) and how long the soil holds water between irrigations.",
    "Animal need uses typical litres per animal per day, and 25% more on hot days.",
    "When forecast inputs are unavailable the plan uses typical Tunisian monthly climate. It assumes every plot is growing all year.",
]


@router.get("/farms/{farm_id}/water-balance")
def water_balance(farm_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "farm:read")
    farm = db.get(models.Farm, farm_id)
    sources = db.scalars(select(models.WaterSource).where(models.WaterSource.farm_id == farm_id)).all()
    herds = db.scalars(select(models.Livestock).where(models.Livestock.farm_id == farm_id)).all()
    fc = forecast.get_forecast(*farm.weather_location)
    daily = fc["daily"] if fc else None
    plots_in = [{"id": p.id, "crop": p.crop, "area_m2": p.area_m2, "irrigation": p.irrigation, "soil_type": p.soil_type}
                for p in farm.plots]
    herds_in = [{"id": h.id, "species": h.species, "count": h.count} for h in herds]
    summary = sources_summary(sources)
    measured_level = summary["total_stored_l"] if any(s.level_recorded for s in sources) else None
    measured_refill = summary["total_refill_l_per_day"] if any(s.refill_recorded for s in sources) else None
    result = water_need.compute_balance(plots_in, herds_in, measured_level, measured_refill,
                                        len(sources), daily, date.today())
    et0_today = daily[0].get("et0_mm") if daily else None
    if et0_today is None:
        et0_today = water_need.TYPICAL_ET0[date.today().month - 1]
    plots_out = []
    for p in farm.plots:
        plan = water_need.irrigation_plan(p.crop, p.soil_type, p.irrigation, p.area_m2, et0_today)
        plots_out.append({"id": p.id, "name": p.name, "crop": p.crop, "crop_label": CROPS.get(p.crop, {}).get("label", p.crop),
                          "soil_type": p.soil_type, "soil_label": water_need.SOIL_LABELS.get(p.soil_type, p.soil_type),
                          "irrigation": p.irrigation, "area_m2": p.area_m2, "defaulted_fields": p.defaulted_fields,
                          "efficiency": round(water_need.efficiency(p.irrigation, p.soil_type), 2),
                          **models.attribution(p), **models.estimate("Aqua models irrigation from crop, area, soil and weather. Defaulted fields use planning assumptions."),
                          **{f"{k}_l": v for k, v in result["plots"][p.id].items()}, **plan})
    herds_out = [{**herd_out(h), **{f"{k}_l": v for k, v in result["animals"][h.id].items()}} for h in herds]
    notes = NOTES.copy()
    if any(not s.refill_recorded for s in sources):
        notes.append("Unrecorded refill rates count as 0 L per day in the supply calculation.")
    return {"as_of": date.today().isoformat(), "forecast_used": any(d["from_forecast"] for d in result["daily"]),
            "forecast_stale": fc.get("stale", False) if fc else None,
            **models.estimate("Aqua models crop and animal water needs using farm records, forecast data and labeled planning assumptions."),
            "supply": {"stored_l": summary["total_stored_l"], "refill_l_per_day": summary["total_refill_l_per_day"],
                       "sources": len(sources), "recorded_stored_l": measured_level, "recorded_refill_l_per_day": measured_refill,
                       "measurements_incomplete": not sources or any(not s.level_recorded or not s.refill_recorded for s in sources)},
            "horizons": result["horizons"], "plots": plots_out, "animals": herds_out, "daily": result["daily"],
            "verdict": result["verdict"], "notes": notes}
