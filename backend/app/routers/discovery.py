"""Matching between people looking for work and jobs, by what is asked and by distance on both sides."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..farm_access import demo_mode
from ..geo import GOVERNORATES, distance_km
from ..rbac import check, current_user
from .profiles import get_or_create

router = APIRouter(prefix="/api", tags=["discovery"])
KINDS = {"task", "period", "long_term"}


def _lower(items) -> set[str]:
    return {str(x).strip().lower() for x in (items or []) if str(x).strip()}


def _csv(value: str) -> list[str]:
    return [x.strip() for x in value.split(",") if x.strip()]


def match_score(wanted_kinds: set[str], wanted_skills: set[str], kind: str | None, skills) -> tuple[int, list[str]]:
    have = _lower(skills)
    overlap = sorted(wanted_skills & have)
    score = 2 * len(overlap) + (1 if kind and kind in wanted_kinds else 0)
    return score, overlap


@router.get("/opportunities")
def opportunities(radius_km: int | None = Query(default=None, ge=1, le=500), kinds: str = "", skills: str = "", q: str = "",
                  limit: int = Query(default=24, ge=1, le=100), offset: int = Query(default=0, ge=0),
                  user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    """Open jobs near me: inside my travel radius and inside the radius the farm gave the job."""
    prof = get_or_create(db, user)
    if prof.governorate not in GOVERNORATES:
        raise HTTPException(422, "Set where you live in your profile first")
    here = GOVERNORATES[prof.governorate]
    reach = radius_km or prof.radius_km
    want_kinds = _lower(_csv(kinds)) & KINDS or _lower(prof.kinds)
    want_skills = _lower(_csv(skills)) or _lower(prof.skills)
    mine = {m.farm_id for m in user.memberships}
    applied = set(db.scalars(select(models.JobApplication.job_id).where(
        models.JobApplication.applicant_id == user.id, models.JobApplication.status != "withdrawn")).all())
    needle = q.strip().lower()
    items = []
    for j in db.scalars(select(models.JobPost).join(models.Farm).where(
        models.JobPost.status == "open", models.Farm.is_fixture == demo_mode(user))).all():
        if j.farm_id in mine or j.farm.location_source == "unavailable" or (j.end_date and j.end_date < models.now().date()):
            continue
        if needle and needle not in f"{j.title} {j.description}".lower():
            continue
        d = distance_km(here[0], here[1], j.farm.lat, j.farm.lon)
        if d > reach or (j.radius_km is not None and d > j.radius_km):
            continue
        score, overlap = match_score(want_kinds, want_skills, j.kind, j.skills)
        items.append({"id": j.id, "title": j.title, "kind": j.kind, "pay_mode": j.pay_mode, "pay_amount": j.pay_amount, "pay_unit": j.pay_unit,
                      "start_date": j.start_date.isoformat() if j.start_date else None, "end_date": j.end_date.isoformat() if j.end_date else None,
                      "workers_needed": j.workers_needed, "skills": j.skills, "governorate": j.governorate, "farm": {"id": j.farm.id, "name": j.farm.name, "demo": j.farm.demo, **models.attribution(j.farm)},
                      "distance_km": round(d, 1), "job_radius_km": j.radius_km, "match": score, "matching_skills": overlap,
                      "applied": j.id in applied, "created_at": models.iso(j.created_at), **models.attribution(j),
                      **models.estimate("Aqua estimates distance from the profile governorate and matches listed skills.")})
    items.sort(key=lambda x: (-x["match"], x["distance_km"]))
    return {"radius_km": reach, "location": prof.governorate, "total": len(items), "items": items[offset:offset + limit]}


@router.get("/farms/{farm_id}/candidates")
def candidates(farm_id: int, radius_km: int = Query(default=50, ge=1, le=500), job_id: int | None = None, kinds: str = "", skills: str = "",
               q: str = "", limit: int = Query(default=24, ge=1, le=100), offset: int = Query(default=0, ge=0),
               user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    """People looking for work near this farm: inside the radius the farmer picked and inside the radius they will travel."""
    check(db, user, farm_id, "jobs:manage")
    farm = db.get(models.Farm, farm_id)
    if farm.location_source == "unavailable":
        return {"radius_km": radius_km, "total": 0, "items": [], "location_available": False}
    want_kinds, want_skills = _lower(_csv(kinds)) & KINDS, _lower(_csv(skills))
    if job_id is not None:
        job = db.get(models.JobPost, job_id)
        if not job or job.farm_id != farm_id:
            raise HTTPException(404, "not found")
        want_kinds = want_kinds or {job.kind}
        want_skills = want_skills or _lower(job.skills)
    members = {m.user_id for m in farm.members}
    needle = q.strip().lower()
    items = []
    for p in db.scalars(select(models.Profile).where(models.Profile.visibility == "public", models.Profile.looking_for_work.is_(True))).all():
        u = p.user
        if not u.active or demo_mode(u) != demo_mode(user) or u.id in members or p.governorate not in GOVERNORATES:
            continue
        if needle and needle not in f"{u.name} {p.headline} {p.bio}".lower():
            continue
        g = GOVERNORATES[p.governorate]
        d = distance_km(farm.lat, farm.lon, g[0], g[1])
        if d > radius_km or d > p.radius_km:
            continue
        if want_kinds and p.kinds and not (want_kinds & _lower(p.kinds)):
            continue
        score, overlap = match_score(want_kinds, want_skills, None, p.skills)
        has_cv = db.scalar(select(models.Cv.id).where(models.Cv.user_id == u.id)) is not None
        items.append({"user_id": u.id, "name": u.name or u.email.split("@")[0], "headline": p.headline, "governorate": p.governorate,
                      "photo": models.people_photo_url(p.photo),
                      "skills": p.skills, "kinds": p.kinds, "languages": p.languages, "availability": p.availability,
                      "distance_km": round(d, 1), "their_radius_km": p.radius_km, "match": score, "matching_skills": overlap, "has_cv": has_cv, "demo": demo_mode(u), **models.attribution(p),
                      **models.estimate("Aqua estimates distance to the profile governorate centre and matches listed skills.")})
    items.sort(key=lambda x: (-x["match"], x["distance_km"]))
    return {"radius_km": radius_km, "total": len(items), "items": items[offset:offset + limit]}
