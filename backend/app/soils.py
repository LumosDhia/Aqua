"""The common soils of Tunisia, which governorates they mostly belong to, and a simple prediction from place, plots and activity.

The catalog is general knowledge for orientation, not a lab result. A farmer can always pick the soil themselves.
"""
from .geo import GOVERNORATES, distance_km

# texture values match the plot soil types used by the water plan: sand, sandy_loam, loam, clay_loam, clay
SOILS: dict[str, dict] = {
    "red_mediterranean": {
        "name": "Red Mediterranean soil (terra rossa)", "texture": "clay_loam", "ph": "7.0 to 8.0", "organic_matter": "medium",
        "water_holding": "medium", "drainage": "good", "salinity_risk": "low",
        "summary": "Red, clay-rich soil on limestone. Warms early, drains well, holds a fair amount of water.",
        "crops": ["Olives", "Grapes", "Almonds", "Citrus", "Wheat"],
        "tips": ["Mulch to keep moisture in summer.", "Add compost every year: organic matter is only medium.", "Drip irrigation suits it best."]},
    "brown_calcareous": {
        "name": "Brown calcareous soil", "texture": "loam", "ph": "7.5 to 8.3", "organic_matter": "medium",
        "water_holding": "medium", "drainage": "good", "salinity_risk": "low",
        "summary": "Brown, limy loam of the hills and plains. Reliable and easy to work.",
        "crops": ["Wheat", "Barley", "Olives", "Peppers", "Potatoes"],
        "tips": ["Watch for iron shortage (yellow leaves) because of the lime.", "Split fertiliser in two or three doses."]},
    "alluvial": {
        "name": "Alluvial soil (river valleys)", "texture": "loam", "ph": "7.0 to 8.0", "organic_matter": "high",
        "water_holding": "high", "drainage": "medium", "salinity_risk": "medium",
        "summary": "Deep, fertile soil left by rivers such as the Medjerda. Holds water and nutrients well.",
        "crops": ["Tomatoes", "Potatoes", "Peppers", "Wheat", "Citrus"],
        "tips": ["Do not over-water: the soil keeps moisture for days.", "Rotate crops to keep diseases down."]},
    "vertisol": {
        "name": "Heavy black clay (tirs, vertisol)", "texture": "clay", "ph": "7.5 to 8.5", "organic_matter": "medium",
        "water_holding": "high", "drainage": "poor", "salinity_risk": "medium",
        "summary": "Dark, heavy clay that swells when wet and cracks when dry. Very rich but hard to work.",
        "crops": ["Wheat", "Barley", "Fodder", "Sugar beet"],
        "tips": ["Work it only when it is neither too wet nor too dry.", "Water less often and slowly to avoid pooling.", "Ridges or raised beds help drainage."]},
    "sandy_coastal": {
        "name": "Sandy coastal soil", "texture": "sandy_loam", "ph": "7.5 to 8.2", "organic_matter": "low",
        "water_holding": "low", "drainage": "excellent", "salinity_risk": "medium",
        "summary": "Light, sandy soil near the sea. Warms fast and drains very fast, so it needs small, frequent irrigation.",
        "crops": ["Tomatoes", "Peppers", "Melons", "Citrus", "Potatoes"],
        "tips": ["Irrigate little and often.", "Add compost and mulch to hold water.", "Check irrigation water salt, the sea water table can rise."]},
    "gypsum_steppe": {
        "name": "Calcareous and gypsum steppe soil", "texture": "sandy_loam", "ph": "7.8 to 8.5", "organic_matter": "low",
        "water_holding": "low", "drainage": "good", "salinity_risk": "medium",
        "summary": "Pale, shallow, often crusted soil of the dry centre and south. Low in organic matter.",
        "crops": ["Olives", "Almonds", "Pistachio", "Barley"],
        "tips": ["Break the surface crust before sowing.", "Plant trees in deep pits with compost.", "Use drip and mulch to save water."]},
    "saline": {
        "name": "Saline soil (chott and sebkha edges)", "texture": "clay_loam", "ph": "8.0 to 8.8", "organic_matter": "low",
        "water_holding": "medium", "drainage": "poor", "salinity_risk": "high",
        "summary": "Salt rises to the surface. Only salt-tolerant crops do well without leaching.",
        "crops": ["Date palm", "Barley", "Sorghum", "Pomegranate"],
        "tips": ["Leach salts with extra irrigation and good drainage.", "Choose salt-tolerant crops.", "Avoid light, frequent watering: it brings salt up."]},
    "saharan_sand": {
        "name": "Saharan sand and oasis soil", "texture": "sand", "ph": "7.5 to 8.5", "organic_matter": "low",
        "water_holding": "low", "drainage": "excellent", "salinity_risk": "medium",
        "summary": "Deep sand that holds almost no water. Oases make it productive with steady irrigation and manure.",
        "crops": ["Date palm", "Henna", "Vegetables under palms"],
        "tips": ["Irrigate often in small amounts.", "Mix in manure or compost every year.", "Shade and windbreaks cut water loss."]},
    "mountain_rendzina": {
        "name": "Shallow stony mountain soil", "texture": "loam", "ph": "7.5 to 8.3", "organic_matter": "medium",
        "water_holding": "low", "drainage": "excellent", "salinity_risk": "low",
        "summary": "Thin, stony soil on slopes. Good for tree crops and grazing, easily eroded.",
        "crops": ["Almonds", "Olives", "Pasture", "Aromatic plants"],
        "tips": ["Build terraces or stone lines against erosion.", "Keep the soil covered.", "Plant trees in pits and water them young."]},
}

# the main soil of each governorate (general orientation, many areas mix several soils)
GOVERNORATE_SOIL: dict[str, tuple[str, str]] = {
    "Tunis": ("alluvial", "brown_calcareous"), "Ariana": ("alluvial", "red_mediterranean"), "Ben Arous": ("sandy_coastal", "red_mediterranean"),
    "Manouba": ("alluvial", "vertisol"), "Nabeul": ("red_mediterranean", "sandy_coastal"), "Zaghouan": ("red_mediterranean", "brown_calcareous"),
    "Bizerte": ("vertisol", "alluvial"), "Beja": ("vertisol", "alluvial"), "Jendouba": ("alluvial", "vertisol"), "Kef": ("brown_calcareous", "mountain_rendzina"),
    "Siliana": ("brown_calcareous", "vertisol"), "Sousse": ("sandy_coastal", "red_mediterranean"), "Monastir": ("sandy_coastal", "red_mediterranean"),
    "Mahdia": ("sandy_coastal", "gypsum_steppe"), "Sfax": ("sandy_coastal", "gypsum_steppe"), "Kairouan": ("gypsum_steppe", "brown_calcareous"),
    "Kasserine": ("mountain_rendzina", "gypsum_steppe"), "Sidi Bouzid": ("gypsum_steppe", "saline"), "Gabes": ("saharan_sand", "saline"),
    "Medenine": ("saharan_sand", "gypsum_steppe"), "Tataouine": ("saharan_sand", "gypsum_steppe"), "Gafsa": ("gypsum_steppe", "saline"),
    "Tozeur": ("saharan_sand", "saline"), "Kebili": ("saline", "saharan_sand"),
}
TEXTURE_TO_SOIL = {"sand": "saharan_sand", "sandy_loam": "sandy_coastal", "loam": "brown_calcareous", "clay_loam": "red_mediterranean", "clay": "vertisol"}


def nearest_governorate(region: str, lat: float, lon: float) -> str:
    """The governorate named by the farm's region, else the closest centre to its coordinates."""
    for g in GOVERNORATES:
        if g.lower() == (region or "").strip().lower():
            return g
    return min(GOVERNORATES, key=lambda g: distance_km(lat, lon, *GOVERNORATES[g]))


def soil_card(key: str) -> dict:
    s = SOILS[key]
    return {"key": key, **s}


def predict(region: str, lat: float, lon: float, plot_textures: list[str], irrigations_last_14_days: int, rain_mm_7d: float | None) -> dict:
    """Best guess from where the farm is, what the plots say and how the farm has been watered. Always explains itself."""
    gov = nearest_governorate(region, lat, lon)
    main, second = GOVERNORATE_SOIL[gov]
    reasons = [f"The farm is in {gov}, where {SOILS[main]['name'].lower()} is the most common soil."]
    key, confidence = main, 0.55
    votes = [TEXTURE_TO_SOIL[t] for t in plot_textures if t in TEXTURE_TO_SOIL]
    if votes:
        textures_main = {SOILS[main]["texture"], SOILS[second]["texture"]}
        agree = [t for t in plot_textures if t in textures_main]
        if len(agree) * 2 >= len(plot_textures):
            confidence += 0.2
            reasons.append("The soil types you set on your plots match this area.")
            if SOILS[second]["texture"] in plot_textures and SOILS[main]["texture"] not in plot_textures:
                key = second
                reasons.append(f"Most plots look like {SOILS[second]['name'].lower()}, the second soil of {gov}, so that is the better match.")
        else:
            top = max(set(plot_textures), key=plot_textures.count)
            key, confidence = TEXTURE_TO_SOIL[top], 0.45
            reasons.append(f"Your plots are mostly {top.replace('_', ' ')}, which differs from the usual soil of {gov}, so the plots decide.")
    soil = SOILS[key]
    notes: list[str] = []
    if soil["salinity_risk"] == "high" or (soil["salinity_risk"] == "medium" and irrigations_last_14_days >= 8):
        notes.append("Frequent light irrigation can bring salt up. Water less often but longer, and check the water's salt level.")
    if soil["water_holding"] == "low" and rain_mm_7d is not None and rain_mm_7d >= 20:
        notes.append("Heavy rain washes nutrients out of light soil. Think about a light top-up of fertiliser afterwards.")
    if soil["drainage"] == "poor" and rain_mm_7d is not None and rain_mm_7d >= 15:
        notes.append("Heavy clay may stay waterlogged after this much rain. Skip irrigation and avoid driving on the plots.")
    if irrigations_last_14_days == 0:
        reasons.append("There was no irrigation in the last two weeks, so nothing from your watering history was used.")
    else:
        reasons.append(f"{irrigations_last_14_days} irrigations in the last two weeks were taken into account.")
    return {"key": key, "confidence": round(min(confidence, 0.9), 2), "reasons": reasons, "notes": notes, "governorate": gov}
