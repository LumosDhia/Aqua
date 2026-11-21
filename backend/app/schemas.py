from datetime import datetime

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import models


class ActorOut(BaseModel):
    name: str
    at: datetime
    role: str | None


class AttributionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    entered_by: ActorOut | None = None
    updated_by: ActorOut | None = None


class ReadingValues(BaseModel):
    soil_moisture: float | None = None
    tank_level: float | None = None
    temperature: float | None = None
    humidity: float | None = None
    rain: bool | None = None


class ReadingIn(ReadingValues):
    plot_id: int


class ReadingOut(ReadingIn, AttributionOut):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ts: datetime
    source: Literal["device", "manual", "demo"] | None = None
    device_id: int | None = None


class PlotIn(BaseModel):
    name: str
    crop: str = "tomatoes"
    area_m2: float = 1000
    irrigation: str = "drip"
    soil_type: Literal["sand", "sandy_loam", "loam", "clay_loam", "clay", ""] = "loam"


class PlotOut(PlotIn, AttributionOut):
    model_config = ConfigDict(from_attributes=True)
    id: int
    farm_id: int
    defaulted_fields: list[str] | None = None


class FarmIn(BaseModel):
    name: str
    region: str = ""
    lat: float = 36.8
    lon: float = 10.18


class FarmSummary(AttributionOut):
    id: int
    name: str
    region: str
    demo: bool
    location_source: Literal["entered", "governorate_centre", "unavailable"] | None = None


class FarmOut(FarmIn, FarmSummary):
    model_config = ConfigDict(from_attributes=True)
    id: int
    description: str = ""
    has_sketch: bool = False
    area_m2: float | None = None
    plots: list[PlotOut] = []


FarmRole = Literal["viewer", "technician", "manager", "owner"]


class RegisterIn(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=200)
    password: str = Field(min_length=8, max_length=200)
    name: str = Field(default="", max_length=120)
    account_type: Literal["farmer", "worker"] = "farmer"


class LoginIn(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    name: str
    role: str
    active: bool
    account_type: str = "farmer"
    photo: str | None = None

    @field_validator("photo", mode="before")
    @classmethod
    def _photo_url(cls, v: str | None) -> str | None:
        # The database stores the file name only; expose the public URL instead.
        # Idempotent: the endpoint dicts are re-validated against the response
        # model, so an already-built URL must pass through unchanged.
        if not v or v.startswith("/uploads/"):
            return v
        return models.people_photo_url(v)


class MeOut(UserOut):
    farm_count: int = 0
    accessible_farm_count: int = 0
    farms: list[FarmSummary] = Field(default_factory=list)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: MeOut


class RegisteredOut(UserOut):
    access_token: str


class UserPatch(BaseModel):
    role: Literal["admin", "user"] | None = None
    active: bool | None = None


class MemberIn(BaseModel):
    email: str
    role: FarmRole


class MemberOut(AttributionOut):
    user_id: int
    email: str
    name: str
    role: str
