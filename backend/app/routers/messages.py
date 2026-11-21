"""Chat between a farm's managers and the worker of an engagement. Contact only opens after a hire."""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..farm_access import demo_mode
from ..rbac import RANK, current_user, farm_role

router = APIRouter(prefix="/api", tags=["messages"])


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=1000)


def _side(db: Session, user: models.User, eid: int) -> tuple[models.Engagement, str]:
    """Which side of the conversation the user is on. Anyone else gets a 404."""
    e = db.get(models.Engagement, eid)
    if not e or e.farm.demo != demo_mode(user) or demo_mode(e.worker) != demo_mode(user):
        raise HTTPException(404, "not found")
    if e.worker_id == user.id:
        return e, "worker"
    role = farm_role(db, user, e.farm_id)
    if role is not None and RANK[role] >= RANK["manager"]:
        return e, "farm"
    raise HTTPException(404, "not found")


def _msg_out(m: models.Message, user: models.User) -> dict:
    return {"id": m.id, "body": m.body, "mine": m.sender_id == user.id, "created_at": models.iso(m.created_at),
            "read": m.read_at is not None, "sender": m.sender.name or m.sender.email.split("@")[0], **models.attribution(m)}


def _unread_q(e: models.Engagement, side: str, user: models.User):
    """Messages from the other side that nobody on my side has opened yet."""
    q = select(models.Message).where(models.Message.engagement_id == e.id, models.Message.read_at.is_(None))
    return q.where(models.Message.sender_id != e.worker_id) if side == "worker" else q.where(models.Message.sender_id == e.worker_id)


@router.get("/engagements/{eid}/messages")
def read_thread(eid: int, limit: int = Query(default=100, ge=1, le=200), user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    e, side = _side(db, user, eid)
    at = models.now()
    role = "worker" if side == "worker" else farm_role(db, user, e.farm_id)
    unread_ids = _unread_q(e, side, user).with_only_columns(models.Message.id)
    db.execute(update(models.Message).where(models.Message.id.in_(unread_ids), models.Message.read_at.is_(None))
               .values(read_at=at, updated_at=at, updated_by_id=user.id, updated_by_role=role))
    db.commit()
    rows = db.scalars(select(models.Message).where(models.Message.engagement_id == eid)
                      .order_by(models.Message.created_at.desc(), models.Message.id.desc()).limit(limit)).all()
    return [_msg_out(m, user) for m in reversed(rows)]


@router.post("/engagements/{eid}/messages")
def send(eid: int, body: MessageIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    e, side = _side(db, user, eid)
    text = body.body.strip()
    if not text:
        raise HTTPException(422, "Write a message first")
    role = "worker" if side == "worker" else farm_role(db, user, e.farm_id)
    m = models.Message(engagement_id=eid, sender_id=user.id, body=text, **models.entered(user, role))
    db.add(m); db.commit(); db.refresh(m)
    return _msg_out(m, user)


def _my_engagements(db: Session, user: models.User) -> list[tuple[models.Engagement, str]]:
    out = [(e, "worker") for e in db.scalars(select(models.Engagement).where(models.Engagement.worker_id == user.id)).all()]
    managed = [m.farm_id for m in user.memberships if RANK[m.role] >= RANK["manager"]]
    if managed:
        out += [(e, "farm") for e in db.scalars(select(models.Engagement).where(models.Engagement.farm_id.in_(managed),
                                                                              models.Engagement.worker_id != user.id)).all()]
    return [(e, side) for e, side in out if e.farm.demo == demo_mode(user) == demo_mode(e.worker)]


@router.get("/messages/threads")
def threads(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    items = []
    for e, side in _my_engagements(db, user):
        last = db.scalar(select(models.Message).where(models.Message.engagement_id == e.id)
                         .order_by(models.Message.created_at.desc(), models.Message.id.desc()).limit(1))
        unread = db.scalar(select(func.count()).select_from(_unread_q(e, side, user).subquery()))
        other = (e.farm.name if side == "worker" else (e.worker.name or e.worker.email.split("@")[0]))
        items.append({"engagement_id": e.id, "side": side, "with": other, "farm": e.farm.name, "title": e.title, "status": e.status,
                      "unread": unread, "last_message": last.body[:120] if last else None,
                      "demo": e.farm.demo, **models.attribution(last if last else e),
                      "last_at": models.iso(last.created_at) if last else models.iso(e.created_at)})
    items.sort(key=lambda i: i["last_at"] or "", reverse=True)
    return items


@router.get("/messages/unread")
def unread(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    by = {}
    for e, side in _my_engagements(db, user):
        n = db.scalar(select(func.count()).select_from(_unread_q(e, side, user).subquery()))
        if n:
            by[e.id] = n
    return {"total": sum(by.values()), "by_engagement": by}
