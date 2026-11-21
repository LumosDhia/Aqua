from collections import Counter
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..geo import GOVERNORATES
from ..rbac import current_user
from .discovery import opportunities
from .engagements import my_engagements
from .jobs import my_applications
from .messages import unread
from .profiles import my_profile

router = APIRouter(prefix="/api", tags=["home"])


class AccountTypeIn(BaseModel):
    account_type: Literal["farmer", "worker"]


@router.put("/account/type")
def switch_account_type(body: AccountTypeIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    user.account_type = body.account_type
    db.commit()
    farm_count = len(user.memberships)
    return {"account_type": user.account_type, "farm_count": farm_count, "has_farm": bool(farm_count)}


@router.get("/home/worker")
def worker_home(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    profile = my_profile(user, db)
    work = my_engagements(user, db)
    counts = Counter(a["status"] for a in my_applications(user, db))
    applications = {status: counts[status] for status in ("pending", "accepted", "declined")}
    applications["total"] = sum(applications.values())
    nearby = None
    if profile["governorate"] in GOVERNORATES:
        nearby = opportunities(radius_km=None, limit=1, offset=0, user=user, db=db)["total"]
    unread_by_engagement = unread(user, db)["by_engagement"]
    return {"profile": profile, "has_farm": bool(profile["farm_count"]),
            "active_work": [e for e in work if e["status"] == "active"], "applications": applications,
            "opportunities_nearby": nearby, "unread_messages": sum(unread_by_engagement.get(e["id"], 0) for e in work)}
