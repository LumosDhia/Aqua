"""Sample community data: fictional farmers with farms, water, market listings, jobs, enquiries and applications.

Run after seed.py:  python seed_market.py     (safe to run again, it skips what already exists)
Start over:         python seed_market.py --reset
All people and businesses are invented. Demo accounts use the password in PASSWORD, delete them before real use.
"""
import random
import shutil
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import select

from app import models
from app.config import settings
from app.db import SessionLocal, init_demo_schema
from app.security import hash_password

PASSWORD = "aqua-demo-2026"
MEDIA = Path(__file__).parent / "seed_media"
random.seed(7)
today = date.today()
now = datetime.now(timezone.utc)


def ago(days: float, hours: float = 0) -> datetime:
    return now - timedelta(days=days, hours=hours)


FARMERS = [
    {
        "email": "mohamed.karoui@aqua.test", "name": "Mohamed Karoui",
        "farm": {"name": "Domaine Oued Zarga", "region": "Beja", "lat": 36.73, "lon": 9.18},
        "plots": [("Lower wheat field", "wheat", 42000, "sprinkler", "clay_loam"), ("Olive terrace", "olives", 26000, "drip", "loam"),
                  ("Barley strip", "barley", 18000, "sprinkler", "clay_loam"), ("Pepper rows", "peppers", 4500, "drip", "loam")],
        "sources": [("borehole", "Borehole B2", None, 0, 280000, "Pumped 14 hours a day, 62 m deep."),
                    ("tank", "Hill reservoir", 150000, 118000, 0, "Concrete, lined. Fed by Borehole B2.")],
        "livestock": [("sheep", 90)],
        "workers": [("Slim Ben Youssef", "Irrigation"), ("Abdelkader Hamrouni", "Harvest")],
        "listings": [{
            "title": "Borehole water, up to 60 m³ a week, pickup or delivery",
            "description": ("Surplus from our second borehole after the autumn sowing. Clear water, low turbidity, no treatment. "
                            "Suitable for drip and sprinkler irrigation of cereals, olives and vegetables. You can load at the farm gate "
                            "with your own tank, or we deliver with a 10 m³ tanker within the stated distance. Deliveries are planned the day before."),
            "litres": 240000, "price_mode": "fixed", "price": 1.2, "source": "borehole", "quality": "Conductivity about 1.6 dS/m, pH 7.4 (test from this spring).",
            "fulfilment": "both", "radius": 35, "gov": "Beja", "address": "Oued Zarga road, 6 km from Testour", "photos": ["drip-irrigation.jpg"], "age": 6, "until": 75,
        }],
        "jobs": [{
            "title": "Olive harvest crew, 4 people", "kind": "period", "start": 4, "end": 52, "pay": ("fixed", 45, "day"), "needed": 4,
            "description": ("We harvest about 26 hectares of Chemlali and Chetoui olives. Hand picking with nets and light poles, "
                            "work starts at 7:00 and finishes at 15:30 with a paid lunch break. Transport from Testour is provided. "
                            "Experienced pickers preferred, we also take people who want to learn."),
            "skills": ["Olive picking", "Harvest"], "gov": "Beja", "address": "Near Testour", "age": 3,
        }, {
            "title": "Repair and re-lay drip lines on the pepper rows", "kind": "task", "start": 8, "end": None, "pay": ("fixed", 90, "task"), "needed": 1,
            "description": "About 4,500 m² of drip tape to replace and test, including two filter cleanings. One to two days of work. Tools provided.",
            "skills": ["Irrigation", "Drip systems"], "gov": "Beja", "address": "Oued Zarga", "age": 1,
        }],
    },
    {
        "email": "salma.trabelsi@aqua.test", "name": "Salma Trabelsi",
        "farm": {"name": "Ferme El Baraka", "region": "Nabeul", "lat": 36.45, "lon": 10.73},
        "plots": [("Greenhouse A", "tomatoes", 6000, "drip", "sandy_loam"), ("Greenhouse B", "peppers", 5000, "drip", "sandy_loam"),
                  ("Citrus block", "citrus", 22000, "drip", "loam")],
        "sources": [("rain_tank", "Roof rainwater tanks", 60000, 47000, 0, "Collected from the greenhouse roofs."),
                    ("well", "Shallow well", None, 0, 70000, "Brackish in summer, good in winter."),
                    ("network", "SONEDE connection", None, 0, 12000, "Used for the nursery only.")],
        "livestock": [("chicken", 120)],
        "workers": [("Hela Mejri", "Greenhouse"), ("Marwen Khelifi", "Harvest")],
        "listings": [{
            "title": "Free rainwater, 40 m³ from the greenhouse tanks",
            "description": ("After a wet October our roof tanks are full. We keep 20 m³ for ourselves and offer the rest free of charge to "
                            "neighbouring farms. Soft, clean water, ideal for seedlings and greenhouse drip. Bring your own containers, "
                            "we fill at the tank outlet. Please call in advance through the app so someone is on site."),
            "litres": 40000, "price_mode": "free", "price": None, "source": "rain_tank", "quality": "Roof-collected, filtered through a first-flush diverter.",
            "fulfilment": "pickup", "radius": None, "gov": "Nabeul", "address": "El Baraka, between Dar Chaabane and Beni Khiar", "photos": ["water-tanks.jpg"], "age": 2, "until": 20,
        }],
        "jobs": [{
            "title": "Greenhouse team member, long term", "kind": "long_term", "start": 14, "end": None, "pay": ("fixed", 1300, "month"), "needed": 1,
            "description": ("Daily care of tomato and pepper greenhouses: tying, pruning, picking, fertigation checks and harvest packing. "
                            "Full time, Monday to Saturday. We train on our fertigation system. Social security and a seasonal bonus included."),
            "skills": ["Greenhouse", "Tomatoes", "Fertigation"], "gov": "Nabeul", "address": "Dar Chaabane El Fehri", "age": 5,
        }],
    },
    {
        "email": "hichem.jlassi@aqua.test", "name": "Hichem Jlassi",
        "farm": {"name": "Jlassi Olive Estate", "region": "Sfax", "lat": 34.74, "lon": 10.76},
        "plots": [("North grove", "olives", 30000, "drip", "sandy_loam"), ("East grove", "olives", 24000, "drip", "sandy_loam"),
                  ("Almond block", "almonds", 15000, "drip", "loam")],
        "sources": [("well", "Estate well", None, 0, 118000, "Hand-dug, 38 m."),
                    ("tank", "Main storage tank", 80000, 21000, 0, "Steel tank on a concrete base.")],
        "livestock": [],
        "workers": [("Mounir Chaabane", "Orchard foreman")],
        "listings": [],
        "jobs": [{
            "title": "Irrigation technician, full season", "kind": "period", "start": 10, "end": 200, "pay": ("fixed", 70, "day"), "needed": 1,
            "description": ("We run 12 hectares of drip-irrigated olives and almonds with a central filter station. You will manage schedules, "
                            "check emitters, clean filters, read the tank levels and report to the foreman. Experience with drip systems required."),
            "skills": ["Irrigation", "Drip systems", "Pumps"], "gov": "Sfax", "address": "Route de Gremda", "age": 4,
        }, {
            "title": "Olive pickers wanted for the late harvest", "kind": "period", "start": 6, "end": 40, "pay": ("fixed", 40, "day"), "needed": 8,
            "description": "Second picking of the Chemlali groves. Groups of four, paid per day. Transport from Sfax city can be arranged.",
            "skills": ["Olive picking"], "gov": "Sfax", "address": "Route de Gremda", "age": 2,
        }],
    },
    {
        "email": "rim.bensalah@aqua.test", "name": "Rim Ben Salah",
        "farm": {"name": "Les Jardins de Ghar El Melh", "region": "Bizerte", "lat": 37.17, "lon": 10.18},
        "plots": [("Pumpkin field", "potatoes", 12000, "drip", "sand"), ("Market garden", "tomatoes", 8000, "drip", "sand"),
                  ("Pepper tunnels", "peppers", 5000, "drip", "sand")],
        "sources": [("well", "Lagoon-side well", None, 0, 95000, "Shallow well, brackish but usable for pumpkins and potatoes."),
                    ("tank", "Header tank", 30000, 9000, 0, "")],
        "livestock": [],
        "workers": [("Yosra Jebali", "Market garden")],
        "listings": [{
            "title": "Surplus well water for market gardens near Ghar El Melh",
            "description": ("We pumped more than our crops need this month and have 25 m³ a week to share. The water is slightly brackish, so it "
                            "suits potatoes, pumpkins, melons and salt-tolerant crops, not young seedlings. Pickup at our header tank, "
                            "easy access for a tractor and trailer."),
            "litres": 100000, "price_mode": "negotiable", "price": None, "source": "well", "quality": "Conductivity about 3.2 dS/m. Not for seedlings.",
            "fulfilment": "pickup", "radius": None, "gov": "Bizerte", "address": "Ghar El Melh, lagoon road", "photos": ["lagoon-farming-ghar-melh.jpg", "pumpkin-field-ghar-el-melh.jpg"], "age": 9, "until": 45,
        }],
        "jobs": [{
            "title": "Packing and loading help for market days", "kind": "task", "start": 3, "end": None, "pay": ("fixed", 35, "day"), "needed": 2,
            "description": "Sorting, crating and loading pumpkins and potatoes for the Tunis wholesale market. Early start at 5:00, finish around noon.",
            "skills": ["Packing", "Loading"], "gov": "Bizerte", "address": "Ghar El Melh", "age": 1,
        }],
    },
    {
        "email": "anis.dridi@aqua.test", "name": "Anis Dridi",
        "farm": {"name": "Bergerie Dridi", "region": "Kef", "lat": 36.17, "lon": 8.70},
        "plots": [("Fodder field", "barley", 12000, "sprinkler", "clay_loam"), ("Wheat plot", "wheat", 8000, "sprinkler", "clay_loam")],
        "sources": [("well", "Pasture well", None, 0, 98000, "Pumped by a solar pump."),
                    ("tank", "Cistern near the sheepfold", 40000, 36000, 0, "Stone cistern, covered.")],
        "livestock": [("sheep", 420), ("goat", 70), ("donkey", 3)],
        "workers": [("Brahim Tlili", "Shepherd")],
        "listings": [{
            "title": "Cistern water for livestock, 30 m³ available",
            "description": ("Our stone cistern is full after the first autumn rains and our animals use less water in the cooler weather. "
                            "We can supply drinking water for livestock, filled directly into your tanker at the cistern. "
                            "Road is passable for trucks in dry weather."),
            "litres": 30000, "price_mode": "fixed", "price": 1.0, "source": "tank", "quality": "Rain and spring water, no chemicals.",
            "fulfilment": "pickup", "radius": None, "gov": "Kef", "address": "Sakiet Sidi Youssef road", "photos": ["sheepfold-tunisia.jpg", "sheep-bizerte.jpg"], "age": 4, "until": 30,
        }],
        "jobs": [{
            "title": "Shepherd, long term with housing", "kind": "long_term", "start": 20, "end": None, "pay": ("fixed", 1100, "month"), "needed": 1,
            "description": ("Look after about 420 sheep and 70 goats, move them between pastures, check water and health, support lambing. "
                            "Simple housing on the farm is provided. Experience with sheep required."),
            "skills": ["Livestock", "Sheep", "Lambing"], "gov": "Kef", "address": "Sakiet Sidi Youssef", "age": 7,
        }],
    },
    {
        "email": "fatma.gharbi@aqua.test", "name": "Fatma Gharbi",
        "farm": {"name": "Oasis Gharbi", "region": "Tozeur", "lat": 33.92, "lon": 8.13},
        "plots": [("Deglet Nour palms", "dates", 20000, "flood", "sand"), ("Understorey vegetables", "peppers", 6000, "drip", "sand")],
        "sources": [("borehole", "Oasis borehole", None, 0, 160000, "Warm artesian water, 70 m deep."),
                    ("tank", "Cooling basin", 90000, 54000, 0, "Water is cooled here before irrigation.")],
        "livestock": [("goat", 25)],
        "workers": [("Tarek Brahmi", "Date harvest")],
        "listings": [{
            "title": "Oasis water delivered by tanker, 15 m³ loads",
            "description": ("We have a reliable artesian borehole and a cooling basin with more capacity than we use in winter. "
                            "We deliver 15 m³ loads by tanker to farms around Tozeur and Nefta. Water is warm when drawn and cooled in the basin, "
                            "good for palms, vegetables and animals."),
            "litres": 150000, "price_mode": "fixed", "price": 2.5, "source": "borehole", "quality": "Artesian, conductivity about 2.4 dS/m.",
            "fulfilment": "delivery", "radius": 40, "gov": "Tozeur", "address": "Oasis of Tozeur, Chebika road", "photos": ["aqueduct-zaghouan.jpg"], "age": 12, "until": 120,
        }],
        "jobs": [{
            "title": "Palm pollination and care, spring contract", "kind": "period", "start": 90, "end": 150, "pay": ("fixed", 50, "day"), "needed": 3,
            "description": "Pollination of Deglet Nour date palms, thinning and bunch support. Climbing experience is required. Work is split across the oasis plots.",
            "skills": ["Palm climbing", "Dates"], "gov": "Tozeur", "address": "Oasis of Tozeur", "age": 8,
        }],
    },
    {
        "email": "walid.mansouri@aqua.test", "name": "Walid Mansouri",
        "farm": {"name": "Mansouri Citrus", "region": "Nabeul", "lat": 36.60, "lon": 10.57},
        "plots": [("Maltese oranges", "citrus", 40000, "drip", "loam"), ("Clementine block", "citrus", 20000, "drip", "loam")],
        "sources": [("well", "Orchard well", None, 0, 103000, ""), ("tank", "Buffer tank", 50000, 33000, 0, "")],
        "livestock": [],
        "workers": [("Hamza Sassi", "Orchard"), ("Ines Rezgui", "Packing")],
        "listings": [],
        "jobs": [{
            "title": "Citrus harvest and packing team", "kind": "period", "start": 2, "end": 70, "pay": ("fixed", 42, "day"), "needed": 6,
            "description": "Picking Maltese oranges and clementines, sorting and boxing at the shed. Packing shed work is available for people who prefer to work indoors.",
            "skills": ["Citrus", "Packing", "Harvest"], "gov": "Nabeul", "address": "Menzel Bouzelfa", "age": 2,
        }],
    },
    {
        "email": "nesrine.hamdi@aqua.test", "name": "Nesrine Hamdi",
        "farm": {"name": "Agri Hamdi", "region": "Kairouan", "lat": 35.68, "lon": 10.10},
        "plots": [("Durum wheat", "wheat", 50000, "sprinkler", "clay"), ("Pepper field", "peppers", 15000, "drip", "clay_loam")],
        "sources": [("borehole", "Well 3", None, 0, 55000, ""), ("tank", "Farm reservoir", 120000, 30000, 0, "Needs refilling before spring.")],
        "livestock": [("beef_cattle", 14)],
        "workers": [],
        "listings": [],
        "jobs": [{
            "title": "Tractor driver and machinery maintenance", "kind": "long_term", "start": 25, "end": None, "pay": ("fixed", 1500, "month"), "needed": 1,
            "description": "Run and maintain two tractors and a seeder across 90 hectares of cereals. Basic workshop repairs, greasing and daily checks. A valid licence is required.",
            "skills": ["Tractor", "Mechanics"], "gov": "Kairouan", "address": "Haffouz road", "age": 6,
        }],
    },
]

INQUIRIES = [
    ("salma.trabelsi@aqua.test", "Domaine Oued Zarga", "Borehole water", "Hello, we are two farms in Nabeul and could use 30 m³ in January for the nursery. Can you deliver that far, and what would the price be for a full tanker?", "read"),
    ("hichem.jlassi@aqua.test", "Cistern water for livestock", "", "We are starting a small goat herd near Sfax and need a regular supply for three months. Is the cistern water available every week?", "new"),
    ("walid.mansouri@aqua.test", "Free rainwater", "", "Can I collect 10 m³ on Thursday morning with a 5 m³ tanker, in two trips? Walid, Mansouri Citrus.", "accepted"),
    ("nesrine.hamdi@aqua.test", "Surplus well water", "", "We have low stock before spring sowing. Is the water suitable for wheat and what is your best price for 60 m³?", "new"),
]
APPLICATIONS = [
    ("rim.bensalah@aqua.test", "Olive harvest crew", "I worked two olive seasons near Bizerte and I have my own pole and nets. I can start on the first day and bring one more picker.", "pending"),
    ("anis.dridi@aqua.test", "Irrigation technician", "I run the pumps and solar installation on our farm in Kef and have looked after drip systems for five years. I would like to discuss the season contract.", "pending"),
    ("mohamed.karoui@aqua.test", "Greenhouse team member", "My cousin is looking for a long-term greenhouse position, he has four years of tomato experience in Kairouan.", "declined"),
    ("fatma.gharbi@aqua.test", "Packing and loading", "Available every market day. I have packed pumpkins and dates for three years.", "accepted"),
]


def reset() -> None:
    """Remove the sample farmers and everything attached to them."""
    db = SessionLocal()
    for f in FARMERS:
        user = db.scalar(select(models.User).where(models.User.email == f["email"]))
        if not user:
            continue
        for farm in db.scalars(select(models.Farm).join(models.FarmMember).where(models.FarmMember.user_id == user.id, models.Farm.is_fixture)).all():
            for plot in farm.plots:
                db.query(models.Reading).filter_by(plot_id=plot.id).delete()
                db.query(models.Decision).filter_by(plot_id=plot.id).delete()
            db.query(models.Task).filter_by(farm_id=farm.id).delete()
            db.delete(farm)
        db.query(models.ListingInquiry).filter_by(sender_id=user.id).delete()
        db.query(models.JobApplication).filter_by(applicant_id=user.id).delete()
        db.query(models.FarmMember).filter_by(user_id=user.id).delete()
        db.flush()
        db.delete(user)
    db.commit()
    for p in (Path(settings.uploads_dir) / "market").glob("f*-seed*"):
        p.unlink()


def run() -> None:
    market_dir = Path(settings.uploads_dir) / "market"
    market_dir.mkdir(parents=True, exist_ok=True)
    db = SessionLocal()
    users: dict[str, models.User] = {}
    for f in FARMERS:
        user = db.scalar(select(models.User).where(models.User.email == f["email"]))
        if user:
            users[f["email"]] = user
            continue
        user = models.User(email=f["email"], name=f["name"], role="user", password_hash=hash_password(PASSWORD))
        db.add(user); db.flush()
        farm = models.Farm(**f["farm"], is_fixture=True); db.add(farm); db.flush()
        db.add(models.FarmMember(user_id=user.id, farm_id=farm.id, role="owner"))
        for name, crop, area, irr, soil in f["plots"]:
            plot = models.Plot(farm_id=farm.id, name=name, crop=crop, area_m2=area, irrigation=irr, soil_type=soil)
            db.add(plot)
        for kind, name, cap, level, refill, notes in f["sources"]:
            db.add(models.WaterSource(farm_id=farm.id, kind=kind, name=name, capacity_l=cap, level_l=level, refill_l_per_day=refill, notes=notes, updated_at=ago(0, random.randint(1, 20))))
        for species, count in f["livestock"]:
            db.add(models.Livestock(farm_id=farm.id, species=species, count=count))
        for wname, wrole in f["workers"]:
            db.add(models.Worker(farm_id=farm.id, name=wname, role_label=wrole))
        for l in f["listings"]:
            photos = []
            for i, src in enumerate(l["photos"]):
                dest = f"f{farm.id}-seed{l['source']}{i}{len(db.new)}{random.randint(100, 999)}{Path(src).suffix}"
                shutil.copyfile(MEDIA / src, market_dir / dest)
                photos.append(dest)
            db.add(models.WaterListing(
                farm_id=farm.id, title=l["title"], description=l["description"], litres_available=l["litres"],
                price_mode=l["price_mode"], price_per_m3=l["price"], water_source=l["source"], quality_notes=l["quality"],
                fulfilment=l["fulfilment"], delivery_radius_km=l["radius"], available_from=today - timedelta(days=l["age"]),
                available_until=today + timedelta(days=l["until"]), governorate=l["gov"], address_text=l["address"], photos=photos,
                status="active", created_at=ago(l["age"]), updated_at=ago(l["age"])))
        for j in f["jobs"]:
            mode, amount, unit = j["pay"]
            db.add(models.JobPost(
                farm_id=farm.id, title=j["title"], description=j["description"], kind=j["kind"],
                start_date=today + timedelta(days=j["start"]), end_date=(today + timedelta(days=j["end"])) if j["end"] else None,
                pay_mode=mode, pay_amount=amount, pay_unit=unit, workers_needed=j["needed"], skills=j["skills"],
                governorate=j["gov"], address_text=j["address"], status="open", created_at=ago(j["age"]), updated_at=ago(j["age"])))
        users[f["email"]] = user
    db.commit()

    def find_listing(fragment: str) -> models.WaterListing | None:
        return db.scalar(select(models.WaterListing).join(models.Farm).where(
            models.Farm.is_fixture, models.WaterListing.title.contains(fragment)))

    def find_job(fragment: str) -> models.JobPost | None:
        return db.scalar(select(models.JobPost).join(models.Farm).where(
            models.Farm.is_fixture, models.JobPost.title.contains(fragment)))

    for email, _seller, fragment, text, status in INQUIRIES:
        listing = find_listing(fragment or _seller)
        sender = users.get(email)
        if listing and sender and not db.scalar(select(models.ListingInquiry).where(
                models.ListingInquiry.listing_id == listing.id, models.ListingInquiry.sender_id == sender.id)):
            db.add(models.ListingInquiry(listing_id=listing.id, sender_id=sender.id, message=text, status=status, created_at=ago(random.randint(0, 3), random.randint(1, 20))))
    for email, fragment, text, status in APPLICATIONS:
        job, applicant = find_job(fragment), users.get(email)
        if job and applicant and not db.scalar(select(models.JobApplication).where(
                models.JobApplication.job_id == job.id, models.JobApplication.applicant_id == applicant.id)):
            db.add(models.JobApplication(job_id=job.id, applicant_id=applicant.id, message=text, status=status, created_at=ago(random.randint(0, 3), random.randint(1, 20))))
    db.commit()


if __name__ == "__main__":
    import sys

    init_demo_schema()
    if "--reset" in sys.argv:
        reset()
    run()
