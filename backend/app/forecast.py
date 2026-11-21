import time
from datetime import datetime, timezone

import httpx

from .config import settings

CACHE_SECONDS = 15 * 60
MAX_STALE_SECONDS = 6 * 60 * 60
_cache: dict[tuple[float, float, int], tuple[float, dict]] = {}

CURRENT = "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m"
HOURLY = "temperature_2m,precipitation_probability,precipitation,wind_speed_10m,weather_code"
DAILY = ("weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,"
         "wind_speed_10m_max,wind_gusts_10m_max,et0_fao_evapotranspiration,uv_index_max,sunrise,sunset")


def condition(code: int | None) -> tuple[str, str]:
    """WMO weather code to (label, icon key)."""
    if code is None:
        return "Unknown", "cloudy"
    if code == 0:
        return "Clear sky", "clear"
    if code in (1, 2):
        return "Partly cloudy", "partly_cloudy"
    if code == 3:
        return "Overcast", "cloudy"
    if code in (45, 48):
        return "Fog", "fog"
    if code in (51, 53, 55, 56, 57):
        return "Drizzle", "drizzle"
    if code in (61, 63, 65, 66, 67, 80, 81, 82):
        return ("Heavy rain" if code in (65, 67, 82) else "Rain"), "rain"
    if code in (71, 73, 75, 77, 85, 86):
        return "Snow", "snow"
    if code in (95, 96, 99):
        return "Thunderstorm", "thunder"
    return "Unknown", "cloudy"


def alerts_for(days: list[dict]) -> list[dict]:
    out: list[dict] = []
    for d in days:
        day = d["date"]
        if d["temp_max"] is not None and d["temp_max"] >= 40:
            out.append({"level": "warning", "kind": "heat", "date": day,
                        "title": "Extreme heat", "text": f"Up to {d['temp_max']:.0f} C. Water early morning or late evening and give animals shade and extra water."})
        elif d["temp_max"] is not None and d["temp_max"] >= 35:
            out.append({"level": "watch", "kind": "heat", "date": day,
                        "title": "Hot day", "text": f"Up to {d['temp_max']:.0f} C. Crops and animals will need more water."})
        if d["temp_min"] is not None and d["temp_min"] <= 2:
            out.append({"level": "warning", "kind": "frost", "date": day,
                        "title": "Frost risk", "text": f"Down to {d['temp_min']:.0f} C. Protect young plants and drain exposed pipes."})
        if d["wind_gust_max"] is not None and d["wind_gust_max"] >= 60:
            out.append({"level": "warning", "kind": "wind", "date": day,
                        "title": "Strong wind", "text": f"Gusts up to {d['wind_gust_max']:.0f} km/h. Do not spray or use sprinklers."})
        if d["rain_mm"] is None:
            continue
        if d["rain_mm"] >= 20:
            out.append({"level": "warning", "kind": "rain", "date": day,
                        "title": "Heavy rain", "text": f"About {d['rain_mm']:.0f} mm expected. Hold irrigation and check drainage."})
        elif (d["rain_probability"] or 0) >= 70 and d["rain_mm"] >= 3:
            out.append({"level": "info", "kind": "rain", "date": day,
                        "title": "Rain likely", "text": f"{d['rain_probability']:.0f}% chance, about {d['rain_mm']:.0f} mm. You can hold irrigation."})
    return out


def _normalize(raw: dict) -> dict:
    c = raw["current"]
    label, icon = condition(c.get("weather_code"))
    current = {"temperature": c["temperature_2m"], "feels_like": c["apparent_temperature"],
               "humidity": c["relative_humidity_2m"], "wind_kmh": c["wind_speed_10m"],
               "gust_kmh": c["wind_gusts_10m"], "rain_mm": c["precipitation"], "condition": label, "icon": icon,
               "time": c["time"]}
    h = raw["hourly"]
    hourly = []
    for i, t in enumerate(h["time"][:48]):
        lab, ic = condition(h["weather_code"][i])
        hourly.append({"time": t, "temperature": h["temperature_2m"][i], "rain_probability": h["precipitation_probability"][i],
                       "rain_mm": h["precipitation"][i], "wind_kmh": h["wind_speed_10m"][i], "condition": lab, "icon": ic})
    d = raw["daily"]
    daily = []
    for i, day in enumerate(d["time"]):
        lab, ic = condition(d["weather_code"][i])
        daily.append({"date": day, "condition": lab, "icon": ic, "temp_max": d["temperature_2m_max"][i],
                      "temp_min": d["temperature_2m_min"][i], "rain_mm": d["precipitation_sum"][i],
                      "rain_probability": d["precipitation_probability_max"][i], "wind_max_kmh": d["wind_speed_10m_max"][i],
                      "wind_gust_max": d["wind_gusts_10m_max"][i], "et0_mm": d["et0_fao_evapotranspiration"][i],
                      "uv_index": d["uv_index_max"][i], "sunrise": d["sunrise"][i], "sunset": d["sunset"][i]})
    return {"current": current, "hourly": hourly, "daily": daily, "alerts": alerts_for(daily),
            "source": "Open-Meteo", "timezone": raw.get("timezone")}


def get_forecast(lat: float | None, lon: float | None, days: int = 7) -> dict | None:
    if lat is None or lon is None:
        return None
    key = (round(lat, 2), round(lon, 2), days)
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_SECONDS:
        return hit[1]
    try:
        r = httpx.get(settings.weather_url, timeout=10, params={
            "latitude": lat, "longitude": lon, "timezone": "auto", "forecast_days": days, "wind_speed_unit": "kmh",
            "current": CURRENT, "hourly": HOURLY, "daily": DAILY})
        r.raise_for_status()
        data = _normalize(r.json())
    except (httpx.HTTPError, KeyError, ValueError, IndexError):
        return {**hit[1], "stale": True} if hit and time.time() - hit[0] <= MAX_STALE_SECONDS else None
    data.update(fetched_at=datetime.now(timezone.utc).isoformat(), stale=False)
    _cache[key] = (time.time(), data)
    return data
