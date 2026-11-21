from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas, weekly
from ..crops import CROPS
from ..db import get_db
from ..decision import decide
from ..farm_access import demo_mode, visible_farms
from ..geo import GOVERNORATES
from ..rbac import check, current_user, plot_or_404
from ..weather import forecast

router = APIRouter(prefix="/api", tags=["farms"])


@router.get("/crops")
def crops(_: models.User = Depends(current_user)):
    return [{"id": k, **v} for k, v in CROPS.items()]


@router.get("/farms", response_model=list[schemas.FarmOut])
def list_farms(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(visible_farms(user)).all()


def _farm_values(body: schemas.FarmIn, existing: models.Farm | None = None) -> dict:
    values = body.model_dump()
    if {"lat", "lon"} <= body.model_fields_set:
        values["location_source"] = "entered"
    elif existing is not None and existing.region == body.region:
        values.update(lat=existing.lat, lon=existing.lon, location_source=existing.location_source)
    elif body.region in GOVERNORATES:
        lat, lon = GOVERNORATES[body.region]
        values.update(lat=lat, lon=lon, location_source="governorate_centre")
    else:
        values["location_source"] = "unavailable"
    return values


@router.post("/farms", response_model=schemas.FarmOut)
def create_farm(body: schemas.FarmIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    """Any signed-in user can create a farm and becomes its owner."""
    farm = models.Farm(**_farm_values(body), is_fixture=demo_mode(user), **models.entered(user, "owner"))
    db.add(farm); db.flush()
    db.add(models.FarmMember(user_id=user.id, farm_id=farm.id, role="owner", **models.entered(user, "owner")))
    db.commit(); db.refresh(farm)
    return farm


@router.get("/farms/{farm_id}", response_model=schemas.FarmOut)
def farm_detail(farm_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> models.Farm:
    check(db, user, farm_id, "farm:read")
    return db.get(models.Farm, farm_id)


@router.patch("/farms/{farm_id}", response_model=schemas.FarmOut)
def update_farm(farm_id: int, body: schemas.FarmIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    role = check(db, user, farm_id, "farm:write")
    farm = db.get(models.Farm, farm_id)
    for k, v in _farm_values(body, farm).items():
        setattr(farm, k, v)
    if db.is_modified(farm):
        farm.record_edit(user, role)
    db.commit(); db.refresh(farm)
    return farm


@router.delete("/farms/{farm_id}", status_code=204)
def delete_farm(farm_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "farm:write")
    db.delete(db.get(models.Farm, farm_id)); db.commit()


@router.post("/farms/{farm_id}/plots", response_model=schemas.PlotOut)
def create_plot(farm_id: int, body: schemas.PlotIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    role = check(db, user, farm_id, "plot:write")
    plot = models.Plot(farm_id=farm_id, **body.model_dump(), **models.entered(user, role),
                       defaulted_fields=sorted(schemas.PlotIn.model_fields.keys() - body.model_fields_set))
    db.add(plot); db.commit(); db.refresh(plot)
    return plot


@router.patch("/plots/{plot_id}", response_model=schemas.PlotOut)
def update_plot(plot_id: int, body: schemas.PlotIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    plot = plot_or_404(db, user, plot_id, "plot:write")
    for k, v in body.model_dump().items():
        setattr(plot, k, v)
    plot.defaulted_fields = sorted(schemas.PlotIn.model_fields.keys() - body.model_fields_set)
    if db.is_modified(plot):
        plot.record_edit(user, check(db, user, plot.farm_id, "plot:write"))
    db.commit(); db.refresh(plot)
    return plot


@router.delete("/plots/{plot_id}", status_code=204)
def delete_plot(plot_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    plot = plot_or_404(db, user, plot_id, "plot:write")
    db.delete(plot); db.commit()


@router.get("/plots/{plot_id}/readings", response_model=list[schemas.ReadingOut])
def plot_readings(plot_id: int, limit: int = 200, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    plot_or_404(db, user, plot_id, "plot:read")
    limit = max(1, min(limit, 1000))
    q = select(models.Reading).where(models.Reading.plot_id == plot_id).order_by(models.Reading.ts.desc()).limit(limit)
    return db.scalars(q).all()


@router.post("/plots/{plot_id}/decide")
def plot_decide(plot_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    plot = plot_or_404(db, user, plot_id, "plot:decide")
    last = db.scalars(select(models.Reading).where(models.Reading.plot_id == plot_id).order_by(models.Reading.ts.desc()).limit(1)).first()
    w = forecast(*plot.farm.weather_location)
    moisture = last.soil_moisture if last else None
    missing_plot_inputs = bool({"crop", "area_m2"}.intersection(plot.defaulted_fields or []))
    if moisture is not None and missing_plot_inputs:
        d = {"action": "wait", "why": "Record the crop and planted area before requesting irrigation advice.",
             "litres_saved": 0}
    else:
        d = decide(moisture, plot.crop, plot.area_m2, w)
    recorded = moisture is not None and not missing_plot_inputs
    if recorded:
        db.add(models.Decision(plot_id=plot_id, action=d["action"], why=d["why"], litres_saved=d["litres_saved"]))
        db.commit()
    return {**d, "weather": w, "recorded": recorded,
            **models.estimate("Aqua models water savings from the irrigation recommendation.")}


@router.get("/plots/{plot_id}/saved")
def water_saved(plot_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    plot_or_404(db, user, plot_id, "plot:read")
    rows = db.scalars(select(models.Decision).where(models.Decision.plot_id == plot_id)).all()
    return {"litres_saved": round(sum(r.litres_saved for r in rows), 1), "decisions": len(rows), **models.estimate("Aqua sums estimated savings from recorded irrigation decisions.")}


def plot_box(plot: models.Plot) -> dict | None:
    """The drawn placement of a plot, or null when it has none (or an incomplete one)."""
    values = (plot.box_x, plot.box_y, plot.box_w, plot.box_h)
    if any(v is None for v in values):
        return None
    return {"x": plot.box_x, "y": plot.box_y, "w": plot.box_w, "h": plot.box_h}


def _plot_status(plot: models.Plot, last: models.Reading | None, rain_prob: float | None) -> dict:
    target = CROPS.get(plot.crop, CROPS["tomatoes"])["min_moisture"]
    label = CROPS.get(plot.crop, {}).get("label", plot.crop.title())
    base = {
        "id": plot.id, "name": plot.name, "crop": plot.crop, "crop_label": label,
        "area_m2": plot.area_m2, "irrigation": plot.irrigation, "soil_type": plot.soil_type, "target": target,
        "soil_moisture": last.soil_moisture if last else None,
        "tank_level": last.tank_level if last else None,
        "temperature": last.temperature if last else None,
        "last_ts": models.iso(last.ts) if last else None,
        "reading_source": last.source if last else None,
        "defaulted_fields": plot.defaulted_fields,
        "box": plot_box(plot),
        "reading_entered_by": last.entered_by if last else None,
        **models.attribution(plot),
        **models.estimate("Aqua compares the latest soil reading with crop moisture guidance."),
    }
    soil = base["soil_moisture"]
    warnings: list[str] = []
    if last is None or soil is None:
        status = "no_data"
        warnings.append("No soil reading yet")
    elif "crop" in (plot.defaulted_fields or []):
        status = "no_data"
        warnings.append("Crop has not been recorded")
    elif soil < target * 0.7:
        status = "critical"
        warnings.append(f"Soil is very dry ({soil:.0f}% against {target}%)")
    elif soil < target:
        status = "rain_wait" if rain_prob is not None and rain_prob >= 60 else "dry"
        warnings.append(f"Soil is dry ({soil:.0f}% against {target}%)")
        if status == "rain_wait":
            warnings.append("Rain is likely, hold the water")
    else:
        status = "ok"
    if base["tank_level"] is not None and base["tank_level"] < 15:
        warnings.append(f"Tank is almost empty ({base['tank_level']:.0f}%)")
        if status == "ok":
            status = "tank_low"
    return {**base, "status": status, "warnings": warnings}


@router.get("/farms/{farm_id}/overview")
def farm_overview(farm_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    role = check(db, user, farm_id, "farm:read")
    farm = db.get(models.Farm, farm_id)
    weather = forecast(*farm.weather_location)
    rain = weather.get("rain_prob")
    plots = []
    for p in farm.plots:
        last = db.scalars(select(models.Reading).where(models.Reading.plot_id == p.id)
                          .order_by(models.Reading.ts.desc()).limit(1)).first()
        plots.append(_plot_status(p, last, rain))
    plot_ids = [p.id for p in farm.plots]
    decisions = db.scalars(select(models.Decision).where(models.Decision.plot_id.in_(plot_ids))
                           .order_by(models.Decision.ts.desc()).limit(40)).all() if plot_ids else []
    week = weekly.current_week()
    estimated_savings = weekly.farm_week_savings(db, farm.id, week)
    measured = [p for p in plots if p["soil_moisture"] is not None]
    names = {p.id: p.name for p in farm.plots}
    saved = round(sum(d.litres_saved for d in decisions), 1)
    return {
        "farm": {"id": farm.id, "name": farm.name, "region": farm.region, "lat": farm.lat, "lon": farm.lon,
                 "demo": farm.demo, "location_source": farm.location_source, **models.attribution(farm)},
        "my_role": role,
        "weather": weather,
        "plots": plots,
        "litres_saved": saved,
        "weekly_savings": {"week_start": week.isoformat(), "litres": estimated_savings,
                           **models.estimate("Aqua uses the latest irrigation recommendation per plot and Tunis calendar day.")},
        "measurement_coverage": {"plots": len(plots), "plots_with_soil_moisture": len(measured),
                                 "latest_soil_sample_at": max((p["last_ts"] for p in measured), default=None)},
        **models.estimate("Aqua sums estimated savings from recent irrigation decisions."),
        "decisions": [{"id": d.id, "plot_id": d.plot_id, "plot_name": names.get(d.plot_id, ""),
                       "action": d.action, "why": d.why, "litres_saved": d.litres_saved,
                       "ts": models.iso(d.ts), **models.estimate("Aqua models savings from this irrigation recommendation.")} for d in decisions[:12]],
    }
