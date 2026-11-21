"""Water need planning: FAO-56 crop water need, soil adjustment, livestock drinking water, supply balance.

All volumes are litres. 1 mm of water over 1 m2 is 1 litre. These are planning estimates, not measurements.
"""
from datetime import date, timedelta

from .crops import CROPS

IRRIGATION_EFFICIENCY = {"drip": 0.90, "sprinkler": 0.75, "flood": 0.60}
SOIL_EFFICIENCY_ADJUST = {"sand": -0.05, "sandy_loam": -0.03, "loam": 0.0, "clay_loam": -0.02, "clay": -0.04}
SOIL_AWC_MM_PER_M = {"sand": 60, "sandy_loam": 90, "loam": 140, "clay_loam": 160, "clay": 180}
SOIL_LABELS = {"sand": "Sand", "sandy_loam": "Sandy loam", "loam": "Loam", "clay_loam": "Clay loam", "clay": "Clay"}
MAD = 0.5
MAX_INTERVAL_DAYS = {"drip": 3, "sprinkler": 7, "flood": 30}

# Litres per animal per day (typical planning values from extension tables).
LIVESTOCK = {
    "dairy_cow": ("Dairy cows", 100), "beef_cattle": ("Beef cattle", 50), "sheep": ("Sheep", 8), "goat": ("Goats", 6),
    "horse": ("Horses", 40), "donkey": ("Donkeys", 25), "camel": ("Camels", 30), "pig": ("Pigs", 12),
    "chicken": ("Chickens", 0.25), "turkey": ("Turkeys", 0.5), "rabbit": ("Rabbits", 0.5),
}

# Typical Tunisian coastal climate, mm per day by month (index 0 = January). Used beyond the forecast.
TYPICAL_ET0 = [1.3, 1.9, 2.9, 4.0, 5.2, 6.4, 7.2, 6.6, 5.0, 3.3, 1.9, 1.3]
TYPICAL_RAIN = [2.0, 1.7, 1.5, 1.3, 0.7, 0.3, 0.05, 0.3, 1.2, 2.0, 1.8, 2.2]
TYPICAL_HOT_MONTHS = {6, 7, 8, 9}

EFFECTIVE_RAIN_SHARE = 0.8
MIN_EFFECTIVE_RAIN_MM = 2.0


def efficiency(irrigation: str, soil: str) -> float:
    base = IRRIGATION_EFFICIENCY.get(irrigation, 0.75)
    return max(0.4, base + SOIL_EFFICIENCY_ADJUST.get(soil, 0.0))


def crop_litres(crop: str, area_m2: float, irrigation: str, soil: str, et0_mm: float, rain_mm: float) -> float:
    kc = CROPS.get(crop, CROPS["tomatoes"])["kc_mid"]
    etc = kc * et0_mm
    effective_rain = rain_mm * EFFECTIVE_RAIN_SHARE if rain_mm >= MIN_EFFECTIVE_RAIN_MM else 0.0
    net_mm = max(0.0, etc - effective_rain)
    return net_mm / efficiency(irrigation, soil) * area_m2


def animal_litres(species: str, count: int, hot: bool) -> float:
    per_head = LIVESTOCK.get(species, ("", 10))[1]
    return per_head * count * (1.25 if hot else 1.0)


def irrigation_plan(crop: str, soil: str, irrigation: str, area_m2: float, et0_mm: float) -> dict:
    """How often to irrigate and how much each time: what the soil can hold, capped by what the irrigation type allows."""
    c = CROPS.get(crop, CROPS["tomatoes"])
    etc = c["kc_mid"] * max(et0_mm, 0.1)
    usable_mm = SOIL_AWC_MM_PER_M.get(soil, 140) * c["root_m"] * MAD
    interval = max(1, min(MAX_INTERVAL_DAYS.get(irrigation, 7), int(usable_mm // etc)))
    per_irrigation = etc * interval / efficiency(irrigation, soil) * area_m2
    return {"interval_days": interval, "per_irrigation_l": round(per_irrigation, 0)}


def _day_inputs(day: date, forecast_by_date: dict[str, dict]) -> tuple[float, float, bool, bool]:
    f = forecast_by_date.get(day.isoformat())
    if f and all(f.get(field) is not None for field in ("et0_mm", "rain_mm", "temp_max")):
        return f["et0_mm"], f["rain_mm"], f["temp_max"] >= 33, True
    m = day.month - 1
    return TYPICAL_ET0[m], TYPICAL_RAIN[m], day.month in TYPICAL_HOT_MONTHS, False


def compute_balance(plots: list[dict], herds: list[dict], stored_l: float | None, refill_per_day: float | None, source_count: int,
                    forecast_daily: list[dict] | None, today: date) -> dict:
    by_date = {d["date"]: d for d in (forecast_daily or [])}
    horizons = {"today": 1, "week": 7, "month": 30, "year": 365}
    plot_totals = {p["id"]: {h: 0.0 for h in horizons} for p in plots}
    herd_totals = {h["id"]: {k: 0.0 for k in horizons} for h in herds}
    crops_by_day: list[float] = []
    animals_by_day: list[float] = []
    daily_detail: list[dict] = []

    for i in range(365):
        day = today + timedelta(days=i)
        et0, rain, hot, from_forecast = _day_inputs(day, by_date)
        crops = 0.0
        for p in plots:
            v = crop_litres(p["crop"], p["area_m2"], p["irrigation"], p["soil_type"], et0, rain)
            crops += v
            for h, n in horizons.items():
                if i < n:
                    plot_totals[p["id"]][h] += v
        animals = 0.0
        for a in herds:
            v = animal_litres(a["species"], a["count"], hot)
            animals += v
            for h, n in horizons.items():
                if i < n:
                    herd_totals[a["id"]][h] += v
        crops_by_day.append(crops)
        animals_by_day.append(animals)
        if i < 7:
            daily_detail.append({"date": day.isoformat(), "crops_l": round(crops), "animals_l": round(animals),
                                 "total_l": round(crops + animals), "et0_mm": round(et0, 2) if from_forecast else None,
                                 "rain_mm": round(rain, 1) if from_forecast else None,
                                 "from_forecast": from_forecast, "planning_weather": "forecast" if from_forecast else "typical_climate"})

    out_h = {}
    supply_known = source_count > 0 and (stored_l is not None or refill_per_day is not None)
    stored = stored_l or 0
    refill = refill_per_day or 0
    for h, n in horizons.items():
        c, a = sum(crops_by_day[:n]), sum(animals_by_day[:n])
        supply = stored + refill * n
        out_h[h] = {"days": n, "crops_l": round(c), "animals_l": round(a), "total_l": round(c + a),
                    "supply_l": round(supply), "balance_l": round(supply - c - a), "supply_estimate_available": supply_known}

    stock, days_left = stored, None
    if supply_known:
        for i in range(365):
            stock += refill - crops_by_day[i] - animals_by_day[i]
            if stock < 0:
                days_left = i
                break

    week = out_h["week"]
    balance = week["balance_l"]
    shortfall_week = max(0, -balance) if supply_known else 0
    surplus_week = max(0, round(balance - 0.25 * week["total_l"])) if supply_known else 0
    if week["total_l"] == 0:
        status, message = "ok", "Add plots or animals to see how much water you need."
    elif source_count == 0:
        status, message = "no_sources", "List your tanks and wells to see how long your water lasts."
    elif not supply_known:
        status, message = "no_sources", "Record a water level or daily refill to estimate how long the supply will last."
    elif days_left is not None and days_left < 7:
        status = "short"
        if shortfall_week > 0:
            message = (f"You will run short in about {max(days_left, 1)} day{'s' if days_left > 1 else ''}. "
                       f"You need about {round(shortfall_week / 1000, 1)} m3 more this week.")
        else:
            peak = daily_detail[days_left]
            message = (f"Your water covers the week in total, but on {peak['date']} the farm needs about "
                       f"{round(peak['total_l'] / 1000, 1)} m3 in one day, more than your tanks and refills can supply. "
                       "Keep the tanks full before then or add a source.")
    elif days_left is not None and days_left <= 30:
        status = "tight"
        message = f"Your water lasts about {days_left} days at this rate. Plan a refill or a purchase before then."
    else:
        status = "ok"
        message = "Your water covers the coming weeks."
        if surplus_week > 0:
            message += f" About {round(surplus_week / 1000, 1)} m3 this week could be shared on the market."

    return {
        "horizons": out_h,
        "plots": {pid: {k: round(v) for k, v in t.items()} for pid, t in plot_totals.items()},
        "animals": {aid: {k: round(v) for k, v in t.items()} for aid, t in herd_totals.items()},
        "daily": daily_detail,
        "verdict": {"status": status, "message": message, "days_left": days_left,
                    "shortfall_l_week": shortfall_week, "surplus_l_week": surplus_week},
    }
