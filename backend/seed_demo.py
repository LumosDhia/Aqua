"""Extend the Aqua fixture dataset after seed.py, seed_market.py and seed_people.py."""

import shutil
from collections import Counter
from datetime import datetime, time, timedelta, timezone
from pathlib import Path

from sqlalchemy import select

from app import models as m
from app.config import settings
from app.db import SessionLocal, init_schema
from app.farm_access import FIXTURE_ACCOUNTS, FIXTURE_OWNERS
from app.security import hash_password
from seed_people import PASSWORD, WORKERS, exp

MEDIA = Path(__file__).parent / "seed_media"
TUNIS = timezone(timedelta(hours=1))

# Portrait, account key, name, governorate, town, radius, rate, specialty,
# biography, two employers and field assignments, training and certification.
PEOPLE = (
    ("leila-ben-youssef", "leila", "Leïla Ben Youssef", "Beja", "Testour", 28, 48, "Olive picking",
     "I lead hand-picking crews on the terraces above Testour. I keep bruised fruit separate and weigh each crew's sacks before the mill truck leaves.",
     "Groves of Sidi Ameur", "Spread nets on terraces and sorted fallen fruit.", "Bir El Euch family groves", "Led the net crew and kept the mill's weight slips.", "Adult education centre, Testour", "Olive quality workshop, Testour"),
    ("sondes-chaabane", "sondes", "Sondes Chaabane", "Nabeul", "Beni Khiar", 22, 52, "Greenhouse",
     "I work under cover with tomatoes and peppers. I train new hands to lower tomato stems without folding them and check the clips after windy nights.",
     "Hammamet tunnel gardens", "Tied young tomato plants and recorded damaged clips.", "Beni Khiar market gardens", "Managed lowering and leaf removal in tomato tunnels.", "Vocational centre, Nabeul", "Protected cropping workshop, Cap Bon"),
    ("amel-mathlouthi", "amel", "Amel Mathlouthi", "Nabeul", "Dar Chaabane", 18, 64, "Drip systems",
     "I trace weak flow from the screen filter to the last emitter. I bring spare couplers and measure the tail flow again before I hand the line back.",
     "Bir Challouf vegetable growers", "Learned to flush drip laterals and fit takeoffs.", "Dar Chaabane irrigation workshop", "Repaired clogged greenhouse and orchard circuits.", "Vocational centre, Nabeul", "Drip maintenance course, Cap Bon"),
    ("fatma-jebali", "fatma", "Fatma Jebali", "Tozeur", "Degache", 25, 47, "Dates",
     "I sort Deglet Nour by ripeness while the bunches are still labelled. I set soft dates aside so they do not spoil the dry trays on the way to the packhouse.",
     "Degache family oasis", "Sorted the morning cut and tagged each tray.", "Djerid date packing group", "Graded and weighed incoming Deglet Nour lots.", "Adult education centre, Degache", "Packhouse hygiene induction, Degache"),
    ("houda-rezgui", "houda", "Houda Rezgui", "Kef", "Sakiet Sidi Youssef", 30, 65, "Animal health",
     "I check feet and appetite before the flock goes out. I log the ear tag and call the vet when a ewe stays off feed or starts to limp.",
     "El Kalaa family sheepfold", "Kept lambing and bottle-feeding records.", "Sakiet livestock group", "Checked feet and recorded veterinary follow-ups by ear tag.", "Agricultural training centre, Le Kef", "Flock observation and handling workshop"),
    ("rim-khelifi", "rim", "Rim Khelifi", "Sfax", "Gremda", 30, 70, "Grafting",
     "I learned budding in a nursery off the Gremda road. On almond blocks I label each scion lot and go back to count which grafts took.",
     "Gremda fruit nursery", "Prepared rootstocks and wrapped bud unions.", "El Ain almond growers", "Top-worked young almonds and logged graft take.", "Vocational centre, Sfax", "Fruit-tree propagation workshop, Sfax"),
    ("najet-trabelsi", "najet", "Najet Trabelsi", "Nabeul", "Menzel Bouzelfa", 25, 44, "Packing",
     "I grade clementines at the shed and set fruit with torn stems aside. I can tell the picker which row sent a damaged crate because I keep the tags with the fruit.",
     "Beni Khalled citrus sheds", "Sorted oranges and stacked weighed crates.", "Bouzelfa citrus growers", "Checked crate weights and traced rejects back to rows.", "Adult education centre, Menzel Bouzelfa", "Produce handling induction, Beni Khalled"),
    ("yosra-mejri", "yosra", "Yosra Mejri", "Bizerte", "Ghar El Melh", 20, 46, "Market garden",
     "I grow tomatoes and peppers on the sandy ground by the lagoon. When wind starts lifting the sand I check the young plants and pin the irrigation tape back down.",
     "Lagoon family gardens", "Transplanted peppers and repaired windblown beds.", "Aousja vegetable growers", "Looked after tomato beds from transplant to market.", "Adult education centre, Ghar El Melh", "Vegetable seedling workshop, Aousja"),
    ("karim-mejri", "karim", "Karim Mejri", "Nabeul", "Beni Khiar", 24, 58, "Irrigation",
     "I run the well and tank rounds before the picking crew arrives. When a plot takes more water than usual I walk the line before giving it another turn.",
     "Beni Khiar orchards", "Read tank gauges and recorded valve openings.", "Korba vegetable growers", "Scheduled drip turns and isolated leaking blocks.", "Vocational centre, Nabeul", "Pump station electrical safety induction"),
    ("youssef-ayari", "youssef", "Youssef Ayari", "Beja", "Oued Zarga", 35, 60, "Soil preparation",
     "I prepare seedbeds on the Medjerda slopes. If the clay still ribbons in my hand I move to a drier strip instead of leaving ruts.",
     "Oued Zarga cereal growers", "Set harrow depth on heavy ground.", "Testour grain group", "Prepared headlands and checked seedbed tilth before drilling.", "Agricultural training centre, Béja", "Agricultural machinery licence"),
    ("nizar-dridi", "nizar", "Nizar Dridi", "Kairouan", "Haffouz", 42, 68, "Tractor",
     "I drive and service tractors on the Haffouz road. I calibrate the drill with a catch tray and write down the settings for the next driver.",
     "Haffouz cereal growers", "Operated cultivators and maintained implements.", "Oueslatia machinery group", "Calibrated grain drills and handled daily tractor checks.", "Vocational centre, Kairouan", "Agricultural machinery licence"),
    ("hatem-ferjani", "hatem", "Hatem Ferjani", "Sfax", "El Ain", 32, 58, "Pruning",
     "I prune Chemlali after picking, starting with broken wood and crowded centres. I mark trees with old splits so the foreman can check them before the next pass.",
     "El Ain family groves", "Removed suckers and gathered cut wood.", "Gremda orchard crews", "Pruned mature Chemlali and recorded damaged scaffolds.", "Adult education centre, El Ain", "Olive canopy management workshop, Sfax"),
    ("mourad-tlili", "mourad", "Mourad Tlili", "Kef", "Sakiet Sidi Youssef", 25, 50, "Sheep",
     "I know the grazing tracks above Sakiet and take the flock back before the crossing gets muddy. At lambing I keep the weak pairs close to the shed.",
     "Sakiet family sheepfold", "Moved ewes between grazing and the winter fold.", "El Kef upland flocks", "Managed grazing turns and watched ewe-lamb pairs.", "Adult education centre, Sakiet Sidi Youssef", "Lambing and flock handling workshop"),
    ("tarek-ouerghi", "tarek", "Tarek Ouerghi", "Tozeur", "Nefta", 28, 62, "Palm climbing",
     "I pollinate palms in spring and cut Deglet Nour bunches in autumn. Before climbing I check the crown and the landing space, and Fatma's sorting crew keeps the trays clear.",
     "Nefta family oasis", "Collected pollen and tied young bunches.", "Degache palm crews", "Pollinated crowns and lowered ripe bunches to the ground crew.", "Agricultural training centre, Tozeur", "Palm climbing and harness inspection workshop"),
    ("lotfi-sassi", "lotfi", "Lotfi Sassi", "Kairouan", "Haffouz", 34, 55, "Livestock",
     "I look after housed cattle when the field crew is sowing. I check the float valves at feeding and separate a slow eater before the others clear the trough.",
     "Haffouz family cattle yard", "Fed finishing cattle and cleaned troughs.", "Sbikha cattle group", "Checked water floats and recorded intake by pen.", "Adult education centre, Haffouz", "Cattle handling and yard safety induction"),
)

# Farm order follows FIXTURE_OWNERS. Roles include the work location because
# the Worker model has no place column.
TEAMS = (
    (("karim", "Irrigation lead · North field"), ("amel", "Drip repair · North field"), ("khadija", "Harvest · North field")),
    (("leila", "Picking lead · Olive terrace"), ("youssef", "Seedbed preparation · Lower wheat field")),
    (("sondes", "Tomato grower · Greenhouse A"), ("amel", "Drip repair · Greenhouse B")),
    (("rim", "Grafting · Almond block"), ("hatem", "Olive pruning · North grove")),
    (("yosra", "Market gardener · Market garden"), ("walid", "Tunnel crop training · Pepper tunnels")),
    (("houda", "Flock health · Lambing pen"), ("mourad", "Shepherd · West pasture")),
    (("fatma", "Date grading · Packing shed"), ("tarek", "Palm climber · Deglet Nour palms")),
    (("najet", "Packing lead · Clementine block"), ("khadija", "Picker · Clementine block")),
    (("nizar", "Tractor driver · Durum wheat"), ("lotfi", "Cattle hand · Finishing yard"), ("nizar_legacy", "Seedbed operator · Durum wheat")),
)

# Farm index, plot, title, work, town, worker, skill, crew size, days,
# status, and applicant's own message.
JOBS = (
    (0, "North field", "Replace the leaking tomato laterals", "Bring a punch and couplers for the western beds. Check the last emitter against the head of each repaired line.", "Dar Chaabane", "amel", "Drip systems", 1, 1, "accepted", "I can bring 16 mm fittings and a pressure gauge. Leave the western valve tagged for me."),
    (0, "North field", "Lift the next ripe tomato pick", "Pick sound turning fruit for the afternoon market crates and keep split fruit in the cull bucket.", "Dar Chaabane", "khadija", "Harvest", 2, 1, "pending", "I can start at first light and finish the market crates before noon."),
    (1, "Olive terrace", "Hand-pick the lower olive terrace", "Work the shallow terraces nearest the track. Nets and crates are at the mill gate.", "Testour", "leila", "Olive picking", 3, 3, "pending", "I can lead the lower terrace and keep the mill weights. Is the steep inside row included?"),
    (2, "Greenhouse A", "Lower the first tomato bays", "Lower vines two bays at a time so the picking aisle stays open.", "Dar Chaabane", "sondes", "Greenhouse", 2, 2, "accepted", "I can bring spare clips and start with the aisle by the mixing tank."),
    (3, "North grove", "Clear broken Chemlali limbs after picking", "Start with rows already released by the picking crew. Flag cracked scaffold limbs for the foreman.", "Gremda", "hatem", "Pruning", 2, 2, "declined", "I can do both afternoons, but my mornings are booked on the El Ain road."),
    (4, "Market garden", "Reset tomato drip tape along the windward beds", "Pin the ends before opening the valve and replace damaged stakes near the access lane.", "Ghar El Melh", "yosra", "Market garden", 2, 1, "pending", "I know those sandy beds. Can we check the pins before the wind gets up?"),
    (5, "Fodder field", "Check ewe feet at the fodder gate", "Run the flock through in small groups after grazing. Record tags for the vet's next round.", "Sakiet Sidi Youssef", "houda", "Animal health", 1, 2, "pending", "I can bring the tag book and check the lame ewes first."),
    (6, "Deglet Nour palms", "Lower the last ripe Deglet Nour bunches", "Keep the ladder lane clear and set each cut bunch on a labelled tray.", "Tozeur oasis", "tarek", "Palm climbing", 2, 2, "pending", "I can clear the palms nearest the basin first so the sorting crew can use the lane."),
    (7, "Clementine block", "Grade the clementine pick at the shed", "Keep first grade and loose fruit separate and return the row labels with the scale sheets.", "Menzel Bouzelfa", "najet", "Packing", 3, 3, "pending", "I can take the scale and train the second table on the stem check."),
    (8, "Durum wheat", "Drill the dry upper headland", "Calibrate with the durum seed on site. Leave the low corner until it stops sticking to the tyres.", "Haffouz", "nizar", "Tractor", 1, 2, "pending", "I can set the drill at the yard before driving out. What width is the seed drill?"),
    (0, "North field", "Receive a tanker at the tomato block", "Guide a 6 m³ tanker to the concrete tank and check the fill before opening the tomato valve.", "Dar Chaabane", "karim", "Irrigation", 1, 1, "accepted", "I can meet the driver at the packing shed and check the coupling before we unload."),
)

LISTINGS = (
    (2, 6, 7, 12, "network", "water-tanks.jpg", "Six cubic metres of nursery mains reserve",
     "3 km from Beni Khiar at the greenhouse gate. SONEDE reserve kept in a covered tank. One 6 m³ delivery at the listed rate within 12 km.",
     "Stored mains water. Tank is covered and was rinsed before filling."),
    (1, 20, 5, 20, "borehole", "drip-irrigation.jpg", "Two tanker loads from Borehole B2",
     "6 km from Testour on the Oued Zarga road. Two 10 m³ loads after the cereal sprinkler turn, with access from the main gate.",
     "Settled borehole water for irrigation. Conductivity 1.6 dS/m at spring sampling."),
    (3, 12, 6, 16, "well", "olive-grove-dahar.jpg", "Estate well water after the grove round",
     "7 km from Gremda. The tanker can take 6 m³ per trip once the North grove valves are shut.",
     "For established trees. Ask for the most recent conductivity reading before ordering."),
    (4, 10, 4, 10, "well", "lagoon-farming-ghar-melh.jpg", "Lagoon road well water for established beds",
     "2 km from Ghar El Melh. Up to two 5 m³ deliveries before the afternoon wind picks up.",
     "Slightly brackish. Buyer to check suitability for the crop."),
    (6, 15, 6.5, 22, "borehole", "water-tanks.jpg", "One cooled borehole load from the oasis basin",
     "5 km from Tozeur on the Chebika road. One 15 m³ tanker from the cooling basin, loaded after the palm turn.",
     "Conductivity around 2.4 dS/m. Ask before using for livestock."),
)

DAY = timedelta(days=1)


def at(day, hour, minute=0):
    return datetime.combine(day, time(hour, minute), TUNIS)


class Seed:
    def __init__(self, db):
        self.db = db
        self.counts = Counter()

    def find(self, model, **key):
        return self.db.scalars(select(model).filter_by(**key)).one_or_none()

    def require(self, model, **key):
        row = self.find(model, **key)
        if row is None:
            raise SystemExit(f"Missing {model.__name__} {key}. Run the base seeds first.")
        return row

    def row(self, model, key, **values):
        row = self.find(model, **key)
        if row is None:
            row = model(**key, **values)
            self.db.add(row)
            self.db.flush()
            self.counts[model.__tablename__, "created"] += 1
        else:
            self.counts[model.__tablename__, "skipped"] += 1
        return row

    def update(self, row, **values):
        changed = any(getattr(row, field) != value for field, value in values.items())
        if changed:
            for field, value in values.items():
                setattr(row, field, value)
        self.counts[row.__tablename__, "updated" if changed else "skipped"] += 1


def copy_photo(source, directory, filename):
    dest = Path(settings.uploads_dir) / directory / filename
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.exists():
        shutil.copyfile(source, dest)
    return filename


def fixture_farms(seed):
    farms, owners = [], []
    for email, (name, region) in FIXTURE_OWNERS.items():
        owner = seed.require(m.User, email=email)
        names = (name, "Nabeul Farm") if email == "owner@aqua.test" else (name,)
        farm = seed.db.scalars(
            select(m.Farm).join(m.FarmMember, m.FarmMember.farm_id == m.Farm.id)
            .where(m.Farm.is_fixture, m.Farm.region == region, m.Farm.name.in_(names),
                   m.FarmMember.user_id == owner.id, m.FarmMember.role == "owner")
        ).one_or_none()
        if farm is None:
            raise SystemExit(f"Missing fixture farm {name} for {email}. Run the base seeds first.")
        farms.append(farm)
        owners.append(owner)
    return farms, owners


def people(seed, stamp):
    accounts = {}
    for entry in WORKERS:
        key = entry["key"]
        alias = key + "_legacy" if key in {"amel", "youssef", "rim", "nizar", "hatem"} else key
        accounts[alias] = seed.require(m.User, email=f"w.{key}@aqua.test")

    for (slug, key, name, gov, town, radius, rate, skill, bio, first, first_work,
         second, second_work, school, certificate) in PEOPLE:
        email = f"w.demo.{key}@aqua.test"
        if email not in FIXTURE_ACCOUNTS:
            raise ValueError(f"Unregistered fixture account {email}")
        user = seed.find(m.User, email=email)
        if user is not None and (user.name != name or user.account_type != "worker"):
            raise ValueError(f"Fixture identity mismatch for {email}")
        user = seed.row(m.User, {"email": email}, name=name, account_type="worker",
                        password_hash=user.password_hash if user else hash_password(PASSWORD))
        accounts[key] = user
        portrait = copy_photo(MEDIA / "portraits" / f"{slug}.jpg", "people", f"{slug}.jpg")
        kinds = ["task", "period"]
        if key in {"mourad", "lotfi", "sondes"}:
            kinds.append("long_term")
        availability = {
            "hatem": "Afternoons by arrangement after the olive pick",
            "khadija": "Mornings",
            "tarek": "Autumn harvest and spring pollination, weather permitting",
            "mourad": "Available for relief shifts, including lambing nights",
        }.get(key, "Weekdays and Saturday mornings by arrangement")
        languages = ["Arabic", "French"] if key in {"amel", "sondes", "rim", "houda", "nizar"} else ["Arabic"]
        seed.row(
            m.Profile, {"user_id": user.id}, headline=f"{skill} · {town}",
            bio=f"{bio} My day rate is {rate} TND.", governorate=gov,
            radius_km=radius, visibility="public", looking_for_work=True, kinds=kinds,
            skills=[skill], languages=languages, availability=availability,
            photo=portrait, created_at=stamp, updated_at=stamp, **m.entered(user),
        )
        seed.row(
            m.Cv, {"user_id": user.id}, source="manual", created_at=stamp, updated_at=stamp,
            data={
                "full_name": name, "summary": bio,
                "experience": [
                    exp(skill, second, town, "2020", "2025", second_work),
                    exp("Farm assistant", first, town, "2015", "2020", first_work),
                ],
                "education": [{"school": school, "degree": "Continuing education", "year": "2015"}],
                "skills": [skill],
                "languages": [{"name": lang, "level": "Native" if lang == "Arabic" else "Working"}
                              for lang in languages],
                "certifications": [certificate],
            },
            **m.entered(user),
        )
    return accounts


def teams(seed, farms, owners, accounts, stamp):
    crew = {}
    for index, entries in enumerate(TEAMS):
        for key, role in entries:
            crew[index, key] = seed.row(
                m.Worker, {"farm_id": farms[index].id, "name": accounts[key].name},
                role_label=role, created_at=stamp, **m.entered(owners[index], "owner"),
            )
    return crew


def hiring(seed, farms, owners, accounts, plots, end):
    delivery_job = None
    for index, plot_name, title, work, town, key, skill, size, days, status, message in JOBS:
        farm, owner, worker = farms[index], owners[index], accounts[key]
        plot = plots[index][plot_name]
        posted = at(end - 6 * DAY, 8)
        start = end - DAY if title.startswith("Receive a tanker") else end + 2 * DAY
        profile = seed.require(m.Profile, user_id=worker.id)
        rates = {"amel": 64, "khadija": 45, "leila": 48, "sondes": 52, "hatem": 58,
                 "yosra": 46, "houda": 65, "tarek": 62, "najet": 44, "nizar": 68, "karim": 58}
        decided = at(end - 3 * DAY, 11)
        job = seed.row(
            m.JobPost, {"farm_id": farm.id, "title": title},
            description=f"{plot.name} ({plot.crop}). {size} on the crew for {days} working day(s). {work}",
            kind="task" if days == 1 else "period", start_date=start, end_date=start + (days - 1) * DAY,
            pay_mode="fixed", pay_amount=rates[key], pay_unit="day", workers_needed=size,
            skills=[skill], governorate=farm.region, address_text=town, radius_km=profile.radius_km,
            status="filled" if status == "accepted" and size == 1 else "open",
            created_at=posted, updated_at=posted, **m.entered(owner, "owner"),
        )
        app = seed.row(
            m.JobApplication, {"job_id": job.id, "applicant_id": worker.id},
            message=message, status=status, created_at=at(end - 5 * DAY, 9),
            updated_by_id=owner.id if status != "pending" else None,
            updated_by_role="owner" if status != "pending" else None,
            updated_at=decided if status != "pending" else None, **m.entered(worker),
        )
        if status == "accepted":
            engagement = seed.row(
                m.Engagement, {"application_id": app.id}, farm_id=farm.id, worker_id=worker.id,
                job_id=job.id, title=title, kind="temporary", start_date=job.start_date,
                end_date=job.end_date, created_at=decided, **m.entered(owner, "owner"),
            )
            if key == "karim":
                delivery_job = engagement

    for age, hour, sender, body in (
        (3, 14, owners[0], "El Baraka can bring 6 m³ on the morning run. Can you meet them by the shed at seven?"),
        (2, 8, accounts["karim"], "Yes. Tell the driver to use the wide gate. I will bring our 50 mm adaptor."),
        (2, 15, owners[0], "Confirmed. Have him fill the concrete tank before you open the North field valve."),
        (1, 8, accounts["karim"], "All 6 m³ are in. I signed the slip and left it on the scale desk."),
    ):
        seed.row(m.Message, {"engagement_id": delivery_job.id, "body": body},
                 sender_id=sender.id, created_at=at(end - age * DAY, hour), **m.entered(sender))


def market(seed, farms, owners, end):
    inquiries = {
        2: (0, "Can you deliver the full 6 m³ at seven? The wide gate by the packing shed takes a tanker.", "accepted"),
        1: (5, "Can I collect one load in our own trailer? Has anyone checked whether this borehole water is fit for sheep?", "new"),
        4: (0, "Would you do a smaller load for the potato beds, and can you show the last conductivity reading?", "new"),
    }
    for index, volume, price, radius, source, photo, title, detail, quality in LISTINGS:
        farm, owner = farms[index], owners[index]
        filename = copy_photo(MEDIA / photo, "market", f"f{farm.id}-g4b-{photo}")
        posted = at(end - 6 * DAY, 10)
        listing = seed.row(
            m.WaterListing, {"farm_id": farm.id, "title": title},
            description=detail, litres_available=1000 * volume, price_mode="fixed", price_per_m3=price,
            water_source=source, quality_notes=quality, fulfilment="both", delivery_radius_km=radius,
            available_from=posted.date(), available_until=end + 7 * DAY,
            governorate=farm.region, address_text=detail.split(". ", 1)[0],
            lat=farm.lat, lon=farm.lon, photos=[filename], created_at=posted, updated_at=posted,
            **m.entered(owner, "owner"),
        )
        if index in inquiries:
            buyer, message, status = inquiries[index]
            sender = owners[buyer]
            seed.row(m.ListingInquiry, {"listing_id": listing.id, "sender_id": sender.id},
                     message=message, status=status, created_at=at(end - 4 * DAY, 10),
                     **m.entered(sender, "owner"))


def farm_work(seed, farm, owner, plots, accounts, crew, end):
    north = "North field"
    olive = "Olive grove"
    dates = "Date palms"

    def log(age, hour, minute, plot, key, kind, title, detail):
        worker = accounts[key]
        stamp = at(end - age * DAY, hour, minute)
        seed.row(m.Activity, {"farm_id": farm.id, "title": title},
                 plot_id=plots[plot].id, user_id=worker.id, kind=kind, detail=detail,
                 happened_at=stamp, created_at=stamp, **m.entered(worker, "worker"))

    # Track the shared 20 m³ tank by mass balance. Each completed irrigation
    # is recorded before that day's reading. Rain changes moisture only.
    draws = {
        12: (north, 3200, 40, "North field drip after the filter flush"),
        10: (dates, 2800, 35, "Date palm turn after the last bunches came down"),
        8: (olive, 3600, 60, "Olive grove turn along the upper drip header"),
        6: (north, 4000, 50, "North field drip before the tomato pick"),
        3: (dates, 2400, 30, "Date palms drip after clearing the basins"),
        1: (north, 3200, 40, "North field drip after the tanker delivery"),
    }
    fills = {
        9: (8000, "Orchard well top-up after the tank dropped below half"),
        4: (5000, "Orchard well top-up before the date palm turn"),
        1: (6000, "El Baraka tanker delivered to the main tank"),
    }
    level = 15000
    moisture = {north: 26, olive: 25, dates: 23}
    for age in range(13, -1, -1):
        if age in fills:
            litres, title = fills[age]
            level += litres
            log(age, 7, 40, north, "karim", "maintenance", title,
                f"Added {litres:,} L to the main concrete tank. Gauge after fill: {level:,} L.")
        irrigated = None
        if age in draws:
            irrigated, litres, minutes, title = draws[age]
            level -= litres
            log(age, 9, 0, irrigated, "karim", "irrigation", title,
                f"Drip ran {minutes} minutes and drew {litres:,} L from the main tank.")
        for plot_name in moisture:
            moisture[plot_name] += 7 if plot_name == irrigated else 4 if age == 5 else -1
            stamp = at(end - age * DAY, 16)
            seed.row(
                m.Reading, {"plot_id": plots[plot_name].id, "ts": stamp, "source": "manual"},
                soil_moisture=moisture[plot_name], tank_level=level / 200,
                temperature=(17, 18, 19, 18, 16, 15, 17)[age % 7],
                humidity=88 if age == 5 else 65 + age % 6, rain=age == 5,
                created_at=stamp, **m.entered(accounts["karim"], "worker"),
            )

    for entry in (
        (6, 12, 0, north, "khadija", "harvest", "Tomatoes picked for the Nabeul market", "Weighed 186 kg of sound tomatoes into ventilated crates. Kept 11 kg of split fruit aside."),
        (5, 15, 10, north, "amel", "note", "Held irrigation after the passing shower", "Topsoil was damp after the shower. Agreed with Karim to leave the laterals off."),
        (4, 10, 30, olive, "karim", "spraying", "Copper pass on the picked olive rows", "Applied Kocide 2000 to the already picked upper rows after the foliage dried. Marked the treated rows on the spray sheet."),
        (3, 11, 0, dates, "karim", "fertilising", "Compost spread on the palm basins", "Spread 180 kg of mature compost on the outer rings of the palm basins, keeping the crowns clear."),
        (2, 8, 30, dates, "karim", "animals", "Checked the goat trough beside the palm access track", "Counted all 12 goats in the stone pen and freed the trough float. They stayed behind the fence off the date plot."),
        (1, 11, 15, north, "khadija", "note", "Crate handover before noon", "Left clean crates by the shed for the morning crew and showed Amel the leaking junction at the west row."),
    ):
        log(*entry)

    completion_times = {6: (12, 0), 5: (15, 10), 4: (10, 30),
                        3: (11, 0), 2: (8, 30), 1: (7, 40)}
    for age, hour, plot, key, status, title, detail in (
        (6, 7, north, "khadija", "done", "Pick tomatoes for the market crates", "Use ventilated crates. Weigh culls separately."),
        (5, 13, north, "amel", "done", "Check the beds after the shower", "Walk the lowest beds before reopening any valve."),
        (4, 8, olive, "karim", "done", "Mark the picked olive rows for the copper pass", "Check the pick sheet before treating the upper rows."),
        (3, 9, dates, "karim", "done", "Spread mature compost around the palm basins", "Compost is ready by the date access lane."),
        (2, 8, dates, "karim", "done", "Free the float on the goat trough", "Use the gate beside the date block and count the goats before leaving."),
        (1, 7, north, "karim", "done", "Meet the El Baraka tanker at the wide gate", "Guide the driver to the main concrete tank and check the delivery slip."),
        (1, 15, north, "amel", "pending", "Send west-row repair to Amel", "The west-row coupling leaks when the valve is fully open."),
        (0, 9, north, "karim", "pending", "Walk the north header before the next turn", "Check the tagged join and file the pressure reading."),
        (0, 11, north, "khadija", "pending", "Sort and stack the returned tomato crates", "Put chipped crates by the wash station for replacement."),
    ):
        stamp = at(end - age * DAY, hour)
        seed.row(
            m.Task, {"farm_id": farm.id, "title": title}, worker_id=crew[0, key].id,
            plot_id=plots[plot].id, details=detail, status=status, created_at=stamp,
            done_at=at(stamp.date(), *completion_times[age]) if status == "done" else None,
            completion_source="manual" if status == "done" else None,
            **m.entered(owner, "owner"),
        )

    tank = seed.require(m.WaterSource, farm_id=farm.id, name="Main concrete tank")
    stamp = at(end, 16).astimezone(timezone.utc)
    recorded = tank.level_at
    if recorded is not None and recorded.tzinfo is None:
        recorded = recorded.replace(tzinfo=timezone.utc)
    if recorded != stamp or tank.level_l != level:
        seed.update(tank, level_l=level, level_recorded=True, level_at=stamp, updated_at=stamp,
                    level_by_id=accounts["karim"].id, level_by_role="worker",
                    notes="Fed by the orchard well and supplemented by tanker when the well round is short.")
    else:
        seed.counts[tank.__tablename__, "skipped"] += 1


def animal_places(seed, farms):
    places = {
        0: {"chicken": "Packing shed run", "goat": "Stone pen by the Date palms access track"},
        1: {"sheep": "Fold below the Olive terrace"},
        2: {"chicken": "Fenced run behind the greenhouse shed"},
        5: {"sheep": "West pasture fold", "goat": "Lambing yard side pen", "donkey": "Track gate shelter"},
        6: {"goat": "Walled pen beyond the cooling basin"},
        8: {"beef_cattle": "Covered finishing yard"},
    }
    for index, species_places in places.items():
        for species, place in species_places.items():
            row = seed.find(m.Livestock, farm_id=farms[index].id, species=species, place="")
            if row is not None:
                seed.update(row, place=place)
            elif seed.find(m.Livestock, farm_id=farms[index].id, species=species, place=place):
                seed.counts[m.Livestock.__tablename__, "skipped"] += 1


def run():
    init_schema()
    with SessionLocal.begin() as db:
        seed = Seed(db)
        farms, owners = fixture_farms(seed)
        # Serialize seed runs on the same fixture farm in PostgreSQL.
        db.execute(select(m.Farm.id).where(m.Farm.id == farms[0].id).with_for_update()).scalar_one()
        plots = [{plot.name: plot for plot in farm.plots} for farm in farms]
        anchor = seed.find(m.JobPost, farm_id=farms[0].id, title=JOBS[0][2])
        if anchor is None:
            end = datetime.now(TUNIS).date() - DAY
        else:
            posted = anchor.created_at
            if posted.tzinfo is None:
                posted = posted.replace(tzinfo=timezone.utc)
            end = posted.astimezone(TUNIS).date() + 6 * DAY
        stamp = at(end - 14 * DAY, 8)
        accounts = people(seed, stamp)
        crew = teams(seed, farms, owners, accounts, stamp)
        hiring(seed, farms, owners, accounts, plots, end)
        market(seed, farms, owners, end)
        farm_work(seed, farms[0], owners[0], plots[0], accounts, crew, end)
        animal_places(seed, farms)
    print(f"Fixture farms: {len(farms)}. Worker accounts in pool: {len(accounts)}. Week ended {end}.")
    for table in sorted({table for table, _ in seed.counts}):
        print(f"{table}: {seed.counts[table, 'created']} created, "
              f"{seed.counts[table, 'updated']} updated, {seed.counts[table, 'skipped']} skipped")


if __name__ == "__main__":
    run()
