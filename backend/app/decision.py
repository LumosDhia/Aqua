from .crops import CROPS


def decide(soil_moisture: float | None, crop: str, area_m2: float, weather: dict) -> dict:
    """Core rule: dry soil + rain coming = wait (save water)."""
    if soil_moisture is None:
        return {"action": "skip", "why": "No soil reading yet.", "litres_saved": 0}
    target = CROPS.get(crop, CROPS["tomatoes"])["min_moisture"]
    rain, wind, temp = weather.get("rain_prob"), weather.get("max_wind"), weather.get("max_temp")
    # rough estimate: 4 L/m2 for a full irrigation, replace with the FAO calculation
    full = round(area_m2 * 4, 1)

    if soil_moisture >= target:
        return {"action": "skip", "why": f"Soil {soil_moisture:.0f}% is above the {target}% target.", "litres_saved": 0}
    if rain is not None and rain >= 60:
        return {"action": "wait", "why": f"Soil is dry ({soil_moisture:.0f}% vs {target}%) but rain is likely ({rain:.0f}%).", "litres_saved": full}
    if (wind is not None and wind > 35) or (temp is not None and temp > 40):
        return {"action": "wait", "why": "Strong wind or extreme heat, irrigate early morning or evening.", "litres_saved": 0}
    if rain is None:
        return {"action": "wait", "why": "The soil is dry and rain forecast is unavailable.", "litres_saved": 0}
    if rain >= 30:
        return {"action": "light", "why": f"Soil dry, rain uncertain ({rain:.0f}%). Reduced irrigation.", "litres_saved": round(full * 0.5, 1)}
    return {"action": "irrigate", "why": f"Soil {soil_moisture:.0f}% below {target}% and rain unlikely ({rain:.0f}%).", "litres_saved": 0}
