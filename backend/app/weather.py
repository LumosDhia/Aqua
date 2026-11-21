from collections.abc import Callable

from . import forecast as forecast_service


def _aggregate(rows: list[dict], field: str, aggregate: Callable[[list[float]], float]) -> float | None:
    values = [row[field] for row in rows]
    if values and all(v is not None for v in values):
        return aggregate(values)
    return None


def forecast(lat: float | None, lon: float | None) -> dict:
    """Next 24 h summary used by the dashboard: rain probability (max), rain mm, hottest hour and strongest wind."""
    data = forecast_service.get_forecast(lat, lon)
    if not data:
        return {"rain_prob": None, "rain_mm": None, "max_temp": None, "max_wind": None,
                "current": None, "source": None, "fetched_at": None, "stale": None, "error": True}
    day = data.get("hourly", [])[:24]
    return {
        "rain_prob": _aggregate(day, "rain_probability", max),
        "rain_mm": _aggregate(day, "rain_mm", sum),
        "max_temp": _aggregate(day, "temperature", max),
        "max_wind": _aggregate(day, "wind_kmh", max),
        "current": data.get("current"),
        "source": data.get("source"),
        "fetched_at": data.get("fetched_at"),
        "stale": data.get("stale", False),
    }
