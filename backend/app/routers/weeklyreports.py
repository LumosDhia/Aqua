"""Weekly farm reports: the numbers, the stored PDFs, and making one on demand."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, weekly
from ..config import settings
from ..db import get_db
from ..rbac import check, current_user

router = APIRouter(prefix="/api", tags=["weekly-reports"])


class MakeIn(BaseModel):
    week: date | None = None          # any date inside the week; empty = this week


def _meta(r: models.WeeklyReport) -> dict:
    return {"id": r.id, "week_start": r.week_start.isoformat(), "score": r.score, "mood": r.mood, "kind": r.kind, "created_at": models.iso(r.created_at), **models.attribution(r),
            **models.estimate("Aqua calculates the weekly score from recorded farm data.")}


def _farm(db: Session, farm_id: int) -> models.Farm:
    return db.get(models.Farm, farm_id)


@router.get("/farms/{farm_id}/reports/weekly")
def weekly_summary(farm_id: int, week: date | None = None, ai: bool = Query(default=False), user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    """The week's numbers, comparison with the four weeks before, and advice. Advice is rule based unless ai=true (slower)."""
    check(db, user, farm_id, "farm:read")
    return weekly.summary(db, _farm(db, farm_id), weekly.monday_of(week) if week else weekly.current_week(), with_ai=ai)


@router.get("/farms/{farm_id}/reports")
def list_reports(farm_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "farm:read")
    rows = db.scalars(select(models.WeeklyReport).where(models.WeeklyReport.farm_id == farm_id).order_by(models.WeeklyReport.week_start.desc()).limit(60)).all()
    farm = _farm(db, farm_id)
    return {"reports": [_meta(r) for r in rows],
            "schedule": {"enabled": settings.weekly_scheduler and not farm.is_fixture,
                         "day": "sunday", "time": "20:00", "timezone": "Africa/Tunis"}}


@router.post("/farms/{farm_id}/reports/weekly")
def make_now(farm_id: int, body: MakeIn | None = None, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    role = check(db, user, farm_id, "water:manage")
    try:
        row = weekly.make_report(db, _farm(db, farm_id), weekly.monday_of(body.week) if body and body.week else weekly.current_week(), kind="manual", actor=user, role=role)
    except RuntimeError as e:
        raise HTTPException(502, str(e))
    return _meta(row)


@router.get("/farms/{farm_id}/reports/{report_id}/pdf")
def download_pdf(farm_id: int, report_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "farm:read")
    r = db.get(models.WeeklyReport, report_id)
    path = weekly.reports_dir() / r.file_name if r and r.farm_id == farm_id else None
    if not path or not path.exists():
        raise HTTPException(404, "not found")
    return FileResponse(path, media_type="application/pdf", filename=f"aqua-week-{r.week_start.isoformat()}.pdf", headers={"Cache-Control": "private, no-store"})
