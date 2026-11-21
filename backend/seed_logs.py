"""Add eight weeks of past activity to the demo farms: notes, irrigation advice and a weekly report per week.

Safe to run again: rows are matched by farm, title and time, and reports by farm and week.
    python seed_logs.py
"""
import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app import models as m, weekly
from app.db import SessionLocal, init_schema
from app.farm_access import FIXTURE_OWNERS

TUNIS = timezone(timedelta(hours=1))
WEEKS = 8

NOTES = {
    "irrigation": [("Drip run on {plot}", "Ran the drip for the usual cycle and checked the emitters at the far end."),
                   ("Flushed the filter", "Screen filter was dirty after the wind. Cleaned it and tested pressure."),
                   ("Moved the hose line on {plot}", "Shifted the lines to the next beds and checked for leaks.")],
    "harvest": [("Picked {plot}", "Morning pick. Crates weighed and stacked in the shade before the truck."),
                ("Second pick on {plot}", "Smaller yield than last week. Culls set aside.")],
    "spraying": [("Sprayed {plot}", "Evening spray, no wind. Wore full protection and logged the product."),
                 ("Checked {plot} for pests", "Walked the rows. Found a few aphids, nothing that needs treating yet.")],
    "fertilising": [("Fertiliser on {plot}", "Applied through the drip. Rinsed the lines after."),
                    ("Compost around {plot}", "Spread mature compost and raked it in.")],
    "planting": [("Replanted gaps on {plot}", "Filled the gaps left by the last frost.")],
    "maintenance": [("Fixed a leak near {plot}", "Replaced a split coupler and tested the line."),
                    ("Checked the pump", "Listened for noise, cleaned the intake and checked the cables."),
                    ("Mended the fence by {plot}", "Closed the gap so animals stay out.")],
    "animals": [("Checked the animals", "Counted the herd, checked water and feet. Nothing unusual."),
                ("Refilled the troughs", "Cleaned the troughs and refilled them from the tank.")],
    "note": [("Weather note", "Hot afternoon, wind from the south. Kept irrigation to the early morning."),
             ("Walked the farm", "General walk round. Soil looks fine, a few dry corners to watch.")],
}
ADVICE = [("irrigate", "Soil is below target and no rain is due. Water this evening.", 0),
          ("wait", "Rain is forecast within a day, so watering can wait.", 900),
          ("skip", "Soil is above target. No irrigation needed today.", 1400),
          ("light", "Soil is slightly dry. A short, light run is enough.", 500)]


def stamp(day, hour, minute):
    return datetime.combine(day, datetime.min.time(), tzinfo=TUNIS).replace(hour=hour, minute=minute)


def main() -> None:
    init_schema()
    today = weekly.current_week()
    with SessionLocal() as db:
        for email, (name, region) in FIXTURE_OWNERS.items():
            owner = db.scalar(select(m.User).where(m.User.email == email))
            farm = db.scalar(select(m.Farm).where(m.Farm.is_fixture, m.Farm.name == name, m.Farm.region == region))
            if owner is None or farm is None or not farm.plots:
                continue
            rng = random.Random(f"logs-{farm.id}")
            plots = list(farm.plots)
            added = 0
            for week in range(1, WEEKS + 1):
                monday = today - timedelta(days=7 * week)
                for _ in range(rng.randint(5, 8)):
                    kind = rng.choice(list(NOTES))
                    title, detail = rng.choice(NOTES[kind])
                    plot = rng.choice(plots)
                    title = title.format(plot=plot.name)
                    when = stamp(monday + timedelta(days=rng.randint(0, 6)), rng.randint(6, 18), rng.choice((0, 10, 20, 30, 45)))
                    if db.scalar(select(m.Activity.id).where(m.Activity.farm_id == farm.id, m.Activity.title == title, m.Activity.happened_at == when)):
                        continue
                    db.add(m.Activity(farm_id=farm.id, plot_id=plot.id, user_id=owner.id, kind=kind, title=title, detail=detail,
                                      happened_at=when, created_at=when, **m.entered(owner, "owner")))
                    added += 1
                for plot in rng.sample(plots, min(len(plots), 3)):
                    action, why, saved = rng.choice(ADVICE)
                    when = stamp(monday + timedelta(days=rng.randint(0, 6)), 6, rng.choice((0, 15, 30)))
                    if db.scalar(select(m.Decision.id).where(m.Decision.plot_id == plot.id, m.Decision.ts == when)):
                        continue
                    db.add(m.Decision(plot_id=plot.id, ts=when, action=action, why=why, litres_saved=saved))
                    added += 1
            db.commit()
            made = 0
            for week in range(1, WEEKS + 1):
                monday = today - timedelta(days=7 * week)
                if db.scalar(select(m.WeeklyReport.id).where(m.WeeklyReport.farm_id == farm.id, m.WeeklyReport.week_start == monday)):
                    continue
                weekly.make_report(db, farm, monday, kind="auto", with_ai=False)
                made += 1
            print(f"{farm.name}: {added} log rows, {made} weekly reports")


if __name__ == "__main__":
    main()
