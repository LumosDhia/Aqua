import base64
import binascii
import re
import secrets
from datetime import date
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import models
from ..config import settings
from ..db import get_db
from ..farm_access import FIXTURE_ACCOUNTS, demo_mode
from ..geo import GOVERNORATES, distance_km
from ..rbac import RANK, check, current_user, farm_role

router = APIRouter(prefix="/api", tags=["market"])

MAX_PHOTOS = 5
MAX_PHOTO_BYTES = 3 * 1024 * 1024
PHOTO_NAME = re.compile(r"^f(\d+)-[A-Za-z0-9_-]{10,}\.(jpg|png|webp)$")
Source = Literal["well", "borehole", "rain_tank", "tank", "network", "canal"]


def uploads_dir() -> Path:
    d = Path(settings.uploads_dir) / "market"
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


class PhotoIn(BaseModel):
    data: str


class ListingIn(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(default="", max_length=2000)
    litres_available: float = Field(gt=0, le=1e9)
    price_mode: Literal["fixed", "free", "negotiable"] = "negotiable"
    price_per_m3: float | None = Field(default=None, ge=0, le=100000)
    water_source: Source = "well"
    quality_notes: str = Field(default="", max_length=300)
    fulfilment: Literal["pickup", "delivery", "both"] = "pickup"
    delivery_radius_km: float | None = Field(default=None, ge=0, le=1000)
    available_from: date | None = None
    available_until: date | None = None
    governorate: str = Field(max_length=40)
    address_text: str = Field(default="", max_length=200)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lon: float | None = Field(default=None, ge=-180, le=180)
    photos: list[str] = Field(default=[], max_length=MAX_PHOTOS)
    status: Literal["active", "paused", "closed"] = "active"


class InquiryIn(BaseModel):
    message: str = Field(min_length=5, max_length=1000)


class InquiryPatch(BaseModel):
    status: Literal["read", "accepted", "declined"]


def _validate(body: ListingIn, farm_id: int) -> None:
    if body.governorate not in GOVERNORATES:
        raise HTTPException(422, "Choose a governorate from the list")
    if body.price_mode == "fixed" and body.price_per_m3 is None:
        raise HTTPException(422, "Give a price per cubic metre or choose free or negotiable")
    if body.fulfilment in ("delivery", "both") and not body.delivery_radius_km:
        raise HTTPException(422, "Give the delivery distance in kilometres")
    if body.available_from and body.available_until and body.available_until < body.available_from:
        raise HTTPException(422, "The end date is before the start date")
    if (body.lat is None) != (body.lon is None):
        raise HTTPException(422, "Give both latitude and longitude, or neither")
    for name in body.photos:
        m = PHOTO_NAME.match(name)
        if not m or int(m.group(1)) != farm_id or not (uploads_dir() / name).exists():
            raise HTTPException(422, "One of the photos is not valid. Upload it again.")


def listing_out(l: models.WaterListing, db: Session, user: models.User, near: tuple[float, float] | None = None,
                mine: bool | None = None) -> dict:
    if mine is None:
        mine = farm_role(db, user, l.farm_id) is not None
    lat, lon = (l.lat, l.lon) if l.lat is not None else GOVERNORATES.get(l.governorate, (None, None))
    dist = round(distance_km(near[0], near[1], lat, lon), 1) if near and lat is not None else None
    out = {
        "id": l.id, "title": l.title, "description": l.description, "litres_available": l.litres_available,
        "price_mode": l.price_mode, "price_per_m3": l.price_per_m3, "water_source": l.water_source,
        "quality_notes": l.quality_notes, "fulfilment": l.fulfilment, "delivery_radius_km": l.delivery_radius_km,
        "available_from": l.available_from.isoformat() if l.available_from else None,
        "available_until": l.available_until.isoformat() if l.available_until else None,
        "governorate": l.governorate, "address_text": l.address_text, "lat": lat, "lon": lon,
        "photos": [f"/uploads/market/{p}" for p in l.photos], "status": l.status,
        "farm": {"id": l.farm.id, "name": l.farm.name, "region": l.farm.region,
                 "demo": l.farm.demo, **models.attribution(l.farm)},
        "distance_km": dist, "is_mine": mine, "created_at": models.iso(l.created_at), "updated_at": models.iso(l.updated_at), **models.attribution(l),
        "location_source": "listing" if l.lat is not None else "governorate_centre",
    }
    if dist is not None:
        out.update(models.estimate("Aqua estimates straight-line distance using the listing location or governorate centre."))
    if mine:
        out["inquiry_count"] = len(l.inquiries)
        out["new_inquiries"] = sum(1 for i in l.inquiries if i.status == "new")
    return out


def _inquiry_out(i: models.ListingInquiry, with_sender: bool) -> dict:
    out = {"id": i.id, "listing_id": i.listing_id, "listing_title": i.listing.title, "message": i.message,
           "status": i.status, "created_at": models.iso(i.created_at), "demo": i.listing.farm.demo, **models.attribution(i)}
    if with_sender:
        out["sender"] = {"id": i.sender.id, "name": i.sender.name or i.sender.email.split("@")[0], "email": i.sender.email}
    else:
        out["farm_name"] = i.listing.farm.name
    return out


@router.get("/market/meta")
def meta(_: models.User = Depends(current_user)):
    return {"governorates": [{"name": n, "lat": c[0], "lon": c[1]} for n, c in GOVERNORATES.items()],
            "sources": ["well", "borehole", "rain_tank", "tank", "network", "canal"]}


@router.get("/market/listings")
def browse(q: str = "", governorate: str = "", fulfilment: Literal["", "pickup", "delivery"] = "",
           source: str = "", max_price: float | None = Query(default=None, ge=0), min_litres: float | None = Query(default=None, ge=0),
           sort: Literal["newest", "price", "distance", "volume"] = "newest", near_farm_id: int | None = None,
           limit: int = Query(default=24, ge=1, le=100), offset: int = Query(default=0, ge=0),
           user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(models.WaterListing).join(models.Farm).where(
        models.WaterListing.status == "active", models.Farm.is_fixture == demo_mode(user))
    stmt = stmt.where(or_(models.WaterListing.available_until.is_(None), models.WaterListing.available_until >= date.today()))
    if q.strip():
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(or_(func.lower(models.WaterListing.title).like(like), func.lower(models.WaterListing.description).like(like),
                              func.lower(models.WaterListing.address_text).like(like)))
    if governorate:
        stmt = stmt.where(models.WaterListing.governorate == governorate)
    if fulfilment:
        stmt = stmt.where(models.WaterListing.fulfilment.in_([fulfilment, "both"]))
    if source:
        stmt = stmt.where(models.WaterListing.water_source == source)
    if max_price is not None:
        stmt = stmt.where(or_(models.WaterListing.price_mode == "free", models.WaterListing.price_per_m3 <= max_price))
    if min_litres is not None:
        stmt = stmt.where(models.WaterListing.litres_available >= min_litres)
    near = None
    if near_farm_id is not None:
        if farm_role(db, user, near_farm_id) is None:
            raise HTTPException(404, "not found")
        f = db.get(models.Farm, near_farm_id)
        near = (f.lat, f.lon) if f.location_source != "unavailable" else None
    rows = db.scalars(stmt).all()
    items = [listing_out(l, db, user, near) for l in rows]
    keys = {"newest": lambda x: x["created_at"], "volume": lambda x: x["litres_available"],
            "price": lambda x: (x["price_mode"] != "free", x["price_per_m3"] if x["price_per_m3"] is not None else 1e12),
            "distance": lambda x: x["distance_km"] if x["distance_km"] is not None else 1e12}
    items.sort(key=keys[sort], reverse=sort in ("newest", "volume"))
    return {"total": len(items), "items": items[offset:offset + limit]}


@router.get("/market/listings/{listing_id}")
def listing_detail(listing_id: int, near_farm_id: int | None = None, user: models.User = Depends(current_user),
                   db: Session = Depends(get_db)):
    l = db.get(models.WaterListing, listing_id)
    mine = bool(l) and farm_role(db, user, l.farm_id) is not None
    if not l or l.farm.demo != demo_mode(user) or (l.status != "active" and not mine):
        raise HTTPException(404, "not found")
    near = None
    if near_farm_id is not None and farm_role(db, user, near_farm_id) is not None:
        f = db.get(models.Farm, near_farm_id)
        near = (f.lat, f.lon) if f.location_source != "unavailable" else None
    out = listing_out(l, db, user, near, mine)
    mine_inq = db.scalar(select(models.ListingInquiry).where(models.ListingInquiry.listing_id == l.id,
                                                              models.ListingInquiry.sender_id == user.id))
    out["my_inquiry"] = _inquiry_out(mine_inq, False) if mine_inq else None
    return out


@router.get("/farms/{farm_id}/market/listings")
def farm_listings(farm_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "farm:read")
    rows = db.scalars(select(models.WaterListing).where(models.WaterListing.farm_id == farm_id)
                      .order_by(models.WaterListing.created_at.desc())).all()
    return [listing_out(l, db, user, mine=True) for l in rows]


@router.post("/farms/{farm_id}/market/photos")
def upload_photo(farm_id: int, body: PhotoIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "market:manage")
    try:
        raw = base64.b64decode(body.data, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, "The photo could not be read")
    if len(raw) > MAX_PHOTO_BYTES:
        raise HTTPException(413, "The photo is larger than 3 MB")
    ext = _image_ext(raw)
    if not ext:
        raise HTTPException(422, "Use a JPEG, PNG or WebP photo")
    name = f"f{farm_id}-{secrets.token_urlsafe(12)}.{ext}"
    (uploads_dir() / name).write_bytes(raw)
    return {"filename": name, "url": f"/uploads/market/{name}"}


@router.post("/farms/{farm_id}/market/listings")
def create_listing(farm_id: int, body: ListingIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    role = check(db, user, farm_id, "market:manage")
    _validate(body, farm_id)
    l = models.WaterListing(farm_id=farm_id, **models.entered(user, role), **{**body.model_dump(), "title": body.title.strip()})
    db.add(l); db.commit(); db.refresh(l)
    return listing_out(l, db, user, mine=True)


def _own_listing(db: Session, farm_id: int, listing_id: int) -> models.WaterListing:
    l = db.get(models.WaterListing, listing_id)
    if not l or l.farm_id != farm_id:
        raise HTTPException(404, "not found")
    return l


@router.patch("/farms/{farm_id}/market/listings/{listing_id}")
def edit_listing(farm_id: int, listing_id: int, body: ListingIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    role = check(db, user, farm_id, "market:manage")
    l = _own_listing(db, farm_id, listing_id)
    _validate(body, farm_id)
    for k, v in body.model_dump().items():
        setattr(l, k, v)
    if db.is_modified(l):
        l.record_edit(user, role)
    db.commit(); db.refresh(l)
    return listing_out(l, db, user, mine=True)


@router.delete("/farms/{farm_id}/market/listings/{listing_id}", status_code=204)
def delete_listing(farm_id: int, listing_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "market:manage")
    db.delete(_own_listing(db, farm_id, listing_id)); db.commit()


@router.post("/market/listings/{listing_id}/inquiries")
def send_inquiry(listing_id: int, body: InquiryIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    l = db.get(models.WaterListing, listing_id)
    if not l or l.farm.demo != demo_mode(user) or l.status != "active":
        raise HTTPException(404, "not found")
    if farm_role(db, user, l.farm_id) is not None:
        raise HTTPException(409, "This is your own listing")
    if db.scalar(select(models.ListingInquiry).where(models.ListingInquiry.listing_id == listing_id,
                                                       models.ListingInquiry.sender_id == user.id)):
        raise HTTPException(409, "You already contacted this seller")
    i = models.ListingInquiry(listing_id=listing_id, sender_id=user.id, message=body.message.strip(), **models.entered(user))
    db.add(i); db.commit(); db.refresh(i)
    return _inquiry_out(i, False)


@router.get("/market/my-inquiries")
def my_inquiries(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(models.ListingInquiry).join(models.WaterListing).join(models.Farm).where(
        models.ListingInquiry.sender_id == user.id, models.Farm.is_fixture == demo_mode(user))
                      .order_by(models.ListingInquiry.created_at.desc())).all()
    return [_inquiry_out(i, False) for i in rows]


@router.get("/farms/{farm_id}/market/inquiries")
def farm_inquiries(farm_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "market:manage")
    rows = db.scalars(select(models.ListingInquiry).join(models.WaterListing)
                      .where(models.WaterListing.farm_id == farm_id,
                             models.ListingInquiry.sender.has(models.User.email.in_(FIXTURE_ACCOUNTS) == demo_mode(user)))
                      .order_by(models.ListingInquiry.created_at.desc())).all()
    return [_inquiry_out(i, True) for i in rows]


@router.patch("/market/inquiries/{inquiry_id}")
def update_inquiry(inquiry_id: int, body: InquiryPatch, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    i = db.get(models.ListingInquiry, inquiry_id)
    role = farm_role(db, user, i.listing.farm_id) if i else None
    if role is None or demo_mode(i.sender) != demo_mode(user):
        raise HTTPException(404, "not found")
    if RANK[role] < RANK["manager"]:
        raise HTTPException(403, "needs farm role manager or higher")
    if i.status != body.status:
        i.status = body.status
        i.record_edit(user, role)
    db.commit()
    return _inquiry_out(i, True)
