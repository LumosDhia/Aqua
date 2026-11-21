from collections.abc import Iterator

from sqlalchemy import MetaData, create_engine, inspect, select, text, update
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.schema import CreateIndex, CreateTable
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


ADDED_COLUMNS = {
    "users": [("account_type", "VARCHAR(10) NOT NULL DEFAULT 'farmer'"), ("photo", "VARCHAR(120)")],
    "job_posts": [("radius_km", "INTEGER")],
    "tasks": [("completion_source", "VARCHAR(10)")],
    "farms": [("description", "VARCHAR(2000) NOT NULL DEFAULT ''"), ("sketch_file", "VARCHAR(80)"),
              ("area_m2", "FLOAT"), ("is_fixture", "BOOLEAN NOT NULL DEFAULT FALSE"),
              ("onboarding_key", "VARCHAR(64)"), ("location_source", "VARCHAR(24)")],
    "livestock": [("place", "VARCHAR(60) NOT NULL DEFAULT ''"),
                  ("box_x", "FLOAT"), ("box_y", "FLOAT"), ("box_w", "FLOAT"), ("box_h", "FLOAT")],
    "water_sources": [("level_recorded", "BOOLEAN NOT NULL DEFAULT TRUE"),
                      ("refill_recorded", "BOOLEAN NOT NULL DEFAULT TRUE")],
    "plots": [("soil_type", "VARCHAR(20) NOT NULL DEFAULT 'loam'"), ("defaulted_fields", "JSON"),
              ("box_x", "FLOAT"), ("box_y", "FLOAT"), ("box_w", "FLOAT"), ("box_h", "FLOAT")],
    "readings": [("humidity", "FLOAT"), ("rain", "BOOLEAN"), ("source", "VARCHAR(10)"),
                 ("device_id", "INTEGER REFERENCES devices(id) ON DELETE SET NULL")],
    "profiles": [("photo", "VARCHAR(120)")],
    "devices": [("base_url", "VARCHAR(200)"), ("status_text", "VARCHAR(200) NOT NULL DEFAULT ''"),
                ("alarm", "BOOLEAN NOT NULL DEFAULT FALSE"), ("mode_auto", "BOOLEAN"), ("last_data", "JSON"),
                ("bridge_online", "BOOLEAN NOT NULL DEFAULT FALSE"),
                ("bridge_stop_pending", "BOOLEAN NOT NULL DEFAULT FALSE")],
}
ACTOR_COLUMNS = {
    "created_by_id": "INTEGER REFERENCES users(id) ON DELETE SET NULL",
    "updated_by_id": "INTEGER REFERENCES users(id) ON DELETE SET NULL",
    "created_by_role": "VARCHAR(20)",
    "updated_by_role": "VARCHAR(20)",
}


def _add_missing_columns(conn: Connection) -> None:
    from . import models

    inspector = inspect(conn)
    columns = {table: dict(items) for table, items in ADDED_COLUMNS.items()}
    timestamp = "TIMESTAMP WITH TIME ZONE" if conn.dialect.name == "postgresql" else "DATETIME"
    columns["water_sources"].update(level_by_id=ACTOR_COLUMNS["updated_by_id"],
                                    level_by_role="VARCHAR(20)", level_at=timestamp)
    for mapper in Base.registry.mappers:
        if issubclass(mapper.class_, models.Attribution):
            columns.setdefault(mapper.local_table.name, {}).update(
                ACTOR_COLUMNS, created_at=timestamp, updated_at=timestamp,
            )

    for table, additions in columns.items():
        existing = {col["name"] for col in inspector.get_columns(table)}
        for name, ddl in additions.items():
            if name not in existing:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))


def _widen_livestock_key(conn: Connection) -> None:
    from .models import Livestock

    if conn.dialect.name == "postgresql":
        conn.execute(text("ALTER TABLE livestock DROP CONSTRAINT IF EXISTS livestock_farm_id_species_key"))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS livestock_farm_species_place ON livestock (farm_id, species, place)"))
        return
    if conn.dialect.name != "sqlite":
        return
    old_key = any(set(key["column_names"]) == {"farm_id", "species"}
                  for key in inspect(conn).get_unique_constraints("livestock"))
    if old_key:
        metadata = MetaData()
        for related in ("farms", "users"):
            Base.metadata.tables[related].to_metadata(metadata)
        replacement = Livestock.__table__.to_metadata(metadata, name="livestock_new")
        conn.execute(CreateTable(replacement))
        names = ", ".join(replacement.columns.keys())
        conn.execute(text(f"INSERT INTO livestock_new ({names}) SELECT {names} FROM livestock"))
        conn.execute(text("DROP TABLE livestock"))
        conn.execute(text("ALTER TABLE livestock_new RENAME TO livestock"))
        for index in Livestock.__table__.indexes:
            conn.execute(CreateIndex(index))


def init_schema(target: Engine = engine) -> None:
    """Create new tables and apply additive changes to an existing development or live database."""
    from . import models
    from .farm_access import legacy_fixture_farm

    with target.begin() as conn:
        if conn.dialect.name == "postgresql":
            conn.execute(text("SELECT pg_advisory_xact_lock(24879115)"))
        elif conn.dialect.name == "sqlite":
            conn.exec_driver_sql("BEGIN IMMEDIATE")
        Base.metadata.create_all(conn)
        _add_missing_columns(conn)
        _widen_livestock_key(conn)
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS farms_onboarding_key ON farms (onboarding_key)"))
        conn.execute(update(models.Farm).where(~models.Farm.is_fixture, legacy_fixture_farm()).values(is_fixture=True))
        fixture_plots = select(models.Plot.id).join(models.Farm).where(models.Farm.is_fixture)
        conn.execute(update(models.Reading).where(
            models.Reading.source.is_(None), models.Reading.plot_id.in_(fixture_plots),
        ).values(source="demo"))


def init_demo_schema() -> None:
    if engine.dialect.name != "sqlite":
        raise SystemExit("Demo seeds require a local SQLite database. Set DATABASE_URL to a demo database file.")
    init_schema()
