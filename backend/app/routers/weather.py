from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import forecast, models
from ..db import get_db
from ..rbac import check, current_user

router = APIRouter(prefix="/api", tags=["weather"])


@router.get("/farms/{farm_id}/forecast")
def farm_forecast(farm_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    check(db, user, farm_id, "farm:read")
    farm = db.get(models.Farm, farm_id)
    data = forecast.get_forecast(*farm.weather_location)
    if data is None:
        raise HTTPException(502, "The forecast is unavailable right now")
    return {"farm": {"id": farm.id, "name": farm.name, "region": farm.region, "lat": farm.lat, "lon": farm.lon,
                     "demo": farm.demo, "location_source": farm.location_source, **models.attribution(farm)}, **data}
