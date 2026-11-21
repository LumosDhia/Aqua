import hmac

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from ..db import get_db
from ..rbac import check, current_user, plot_or_404

router = APIRouter(prefix="/api", tags=["devices"])


@router.post("/readings", response_model=schemas.ReadingOut)
def ingest(body: schemas.ReadingIn, x_api_key: str = Header(default=""), db: Session = Depends(get_db)) -> models.Reading:
    """ESP32 posts here. Auth: X-API-Key header."""
    if not hmac.compare_digest(x_api_key.encode(), settings.device_api_key.encode()):
        raise HTTPException(401, "bad api key")
    if not db.get(models.Plot, body.plot_id):
        raise HTTPException(404, "plot not found")
    r = models.Reading(**body.model_dump(), source="device")
    db.add(r); db.commit(); db.refresh(r)
    return r


@router.post("/plots/{plot_id}/readings", response_model=schemas.ReadingOut)
def manual_reading(
    plot_id: int, body: schemas.ReadingValues, user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
) -> models.Reading:
    plot = plot_or_404(db, user, plot_id, "plot:decide")
    role = check(db, user, plot.farm_id, "plot:decide")
    values = body.model_dump(exclude_none=True)
    if not values:
        raise HTTPException(422, "Enter at least one reading")
    reading = models.Reading(plot_id=plot_id, source="manual", **values, **models.entered(user, role))
    db.add(reading)
    db.commit()
    db.refresh(reading)
    return reading
