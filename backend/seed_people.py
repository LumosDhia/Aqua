"""Sample people: fictional farm workers with profiles and CVs, hires, work history, chats and reports.

Run after seed.py and seed_market.py:  python seed_people.py     (safe to run again, it skips what exists)
Start over (only the people made here): python seed_people.py --reset
Everyone is invented and shares the password in PASSWORD. Delete these accounts before real use.
"""
import random
import sys
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import delete, or_, select

from app import models
from app.db import SessionLocal, init_demo_schema
from app.security import hash_password

PASSWORD = "aqua-demo-2026"
DOMAIN = "@aqua.test"
PREFIX = "w."
random.seed(11)
today = date.today()
now = datetime.now(timezone.utc)


def ago(days: float, hours: float = 0) -> datetime:
    return now - timedelta(days=days, hours=hours)


def exp(role: str, employer: str, place: str, start: str, end: str, text: str) -> dict[str, str]:
    return {"role": role, "employer": employer, "place": place, "start": start, "end": end, "description": text}


# visibility "private" and looking False show the discovery rules working
WORKERS = [
    dict(key="amel", name="Amel Gharbi", gov="Beja", radius=80, vis="public", looking=True, kinds=["period", "long_term"],
         headline="Olive picker and pruner, 9 seasons", skills=["Olive picking", "Pruning", "Harvest"], langs=["Arabic", "French"],
         bio="I have worked the olive harvest around Beja and Jendouba every winter since I was 17. I read nets and poles well and can lead a small crew.",
         avail="From mid November, weekdays and Saturdays",
         cv=dict(summary="Experienced seasonal olive worker, reliable and quick, able to lead a crew of four.",
                 experience=[exp("Crew leader", "Domaine Sidi Ali", "Testour", "2022", "2025", "Led four pickers, kept the daily weight record."),
                             exp("Olive picker", "Family groves", "Beja", "2016", "2022", "Hand picking and net work each season.")],
                 education=[{"school": "Lycee agricole de Beja", "degree": "Agriculture certificate", "year": "2016"}],
                 skills=["Olive picking", "Pruning", "Crew leading"], languages=[{"name": "Arabic", "level": "Native"}, {"name": "French", "level": "Good"}],
                 certifications=["First aid, 2023"])),
    dict(key="youssef", name="Youssef Mejri", gov="Beja", radius=120, vis="public", looking=True, kinds=["task", "period"],
         headline="Irrigation technician, drip and sprinkler", skills=["Irrigation", "Drip systems", "Pump repair"], langs=["Arabic", "French", "English"],
         bio="I design, repair and balance drip systems for vegetables and orchards. I bring my own tools and test every line before I leave.",
         avail="Flexible, short notice",
         cv=dict(summary="Irrigation technician with six years on vegetable and olive farms.",
                 experience=[exp("Irrigation technician", "Agro Medjerda", "Beja", "2021", "2025", "Installed and maintained drip on 80 ha."),
                             exp("Assistant fitter", "Hydro Services", "Tunis", "2019", "2021", "Pump and filter servicing.")],
                 education=[{"school": "ISET Beja", "degree": "Technician diploma, water systems", "year": "2019"}],
                 skills=["Drip systems", "Pump repair", "Filter servicing"], languages=[{"name": "Arabic", "level": "Native"}, {"name": "French", "level": "Good"}, {"name": "English", "level": "Basic"}],
                 certifications=[])),
    dict(key="rim", name="Rim Haddad", gov="Sfax", radius=150, vis="public", looking=True, kinds=["long_term"],
         headline="Orchard worker and nursery assistant", skills=["Planting", "Pruning", "Nursery"], langs=["Arabic", "French"],
         bio="Five years in a tree nursery and two in almond orchards. I like careful work: grafting, planting and tying.",
         avail="Full time, from January",
         cv=dict(summary="Nursery and orchard worker looking for a stable full time job.",
                 experience=[exp("Nursery assistant", "Pepiniere Sfax Sud", "Sfax", "2020", "2025", "Grafting, potting, watering schedules for 40,000 seedlings.")],
                 education=[], skills=["Grafting", "Planting", "Pruning"], languages=[{"name": "Arabic", "level": "Native"}, {"name": "French", "level": "Good"}], certifications=[])),
    dict(key="nizar", name="Nizar Ben Salah", gov="Kairouan", radius=100, vis="public", looking=True, kinds=["task", "period"],
         headline="Tractor driver and harvest hand", skills=["Tractor driving", "Harvest", "Wheat"], langs=["Arabic"],
         bio="I drive and maintain tractors and harvest wheat and barley. I hold a valid agricultural machinery licence.",
         avail="April to July, and ploughing in autumn",
         cv=dict(summary="Machinery operator for cereal farms.", experience=[exp("Tractor driver", "Ferme El Ouara", "Kairouan", "2018", "2025", "Ploughing, sowing and harvest on 300 ha.")],
                 education=[], skills=["Tractor driving", "Machinery repair"], languages=[{"name": "Arabic", "level": "Native"}], certifications=["Machinery licence"])),
    dict(key="khadija", name="Khadija Trabelsi", gov="Nabeul", radius=60, vis="public", looking=True, kinds=["task"],
         headline="Citrus and vegetable picker", skills=["Citrus", "Harvest", "Packing"], langs=["Arabic", "French"],
         bio="Fast, careful picking and sorting for citrus and tomatoes. I can also pack for market.", avail="Mornings, every day",
         cv=dict(summary="Picker and packer for citrus and vegetables around Cap Bon.", experience=[exp("Picker and packer", "Cooperative Beni Khalled", "Nabeul", "2019", "2025", "Citrus and tomato harvest.")],
                 education=[], skills=["Citrus", "Packing"], languages=[{"name": "Arabic", "level": "Native"}, {"name": "French", "level": "Basic"}], certifications=[])),
    dict(key="hatem", name="Hatem Jlassi", gov="Beja", radius=40, vis="public", looking=True, kinds=["task"],
         headline="Farm hand, general work", skills=["Harvest", "Irrigation"], langs=["Arabic"], bio="Any honest farm work, I learn fast.", avail="Weekends",
         cv=None),
    dict(key="sonia", name="Sonia Ayari", gov="Jendouba", radius=200, vis="private", looking=True, kinds=["period"],
         headline="Seasonal worker (profile private)", skills=["Olive picking"], langs=["Arabic"], bio="", avail="",
         cv=dict(summary="Private profile: cannot apply until made public.", experience=[], education=[], skills=["Olive picking"], languages=[{"name": "Arabic", "level": "Native"}], certifications=[])),
    dict(key="walid", name="Walid Chaabane", gov="Tunis", radius=70, vis="public", looking=False, kinds=["long_term"],
         headline="Greenhouse worker, not looking right now", skills=["Greenhouse", "Tomatoes"], langs=["Arabic", "French"], bio="Currently employed, open later.", avail="",
         cv=dict(summary="Greenhouse tomato worker.", experience=[exp("Greenhouse worker", "Serres du Nord", "Bizerte", "2020", "2025", "Planting, tying, picking.")],
                 education=[], skills=["Greenhouse"], languages=[{"name": "Arabic", "level": "Native"}], certifications=[])),
]

# (worker, job title fragment, engagement kind or None, status, note or reason, days ago it started, chat lines)
HIRES = [
    ("amel", "Olive harvest crew", "temporary", "active", "", 6,
     [("farm", "Welcome Amel, we start at 7:00 at the north gate."), ("worker", "Thank you, I will bring my own net."), ("farm", "Perfect, lunch is on us.")]),
    ("youssef", "drip lines", "temporary", "finished", "Fixed all four lines in a day and a half, tested and left clean.", 20,
     [("farm", "Can you start Monday?"), ("worker", "Yes, I will be there at 8."), ("farm", "All good, thank you Youssef.")]),
    ("hatem", "Olive harvest crew", "temporary", "disapproved", "Did not come on two agreed days without calling.", 15,
     [("farm", "We missed you today, are you coming tomorrow?")]),
]
# (reporter side, worker, reason, details, status, admin note)
REPORTS = [
    ("farm", "hatem", "no_show", "He did not come on two agreed days and did not answer the phone.", "open", ""),
    ("worker", "amel", "other", "I was asked to bring my own ladder, which was not in the job post.", "dismissed", "Reviewed: a ladder was listed in the post. No action."),
]


def reset() -> None:
    with SessionLocal() as db:
        emails = [f"{PREFIX}{w['key']}{DOMAIN}" for w in WORKERS]
        ids = list(db.scalars(select(models.User.id).where(models.User.email.in_(emails))))
        if ids:
            eng = [e.id for e in db.scalars(select(models.Engagement).where(models.Engagement.worker_id.in_(ids))).all()]
            db.execute(delete(models.Report).where(or_(models.Report.reporter_id.in_(ids), models.Report.target_id.in_(ids))))
            if eng:
                db.execute(delete(models.Message).where(models.Message.engagement_id.in_(eng)))
                db.execute(delete(models.Engagement).where(models.Engagement.id.in_(eng)))
            db.execute(delete(models.JobApplication).where(models.JobApplication.applicant_id.in_(ids)))
            db.execute(delete(models.Cv).where(models.Cv.user_id.in_(ids)))
            db.execute(delete(models.Profile).where(models.Profile.user_id.in_(ids)))
            db.execute(delete(models.User).where(models.User.id.in_(ids)))
            db.commit()


def run() -> None:
    with SessionLocal() as db:
        if not db.scalar(select(models.JobPost.id).join(models.Farm).where(models.Farm.is_fixture).limit(1)):
            sys.exit("Run seed.py and seed_market.py first: there are no farmers or jobs to hire for.")
        made: dict[str, models.User] = {}
        for w in WORKERS:
            email = f"{PREFIX}{w['key']}{DOMAIN}"
            user = db.scalar(select(models.User).where(models.User.email == email))
            if not user:
                user = models.User(email=email, name=w["name"], role="user", account_type="worker", password_hash=hash_password(PASSWORD))
                db.add(user); db.flush()
                db.add(models.Profile(user_id=user.id, headline=w["headline"], bio=w["bio"], governorate=w["gov"], visibility=w["vis"], radius_km=w["radius"],
                                      looking_for_work=w["looking"], kinds=w["kinds"], skills=w["skills"], languages=w["langs"], availability=w["avail"]))
                if w["cv"]:
                    db.add(models.Cv(user_id=user.id, data={"full_name": w["name"], **w["cv"]}, source="manual"))
            made[w["key"]] = user
        db.commit()

        def job_like(fragment: str) -> models.JobPost | None:
            return db.scalar(select(models.JobPost).join(models.Farm).where(
                models.Farm.is_fixture, models.JobPost.title.contains(fragment)))

        engs: dict[str, models.Engagement] = {}
        for key, fragment, kind, status, note, days, chat in HIRES:
            job, user = job_like(fragment), made[key]
            if not job or db.scalar(select(models.JobApplication).where(models.JobApplication.job_id == job.id, models.JobApplication.applicant_id == user.id)):
                continue
            app = models.JobApplication(job_id=job.id, applicant_id=user.id, message="I am available and can start when you need me.", status="accepted", created_at=ago(days + 2))
            db.add(app); db.flush()
            e = models.Engagement(farm_id=job.farm_id, worker_id=user.id, job_id=job.id, application_id=app.id, title=job.title, kind=kind, status=status,
                                  start_date=today - timedelta(days=days), created_at=ago(days),
                                  end_date=(today - timedelta(days=max(days - 3, 0))) if status != "active" else job.end_date,
                                  note=note if status == "finished" else "", reason=note if status == "disapproved" else "",
                                  closed_at=ago(max(days - 3, 0)) if status != "active" else None)
            db.add(e); db.flush()
            owner_id = next(m.user_id for m in job.farm.members if m.role == "owner")
            for i, (side, text) in enumerate(chat):
                at = ago(days - 0.2 * i)
                db.add(models.Message(engagement_id=e.id, sender_id=owner_id if side == "farm" else user.id, body=text, created_at=at,
                                      read_at=at + timedelta(minutes=20) if i < len(chat) - 1 else None))
            engs[key] = e
        # a few open applications from public workers who are not hired yet
        for key, fragment in (("rim", "Olive harvest crew"), ("nizar", "Repair and re-lay"), ("khadija", "Olive harvest crew")):
            job, user = job_like(fragment), made[key]
            if job and not db.scalar(select(models.JobApplication).where(models.JobApplication.job_id == job.id, models.JobApplication.applicant_id == user.id)):
                db.add(models.JobApplication(job_id=job.id, applicant_id=user.id, message="Please consider me for this job, I have the right experience.",
                                             status="pending", created_at=ago(random.randint(0, 2), random.randint(1, 20))))
        db.commit()
        for side, key, reason, details, status, admin_note in REPORTS:
            e = engs.get(key) or db.scalar(select(models.Engagement).join(models.Farm).where(
                models.Farm.is_fixture, models.Engagement.worker_id == made[key].id))
            if not e:
                continue
            owner_id = next(m.user_id for m in e.farm.members if m.role == "owner")
            reporter, target = (owner_id, made[key].id) if side == "farm" else (made[key].id, owner_id)
            if db.scalar(select(models.Report).where(models.Report.reporter_id == reporter, models.Report.target_id == target)):
                continue
            db.add(models.Report(reporter_id=reporter, target_id=target, engagement_id=e.id, reason=reason, details=details, status=status, admin_note=admin_note,
                                 created_at=ago(4), resolved_at=ago(2) if status in ("resolved", "dismissed") else None))
        db.commit()


if __name__ == "__main__":
    init_demo_schema()
    if "--reset" in sys.argv:
        reset()
    run()
