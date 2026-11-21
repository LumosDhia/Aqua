"""Hiring: an accepted application becomes an engagement, which the farmer finishes, disapproves or upgrades."""
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, object_session

from .. import models
from ..db import get_db
from ..farm_access import FIXTURE_ACCOUNTS, demo_mode
from ..rbac import RANK, check, current_user, farm_role

router = APIRouter(prefix="/api", tags=["engagements"])


class FinishIn(BaseModel):
    note: str = Field(default="", max_length=600)


class DisapproveIn(BaseModel):
    reason: str = Field(min_length=5, max_length=600)


def open_engagement(db: Session, app: models.JobApplication, user: models.User, role: str) -> models.Engagement:
    """Called when a farmer accepts an application. One engagement per application."""
    existing = db.scalar(select(models.Engagement).where(models.Engagement.application_id == app.id))
    if existing:
        return existing
    j = app.job
    e = models.Engagement(farm_id=j.farm_id, worker_id=app.applicant_id, job_id=j.id, application_id=app.id, title=j.title,
                          kind="full_time" if j.kind == "long_term" else "temporary", start_date=j.start_date or date.today(),
                          end_date=j.end_date if j.kind == "period" else None, **models.entered(user, role))
    db.add(e)
    return e


def cancel_for_application(db: Session, app: models.JobApplication, user: models.User, role: str) -> None:
    e = db.scalar(select(models.Engagement).where(models.Engagement.application_id == app.id))
    if e and e.status == "active":
        e.status, e.reason, e.closed_at = "disapproved", "The offer was withdrawn", models.now()
        e.record_edit(user, role, at=e.closed_at)


def eng_out(e: models.Engagement, for_farm: bool) -> dict:
    out = {"id": e.id, "title": e.title, "kind": e.kind, "status": e.status, "start_date": e.start_date.isoformat() if e.start_date else None,
           "end_date": e.end_date.isoformat() if e.end_date else None, "note": e.note, "created_at": models.iso(e.created_at),
           "closed_at": models.iso(e.closed_at), "farm": {"id": e.farm.id, "name": e.farm.name, "region": e.farm.region,
               "demo": e.farm.demo, **models.attribution(e.farm)},
           "upgraded_from_id": e.upgraded_from_id, **models.attribution(e)}
    if for_farm:
        sess = object_session(e)
        photo = sess.scalar(select(models.Profile.photo).where(models.Profile.user_id == e.worker_id)) if sess is not None else None
        out["worker"] = {"id": e.worker.id, "name": e.worker.name or e.worker.email.split("@")[0],
                         "photo": models.people_photo_url(photo)}
    if e.status == "disapproved":
        out["reason"] = e.reason
    return out


def _manage(db: Session, user: models.User, eid: int) -> tuple[models.Engagement, str]:
    e = db.get(models.Engagement, eid)
    role = farm_role(db, user, e.farm_id) if e else None
    if role is None or demo_mode(e.worker) != demo_mode(user):
        raise HTTPException(404, "not found")
    if RANK[role] < RANK["manager"]:
        raise HTTPException(403, "needs farm role manager or higher")
    return e, role


def _must_be_active(e: models.Engagement) -> None:
    if e.status != "active":
        raise HTTPException(409, f"This work is already {e.status}")


@router.get("/farms/{farm_id}/engagements")
def farm_engagements(farm_id: int, status: Literal["active", "finished", "disapproved"] | None = None,
                     user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "jobs:manage")
    q = select(models.Engagement).where(models.Engagement.farm_id == farm_id,
        models.Engagement.worker.has(models.User.email.in_(FIXTURE_ACCOUNTS) == demo_mode(user)))
    if status:
        q = q.where(models.Engagement.status == status)
    return [eng_out(e, True) for e in db.scalars(q.order_by(models.Engagement.created_at.desc())).all()]


@router.get("/engagements/mine")
def my_engagements(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(models.Engagement).join(models.Farm).where(
        models.Engagement.worker_id == user.id, models.Farm.is_fixture == demo_mode(user))
                      .order_by(models.Engagement.created_at.desc())).all()
    return [eng_out(e, False) for e in rows]


@router.post("/engagements/{eid}/finish")
def finish(eid: int, body: FinishIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    e, role = _manage(db, user, eid)
    _must_be_active(e)
    e.status, e.note, e.closed_at = "finished", body.note.strip(), models.now()
    e.end_date = e.end_date or date.today()
    e.record_edit(user, role, at=e.closed_at)
    db.commit()
    return eng_out(e, True)


@router.post("/engagements/{eid}/disapprove")
def disapprove(eid: int, body: DisapproveIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    e, role = _manage(db, user, eid)
    _must_be_active(e)
    e.status, e.reason, e.closed_at = "disapproved", body.reason.strip(), models.now()
    e.record_edit(user, role, at=e.closed_at)
    db.commit()
    return eng_out(e, True)


@router.post("/engagements/{eid}/upgrade")
def upgrade(eid: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    """A finished temporary job becomes a new full-time engagement for the same person."""
    e, role = _manage(db, user, eid)
    if e.status != "finished" or e.kind != "temporary":
        raise HTTPException(409, "Only finished temporary work can be upgraded to full time")
    if db.scalar(select(models.Engagement).where(models.Engagement.upgraded_from_id == e.id)):
        raise HTTPException(409, "Already upgraded")
    n = models.Engagement(farm_id=e.farm_id, worker_id=e.worker_id, job_id=e.job_id, upgraded_from_id=e.id, title=e.title,
                          kind="full_time", start_date=date.today(), **models.entered(user, role))
    db.add(n); db.commit(); db.refresh(n)
    return eng_out(n, True)


def work_history(db: Session, user: models.User) -> dict:
    """What a public profile shows: where the person works now and the finished jobs the farmers confirmed."""
    rows = db.scalars(select(models.Engagement).join(models.Farm).where(models.Engagement.worker_id == user.id,
                                                      models.Farm.is_fixture == demo_mode(user),
                                                      models.Engagement.status.in_(["active", "finished"]))
                      .order_by(models.Engagement.created_at.desc())).all()
    return {"works_at": [{"farm": e.farm.name, "title": e.title, "kind": e.kind, "demo": e.farm.demo, **models.attribution(e)} for e in rows if e.status == "active"],
            "verified_work": [{"farm": e.farm.name, "title": e.title, "kind": e.kind, "start_date": e.start_date.isoformat() if e.start_date else None,
                               "end_date": e.end_date.isoformat() if e.end_date else None, "note": e.note, "demo": e.farm.demo, **models.attribution(e)} for e in rows if e.status == "finished"]}
