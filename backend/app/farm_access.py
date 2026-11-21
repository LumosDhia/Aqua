from sqlalchemy import and_, case, or_, select

from . import models

FIXTURE_OWNERS = {
    "owner@aqua.test": ("Demo Farm", "Nabeul"),
    "mohamed.karoui@aqua.test": ("Domaine Oued Zarga", "Beja"),
    "salma.trabelsi@aqua.test": ("Ferme El Baraka", "Nabeul"),
    "hichem.jlassi@aqua.test": ("Jlassi Olive Estate", "Sfax"),
    "rim.bensalah@aqua.test": ("Les Jardins de Ghar El Melh", "Bizerte"),
    "anis.dridi@aqua.test": ("Bergerie Dridi", "Kef"),
    "fatma.gharbi@aqua.test": ("Oasis Gharbi", "Tozeur"),
    "walid.mansouri@aqua.test": ("Mansouri Citrus", "Nabeul"),
    "nesrine.hamdi@aqua.test": ("Agri Hamdi", "Kairouan"),
    "lamine.benali@aqua.test": ("Ferme Lamine", "Nabeul"),
    "samia.riahi@aqua.test": ("Jardin Samia", "Nabeul"),
}
# Keys for the demonstration worker pool in seed_demo.py. A real account is never in this set.
DEMO_WORKER_KEYS = (
    "leila", "sondes", "amel", "fatma", "houda", "rim", "najet", "ines", "yosra", "salma", "amina",
    "karim", "youssef", "nizar", "hatem", "mourad", "tarek", "lotfi", "anis", "walid", "mehdi", "slah",
)

FIXTURE_ACCOUNTS = frozenset(FIXTURE_OWNERS) | {
    "admin@aqua.test", "manager@aqua.test", "technician@aqua.test", "viewer@aqua.test",
    *(f"w.{name}@aqua.test" for name in ("amel", "youssef", "rim", "nizar", "khadija", "hatem", "sonia", "walid")),
    *(f"w.demo.{key}@aqua.test" for key in DEMO_WORKER_KEYS),
    "karim.bouazizi@aqua.test", "nadia.sassi@aqua.test",
}


def demo_mode(user: models.User) -> bool:
    return user.email in FIXTURE_ACCOUNTS


def legacy_fixture_farm():
    # Match the seed owner, name and region together on existing databases.
    farm = models.Farm
    member = models.FarmMember
    owner = models.User
    return select(1).select_from(member).join(owner, owner.id == member.user_id).where(
        member.farm_id == farm.id,
        member.role == "owner",
        or_(*(and_(owner.email == email, farm.region == region,
                   farm.name.in_((name, "Nabeul Farm")) if email == "owner@aqua.test" else farm.name == name)
              for email, (name, region) in FIXTURE_OWNERS.items())),
    ).correlate(farm).exists()


def visible_farms(user: models.User):
    farm = models.Farm
    member = models.FarmMember
    membership = and_(member.farm_id == farm.id, member.user_id == user.id)
    query = select(farm).where(farm.is_fixture == demo_mode(user))
    if user.role != "admin":
        return query.join(member, membership).order_by(
            case((member.role == "owner", 0), else_=1), farm.id.desc(),
        )
    return query.outerjoin(member, membership).order_by(
        case((member.role == "owner", 0), (member.id.is_not(None), 1), else_=2), farm.id.desc(),
    )
