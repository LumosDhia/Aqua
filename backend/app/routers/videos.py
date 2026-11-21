"""Make, follow and download the weekly film of a farm. One render runs at a time."""
import shutil
import tempfile
import threading
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models, videos, weekly
from ..db import SessionLocal, get_db
from ..rbac import check, current_user

router = APIRouter(prefix="/api", tags=["videos"])
_render_lock = threading.Lock()
MAX_ACTIVE_PER_FARM = 1


class VideoIn(BaseModel):
    week: date | None = None


def videos_dir() -> Path:
    from ..config import settings
    d = Path(settings.private_dir) / "videos"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _meta(j: models.VideoJob) -> dict:
    return {"id": j.id, "week_start": j.week_start.isoformat(), "mood": j.mood, "status": j.status, "error": j.error, "seconds": j.seconds,
            "created_at": models.iso(j.created_at), "finished_at": models.iso(j.finished_at), "ready": j.status == "done",
            **models.attribution(j), **models.estimate("Aqua generates the film from the farm’s weekly data.")}


def run_job(job_id: int, quality: str = "draft") -> None:
    """Background worker: waits its turn, writes the project, renders, records the result."""
    with _render_lock, SessionLocal() as db:
        job = db.get(models.VideoJob, job_id)
        if job is None:
            return
        job.status = "rendering"; db.commit()
        work = Path(tempfile.mkdtemp(prefix="aqua-film-"))
        try:
            farm = db.get(models.Farm, job.farm_id)
            s = weekly.summary(db, farm, job.week_start, with_ai=False)
            facts = videos.build_project(s, work / "project", mood=job.mood)
            out = videos_dir() / f"f{farm.id}-{job.week_start.isoformat()}-{job.id}.mp4"
            videos.render(work / "project", out, quality=quality)
            job.status, job.file_name, job.seconds, job.error = "done", out.name, facts["duration"], ""
        except Exception as e:
            job.status, job.error = "failed", str(e)[:400]
        finally:
            job.finished_at = models.now()
            db.commit()
            shutil.rmtree(work, ignore_errors=True)


@router.post("/farms/{farm_id}/videos")
def make_video(farm_id: int, body: VideoIn | None = None, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    role = check(db, user, farm_id, "water:manage")
    busy = db.scalar(select(func.count(models.VideoJob.id)).where(models.VideoJob.farm_id == farm_id, models.VideoJob.status.in_(["queued", "rendering"])))
    if busy >= MAX_ACTIVE_PER_FARM:
        raise HTTPException(409, "A film for this farm is already being made. Wait for it to finish.")
    farm = db.get(models.Farm, farm_id)
    wk = weekly.monday_of(body.week) if body and body.week else weekly.current_week()
    mood = weekly.week_metrics(db, farm, wk)["mood"]
    job = models.VideoJob(farm_id=farm_id, week_start=wk, mood=mood, **models.entered(user, role))
    db.add(job); db.commit(); db.refresh(job)
    threading.Thread(target=run_job, args=(job.id,), name=f"film-{job.id}", daemon=True).start()
    return _meta(job)


@router.get("/farms/{farm_id}/videos")
def list_videos(farm_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "farm:read")
    rows = db.scalars(select(models.VideoJob).where(models.VideoJob.farm_id == farm_id).order_by(models.VideoJob.id.desc()).limit(30)).all()
    return {"videos": [_meta(j) for j in rows]}


def _job(db: Session, farm_id: int, video_id: int) -> models.VideoJob:
    j = db.get(models.VideoJob, video_id)
    if not j or j.farm_id != farm_id:
        raise HTTPException(404, "not found")
    return j


@router.get("/farms/{farm_id}/videos/{video_id}")
def video_status(farm_id: int, video_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "farm:read")
    return _meta(_job(db, farm_id, video_id))


@router.get("/farms/{farm_id}/videos/{video_id}/file")
def video_file(farm_id: int, video_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "farm:read")
    j = _job(db, farm_id, video_id)
    path = videos_dir() / j.file_name if j.file_name else None
    if j.status != "done" or not path or not path.exists():
        raise HTTPException(404, "not found")
    return FileResponse(path, media_type="video/mp4", filename=f"aqua-week-{j.week_start.isoformat()}.mp4", headers={"Cache-Control": "private, no-store"})
