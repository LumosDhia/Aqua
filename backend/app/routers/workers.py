from collections.abc import Sequence
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..farm_access import FIXTURE_ACCOUNTS
from ..rbac import RANK, check, current_user

router = APIRouter(prefix="/api", tags=["workers"])


class WorkerIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    role_label: str = Field(default="", max_length=80)


class TaskIn(BaseModel):
    worker_id: int
    plot_id: int | None = None
    title: str = Field(min_length=1, max_length=200)
    details: str = Field(default="", max_length=1000)


class TaskPatch(BaseModel):
    status: str = Field(pattern="^done$")


def _portrait_by_name(db: Session, workers: Sequence[models.Worker]) -> dict[str, str]:
    """Portrait for a demonstration team row, matched by name to a demonstration account only."""
    if not workers:
        return {}
    farm = db.get(models.Farm, workers[0].farm_id)
    if farm is None or not farm.is_fixture:
        return {}
    names = [w.name for w in workers]
    found: dict[str, str] = {}
    rows = db.execute(
        select(models.User.name, models.Profile.photo)
        .join(models.Profile, models.Profile.user_id == models.User.id)
        .where(models.User.name.in_(names), models.User.email.in_(FIXTURE_ACCOUNTS), models.Profile.photo.is_not(None))
    ).all()
    for name, photo in rows:
        url = models.people_photo_url(photo)
        if url and name not in found:
            found[name] = url
    return found


def _workers_out(db: Session, workers: Sequence[models.Worker], role: str) -> list[dict[str, object]]:
    photos = _portrait_by_name(db, workers)
    return [
        {"id": w.id, "name": w.name, "role_label": w.role_label, "photo": photos.get(w.name),
         "created_at": models.iso(w.created_at), **models.attribution(w)}
        for w in workers
    ]


def _task_out(t: models.Task) -> dict[str, object]:
    return {"id": t.id, "worker_id": t.worker_id, "worker_name": t.worker.name, "plot_id": t.plot_id,
            "plot_name": t.plot.name if t.plot else None, "title": t.title, "details": t.details,
            "status": t.status, "created_at": models.iso(t.created_at),
            "done_at": models.iso(t.done_at), "completion_source": t.completion_source, **models.attribution(t)}


def _complete_task(db: Session, task_id: int, user: models.User, role: str) -> None:
    at = datetime.now(timezone.utc)
    db.execute(
        update(models.Task)
        .where(models.Task.id == task_id, models.Task.status != "done")
        .values(status="done", done_at=at, completion_source="web",
                updated_at=at, updated_by_id=user.id, updated_by_role=role)
    )
    db.commit()


@router.get("/farms/{farm_id}/workers")
def list_workers(
    farm_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> list[dict[str, object]]:
    role = check(db, user, farm_id, "farm:read")
    rows = db.scalars(select(models.Worker).where(models.Worker.farm_id == farm_id).order_by(models.Worker.name)).all()
    return _workers_out(db, rows, role)


@router.get("/workers/{worker_id}")
def get_worker(
    worker_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict[str, object]:
    worker = db.get(models.Worker, worker_id)
    if not worker:
        raise HTTPException(404, "not found")
    role = check(db, user, worker.farm_id, "farm:read")
    return _workers_out(db, [worker], role)[0]


@router.post("/farms/{farm_id}/workers")
def add_worker(
    farm_id: int, body: WorkerIn, user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict[str, object]:
    role = check(db, user, farm_id, "worker:manage")
    worker = models.Worker(farm_id=farm_id, name=body.name.strip(), role_label=body.role_label.strip(),
                           **models.entered(user, role))
    db.add(worker)
    db.commit()
    return _workers_out(db, [worker], role)[0]


@router.delete("/farms/{farm_id}/workers/{worker_id}", status_code=204)
def remove_worker(
    farm_id: int, worker_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> None:
    check(db, user, farm_id, "worker:manage")
    worker = db.get(models.Worker, worker_id)
    if not worker or worker.farm_id != farm_id:
        raise HTTPException(404, "not found")
    db.delete(worker)
    db.commit()


@router.get("/farms/{farm_id}/tasks")
def list_tasks(
    farm_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> list[dict[str, object]]:
    check(db, user, farm_id, "farm:read")
    rows = db.scalars(select(models.Task).where(models.Task.farm_id == farm_id)
                      .order_by(models.Task.created_at.desc(), models.Task.id.desc()).limit(50)).all()
    return [_task_out(task) for task in rows]


@router.post("/farms/{farm_id}/tasks")
def create_task(
    farm_id: int, body: TaskIn, user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict[str, object]:
    role = check(db, user, farm_id, "task:assign")
    worker = db.get(models.Worker, body.worker_id)
    if not worker or worker.farm_id != farm_id:
        raise HTTPException(404, "worker not found")
    if body.plot_id is not None:
        plot = db.get(models.Plot, body.plot_id)
        if not plot or plot.farm_id != farm_id:
            raise HTTPException(404, "plot not found")
    task = models.Task(farm_id=farm_id, worker_id=worker.id, plot_id=body.plot_id, title=body.title.strip(),
                       details=body.details.strip(), **models.entered(user, role))
    db.add(task)
    db.commit()
    return _task_out(task)


@router.patch("/farms/{farm_id}/tasks/{task_id}")
def update_task(
    farm_id: int, task_id: int, body: TaskPatch, user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    role = check(db, user, farm_id, "task:assign")
    task = db.get(models.Task, task_id)
    if not task or task.farm_id != farm_id:
        raise HTTPException(404, "not found")
    _complete_task(db, task.id, user, role)
    db.refresh(task)
    return _task_out(task)
