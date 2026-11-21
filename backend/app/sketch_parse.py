"""Reads a farmer's drawing or description into crops, animals and where each field sits.

The model only reports what it can see or what the farmer wrote. Everything it says is checked against Aqua's own
crop and animal ids here, so nothing outside those ids can reach the farm. Failing to read is an honest result
(ok=false with a reason), never a guess.
"""
import re
import unicodedata
from typing import Any

from . import ai
from .crops import CROPS

SPECIES = ("dairy_cow", "beef_cattle", "sheep", "goat", "horse", "donkey", "camel", "pig", "chicken", "turkey", "rabbit")
MAX_PLOTS = 30
MIN_SIDE = 0.02

# What farmers write (English, French, Arabic, Tunisian spellings) mapped to the ids Aqua knows.
CROP_WORDS: dict[str, tuple[str, ...]] = {
    "tomatoes": ("tomato", "tomatoes", "tomate", "tomates", "طماطم", "طماطة", "بندورة"),
    "peppers": ("pepper", "peppers", "poivron", "poivrons", "piment", "فلفل"),
    "potatoes": ("potato", "potatoes", "pomme de terre", "pommes de terre", "patate", "patates", "بطاطا", "بطاطس"),
    "olives": ("olive", "olives", "olivier", "oliviers", "olive tree", "olive trees", "زيتون", "زيتونة"),
    "wheat": ("wheat", "ble", "blé", "قمح", "قمح صلب"),
    "barley": ("barley", "orge", "شعير"),
    "citrus": ("citrus", "orange", "oranges", "lemon", "lemons", "citron", "citrons", "agrumes", "برتقال", "ليمون", "حامض"),
    "dates": ("date", "dates", "date palm", "palm", "palms", "dattes", "palmier", "palmiers", "تمر", "نخيل", "دقلة"),
    "grapes": ("grape", "grapes", "vine", "vines", "raisin", "raisins", "vigne", "عنب", "دالية"),
    "almonds": ("almond", "almonds", "amande", "amandes", "amandier", "لوز"),
    "onions": ("onion", "onions", "oignon", "oignons", "بصل", "بصلة"),
}
ANIMAL_WORDS: dict[str, tuple[str, ...]] = {
    "dairy_cow": ("cow", "cows", "vache", "vaches", "dairy cow", "dairy cows", "cattle", "بقرة", "بقر", "أبقار"),
    "beef_cattle": ("beef cattle", "bull", "bulls", "ox", "oxen", "taureau", "taureaux", "boeuf", "bœuf", "عجل", "عجول"),
    "sheep": ("sheep", "mouton", "moutons", "brebis", "agneau", "agneaux", "خروف", "غنم", "نعجة", "أغنام"),
    "goat": ("goat", "goats", "chevre", "chèvre", "chevres", "chèvres", "ماعز", "معزة"),
    "horse": ("horse", "horses", "cheval", "chevaux", "حصان", "خيل"),
    "donkey": ("donkey", "donkeys", "ane", "âne", "anes", "ânes", "حمار", "حمير"),
    "camel": ("camel", "camels", "chameau", "chameaux", "جمل", "إبل", "ابل"),
    "pig": ("pig", "pigs", "porc", "porcs", "cochon", "cochons", "خنزير"),
    "chicken": ("chicken", "chickens", "hen", "hens", "poule", "poules", "poulet", "poulets", "دجاج", "دجاجة", "فروج"),
    "turkey": ("turkey", "turkeys", "dinde", "dindes", "ديك رومي", "ديوك رومية"),
    "rabbit": ("rabbit", "rabbits", "lapin", "lapins", "أرنب", "ارانب", "أرانب"),
}


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", str(text)).casefold()
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"[^\w\s]", " ", text).strip()


def _table(words: dict[str, tuple[str, ...]]) -> dict[str, str]:
    out = {_norm(word): key for key, group in words.items() for word in group}
    out.update({key: key for key in words})
    return out


_CROP_LOOKUP = _table(CROP_WORDS)
_ANIMAL_LOOKUP = _table(ANIMAL_WORDS)


def _lookup(table: dict[str, str], text: str) -> str | None:
    """An id from a word or short phrase: the whole phrase first, then any word in it ("3 chicken", "olive trees")."""
    phrase = " ".join(_norm(text).split())
    if not phrase:
        return None
    if phrase in table:
        return table[phrase]
    found = {table[w] for w in phrase.split() if w in table}
    found |= {table[k] for k in table if " " in k and k in phrase}
    return found.pop() if len(found) == 1 else None


def crop_from_text(text: str) -> str | None:
    return _lookup(_CROP_LOOKUP, text)


def species_from_text(text: str) -> str | None:
    return _lookup(_ANIMAL_LOOKUP, text)


SYSTEM = (
    "You read a Tunisian farmer's hand drawing or short description of their farm so a dashboard can be set up. "
    "Report only what is on the drawing or in the words: never guess, never add things that are not there. "
    "Each outlined box or area on a drawing is one entry. A box that holds a crop name (in any language) is a plot "
    "with that label. A box that holds an animal and perhaps a number (for example '3 chicken' or '4 cows') is NOT a plot: "
    "put it in animals with the species and the count written; if no number is written use 1 only when a single animal is drawn, "
    "otherwise leave that animal out. A box with no writing is still a plot: give it an empty label and an empty crop. "
    "For a drawing, give each plot's box, and each animal box's box, as fractions of the whole picture: x and y are the top-left corner, w and h the size, all between 0 and 1. "
    "For a description there is no picture: leave box out (use x, y, w, h all 0). "
    "Use the crop id only when the label clearly names that crop, otherwise an empty string. "
    "Put anything unclear in notes, one short sentence each. If nothing can be read, return empty lists and say why in notes."
)

TOOL = {
    "name": "read_farm_sketch",
    "input_schema": {
        "type": "object",
        "properties": {
            "plots": {"type": "array", "maxItems": MAX_PLOTS, "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string", "description": "The text written in or by the box, as written; empty if none"},
                    "crop": {"type": "string", "enum": ["", *CROPS], "description": "Crop id, empty if the label does not clearly name one"},
                    "box": {"type": "object", "properties": {k: {"type": "number"} for k in "xywh"}, "required": list("xywh")},
                },
                "required": ["label", "crop", "box"],
            }},
            "animals": {"type": "array", "maxItems": 11, "items": {
                "type": "object",
                "properties": {"species": {"type": "string", "enum": list(SPECIES)}, "count": {"type": "integer"},
                               "box": {"type": "object", "description": "Where the animal's box sits on a drawing; omit for a description",
                                       "properties": {k: {"type": "number"} for k in "xywh"}, "required": list("xywh")}},
                "required": ["species", "count"],
            }},
            "notes": {"type": "array", "maxItems": 6, "items": {"type": "string"}},
        },
        "required": ["plots", "animals", "notes"],
    },
}


def _fail(source: str, reason: str) -> dict:
    return {"source": source, "ok": False, "reason": reason, "plots": [], "animals": [], "notes": []}


def _num(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value) if value == value and abs(value) != float("inf") else None


def _box(raw: Any) -> dict[str, float] | None:
    if not isinstance(raw, dict):
        return None
    x, y, w, h = (_num(raw.get(k)) for k in "xywh")
    if None in (x, y, w, h):
        return None
    x, y = min(max(x, 0.0), 1.0), min(max(y, 0.0), 1.0)
    w, h = min(w, 1.0 - x), min(h, 1.0 - y)
    if w < MIN_SIDE or h < MIN_SIDE:
        return None
    return {"x": round(x, 4), "y": round(y, 4), "w": round(w, 4), "h": round(h, 4)}


def clean(source: str, out: Any) -> dict:
    """Validate the model's answer. Only known ids survive; anything odd is dropped, never repaired by guessing."""
    if not isinstance(out, dict):
        return _fail(source, "Aqua could not read that. You can type your farm in by hand.")
    notes = [str(n).strip()[:200] for n in (out.get("notes") if isinstance(out.get("notes"), list) else []) if str(n).strip()][:6]

    plots: list[dict] = []
    dropped = 0
    for raw in (out.get("plots") if isinstance(out.get("plots"), list) else [])[:MAX_PLOTS]:
        if not isinstance(raw, dict):
            continue
        label = " ".join(str(raw.get("label") or "").split())[:120]
        by_word = crop_from_text(label) if label else None
        stated = raw.get("crop") if raw.get("crop") in CROPS else None
        crop = by_word or (stated if label else None)
        box = _box(raw.get("box"))
        if source == "drawing" and box is None:
            dropped += 1
            continue
        plots.append({"label": label, "crop": crop, "crop_confidence": "high" if by_word else "low",
                      "share": None, "box": box if source == "drawing" else None})
    if dropped:
        notes.append(f"{dropped} outlined area{'s' if dropped > 1 else ''} could not be placed and was left out.")
    if source == "drawing":
        areas = [p["box"]["w"] * p["box"]["h"] for p in plots]
        total = sum(areas)
        for p, a in zip(plots, areas):
            p["share"] = round(a / total, 4) if total > 0 else None

    animals: dict[str, int] = {}
    animal_boxes: dict[str, dict[str, float]] = {}
    for raw in (out.get("animals") if isinstance(out.get("animals"), list) else [])[:11]:
        if not isinstance(raw, dict):
            continue
        species = raw.get("species") if raw.get("species") in SPECIES else species_from_text(str(raw.get("species") or ""))
        count = _num(raw.get("count"))
        if species and count is not None and count == int(count) and 1 <= count <= 1_000_000:
            animals[species] = animals.get(species, 0) + int(count)
            box = _box(raw.get("box")) if source == "drawing" else None
            if box and species not in animal_boxes:  # one box per species: the first one drawn
                animal_boxes[species] = box

    if not plots and not animals:
        what = "drawing" if source == "drawing" else "description"
        return {**_fail(source, f"Aqua could not read any crops or animals in that {what}. You can type your farm in by hand."), "notes": notes}
    return {"source": source, "ok": True, "reason": "", "plots": plots,
            "animals": [{"species": s, "count": n, "box": animal_boxes.get(s)} for s, n in animals.items()], "notes": notes}


def parse_sketch(*, image_b64: str | None, media_type: str | None, description: str | None, area_m2: float | None) -> dict:
    source = "drawing" if image_b64 else "description"
    if not ai.configured():
        return _fail(source, "Aqua cannot read drawings right now. Please type your farm in by hand.")
    content: list[dict] = []
    if image_b64:
        content.append({"type": "image", "source": {"type": "base64", "media_type": media_type, "data": image_b64}})
        text = "Read this hand drawing of the farm."
        if (description or "").strip():
            text += f"\nThe farmer also wrote: {description.strip()}"
    else:
        text = f"The farmer describes the farm: {(description or '').strip()}"
    if area_m2:
        text += f"\nThe whole farm is about {area_m2:.0f} square metres."
    content.append({"type": "text", "text": text})
    try:
        out = ai.call_tool(SYSTEM, content, TOOL)
    except ai.AiUnavailable:
        return _fail(source, "Aqua could not read that just now. Please try again, or type your farm in by hand.")
    return clean(source, out)
