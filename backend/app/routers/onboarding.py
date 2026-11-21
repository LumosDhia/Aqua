import base64
import binascii
import secrets
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import ai, models, sketch_parse
from ..config import settings
from ..crops import CROPS
from ..db import get_db
from ..farm_access import FIXTURE_ACCOUNTS
from ..geo import GOVERNORATES
from ..rbac import check, current_user
from .water import Kind as SourceKind, Species

router = APIRouter(prefix="/api", tags=["onboarding"])

Soil = Literal["sand", "sandy_loam", "loam", "clay_loam", "clay", ""]
Irrigation = Literal["drip", "sprinkler", "flood", ""]
MAX_SKETCH_BYTES = 6 * 1024 * 1024


class WizardFarm(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    governorate: str = Field(max_length=40)
    area_m2: float | None = Field(default=None, ge=1, le=1_000_000_000)
    description: str = Field(default="", max_length=2000)


class PlotBox(BaseModel):
    """Where the plot sits on the farmer's drawing, as fractions 0..1 of the drawing."""
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    w: float = Field(gt=0, le=1)
    h: float = Field(gt=0, le=1)


class WizardPlot(BaseModel):
    name: str = Field(default="", max_length=120)
    crop: str
    area_m2: float = Field(ge=1, le=10_000_000)
    irrigation: Irrigation = ""
    soil_type: Soil = ""
    box: PlotBox | None = None


class WizardSource(BaseModel):
    kind: SourceKind
    name: str = Field(default="", max_length=120)
    capacity_l: float | None = Field(default=None, ge=0, le=1e9)
    level_l: float | None = Field(default=None, ge=0, le=1e9)
    refill_l_per_day: float | None = Field(default=None, ge=0, le=1e9)


class WizardHerd(BaseModel):
    species: Species
    count: int = Field(ge=1, le=1_000_000)
    place: str = Field(default="", max_length=60)
    box: PlotBox | None = None


class WizardIn(BaseModel):
    farm: WizardFarm
    draft_key: str | None = Field(default=None, pattern=r"^[0-9a-f]{32}$")
    sketch: str | None = None
    plots: list[WizardPlot] = Field(default=[], max_length=30)
    water_sources: list[WizardSource] = Field(default=[], max_length=12)
    livestock: list[WizardHerd] = Field(default=[], max_length=11)


SOURCE_NAMES = {"tank": "Tank", "well": "Well", "borehole": "Borehole", "rain_tank": "Rain tank",
                "network": "Public network (SONEDE)", "canal": "Canal"}


def _wizard_result(farm: models.Farm) -> dict:
    return {
        "farm_id": farm.id,
        "demo": farm.demo,
        **models.attribution(farm),
        "name": farm.name,
        "governorate": farm.region,
        "area_m2": farm.area_m2,
        "planted_area_m2": sum(plot.area_m2 for plot in farm.plots),
        "plots": len(farm.plots),
        "water_sources": len(farm.water_sources),
        "animals": len(farm.livestock),
        "animal_count": sum(herd.count for herd in farm.livestock),
    }


@router.post("/onboarding/farmer")
def wizard(body: WizardIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    key = f"{user.id}:{body.draft_key}" if body.draft_key else None
    existing = select(models.Farm).where(models.Farm.onboarding_key == key)
    if key and (saved := db.scalar(existing)) is not None:
        check(db, user, saved.id, "farm:write")
        return _wizard_result(saved)

    name = body.farm.name.strip()
    if len(name) < 2:
        raise HTTPException(422, "Farm name must be at least 2 characters.")
    if body.farm.governorate not in GOVERNORATES:
        raise HTTPException(422, "Choose a governorate from the list.")
    for plot in body.plots:
        if plot.crop not in CROPS:
            raise HTTPException(422, f"Unknown crop: {plot.crop}")
    if len({h.species for h in body.livestock}) != len(body.livestock):
        raise HTTPException(422, "Each kind of animal can be listed once.")
    for source in body.water_sources:
        if source.capacity_l is not None and source.level_l is not None and source.level_l > source.capacity_l:
            raise HTTPException(422, "The level cannot be higher than the capacity.")
    sketch = _decode_sketch(body.sketch) if body.sketch is not None else None

    lat, lon = GOVERNORATES[body.farm.governorate]
    farm = models.Farm(
        name=name, region=body.farm.governorate, area_m2=body.farm.area_m2, lat=lat, lon=lon,
        description=body.farm.description.strip(), onboarding_key=key, is_fixture=user.email in FIXTURE_ACCOUNTS,
        location_source="governorate_centre",
        **models.entered(user, "owner"),
    )
    sketch_path = None
    try:
        db.add(farm)
        db.flush()
        db.add(models.FarmMember(user_id=user.id, farm_id=farm.id, role="owner", **models.entered(user, "owner")))
        counts: dict[str, int] = {}
        for plot in body.plots:
            label = CROPS[plot.crop]["label"]
            counts[plot.crop] = counts.get(plot.crop, 0) + 1
            field_name = plot.name.strip() or f"{label} field {counts[plot.crop]}"
            farm.plots.append(models.Plot(name=field_name, crop=plot.crop, area_m2=plot.area_m2,
                                          irrigation=plot.irrigation, soil_type=plot.soil_type,
                                          defaulted_fields=[] if plot.name.strip() else ["name"],
                                          box_x=plot.box.x if plot.box else None, box_y=plot.box.y if plot.box else None,
                                          box_w=plot.box.w if plot.box else None, box_h=plot.box.h if plot.box else None,
                                          **models.entered(user, "owner")))
        for source in body.water_sources:
            record = models.WaterSource(
                kind=source.kind, name=source.name.strip() or SOURCE_NAMES[source.kind],
                capacity_l=source.capacity_l, level_l=source.level_l or 0, refill_l_per_day=source.refill_l_per_day or 0,
                level_recorded=source.level_l is not None, refill_recorded=source.refill_l_per_day is not None,
                **models.entered(user, "owner"),
            )
            record.record_level(user, "owner")
            farm.water_sources.append(record)
        for herd in body.livestock:
            farm.livestock.append(models.Livestock(species=herd.species, count=herd.count, place=herd.place.strip(),
                                               box_x=herd.box.x if herd.box else None, box_y=herd.box.y if herd.box else None,
                                               box_w=herd.box.w if herd.box else None, box_h=herd.box.h if herd.box else None,
                                               **models.entered(user, "owner")))
        if sketch:
            raw, ext = sketch
            farm.sketch_file = f"f{farm.id}-{secrets.token_urlsafe(12)}.{ext}"
            sketch_path = _private_dir() / farm.sketch_file
            sketch_path.write_bytes(raw)
        result = _wizard_result(farm)
        db.commit()
        return result
    except Exception as error:
        db.rollback()
        if sketch_path:
            sketch_path.unlink(missing_ok=True)
        if isinstance(error, IntegrityError) and key and (saved := db.scalar(existing)) is not None:
            check(db, user, saved.id, "farm:write")
            return _wizard_result(saved)
        raise


# ---------------------------------------------------------------- farm description and drawing

class AboutIn(BaseModel):
    description: str = Field(max_length=2000)


class SketchIn(BaseModel):
    data: str


def _private_dir() -> Path:
    d = Path(settings.private_dir) / "farm-sketches"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _image_ext(raw: bytes) -> str | None:
    if raw.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "webp"
    return None


def _decode_sketch(data: str) -> tuple[bytes, str]:
    if len(data) > MAX_SKETCH_BYTES * 4 // 3:
        raise HTTPException(413, "The picture is larger than 6 MB")
    try:
        raw = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, "The picture could not be read")
    ext = _image_ext(raw)
    if not ext:
        raise HTTPException(422, "Use a JPEG, PNG or WebP picture")
    return raw, ext


@router.put("/farms/{farm_id}/about")
def set_about(farm_id: int, body: AboutIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    role = check(db, user, farm_id, "farm:write")
    f = db.get(models.Farm, farm_id)
    f.description = body.description.strip()
    if db.is_modified(f):
        f.record_edit(user, role)
    db.commit()
    return {"description": f.description, "has_sketch": f.has_sketch, **models.attribution(f)}


@router.post("/farms/{farm_id}/sketch")
def upload_sketch(farm_id: int, body: SketchIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    role = check(db, user, farm_id, "farm:write")
    raw, ext = _decode_sketch(body.data)
    f = db.get(models.Farm, farm_id)
    if f.sketch_file:
        (_private_dir() / f.sketch_file).unlink(missing_ok=True)
    name = f"f{farm_id}-{secrets.token_urlsafe(12)}.{ext}"
    (_private_dir() / name).write_bytes(raw)
    f.sketch_file = name
    f.record_edit(user, role)
    db.commit()
    return {"has_sketch": True, **models.attribution(f)}


@router.get("/farms/{farm_id}/sketch")
def get_sketch(farm_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "farm:read")
    f = db.get(models.Farm, farm_id)
    path = _private_dir() / f.sketch_file if f.sketch_file else None
    if not path or not path.exists():
        raise HTTPException(404, "not found")
    return FileResponse(path, headers={"Cache-Control": "private, max-age=300"})


@router.delete("/farms/{farm_id}/sketch", status_code=204)
def delete_sketch(farm_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    role = check(db, user, farm_id, "farm:write")
    f = db.get(models.Farm, farm_id)
    if f.sketch_file:
        (_private_dir() / f.sketch_file).unlink(missing_ok=True)
        f.sketch_file = None
        f.record_edit(user, role)
        db.commit()


# ---------------------------------------------------------------- optional AI helper

SUGGEST_TOOL = {
    "name": "suggest_farm_setup",
    "description": "Suggest the plots, water sources and animals described by the farmer.",
    "input_schema": {"type": "object", "properties": {
        "plots": {"type": "array", "maxItems": 30, "items": {"type": "object", "properties": {
            "name": {"type": "string"}, "crop": {"type": "string", "enum": list(CROPS)},
            "area_m2": {"type": "number", "description": "Area in square metres, estimate if unsure"},
            "irrigation": {"type": "string", "enum": ["drip", "sprinkler", "flood"]},
            "soil_type": {"type": "string", "enum": ["sand", "sandy_loam", "loam", "clay_loam", "clay"]}}, "required": ["crop", "area_m2"]}},
        "water_sources": {"type": "array", "maxItems": 12, "items": {"type": "object", "properties": {
            "kind": {"type": "string", "enum": ["tank", "well", "borehole", "rain_tank", "network", "canal"]},
            "name": {"type": "string"}, "capacity_l": {"type": "number"}}, "required": ["kind"]}},
        "livestock": {"type": "array", "maxItems": 11, "items": {"type": "object", "properties": {
            "species": {"type": "string", "enum": ["dairy_cow", "beef_cattle", "sheep", "goat", "horse", "donkey", "camel", "pig", "chicken", "turkey", "rabbit"]},
            "count": {"type": "integer"}}, "required": ["species", "count"]}},
        "notes": {"type": "string", "description": "One short sentence about what was uncertain"}},
        "required": ["plots"]},
}

SUGGEST_SYSTEM = ("You help a Tunisian farmer set up a farm dashboard. Read the farmer's description and, if given, the hand-drawn picture "
                  "of the farm. Suggest plots (crop from the allowed list, a realistic area in square metres, irrigation and soil if stated "
                  "or clearly implied), water sources and animals. Only include what is described or drawn. If an area is not stated, "
                  "estimate it from the drawing or the words and say so in notes. Use the nearest allowed crop when the farmer names a crop "
                  "that is not listed.")


class SuggestIn(BaseModel):
    description: str = Field(default="", max_length=2000)
    image: str | None = None


@router.get("/ai/status")
def ai_status(_: models.User = Depends(current_user)):
    return {"configured": ai.configured()}


@router.post("/onboarding/suggest")
def suggest(body: SuggestIn, _: models.User = Depends(current_user)):
    if not body.description.strip() and not body.image:
        raise HTTPException(422, "Write a description or add a picture first")
    content: list[dict] = []
    if body.image:
        try:
            raw = base64.b64decode(body.image, validate=True)
        except (binascii.Error, ValueError):
            raise HTTPException(422, "The picture could not be read")
        ext = _image_ext(raw)
        if not ext or len(raw) > MAX_SKETCH_BYTES:
            raise HTTPException(422, "Use a JPEG, PNG or WebP picture under 6 MB")
        content.append({"type": "image", "source": {"type": "base64", "media_type": {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}[ext], "data": body.image}})
    content.append({"type": "text", "text": body.description.strip() or "Please read the drawing."})
    try:
        out = ai.call_tool(SUGGEST_SYSTEM, content, SUGGEST_TOOL)
    except ai.AiUnavailable as e:
        raise HTTPException(503, str(e))
    plots = [{"name": str(p.get("name", ""))[:120], "crop": p["crop"], "area_m2": max(1.0, float(p.get("area_m2", 1000))),
              "irrigation": p.get("irrigation") if p.get("irrigation") in ("drip", "sprinkler", "flood") else "drip",
              "soil_type": p.get("soil_type") if p.get("soil_type") in ("sand", "sandy_loam", "loam", "clay_loam", "clay") else "loam"}
             for p in out.get("plots", [])[:30] if p.get("crop") in CROPS]
    sources = [{"kind": s["kind"], "name": str(s.get("name", ""))[:120], "capacity_l": s.get("capacity_l")}
               for s in out.get("water_sources", [])[:12] if s.get("kind") in SOURCE_NAMES]
    herds = [{"species": h["species"], "count": max(1, int(h.get("count", 1)))} for h in out.get("livestock", [])[:11]]
    return {"plots": plots, "water_sources": sources, "livestock": herds, "notes": str(out.get("notes", ""))[:300]}


# ---------------------------------------------------------------- reading the drawing or description

class ParseSketchIn(BaseModel):
    image: str | None = Field(default=None, description="data URL of the drawing")
    description: str | None = Field(default=None, max_length=2000)
    area_m2: float | None = Field(default=None, ge=1, le=1_000_000_000)


MEDIA = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}


@router.post("/onboarding/parse-sketch")
def parse_sketch(body: ParseSketchIn, user: models.User = Depends(current_user)):
    if user.account_type != "farmer":
        raise HTTPException(403, "Only farm owners can set up a farm")
    text = (body.description or "").strip()
    if not body.image and not text:
        raise HTTPException(422, "Add a drawing or write a description first")
    data, media = None, None
    if body.image:
        data = body.image.split(",", 1)[1] if body.image.startswith("data:") and "," in body.image else body.image
        raw, ext = _decode_sketch(data)
        media = MEDIA[ext]
    return sketch_parse.parse_sketch(image_b64=data, media_type=media, description=text, area_m2=body.area_m2)
