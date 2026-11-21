from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..farm_access import FIXTURE_ACCOUNTS, demo_mode
from ..geo import GOVERNORATES, distance_km
from ..rbac import RANK, check, current_user, farm_role
from .engagements import cancel_for_application, open_engagement
from .profiles import get_or_create

router = APIRouter(prefix="/api", tags=["jobs"])


class JobIn(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(default="", max_length=2000)
    kind: Literal["task", "period", "long_term"]
    start_date: date | None = None
    end_date: date | None = None
    pay_mode: Literal["fixed", "negotiable"] = "negotiable"
    pay_amount: float | None = Field(default=None, gt=0, le=1_000_000)
    pay_unit: Literal["hour", "day", "task", "week", "month"] | None = None
    workers_needed: int = Field(default=1, ge=1, le=100)
    skills: list[str] = Field(default=[], max_length=8)
    governorate: str = Field(max_length=40)
    address_text: str = Field(default="", max_length=200)
    status: Literal["open", "filled", "closed"] = "open"
    radius_km: int | None = Field(default=None, ge=1, le=500)


class ApplicationIn(BaseModel):
    message: str = Field(min_length=5, max_length=1000)


class ApplicationPatch(BaseModel):
    status: Literal["accepted", "declined"]


def _validate(b: JobIn) -> None:
    if b.governorate not in GOVERNORATES:
        raise HTTPException(422, "Choose a governorate from the list")
    if b.kind == "period" and (not b.start_date or not b.end_date):
        raise HTTPException(422, "A job for a period needs a start and an end date")
    if b.start_date and b.end_date and b.end_date < b.start_date:
        raise HTTPException(422, "The end date is before the start date")
    if b.pay_mode == "fixed" and (b.pay_amount is None or b.pay_unit is None):
        raise HTTPException(422, "Give the pay amount and what it is per, or choose negotiable")
    if any(not s.strip() or len(s) > 30 for s in b.skills):
        raise HTTPException(422, "Each skill must be 1 to 30 characters")


def job_out(j: models.JobPost, db: Session, user: models.User, near: tuple[float, float] | None = None,
            mine: bool | None = None) -> dict:
    if mine is None:
        mine = farm_role(db, user, j.farm_id) is not None
    lat, lon = GOVERNORATES.get(j.governorate, (None, None))
    out = {"id": j.id, "title": j.title, "description": j.description, "kind": j.kind,
           "start_date": j.start_date.isoformat() if j.start_date else None,
           "end_date": j.end_date.isoformat() if j.end_date else None,
           "pay_mode": j.pay_mode, "pay_amount": j.pay_amount, "pay_unit": j.pay_unit,
           "workers_needed": j.workers_needed, "skills": j.skills, "governorate": j.governorate,
           "address_text": j.address_text, "status": j.status, "radius_km": j.radius_km,
           "farm": {"id": j.farm.id, "name": j.farm.name, "region": j.farm.region,
                    "demo": j.farm.demo, **models.attribution(j.farm)},
           "distance_km": round(distance_km(near[0], near[1], lat, lon), 1) if near and lat is not None else None,
           "is_mine": mine, "created_at": models.iso(j.created_at), "updated_at": models.iso(j.updated_at), **models.attribution(j),
           "accepted_count": sum(1 for a in j.applications if a.status == "accepted")}
    if out["distance_km"] is not None:
        out.update(models.estimate("Aqua estimates straight-line distance to the job governorate centre."))
    if mine:
        out["application_count"] = sum(1 for a in j.applications if a.status != "withdrawn")
        out["pending_applications"] = sum(1 for a in j.applications if a.status == "pending")
    return out


def _app_out(a: models.JobApplication, with_applicant: bool) -> dict:
    out = {"id": a.id, "job_id": a.job_id, "job_title": a.job.title, "message": a.message, "status": a.status,
           "created_at": models.iso(a.created_at), "demo": a.job.farm.demo, **models.attribution(a)}
    if with_applicant:
        out["applicant"] = {"id": a.applicant.id, "name": a.applicant.name or a.applicant.email.split("@")[0],
                            "email": a.applicant.email}
    else:
        out["farm_name"] = a.job.farm.name
    return out


@router.get("/jobs")
def browse(q: str = "", kind: Literal["", "task", "period", "long_term"] = "", governorate: str = "",
           sort: Literal["newest", "pay", "distance"] = "newest", near_farm_id: int | None = None,
           limit: int = Query(default=24, ge=1, le=100), offset: int = Query(default=0, ge=0),
           user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(models.JobPost).join(models.Farm).where(models.JobPost.status == "open", models.Farm.is_fixture == demo_mode(user))
    stmt = stmt.where(or_(models.JobPost.end_date.is_(None), models.JobPost.end_date >= date.today()))
    if q.strip():
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(or_(func.lower(models.JobPost.title).like(like), func.lower(models.JobPost.description).like(like)))
    if kind:
        stmt = stmt.where(models.JobPost.kind == kind)
    if governorate:
        stmt = stmt.where(models.JobPost.governorate == governorate)
    near = None
    if near_farm_id is not None:
        if farm_role(db, user, near_farm_id) is None:
            raise HTTPException(404, "not found")
        f = db.get(models.Farm, near_farm_id)
        near = (f.lat, f.lon) if f.location_source != "unavailable" else None
    items = [job_out(j, db, user, near) for j in db.scalars(stmt).all()]
    keys = {"newest": lambda x: x["created_at"], "pay": lambda x: x["pay_amount"] or 0,
            "distance": lambda x: x["distance_km"] if x["distance_km"] is not None else 1e12}
    items.sort(key=keys[sort], reverse=sort != "distance")
    return {"total": len(items), "items": items[offset:offset + limit]}


@router.get("/jobs/my-applications")
def my_applications(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(models.JobApplication).join(models.JobPost).join(models.Farm).where(
        models.JobApplication.applicant_id == user.id, models.Farm.is_fixture == demo_mode(user))
                      .order_by(models.JobApplication.created_at.desc())).all()
    return [_app_out(a, False) for a in rows]


class OfferIn(BaseModel):
    user_id: int
    message: str = Field(default="", max_length=1000)


class OfferPatch(BaseModel):
    status: Literal["accepted", "declined"]


def _offer_out(o: models.JobOffer, for_farm: bool) -> dict:
    j = o.job
    out = {"id": o.id, "job_id": o.job_id, "job_title": j.title, "message": o.message, "status": o.status,
           "created_at": models.iso(o.created_at), "demo": j.farm.demo, **models.attribution(o)}
    if for_farm:
        out["worker"] = {"id": o.worker.id, "name": o.worker.name or o.worker.email.split("@")[0]}
    else:
        out.update({"farm_name": j.farm.name, "farm_region": j.farm.region, "kind": j.kind, "governorate": j.governorate,
                    "pay_mode": j.pay_mode, "pay_amount": j.pay_amount, "pay_unit": j.pay_unit,
                    "start_date": j.start_date.isoformat() if j.start_date else None,
                    "end_date": j.end_date.isoformat() if j.end_date else None, "job_status": j.status})
    return out


@router.get("/jobs/my-offers")
def my_offers(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    """Invitations farms sent me. Withdrawn ones are not shown."""
    rows = db.scalars(select(models.JobOffer).join(models.JobPost, models.JobOffer.job_id == models.JobPost.id).join(models.Farm).where(
        models.JobOffer.worker_id == user.id, models.JobOffer.status != "withdrawn", models.Farm.is_fixture == demo_mode(user))
                      .order_by(models.JobOffer.created_at.desc())).all()
    return [_offer_out(o, False) for o in rows]


@router.patch("/jobs/offers/{offer_id}")
def answer_offer(offer_id: int, body: OfferPatch, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    o = db.get(models.JobOffer, offer_id)
    if not o or o.worker_id != user.id or o.job.farm.demo != demo_mode(user):
        raise HTTPException(404, "not found")
    if o.status != "pending":
        raise HTTPException(409, f"This offer was already {o.status}")
    j = o.job
    if body.status == "accepted":
        if j.status != "open":
            raise HTTPException(409, "This job is no longer open")
        a = db.scalar(select(models.JobApplication).where(models.JobApplication.job_id == j.id, models.JobApplication.applicant_id == user.id))
        if a is None:
            a = models.JobApplication(job_id=j.id, applicant_id=user.id, message="I accepted your invitation.", status="accepted", **models.entered(user))
            db.add(a)
        else:
            a.status = "accepted"
        db.flush()
        open_engagement(db, a, user, "worker")
        db.flush()
        db.refresh(j)
        if sum(1 for x in j.applications if x.status == "accepted") >= j.workers_needed:
            j.status = "filled"
    o.status = body.status
    o.record_edit(user, "worker")
    db.commit()
    return _offer_out(o, False)


@router.post("/farms/{farm_id}/jobs/{job_id}/offers")
def invite_worker(farm_id: int, job_id: int, body: OfferIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    role = check(db, user, farm_id, "jobs:manage")
    j = _own_job(db, farm_id, job_id)
    if j.status != "open":
        raise HTTPException(409, "Only an open job can be offered")
    w = db.get(models.User, body.user_id)
    prof = get_or_create(db, w) if w else None
    if not w or not w.active or demo_mode(w) != demo_mode(user) or prof.visibility != "public" or not prof.looking_for_work:
        raise HTTPException(404, "This person is not open to work")
    if any(m.user_id == w.id for m in j.farm.members):
        raise HTTPException(409, "This person is already on your farm")
    if db.scalar(select(models.JobOffer).where(models.JobOffer.job_id == job_id, models.JobOffer.worker_id == w.id, models.JobOffer.status != "withdrawn")):
        raise HTTPException(409, "You already invited this person to this job")
    if db.scalar(select(models.JobApplication).where(models.JobApplication.job_id == job_id, models.JobApplication.applicant_id == w.id,
                                                      models.JobApplication.status.in_(("pending", "accepted")))):
        raise HTTPException(409, "This person already applied to this job")
    o = db.scalar(select(models.JobOffer).where(models.JobOffer.job_id == job_id, models.JobOffer.worker_id == w.id))
    if o is None:
        o = models.JobOffer(job_id=job_id, worker_id=w.id, message=body.message.strip(), **models.entered(user, role))
        db.add(o)
    else:                                                                   # an earlier withdrawn offer is sent again
        o.status, o.message = "pending", body.message.strip()
        o.record_edit(user, role)
    db.commit(); db.refresh(o)
    return _offer_out(o, True)


@router.get("/farms/{farm_id}/jobs/offers")
def farm_offers(farm_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "jobs:manage")
    rows = db.scalars(select(models.JobOffer).join(models.JobPost, models.JobOffer.job_id == models.JobPost.id).where(models.JobPost.farm_id == farm_id)
                      .order_by(models.JobOffer.created_at.desc())).all()
    return [_offer_out(o, True) for o in rows if demo_mode(o.worker) == demo_mode(user)]


@router.delete("/farms/{farm_id}/jobs/offers/{offer_id}", status_code=204)
def withdraw_offer(farm_id: int, offer_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    role = check(db, user, farm_id, "jobs:manage")
    o = db.get(models.JobOffer, offer_id)
    if not o or o.job.farm_id != farm_id:
        raise HTTPException(404, "not found")
    if o.status == "pending":
        o.status = "withdrawn"
        o.record_edit(user, role)
    db.commit()


@router.get("/jobs/{job_id}")
def job_detail(job_id: int, near_farm_id: int | None = None, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    j = db.get(models.JobPost, job_id)
    mine = bool(j) and farm_role(db, user, j.farm_id) is not None
    if not j or j.farm.demo != demo_mode(user) or (j.status == "closed" and not mine):
        raise HTTPException(404, "not found")
    near = None
    if near_farm_id is not None and farm_role(db, user, near_farm_id) is not None:
        f = db.get(models.Farm, near_farm_id)
        near = (f.lat, f.lon) if f.location_source != "unavailable" else None
    out = job_out(j, db, user, near, mine)
    app = db.scalar(select(models.JobApplication).where(models.JobApplication.job_id == j.id,
                                                         models.JobApplication.applicant_id == user.id))
    out["my_application"] = _app_out(app, False) if app else None
    return out


@router.get("/farms/{farm_id}/jobs")
def farm_jobs(farm_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "farm:read")
    rows = db.scalars(select(models.JobPost).where(models.JobPost.farm_id == farm_id).order_by(models.JobPost.created_at.desc())).all()
    return [job_out(j, db, user, mine=True) for j in rows]


@router.post("/farms/{farm_id}/jobs")
def create_job(farm_id: int, body: JobIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    role = check(db, user, farm_id, "jobs:manage")
    _validate(body)
    j = models.JobPost(farm_id=farm_id, **models.entered(user, role),
                       **{**body.model_dump(), "title": body.title.strip(), "skills": [s.strip() for s in body.skills]})
    db.add(j); db.commit(); db.refresh(j)
    return job_out(j, db, user, mine=True)


def _own_job(db: Session, farm_id: int, job_id: int) -> models.JobPost:
    j = db.get(models.JobPost, job_id)
    if not j or j.farm_id != farm_id:
        raise HTTPException(404, "not found")
    return j


@router.patch("/farms/{farm_id}/jobs/{job_id}")
def edit_job(farm_id: int, job_id: int, body: JobIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    role = check(db, user, farm_id, "jobs:manage")
    j = _own_job(db, farm_id, job_id)
    _validate(body)
    for k, v in body.model_dump().items():
        setattr(j, k, [s.strip() for s in v] if k == "skills" else v)
    if db.is_modified(j):
        j.record_edit(user, role)
    db.commit(); db.refresh(j)
    return job_out(j, db, user, mine=True)


@router.delete("/farms/{farm_id}/jobs/{job_id}", status_code=204)
def delete_job(farm_id: int, job_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "jobs:manage")
    db.delete(_own_job(db, farm_id, job_id)); db.commit()


@router.post("/jobs/{job_id}/applications")
def apply(job_id: int, body: ApplicationIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    j = db.get(models.JobPost, job_id)
    if not j or j.farm.demo != demo_mode(user) or j.status != "open":
        raise HTTPException(404, "not found")
    if farm_role(db, user, j.farm_id) is not None:
        raise HTTPException(409, "This is your own job post")
    if get_or_create(db, user).visibility == "private":
        raise HTTPException(403, "Your profile is private. Make it public to apply for jobs.")
    if db.scalar(select(models.JobApplication).where(models.JobApplication.job_id == job_id,
                                                      models.JobApplication.applicant_id == user.id)):
        raise HTTPException(409, "You already applied to this job")
    a = models.JobApplication(job_id=job_id, applicant_id=user.id, message=body.message.strip(), **models.entered(user))
    db.add(a); db.commit(); db.refresh(a)
    return _app_out(a, False)


@router.get("/farms/{farm_id}/jobs/applications")
def farm_applications(farm_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "jobs:manage")
    rows = db.scalars(select(models.JobApplication).join(models.JobPost).where(
        models.JobPost.farm_id == farm_id,
        models.JobApplication.applicant.has(models.User.email.in_(FIXTURE_ACCOUNTS) == demo_mode(user)))
                      .order_by(models.JobApplication.created_at.desc())).all()
    return [_app_out(a, True) for a in rows]


@router.patch("/jobs/applications/{application_id}")
def decide(application_id: int, body: ApplicationPatch, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    a = db.get(models.JobApplication, application_id)
    role = farm_role(db, user, a.job.farm_id) if a else None
    if role is None or demo_mode(a.applicant) != demo_mode(user):
        raise HTTPException(404, "not found")
    if RANK[role] < RANK["manager"]:
        raise HTTPException(403, "needs farm role manager or higher")
    if a.status == "withdrawn":
        raise HTTPException(409, "The applicant withdrew")
    if a.status != body.status:
        a.status = body.status
        a.record_edit(user, role)
    db.flush()
    if a.status == "accepted":
        open_engagement(db, a, user, role)
    else:
        cancel_for_application(db, a, user, role)
    job = a.job
    accepted = sum(1 for x in job.applications if x.status == "accepted")
    if job.status == "open" and accepted >= job.workers_needed:
        job.status = "filled"
        job.record_edit(user, role)
    db.commit()
    return _app_out(a, True)


@router.delete("/jobs/applications/{application_id}", status_code=204)
def withdraw(application_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    a = db.get(models.JobApplication, application_id)
    if not a or a.applicant_id != user.id or a.job.farm.demo != demo_mode(user):
        raise HTTPException(404, "not found")
    if a.status != "withdrawn":
        a.status = "withdrawn"
        a.record_edit(user, user.role)
    db.commit()
