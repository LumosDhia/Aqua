"""Seed the local Nabeul demo farm and five role accounts."""

from sqlalchemy import select

from app import models
from app.db import SessionLocal, init_demo_schema
from app.security import hash_password

PLOTS = (
    ("North field", "tomatoes", 1800), ("Olive grove", "olives", 5200),
    ("Wheat strip", "wheat", 3400), ("Pepper rows", "peppers", 1200),
    ("Orange orchard", "citrus", 3000), ("Date palms", "dates", 2400),
)
SOURCES = (
    ("tank", "Main concrete tank", 20000, 14000, 0, "Filled from the well every evening"),
    ("well", "Orchard well", None, 0, 40000, "Pumped by the solar pump, 38 m deep"),
    ("rain_tank", "Roof rain tank", 5000, 1800, 0, "Collected from the packing shed roof"),
    ("network", "SONEDE connection", None, 0, 8000, "Backup, used for the nursery"),
)


def run() -> None:
    init_demo_schema()
    with SessionLocal() as db:
        existing = db.scalar(select(models.Farm).where(
            models.Farm.is_fixture, models.Farm.name.in_(("Nabeul Farm", "Demo Farm")),
            models.Farm.region == "Nabeul",
        ).limit(1))
        if existing:
            return
        farm = models.Farm(name="Nabeul Farm", region="Nabeul", lat=36.45, lon=10.73, is_fixture=True)
        db.add(farm)
        db.flush()
        for name, crop, area in PLOTS:
            farm.plots.append(models.Plot(name=name, crop=crop, area_m2=area))
        for role in ("admin", "owner", "manager", "technician", "viewer"):
            email = f"{role}@aqua.test"
            user = db.scalar(select(models.User).where(models.User.email == email))
            if user is None:
                user = models.User(email=email, name=role.title(), role="admin" if role == "admin" else "user",
                                   account_type="worker" if role == "technician" else "farmer",
                                   password_hash=hash_password(f"{role}1234"))
                db.add(user)
                db.flush()
            if role != "admin":
                farm.members.append(models.FarmMember(user_id=user.id, role=role))
        for kind, name, capacity, level, refill, notes in SOURCES:
            farm.water_sources.append(models.WaterSource(kind=kind, name=name, capacity_l=capacity, level_l=level,
                                                       refill_l_per_day=refill, notes=notes))
        farm.livestock.extend((models.Livestock(species="chicken", count=60), models.Livestock(species="goat", count=12)))
        for name, role in (("Karim Ben Ali", "Irrigation"), ("Sami Gharbi", "Harvest")):
            farm.workers.append(models.Worker(name=name, role_label=role))
        db.commit()


if __name__ == "__main__":
    run()
