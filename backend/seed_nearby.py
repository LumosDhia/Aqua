"""Add four accounts near owner@aqua.test in Nabeul, with water listings and jobs.

Two are farmers (each with a farm near the owner's Nabeul Farm) and two are
workers looking for work in the same governorate. The farmers post five water
market listings and five jobs between them.

Run with the same environment as the server, e.g. from backend/:
    set -a; source ../local/farm.env; set +a; .venv/bin/python seed_nearby.py
Safe to run again; it skips anything that already exists.
"""
import random
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select

from app import models
from app.config import settings
from app.db import SessionLocal, init_schema
from app.security import hash_password

PASSWORD = "aqua-demo-2026"
random.seed(7)
today = date.today()
now = datetime.now(timezone.utc)


def ago(days: float, hours: float = 0) -> datetime:
    return now - timedelta(days=days, hours=hours)


# Owner's "Nabeul Farm" sits at (36.45, 10.73). These are a couple of km away.
FARMERS = [
    {
        "email": "lamine.benali@aqua.test", "name": "Lamine Ben Ali",
        "farm": {"name": "Ferme Lamine", "region": "Nabeul", "lat": 36.47, "lon": 10.75},
        "listings": [
            {
                "title": "Well water for vegetables near Dar Chaabane",
                "description": "Surplus from our garden well after the tomato season. Clear water, low turbidity, good for drip and sprinkler irrigation of vegetables and citrus. Load at the farm gate with your own tank, or we deliver with a 10 m3 tanker within 20 km.",
                "litres": 80000, "price_mode": "fixed", "price": 1.5, "source": "well",
                "quality": "Conductivity about 1.8 dS/m, pH 7.2 (test from this autumn).",
                "fulfilment": "both", "radius": 20, "gov": "Nabeul", "address": "Dar Chaabane, 3 km from the town centre",
                "age": 4, "until": 40,
            },
            {
                "title": "Free rainwater from the roof tanks",
                "description": "Our greenhouse roof tanks are full after the October rains. We keep a quarter for ourselves and give the rest free to nearby farms. Soft water, ideal for seedlings and young plants. Bring your own containers.",
                "litres": 30000, "price_mode": "free", "price": None, "source": "rain_tank",
                "quality": "Roof-collected, filtered through a first-flush diverter.",
                "fulfilment": "pickup", "radius": None, "gov": "Nabeul", "address": "Dar Chaabane El Fehri",
                "age": 2, "until": 18,
            },
            {
                "title": "Borehole delivery to Beni Khiar and Korba",
                "description": "Our borehole runs below capacity in winter and we deliver 15 m3 loads by tanker to farms around Beni Khiar and Korba. Reliable, tested water suited to vegetables, citrus and young orchards.",
                "litres": 120000, "price_mode": "negotiable", "price": None, "source": "borehole",
                "quality": "Conductivity about 2.0 dS/m, no treatment.",
                "fulfilment": "delivery", "radius": 25, "gov": "Nabeul", "address": "Beni Khiar road",
                "age": 6, "until": 60,
            },
        ],
        "jobs": [
            {
                "title": "Vegetable pickers, 3 people", "kind": "period", "start": 3, "end": 45,
                "pay": ("fixed", 40, "day"), "needed": 3,
                "description": "Picking peppers and tomatoes across the market garden. Early start at 6:30, finish by 14:00. Transport from Dar Chaabane can be arranged.",
                "skills": ["Harvest", "Vegetables"], "gov": "Nabeul", "address": "Dar Chaabane", "age": 2,
            },
            {
                "title": "Drip line repair and filter cleaning", "kind": "task", "start": 5, "end": None,
                "pay": ("fixed", 80, "task"), "needed": 1,
                "description": "Replace about 3,000 m2 of drip tape and clean two screen filters. One to two days. Tools and spare couplers provided.",
                "skills": ["Irrigation", "Drip systems"], "gov": "Nabeul", "address": "Dar Chaabane", "age": 1,
            },
            {
                "title": "Tractor driver for the season", "kind": "long_term", "start": 10, "end": None,
                "pay": ("fixed", 1400, "month"), "needed": 1,
                "description": "Run and maintain one tractor for bed preparation and spraying across 12 hectares. A valid licence and some mechanical experience required.",
                "skills": ["Tractor", "Mechanics"], "gov": "Nabeul", "address": "Dar Chaabane", "age": 3,
            },
        ],
    },
    {
        "email": "samia.riahi@aqua.test", "name": "Samia Riahi",
        "farm": {"name": "Jardin Samia", "region": "Nabeul", "lat": 36.43, "lon": 10.70},
        "listings": [
            {
                "title": "Surplus citrus-grove water, pickup only",
                "description": "We overfilled the buffer tank before the cooler weather and have about 50 m3 to share this month. Slightly hard but fine for citrus, olives and animals. Pickup at the tank outlet, easy access for a tractor and trailer.",
                "litres": 50000, "price_mode": "fixed", "price": 1.2, "source": "tank",
                "quality": "Conductivity about 2.2 dS/m.",
                "fulfilment": "pickup", "radius": None, "gov": "Nabeul", "address": "Route de Beni Khiar",
                "age": 3, "until": 30,
            },
            {
                "title": "Network water share for the nursery",
                "description": "Our SONEDE connection has spare capacity this month. We can share up to 20 m3 for nurseries and young seedlings, filled at the farm during working hours.",
                "litres": 20000, "price_mode": "negotiable", "price": None, "source": "network",
                "quality": "Treated public water, suitable for seedlings.",
                "fulfilment": "pickup", "radius": None, "gov": "Nabeul", "address": "Beni Khiar",
                "age": 1, "until": 15,
            },
        ],
        "jobs": [
            {
                "title": "Citrus pruning team, 2 people", "kind": "period", "start": 7, "end": 60,
                "pay": ("fixed", 45, "day"), "needed": 2,
                "description": "Pruning young clementine and Maltese orange trees: broken wood, crowded centres, suckers. Tools provided, experience preferred.",
                "skills": ["Pruning", "Citrus"], "gov": "Nabeul", "address": "Beni Khiar", "age": 2,
            },
            {
                "title": "Greenhouse assistant, long term", "kind": "long_term", "start": 14, "end": None,
                "pay": ("fixed", 1200, "month"), "needed": 1,
                "description": "Daily care of tomato and pepper tunnels: tying, pruning, picking, fertigation checks and packing. Full time Monday to Saturday. We train on our system.",
                "skills": ["Greenhouse", "Tomatoes"], "gov": "Nabeul", "address": "Beni Khiar", "age": 4,
            },
        ],
    },
]

WORKERS = [
    {
        "email": "karim.bouazizi@aqua.test", "name": "Karim Bouazizi",
        "headline": "Greenhouse and drip worker", "skills": ["Greenhouse", "Drip systems", "Harvest"],
        "bio": "Six seasons in Nabeul greenhouses. I lower tomato stems, repair drip tape and pack for market days.",
        "availability": "Full time from December",
    },
    {
        "email": "nadia.sassi@aqua.test", "name": "Nadia Sassi",
        "headline": "Citrus picker and pruner", "skills": ["Citrus", "Pruning", "Packing"],
        "bio": "I pick and prune clementines around Beni Khiar and can lead a small packing team.",
        "availability": "Weekdays and Saturdays",
    },
]


def _ensure_farmer(db, f: dict) -> tuple[models.User, models.Farm]:
    user = db.scalar(select(models.User).where(models.User.email == f["email"]))
    if user:
        farm = db.scalar(select(models.Farm).join(models.FarmMember).where(models.FarmMember.user_id == user.id))
        return user, farm
    user = models.User(email=f["email"], name=f["name"], role="user", account_type="farmer",
                       password_hash=hash_password(PASSWORD))
    db.add(user); db.flush()
    farm = models.Farm(**f["farm"], is_fixture=True)
    db.add(farm); db.flush()
    db.add(models.FarmMember(user_id=user.id, farm_id=farm.id, role="owner"))
    db.add(models.WaterSource(farm_id=farm.id, kind="well", name="Main well", capacity_l=None,
                              level_l=0, refill_l_per_day=60000))
    return user, farm


def run() -> None:
    init_schema()
    db = SessionLocal()
    created = {"listings": 0, "jobs": 0, "workers": 0}
    for f in FARMERS:
        user, farm = _ensure_farmer(db, f)
        for l in f["listings"]:
            if db.scalar(select(models.WaterListing.id).where(models.WaterListing.farm_id == farm.id, models.WaterListing.title == l["title"])):
                continue
            db.add(models.WaterListing(
                farm_id=farm.id, title=l["title"], description=l["description"],
                litres_available=l["litres"], price_mode=l["price_mode"], price_per_m3=l["price"],
                water_source=l["source"], quality_notes=l["quality"], fulfilment=l["fulfilment"],
                delivery_radius_km=l["radius"], available_from=today - timedelta(days=l["age"]),
                available_until=today + timedelta(days=l["until"]), governorate=l["gov"],
                address_text=l["address"], photos=[], status="active",
                created_at=ago(l["age"]), updated_at=ago(l["age"])))
            created["listings"] += 1
        for j in f["jobs"]:
            if db.scalar(select(models.JobPost.id).where(models.JobPost.farm_id == farm.id, models.JobPost.title == j["title"])):
                continue
            mode, amount, unit = j["pay"]
            db.add(models.JobPost(
                farm_id=farm.id, title=j["title"], description=j["description"], kind=j["kind"],
                start_date=today + timedelta(days=j["start"]),
                end_date=(today + timedelta(days=j["end"])) if j["end"] else None,
                pay_mode=mode, pay_amount=amount, pay_unit=unit, workers_needed=j["needed"],
                skills=j["skills"], governorate=j["gov"], address_text=j["address"],
                status="open", created_at=ago(j["age"]), updated_at=ago(j["age"])))
            created["jobs"] += 1
    for w in WORKERS:
        user = db.scalar(select(models.User).where(models.User.email == w["email"]))
        if user:
            continue
        user = models.User(email=w["email"], name=w["name"], role="user", account_type="worker",
                           password_hash=hash_password(PASSWORD))
        db.add(user); db.flush()
        db.add(models.Profile(user_id=user.id, headline=w["headline"], bio=w["bio"],
                              governorate="Nabeul", visibility="public", radius_km=60,
                              looking_for_work=True, kinds=["task", "period"], skills=w["skills"],
                              languages=["Arabic"], availability=w["availability"]))
        created["workers"] += 1
    db.commit()
    print(f"Added {created['listings']} listings, {created['jobs']} jobs, {created['workers']} workers.")


if __name__ == "__main__":
    run()
