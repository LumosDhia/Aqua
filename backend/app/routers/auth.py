import base64
import binascii
import secrets
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from ..db import get_db
from ..farm_access import FIXTURE_ACCOUNTS, demo_mode, visible_farms
from ..rbac import check, current_user, require_admin
from ..security import hash_password, make_token, verify_password

router = APIRouter(prefix="/api", tags=["auth"])

MAX_PHOTO_BYTES = 3 * 1024 * 1024


def _people_dir() -> Path:
    return Path(settings.uploads_dir) / "people"


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


@router.post("/auth/register", response_model=schemas.RegisteredOut)
def register(body: schemas.RegisterIn, db: Session = Depends(get_db)):
    """Public sign-up always creates a normal user. Admins are made by seed.py or by another admin."""
    email = body.email.lower().strip()
    if email in FIXTURE_ACCOUNTS or db.scalar(select(models.User).where(models.User.email == email)):
        raise HTTPException(409, "email already used")
    user = models.User(email=email, name=body.name, password_hash=hash_password(body.password), role="user",
                       account_type=body.account_type)
    try:
        db.add(user)
        db.flush()
        db.add(models.Profile(user_id=user.id, looking_for_work=body.account_type == "worker"))
        db.commit()
    except IntegrityError:
        db.rollback()
        if db.scalar(select(models.User).where(models.User.email == email)):
            raise HTTPException(409, "email already used")
        raise
    db.refresh(user)
    return {**schemas.UserOut.model_validate(user).model_dump(), "access_token": make_token(user.id)}


@router.post("/auth/login", response_model=schemas.TokenOut)
def login(body: schemas.LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(models.User).where(models.User.email == body.email.lower().strip()))
    if not user or not user.active or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "bad email or password")
    return {"access_token": make_token(user.id), "user": _signed_in_user(user, db)}


@router.get("/me", response_model=schemas.MeOut)
@router.get("/auth/me", response_model=schemas.MeOut)
def me(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    return _signed_in_user(user, db)


def _signed_in_user(user: models.User, db: Session) -> dict:
    membership_count = db.scalar(
        select(func.count()).select_from(models.FarmMember).join(models.Farm).where(
            models.FarmMember.user_id == user.id,
            models.Farm.is_fixture == (user.email in FIXTURE_ACCOUNTS),
        )
    ) or 0
    farms = db.scalars(visible_farms(user)).all()
    return {**schemas.UserOut.model_validate(user).model_dump(),
            "farm_count": membership_count, "accessible_farm_count": len(farms), "farms": farms}


@router.get("/users", response_model=list[schemas.UserOut])
def list_users(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.scalars(select(models.User).where(models.User.email.in_(FIXTURE_ACCOUNTS) == demo_mode(admin))).all()


@router.patch("/users/{user_id}", response_model=schemas.UserOut)
def update_user(user_id: int, body: schemas.UserPatch, admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    u = db.get(models.User, user_id)
    if not u or demo_mode(u) != demo_mode(admin):
        raise HTTPException(404, "not found")
    if u.id == admin.id and (body.role == "user" or body.active is False):
        raise HTTPException(400, "admin cannot demote or disable self")
    if body.role is not None:
        u.role = body.role
    if body.active is not None:
        u.active = body.active
    db.commit(); db.refresh(u)
    return u


@router.put("/me/photo")
def set_photo(body: PhotoIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    """Set the account profile picture. The client sends the raw bytes as base64."""
    try:
        raw = base64.b64decode(body.data, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, "The photo could not be read")
    if not raw:
        raise HTTPException(422, "The photo is empty")
    if len(raw) > MAX_PHOTO_BYTES:
        raise HTTPException(413, "The photo is larger than 3 MB")
    ext = _image_ext(raw)
    if not ext:
        raise HTTPException(422, "Use a JPEG, PNG or WebP photo")
    name = f"u{user.id}-{secrets.token_urlsafe(8)}.{ext}"
    dest = _people_dir() / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(raw)
    old = user.photo
    user.photo = name
    db.commit()
    if old:
        old_file = _people_dir() / old
        if old_file.exists():
            old_file.unlink()
    return {"photo": models.people_photo_url(name)}


@router.get("/farms/{farm_id}/members", response_model=list[schemas.MemberOut])
def list_members(farm_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "farm:read")
    rows = db.scalars(select(models.FarmMember).where(models.FarmMember.farm_id == farm_id)).all()
    return [{"user_id": m.user_id, "email": m.user.email, "name": m.user.name, "role": m.role, **models.attribution(m)} for m in rows]


@router.put("/farms/{farm_id}/members", response_model=schemas.MemberOut)
def set_member(farm_id: int, body: schemas.MemberIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    role = check(db, user, farm_id, "member:manage")
    target = db.scalar(select(models.User).where(models.User.email == body.email.lower().strip()))
    if not target:
        raise HTTPException(404, "user not found")
    if (target.email in FIXTURE_ACCOUNTS) != (user.email in FIXTURE_ACCOUNTS):
        raise HTTPException(422, "This account cannot join this farm.")
    m = db.scalar(select(models.FarmMember).where(
        models.FarmMember.user_id == target.id, models.FarmMember.farm_id == farm_id))
    if m and m.role == "owner" and body.role != "owner" and _owner_count(db, farm_id) <= 1:
        raise HTTPException(400, "farm needs at least one owner")
    if m:
        if m.role != body.role:
            m.role = body.role
            m.record_edit(user, role)
    else:
        m = models.FarmMember(user_id=target.id, farm_id=farm_id, role=body.role, **models.entered(user, role))
        db.add(m)
    db.commit(); db.refresh(m)
    return {"user_id": target.id, "email": target.email, "name": target.name, "role": m.role, **models.attribution(m)}


@router.delete("/farms/{farm_id}/members/{user_id}", status_code=204)
def remove_member(farm_id: int, user_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "member:manage")
    m = db.scalar(select(models.FarmMember).where(
        models.FarmMember.user_id == user_id, models.FarmMember.farm_id == farm_id))
    if not m:
        raise HTTPException(404, "not found")
    if m.role == "owner" and _owner_count(db, farm_id) <= 1:
        raise HTTPException(400, "farm needs at least one owner")
    db.delete(m); db.commit()


def _owner_count(db: Session, farm_id: int) -> int:
    return len(db.scalars(select(models.FarmMember).where(
        models.FarmMember.farm_id == farm_id, models.FarmMember.role == "owner")).all())
