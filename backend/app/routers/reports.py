"""Reports to Aqua about a person, and the admin queue that reviews them."""
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..farm_access import FIXTURE_ACCOUNTS, demo_mode
from ..rbac import current_user, require_admin
from .profiles import get_or_create

router = APIRouter(prefix="/api", tags=["reports"])
DAILY_LIMIT = 5
Reason = Literal["scam", "no_show", "unsafe", "harassment", "other"]


class ReportIn(BaseModel):
    target_user_id: int
    reason: Reason
    details: str = Field(min_length=10, max_length=1500)
    engagement_id: int | None = None


class ReportPatch(BaseModel):
    status: Literal["open", "reviewing", "resolved", "dismissed"] | None = None
    admin_note: str | None = Field(default=None, max_length=1000)
    suspend: bool | None = None


def _name(u: models.User) -> str:
    return u.name or u.email.split("@")[0]


def _out(r: models.Report, admin: bool) -> dict:
    out = {"id": r.id, "reason": r.reason, "details": r.details, "status": r.status, "engagement_id": r.engagement_id,
           "created_at": models.iso(r.created_at), "resolved_at": models.iso(r.resolved_at),
           "target": {"id": r.target.id, "name": _name(r.target)},
           "demo": demo_mode(r.reporter), **models.attribution(r)}
    if admin:
        out["reporter"] = {"id": r.reporter.id, "name": _name(r.reporter), "email": r.reporter.email}
        out["target"].update({"email": r.target.email, "active": r.target.active,
                              "reports_against": 0})
        out["admin_note"] = r.admin_note
    if not admin:
        out["updated_by"] = None  # Moderator identities are visible in the admin queue.
    if not admin and r.status in ("resolved", "dismissed"):
        out["admin_note"] = r.admin_note                      # the reporter sees how it ended
    return out


def _shares_work(db: Session, a: int, b: int, engagement_id: int | None) -> bool:
    q = select(models.Engagement).where(or_(models.Engagement.worker_id == a, models.Engagement.worker_id == b))
    if engagement_id is not None:
        q = q.where(models.Engagement.id == engagement_id)
    for e in db.scalars(q).all():
        side_a = e.worker_id == a or any(m.user_id == a for m in e.farm.members)
        side_b = e.worker_id == b or any(m.user_id == b for m in e.farm.members)
        if side_a and side_b and e.worker_id in (a, b):
            return True
    return False


@router.post("/reports")
def create(body: ReportIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    target = db.get(models.User, body.target_user_id)
    if not target or not target.active or demo_mode(target) != demo_mode(user):
        raise HTTPException(404, "not found")
    if target.id == user.id:
        raise HTTPException(422, "You cannot report yourself")
    # you can report someone you worked with, or someone whose profile is public
    if not _shares_work(db, user.id, target.id, body.engagement_id) and (body.engagement_id is not None or get_or_create(db, target).visibility == "private"):
        raise HTTPException(404, "not found")
    since = models.now() - timedelta(hours=24)
    if db.scalar(select(func.count(models.Report.id)).where(models.Report.reporter_id == user.id, models.Report.created_at >= since)) >= DAILY_LIMIT:
        raise HTTPException(429, "You have sent several reports today. Please wait before sending more.")
    if db.scalar(select(models.Report.id).where(models.Report.reporter_id == user.id, models.Report.target_id == target.id,
                                                 models.Report.status.in_(["open", "reviewing"]))):
        raise HTTPException(409, "You already have an open report about this person")
    r = models.Report(reporter_id=user.id, target_id=target.id, engagement_id=body.engagement_id, reason=body.reason, details=body.details.strip(), **models.entered(user))
    db.add(r); db.commit(); db.refresh(r)
    return _out(r, False)


@router.get("/reports/mine")
def mine(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(models.Report).where(models.Report.reporter_id == user.id,
        models.Report.target.has(models.User.email.in_(FIXTURE_ACCOUNTS) == demo_mode(user)))
        .order_by(models.Report.created_at.desc())).all()
    return [_out(r, False) for r in rows]


@router.get("/admin/reports")
def queue(status: Literal["open", "reviewing", "resolved", "dismissed"] | None = None, admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    reporter_is_demo = models.Report.reporter.has(models.User.email.in_(FIXTURE_ACCOUNTS))
    target_is_demo = models.Report.target.has(models.User.email.in_(FIXTURE_ACCOUNTS))
    scope = (reporter_is_demo, target_is_demo) if demo_mode(admin) else (~reporter_is_demo, ~target_is_demo)
    q = select(models.Report).where(*scope)
    if status:
        q = q.where(models.Report.status == status)
    rows = db.scalars(q.order_by(models.Report.created_at.desc())).all()
    counts = dict(db.execute(select(models.Report.target_id, func.count()).where(*scope).group_by(models.Report.target_id)).all())
    out = [_out(r, True) for r in rows]
    for o in out:
        o["target"]["reports_against"] = counts.get(o["target"]["id"], 0)
    return out


@router.patch("/admin/reports/{report_id}")
def review(report_id: int, body: ReportPatch, admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    r = db.get(models.Report, report_id)
    if not r or demo_mode(r.reporter) != demo_mode(admin) or demo_mode(r.target) != demo_mode(admin):
        raise HTTPException(404, "not found")
    if body.suspend is not None:
        if r.target_id == admin.id:
            raise HTTPException(409, "You cannot suspend yourself")
        r.target.active = not body.suspend
    if body.admin_note is not None:
        r.admin_note = body.admin_note.strip()
    if body.status is not None:
        r.status = body.status
        r.resolved_at = models.now() if body.status in ("resolved", "dismissed") else None
    if db.is_modified(r) or db.is_modified(r.target):
        r.record_edit(admin, admin.role)
    db.commit(); db.refresh(r)
    out = _out(r, True)
    out["target"]["reports_against"] = db.scalar(select(func.count(models.Report.id)).where(models.Report.target_id == r.target_id))
    return out
