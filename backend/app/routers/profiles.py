from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..farm_access import demo_mode
from ..geo import GOVERNORATES, distance_km
from ..rbac import current_user

router = APIRouter(prefix="/api", tags=["profiles"])

KINDS = ("task", "period", "long_term")


class ProfileIn(BaseModel):
    headline: str = Field(default="", max_length=120)
    bio: str = Field(default="", max_length=1500)
    governorate: str = Field(default="", max_length=40)
    visibility: Literal["public", "private"] = "public"
    radius_km: int = Field(default=50, ge=1, le=500)
    looking_for_work: bool = False
    kinds: list[Literal["task", "period", "long_term"]] = Field(default=[], max_length=3)
    skills: list[str] = Field(default=[], max_length=12)
    languages: list[str] = Field(default=[], max_length=6)
    availability: str = Field(default="", max_length=200)


def _tags(items: list[str], what: str, limit: int) -> list[str]:
    out: list[str] = []
    for t in items:
        t = t.strip()
        if not t or len(t) > limit:
            raise HTTPException(422, f"Each {what} must be 1 to {limit} characters")
        if t.lower() not in (x.lower() for x in out):
            out.append(t)
    return out


def get_or_create(db: Session, user: models.User) -> models.Profile:
    p = db.scalar(select(models.Profile).where(models.Profile.user_id == user.id))
    if not p:
        p = models.Profile(user_id=user.id, looking_for_work=user.account_type == "worker")
        db.add(p); db.commit(); db.refresh(p)
    return p


def profile_out(p: models.Profile, user: models.User, mine: bool) -> dict:
    out = {"user_id": user.id, "name": user.name or user.email.split("@")[0], "account_type": user.account_type,
           "headline": p.headline, "bio": p.bio, "governorate": p.governorate, "visibility": p.visibility,
           "radius_km": p.radius_km, "looking_for_work": p.looking_for_work, "kinds": p.kinds, "skills": p.skills,
           "languages": p.languages, "availability": p.availability, "photo": models.people_photo_url(p.photo),
           "updated_at": models.iso(p.updated_at), "demo": demo_mode(user), **models.attribution(p)}
    if mine:
        out["complete"] = bool(p.headline and p.governorate)
        out["farm_count"] = len(user.memberships)
        out["email"] = user.email
    return out


@router.get("/profile/me")
def my_profile(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    return profile_out(get_or_create(db, user), user, True)


@router.put("/profile/me")
def update_profile(body: ProfileIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    if body.governorate and body.governorate not in GOVERNORATES:
        raise HTTPException(422, "Choose a governorate from the list")
    p = get_or_create(db, user)
    p.headline, p.bio, p.availability = body.headline.strip(), body.bio.strip(), body.availability.strip()
    p.governorate, p.visibility, p.radius_km = body.governorate, body.visibility, body.radius_km
    p.looking_for_work, p.kinds = body.looking_for_work, list(dict.fromkeys(body.kinds))
    p.skills, p.languages = _tags(body.skills, "skill", 30), _tags(body.languages, "language", 30)
    if db.is_modified(p):
        p.record_edit(user, user.role)
    db.commit(); db.refresh(p)
    return profile_out(p, user, True)


@router.get("/profiles/{user_id}")
def public_profile(user_id: int, viewer: models.User = Depends(current_user), db: Session = Depends(get_db)):
    target = db.get(models.User, user_id)
    if not target or not target.active or demo_mode(target) != demo_mode(viewer):
        raise HTTPException(404, "not found")
    p = get_or_create(db, target)
    if p.visibility == "private" and viewer.id != target.id and viewer.role != "admin":
        raise HTTPException(404, "not found")
    from .engagements import work_history
    return {**profile_out(p, target, viewer.id == target.id), **work_history(db, target)}


@router.get("/members")
def members(farm_id: int | None = Query(default=None), viewer: models.User = Depends(current_user), db: Session = Depends(get_db)):
    """Public people in this network: workers looking for work, people already on a farm, and this farm's own members."""
    farm = db.get(models.Farm, farm_id) if farm_id is not None else None
    on_farm = viewer.role == "admin" or any(m.farm_id == farm_id for m in viewer.memberships)
    if farm is None or not on_farm or farm.is_fixture != demo_mode(viewer):
        farm = None
    member_ids = {m.user_id for m in farm.members} if farm is not None else set()
    here = (farm.lat, farm.lon) if farm is not None and farm.location_source != "unavailable" else None
    accessible = {m.farm_id for m in viewer.memberships}
    rows = db.scalars(
        select(models.Profile)
        .join(models.User, models.User.id == models.Profile.user_id)
        .where(models.Profile.visibility == "public", models.User.active.is_(True), models.User.role != "admin")
    ).all()
    items = []
    for p in rows:
        u = p.user
        if demo_mode(u) != demo_mode(viewer):
            continue
        active = db.scalars(
            select(models.Engagement)
            .join(models.Farm, models.Farm.id == models.Engagement.farm_id)
            .where(
                models.Engagement.worker_id == u.id,
                models.Engagement.status == "active",
                models.Farm.is_fixture == demo_mode(viewer),
            )
            .order_by(models.Engagement.created_at.desc())
        ).first()
        dist = None
        if here is not None and p.governorate in GOVERNORATES:
            g = GOVERNORATES[p.governorate]
            dist = round(distance_km(here[0], here[1], g[0], g[1]), 1)
        works = None
        if active is not None:
            works = {
                "farm_id": active.farm_id,
                "farm": active.farm.name,
                "title": active.title,
                "accessible": active.farm_id in accessible or viewer.role == "admin",
            }
        items.append({
            "user_id": u.id,
            "name": u.name or u.email.split("@")[0],
            "headline": p.headline,
            "governorate": p.governorate,
            "photo": models.people_photo_url(p.photo),
            "skills": p.skills or [],
            "languages": p.languages or [],
            "availability": p.availability,
            "looking_for_work": p.looking_for_work,
            "radius_km": p.radius_km,
            "kinds": p.kinds or [],
            "on_my_farm": u.id in member_ids,
            "distance_km": dist,
            "works_at": works,
            "demo": demo_mode(u),
            **models.attribution(p),
            **(models.estimate("Aqua estimates distance from the profile governorate centre.") if dist is not None else {}),
        })
    items.sort(key=lambda x: x["name"].lower())
    return {"total": len(items), "items": items}
