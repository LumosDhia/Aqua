"""Role based access control.

Global role (users.role):  admin | user
  admin: full access to everything, manages users.
Farm role (farm_members.role), ordered:  viewer < technician < manager < owner
  viewer:      read farms, plots, readings, saved water
  technician:  viewer + run decisions (irrigation)
  manager:     technician + create/edit plots
  owner:       manager + edit/delete farm, manage members
"""
from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models
from .db import get_db
from .farm_access import FIXTURE_ACCOUNTS
from .security import read_token

FARM_ROLES = ["viewer", "technician", "manager", "owner"]
RANK = {r: i for i, r in enumerate(FARM_ROLES)}

# permission -> minimum farm role
PERMS = {
    "farm:read": "viewer",
    "plot:read": "viewer",
    "plot:decide": "technician",
    "plot:write": "manager",
    "farm:write": "owner",
    "member:manage": "owner",
    "worker:manage": "manager",
    "task:assign": "technician",
    "water:manage": "manager",
    "water:update": "technician",
    "market:manage": "manager",
    "jobs:manage": "manager",
    "device:manage": "manager",
    "device:control": "technician",
    "device:mode": "manager",
}


def current_user(authorization: str = Header(default=""), db: Session = Depends(get_db)) -> models.User:
    scheme, _, token = authorization.partition(" ")
    uid = read_token(token) if scheme.lower() == "bearer" else None
    user = db.get(models.User, uid) if uid else None
    if not user or not user.active:
        raise HTTPException(401, "not authenticated", headers={"WWW-Authenticate": "Bearer"})
    return user


def require_admin(user: models.User = Depends(current_user)) -> models.User:
    if user.role != "admin":
        raise HTTPException(403, "admin only")
    return user


def farm_role(db: Session, user: models.User, farm_id: int) -> str | None:
    fixture = db.scalar(select(models.Farm.is_fixture).where(models.Farm.id == farm_id))
    if fixture is None or fixture != (user.email in FIXTURE_ACCOUNTS):
        return None
    if user.role == "admin":
        return "owner"
    m = db.scalar(select(models.FarmMember).where(
        models.FarmMember.user_id == user.id, models.FarmMember.farm_id == farm_id))
    return m.role if m else None


def check(db: Session, user: models.User, farm_id: int, perm: str) -> str:
    """Raise 404 if the user has no access to the farm at all (hides existence), 403 if the role is too low."""
    role = farm_role(db, user, farm_id)
    if role is None:
        raise HTTPException(404, "not found")
    if RANK[role] < RANK[PERMS[perm]]:
        raise HTTPException(403, f"needs farm role {PERMS[perm]} or higher")
    return role


def plot_or_404(db: Session, user: models.User, plot_id: int, perm: str) -> models.Plot:
    plot = db.get(models.Plot, plot_id)
    if not plot:
        raise HTTPException(404, "not found")
    check(db, user, plot.farm_id, perm)
    return plot
