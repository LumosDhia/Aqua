import re
from datetime import date, datetime, timezone

from sqlalchemy import JSON, Boolean, Date, DateTime, UniqueConstraint, Float, ForeignKey, Integer, String, false
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from .db import Base


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime | None) -> str | None:
    """SQLite returns naive datetimes; they are always UTC, so label them as such."""
    if dt is None:
        return None
    return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).isoformat()


class Attribution:
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=now)
    created_by_role: Mapped[str | None] = mapped_column(String(20))
    updated_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_by_role: Mapped[str | None] = mapped_column(String(20))
    _legacy_actor = ""

    @declared_attr
    def created_by(cls) -> Mapped["User | None"]:
        return relationship("User", foreign_keys=[cls.created_by_id])

    @declared_attr
    def last_editor(cls) -> Mapped["User | None"]:
        return relationship("User", foreign_keys=[cls.updated_by_id])

    @property
    def entered_by(self) -> dict[str, str | None] | None:
        actor = self.created_by
        if self.created_by_id is None and self._legacy_actor:
            actor = getattr(self, self._legacy_actor)
        if self.created_by_role is None and actor is not None:
            from .farm_access import FIXTURE_ACCOUNTS
            if actor.email in FIXTURE_ACCOUNTS:
                return None
        return actor_out(actor, self.created_at, self.created_by_role)

    @property
    def updated_by(self) -> dict[str, str | None] | None:
        if (self.created_by_id, self.created_at, self.created_by_role) == (
            self.updated_by_id, self.updated_at, self.updated_by_role,
        ):
            return None
        return actor_out(self.last_editor, self.updated_at, self.updated_by_role)

    def record_edit(self, user: "User", role: str, *, at: datetime | None = None) -> None:
        self.last_editor = user
        self.updated_by_role = role
        self.updated_at = at if at is not None else now()


def actor_out(user: "User | None", at: datetime | None, role: str | None) -> dict[str, str | None] | None:
    if user is None or at is None:
        return None
    timestamp = (at if at.tzinfo else at.replace(tzinfo=timezone.utc)).astimezone(timezone.utc)
    return {"name": user.name or "Unnamed user", "at": timestamp.isoformat().replace("+00:00", "Z"), "role": role}


def attribution(record: Attribution) -> dict[str, dict[str, str | None] | None]:
    return {"entered_by": record.entered_by, "updated_by": record.updated_by}


def entered(user: "User", role: str | None = None) -> dict[str, "User | str"]:
    return {"created_by": user, "created_by_role": role or user.role}


def estimate(note: str) -> dict[str, str]:
    return {"basis": "aqua_estimate", "basis_note": note}


_PHOTO_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,118}\Z")


def people_photo_url(name: str | None) -> str | None:
    """Public path for a profile portrait. The database stores the file name only."""
    if not name or not _PHOTO_NAME.fullmatch(name):
        return None
    return f"/uploads/people/{name}"


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    password_hash: Mapped[str] = mapped_column(String(300))
    role: Mapped[str] = mapped_column(String(20), default="user")      # admin | user
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    account_type: Mapped[str] = mapped_column(String(10), default="farmer")        # farmer | worker
    photo: Mapped[str | None] = mapped_column(String(120), nullable=True)   # file name in uploads/people, never a path
    memberships: Mapped[list["FarmMember"]] = relationship(back_populates="user", cascade="all, delete-orphan", foreign_keys="FarmMember.user_id")


class FarmMember(Attribution, Base):
    __tablename__ = "farm_members"
    __table_args__ = (UniqueConstraint("user_id", "farm_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    farm_id: Mapped[int] = mapped_column(ForeignKey("farms.id"), index=True)
    role: Mapped[str] = mapped_column(String(20), default="viewer")    # viewer | technician | manager | owner
    user: Mapped["User"] = relationship(back_populates="memberships", foreign_keys=[user_id])


class Farm(Attribution, Base):
    __tablename__ = "farms"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    region: Mapped[str] = mapped_column(String(60), default="")
    lat: Mapped[float] = mapped_column(Float, default=36.8)   # Tunis by default
    lon: Mapped[float] = mapped_column(Float, default=10.18)
    location_source: Mapped[str | None] = mapped_column(String(24))
    description: Mapped[str] = mapped_column(String(2000), default="")
    sketch_file: Mapped[str | None] = mapped_column(String(80), nullable=True)      # private file, never served as static
    area_m2: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_fixture: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    onboarding_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    plots: Mapped[list["Plot"]] = relationship(back_populates="farm", cascade="all, delete-orphan")
    @property
    def has_sketch(self) -> bool:
        return bool(self.sketch_file)

    @property
    def demo(self) -> bool:
        return self.is_fixture

    @property
    def weather_location(self) -> tuple[float | None, float | None]:
        return (None, None) if self.location_source == "unavailable" else (self.lat, self.lon)

    members: Mapped[list["FarmMember"]] = relationship(cascade="all, delete-orphan")
    workers: Mapped[list["Worker"]] = relationship(cascade="all, delete-orphan")
    water_sources: Mapped[list["WaterSource"]] = relationship(cascade="all, delete-orphan")
    livestock: Mapped[list["Livestock"]] = relationship(cascade="all, delete-orphan")
    listings: Mapped[list["WaterListing"]] = relationship(back_populates="farm", cascade="all, delete-orphan")
    jobs: Mapped[list["JobPost"]] = relationship(back_populates="farm", cascade="all, delete-orphan")
    devices: Mapped[list["Device"]] = relationship(cascade="all, delete-orphan")


class Plot(Attribution, Base):
    __tablename__ = "plots"
    id: Mapped[int] = mapped_column(primary_key=True)
    farm_id: Mapped[int] = mapped_column(ForeignKey("farms.id"))
    name: Mapped[str] = mapped_column(String(120))
    crop: Mapped[str] = mapped_column(String(60), default="tomatoes")
    area_m2: Mapped[float] = mapped_column(Float, default=1000)
    irrigation: Mapped[str] = mapped_column(String(20), default="drip")
    soil_type: Mapped[str] = mapped_column(String(20), default="loam")
    defaulted_fields: Mapped[list[str] | None] = mapped_column(JSON)
    # where the farmer drew this plot, as fractions 0..1 of the drawing; all four are null when it was not drawn
    box_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    box_y: Mapped[float | None] = mapped_column(Float, nullable=True)
    box_w: Mapped[float | None] = mapped_column(Float, nullable=True)
    box_h: Mapped[float | None] = mapped_column(Float, nullable=True)
    farm: Mapped[Farm] = relationship(back_populates="plots")
    readings: Mapped[list["Reading"]] = relationship(back_populates="plot", cascade="all, delete-orphan")


class Reading(Attribution, Base):
    __tablename__ = "readings"
    source: Mapped[str | None] = mapped_column(String(10))
    device_id: Mapped[int | None] = mapped_column(ForeignKey("devices.id", ondelete="SET NULL"))
    id: Mapped[int] = mapped_column(primary_key=True)
    plot_id: Mapped[int] = mapped_column(ForeignKey("plots.id"), index=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    soil_moisture: Mapped[float | None] = mapped_column(Float, nullable=True)   # percent
    tank_level: Mapped[float | None] = mapped_column(Float, nullable=True)      # percent
    temperature: Mapped[float | None] = mapped_column(Float, nullable=True)
    humidity: Mapped[float | None] = mapped_column(Float, nullable=True)
    rain: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    plot: Mapped[Plot] = relationship(back_populates="readings")


class Decision(Base):
    __tablename__ = "decisions"
    id: Mapped[int] = mapped_column(primary_key=True)
    plot_id: Mapped[int] = mapped_column(ForeignKey("plots.id"), index=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    action: Mapped[str] = mapped_column(String(20))      # irrigate | wait | skip | light
    why: Mapped[str] = mapped_column(String(300))
    litres_saved: Mapped[float] = mapped_column(Float, default=0)


class Worker(Attribution, Base):
    __tablename__ = "workers"
    id: Mapped[int] = mapped_column(primary_key=True)
    farm_id: Mapped[int] = mapped_column(ForeignKey("farms.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    role_label: Mapped[str] = mapped_column(String(80), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    tasks: Mapped[list["Task"]] = relationship(back_populates="worker", cascade="all, delete-orphan")


class Task(Attribution, Base):
    __tablename__ = "tasks"
    id: Mapped[int] = mapped_column(primary_key=True)
    farm_id: Mapped[int] = mapped_column(ForeignKey("farms.id"), index=True)
    worker_id: Mapped[int] = mapped_column(ForeignKey("workers.id"), index=True)
    plot_id: Mapped[int | None] = mapped_column(ForeignKey("plots.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(200))
    details: Mapped[str] = mapped_column(String(1000), default="")
    status: Mapped[str] = mapped_column(String(20), default="pending")   # pending | done
    error: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completion_source: Mapped[str | None] = mapped_column(String(10))
    worker: Mapped[Worker] = relationship(back_populates="tasks")
    plot: Mapped["Plot | None"] = relationship()


class WaterSource(Attribution, Base):
    __tablename__ = "water_sources"
    id: Mapped[int] = mapped_column(primary_key=True)
    farm_id: Mapped[int] = mapped_column(ForeignKey("farms.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20))    # tank | well | borehole | rain_tank | network | canal
    name: Mapped[str] = mapped_column(String(120))
    capacity_l: Mapped[float | None] = mapped_column(Float, nullable=True)
    level_l: Mapped[float] = mapped_column(Float, default=0)
    refill_l_per_day: Mapped[float] = mapped_column(Float, default=0)
    level_recorded: Mapped[bool] = mapped_column(Boolean, default=True)
    level_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    level_by_role: Mapped[str | None] = mapped_column(String(20))
    level_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    level_recorder: Mapped["User | None"] = relationship(foreign_keys=[level_by_id])

    def record_level(self, user: User, role: str) -> None:
        self.level_recorder = user if self.level_recorded else None
        self.level_by_role = role if self.level_recorded else None
        self.level_at = now() if self.level_recorded else None

    refill_recorded: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str] = mapped_column(String(300), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Livestock(Attribution, Base):
    __tablename__ = "livestock"
    __table_args__ = (UniqueConstraint("farm_id", "species", "place"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    farm_id: Mapped[int] = mapped_column(ForeignKey("farms.id"), index=True)
    species: Mapped[str] = mapped_column(String(20))
    count: Mapped[int] = mapped_column(Integer, default=0)
    place: Mapped[str] = mapped_column(String(60), default="")                      # barn, pasture, pen: animals of one species are grouped by it
    # where the farmer drew this herd's pen on their drawing (fractions 0..1 of the drawing); null when not drawn
    box_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    box_y: Mapped[float | None] = mapped_column(Float, nullable=True)
    box_w: Mapped[float | None] = mapped_column(Float, nullable=True)
    box_h: Mapped[float | None] = mapped_column(Float, nullable=True)


class WaterListing(Attribution, Base):
    __tablename__ = "water_listings"
    id: Mapped[int] = mapped_column(primary_key=True)
    farm_id: Mapped[int] = mapped_column(ForeignKey("farms.id"), index=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(2000), default="")
    litres_available: Mapped[float] = mapped_column(Float)
    price_mode: Mapped[str] = mapped_column(String(12), default="negotiable")    # fixed | free | negotiable
    price_per_m3: Mapped[float | None] = mapped_column(Float, nullable=True)
    water_source: Mapped[str] = mapped_column(String(20), default="well")
    quality_notes: Mapped[str] = mapped_column(String(300), default="")
    fulfilment: Mapped[str] = mapped_column(String(10), default="pickup")        # pickup | delivery | both
    delivery_radius_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    available_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    available_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    governorate: Mapped[str] = mapped_column(String(40), default="")
    address_text: Mapped[str] = mapped_column(String(200), default="")
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    photos: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(10), default="active")            # active | paused | closed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    farm: Mapped["Farm"] = relationship(back_populates="listings")
    inquiries: Mapped[list["ListingInquiry"]] = relationship(back_populates="listing", cascade="all, delete-orphan")


class ListingInquiry(Attribution, Base):
    _legacy_actor = "sender"
    __tablename__ = "listing_inquiries"
    __table_args__ = (UniqueConstraint("listing_id", "sender_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("water_listings.id"), index=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    message: Mapped[str] = mapped_column(String(1000))
    status: Mapped[str] = mapped_column(String(10), default="new")               # new | read | accepted | declined
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    listing: Mapped[WaterListing] = relationship(back_populates="inquiries")
    sender: Mapped["User"] = relationship(foreign_keys=[sender_id])


class JobPost(Attribution, Base):
    __tablename__ = "job_posts"
    id: Mapped[int] = mapped_column(primary_key=True)
    farm_id: Mapped[int] = mapped_column(ForeignKey("farms.id"), index=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(2000), default="")
    kind: Mapped[str] = mapped_column(String(10))                                   # task | period | long_term
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    pay_mode: Mapped[str] = mapped_column(String(12), default="negotiable")         # fixed | negotiable
    pay_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    pay_unit: Mapped[str | None] = mapped_column(String(8), nullable=True)          # hour | day | task | week | month
    workers_needed: Mapped[int] = mapped_column(Integer, default=1)
    skills: Mapped[list] = mapped_column(JSON, default=list)
    governorate: Mapped[str] = mapped_column(String(40), default="")
    address_text: Mapped[str] = mapped_column(String(200), default="")
    status: Mapped[str] = mapped_column(String(10), default="open")                 # open | filled | closed
    radius_km: Mapped[int | None] = mapped_column(Integer, nullable=True)           # how far from the farm the job is shown, empty = everywhere
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    farm: Mapped["Farm"] = relationship(back_populates="jobs")
    applications: Mapped[list["JobApplication"]] = relationship(back_populates="job", cascade="all, delete-orphan")


class JobApplication(Attribution, Base):
    _legacy_actor = "applicant"
    __tablename__ = "job_applications"
    __table_args__ = (UniqueConstraint("job_id", "applicant_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("job_posts.id"), index=True)
    applicant_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    message: Mapped[str] = mapped_column(String(1000))
    status: Mapped[str] = mapped_column(String(10), default="pending")              # pending | accepted | declined | withdrawn
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    job: Mapped[JobPost] = relationship(back_populates="applications")
    applicant: Mapped["User"] = relationship(foreign_keys=[applicant_id])


class JobOffer(Attribution, Base):
    """A farm inviting a worker who is open to work to take one of its open jobs. The worker accepts or declines."""
    __tablename__ = "job_offers"
    __table_args__ = (UniqueConstraint("job_id", "worker_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("job_posts.id", ondelete="CASCADE"), index=True)
    worker_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    message: Mapped[str] = mapped_column(String(1000), default="")
    status: Mapped[str] = mapped_column(String(10), default="pending")              # pending | accepted | declined | withdrawn
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    job: Mapped[JobPost] = relationship()
    worker: Mapped["User"] = relationship(foreign_keys=[worker_id])


class Device(Attribution, Base):
    __tablename__ = "devices"
    id: Mapped[int] = mapped_column(primary_key=True)
    farm_id: Mapped[int] = mapped_column(ForeignKey("farms.id"), index=True)
    plot_id: Mapped[int | None] = mapped_column(ForeignKey("plots.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(80))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    token_hint: Mapped[str] = mapped_column(String(8), default="")
    base_url: Mapped[str | None] = mapped_column(String(200), nullable=True)      # set for boards the server reads and drives itself
    status_text: Mapped[str] = mapped_column(String(200), default="")
    alarm: Mapped[bool] = mapped_column(Boolean, default=False)
    mode_auto: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    last_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    bridge_online: Mapped[bool] = mapped_column(Boolean, default=False)
    bridge_stop_pending: Mapped[bool] = mapped_column(Boolean, default=False)
    firmware: Mapped[str] = mapped_column(String(40), default="")
    ip: Mapped[str] = mapped_column(String(45), default="")
    rssi: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    actuators: Mapped[list["Actuator"]] = relationship(back_populates="device", cascade="all, delete-orphan")
    commands: Mapped[list["DeviceCommand"]] = relationship(back_populates="device", cascade="all, delete-orphan")
    plot: Mapped["Plot | None"] = relationship()


class Actuator(Attribution, Base):
    __tablename__ = "actuators"
    __table_args__ = (UniqueConstraint("device_id", "key"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), index=True)
    key: Mapped[str] = mapped_column(String(30))
    label: Mapped[str] = mapped_column(String(80))
    kind: Mapped[str] = mapped_column(String(10), default="relay")      # pump | valve | light | fan | relay
    state: Mapped[str] = mapped_column(String(3), default="off")        # on | off
    max_run_s: Mapped[int] = mapped_column(Integer, default=1800)
    on_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    state_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    device: Mapped[Device] = relationship(back_populates="actuators")


class DeviceCommand(Attribution, Base):
    __tablename__ = "device_commands"
    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), index=True)
    actuator_id: Mapped[int] = mapped_column(ForeignKey("actuators.id"), index=True)
    action: Mapped[str] = mapped_column(String(3))                       # on | off | aut | man
    duration_s: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(10), default="pending")   # pending | delivered | done | failed | expired | cancelled
    result: Mapped[str] = mapped_column(String(200), default="")
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    device: Mapped[Device] = relationship(back_populates="commands")
    actuator: Mapped[Actuator] = relationship()


class Profile(Attribution, Base):
    __tablename__ = "profiles"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    headline: Mapped[str] = mapped_column(String(120), default="")
    bio: Mapped[str] = mapped_column(String(1500), default="")
    governorate: Mapped[str] = mapped_column(String(40), default="")
    visibility: Mapped[str] = mapped_column(String(8), default="public")            # public | private
    radius_km: Mapped[int] = mapped_column(Integer, default=50)
    looking_for_work: Mapped[bool] = mapped_column(Boolean, default=False)
    kinds: Mapped[list] = mapped_column(JSON, default=list)                          # task | period | long_term
    skills: Mapped[list] = mapped_column(JSON, default=list)
    languages: Mapped[list] = mapped_column(JSON, default=list)
    availability: Mapped[str] = mapped_column(String(200), default="")
    photo: Mapped[str | None] = mapped_column(String(120), nullable=True)   # file name in uploads/people, never a path
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    user: Mapped["User"] = relationship(foreign_keys=[user_id])


class Cv(Attribution, Base):
    __tablename__ = "cvs"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    source: Mapped[str] = mapped_column(String(10), default="manual")            # manual | uploaded | described
    file_name: Mapped[str | None] = mapped_column(String(80), nullable=True)      # private stored file
    file_original: Mapped[str] = mapped_column(String(120), default="")
    file_type: Mapped[str] = mapped_column(String(80), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    user: Mapped["User"] = relationship(foreign_keys=[user_id])


class Engagement(Attribution, Base):
    """A worker hired onto a farm after the farmer accepted an application."""
    __tablename__ = "engagements"
    id: Mapped[int] = mapped_column(primary_key=True)
    farm_id: Mapped[int] = mapped_column(ForeignKey("farms.id"), index=True)
    worker_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    job_id: Mapped[int | None] = mapped_column(ForeignKey("job_posts.id"), nullable=True)
    application_id: Mapped[int | None] = mapped_column(ForeignKey("job_applications.id"), nullable=True, unique=True)
    upgraded_from_id: Mapped[int | None] = mapped_column(ForeignKey("engagements.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(10), default="temporary")              # temporary | full_time
    status: Mapped[str] = mapped_column(String(12), default="active")               # active | finished | disapproved
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    note: Mapped[str] = mapped_column(String(600), default="")                       # farmer's words when finished
    reason: Mapped[str] = mapped_column(String(600), default="")                     # why disapproved
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    farm: Mapped["Farm"] = relationship()
    worker: Mapped["User"] = relationship(foreign_keys=[worker_id])


class Message(Attribution, Base):
    _legacy_actor = "sender"
    """A chat message between the farm side and the worker of one engagement."""
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    engagement_id: Mapped[int] = mapped_column(ForeignKey("engagements.id"), index=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(String(1000))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sender: Mapped["User"] = relationship(foreign_keys=[sender_id])


class Report(Attribution, Base):
    _legacy_actor = "reporter"
    """A report to Aqua about a person, reviewed by an admin."""
    __tablename__ = "reports"
    id: Mapped[int] = mapped_column(primary_key=True)
    reporter_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    target_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    engagement_id: Mapped[int | None] = mapped_column(ForeignKey("engagements.id"), nullable=True)
    reason: Mapped[str] = mapped_column(String(12))                                  # scam | no_show | unsafe | harassment | other
    details: Mapped[str] = mapped_column(String(1500))
    status: Mapped[str] = mapped_column(String(10), default="open")                 # open | reviewing | resolved | dismissed
    admin_note: Mapped[str] = mapped_column(String(1000), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reporter: Mapped["User"] = relationship(foreign_keys=[reporter_id])
    target: Mapped["User"] = relationship(foreign_keys=[target_id])


class FarmSoil(Attribution, Base):
    """The soil the farmer says they have. Without a row the soil is predicted instead."""
    __tablename__ = "farm_soils"
    id: Mapped[int] = mapped_column(primary_key=True)
    farm_id: Mapped[int] = mapped_column(ForeignKey("farms.id"), unique=True, index=True)
    soil_key: Mapped[str] = mapped_column(String(30))
    description: Mapped[str] = mapped_column(String(600), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Activity(Attribution, Base):
    _legacy_actor = "user"
    """A note the farmer or a manager writes in the farm's activity log. The log also shows what the system recorded by itself."""
    __tablename__ = "activities"
    id: Mapped[int] = mapped_column(primary_key=True)
    farm_id: Mapped[int] = mapped_column(ForeignKey("farms.id"), index=True)
    plot_id: Mapped[int | None] = mapped_column(ForeignKey("plots.id"), nullable=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    kind: Mapped[str] = mapped_column(String(16), default="note")                  # irrigation | harvest | spraying | fertilising | planting | maintenance | animals | note
    title: Mapped[str] = mapped_column(String(160))
    detail: Mapped[str] = mapped_column(String(800), default="")
    happened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    user: Mapped["User | None"] = relationship(foreign_keys=[user_id])
    plot: Mapped["Plot | None"] = relationship()


class WeeklyReport(Attribution, Base):
    """A finished weekly report with its PDF, one per farm and week."""
    __tablename__ = "weekly_reports"
    __table_args__ = (UniqueConstraint("farm_id", "week_start"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    farm_id: Mapped[int] = mapped_column(ForeignKey("farms.id"), index=True)
    week_start: Mapped[date] = mapped_column(Date)                                  # the Monday
    file_name: Mapped[str] = mapped_column(String(80))
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mood: Mapped[str] = mapped_column(String(6), default="ok")                      # good | ok | bad
    kind: Mapped[str] = mapped_column(String(8), default="auto")                    # auto (end of week) | manual
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class VideoJob(Attribution, Base):
    """A weekly film being made (or made) for a farm."""
    __tablename__ = "video_jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    farm_id: Mapped[int] = mapped_column(ForeignKey("farms.id"), index=True)
    week_start: Mapped[date] = mapped_column(Date)
    mood: Mapped[str] = mapped_column(String(6), default="ok")
    status: Mapped[str] = mapped_column(String(10), default="queued")              # queued | rendering | done | failed
    error: Mapped[str] = mapped_column(String(400), default="")
    file_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
