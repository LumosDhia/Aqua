"""Give every existing account a profile picture.

Copies the bundled example portraits into uploads/people and fills the account
photo for anyone who does not have one yet: workers reuse the portrait already
on their worker profile, and everyone else gets a random example portrait.

Run with the same environment as the server, e.g. from backend/:
    set -a; source ../local/farm.env; set +a; .venv/bin/python seed_avatars.py
Safe to run again; it only fills accounts that still have no photo.
"""
import random
import shutil
from pathlib import Path

from sqlalchemy import select

from app import models
from app.config import settings
from app.db import SessionLocal, init_schema

MEDIA = Path(__file__).parent / "seed_media"

random.seed(11)


def portraits() -> list[Path]:
    return sorted(p for p in (MEDIA / "portraits").glob("*.jpg"))


def copy_photo(source: Path, filename: str) -> str:
    dest = Path(settings.uploads_dir) / "people" / filename
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.exists():
        shutil.copyfile(source, dest)
    return filename


def run() -> None:
    init_schema()
    pool = portraits()
    if not pool:
        raise SystemExit("No example portraits found in seed_media/portraits.")
    assigned = 0
    with SessionLocal() as db:
        users = db.scalars(select(models.User)).all()
        for user in users:
            if user.photo:
                continue
            filename: str | None = None
            profile = db.scalar(select(models.Profile).where(models.Profile.user_id == user.id))
            if profile and profile.photo:
                filename = profile.photo
            else:
                filename = random.choice(pool).name
            copy_photo(MEDIA / "portraits" / filename, filename)
            user.photo = filename
            assigned += 1
        db.commit()
    print(f"Assigned a profile picture to {assigned} account(s).")


if __name__ == "__main__":
    run()
