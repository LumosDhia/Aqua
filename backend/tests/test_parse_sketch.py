import base64

from fastapi.testclient import TestClient

from app import ai, sketch_parse
from app.db import SessionLocal
from app.main import app
from app import models

c = TestClient(app)
PNG = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 32).decode()


def login(email: str, account_type: str = "farmer") -> dict[str, str]:
    assert c.post("/api/auth/register", json={"email": email, "password": "password1", "name": "T"}).status_code == 200
    with SessionLocal() as db:
        db.query(models.User).filter_by(email=email).one().account_type = account_type
        db.commit()
    tok = c.post("/api/auth/login", json={"email": email, "password": "password1"}).json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


def stub(monkeypatch, answer):
    monkeypatch.setattr(ai, "configured", lambda: True)
    calls = []

    def fake(system, content, tool, max_tokens=2000):
        calls.append(content)
        if isinstance(answer, Exception):
            raise answer
        return answer

    monkeypatch.setattr(ai, "call_tool", fake)
    return calls


SKETCH = {
    "plots": [
        {"label": "Tomato", "crop": "tomatoes", "box": {"x": 0.2, "y": 0.2, "w": 0.3, "h": 0.2}},
        {"label": "olive", "crop": "olives", "box": {"x": 0.55, "y": 0.2, "w": 0.3, "h": 0.2}},
        {"label": "", "crop": "", "box": {"x": 0.3, "y": 0.45, "w": 0.55, "h": 0.2}},
        {"label": "onion", "crop": "onions", "box": {"x": 0.3, "y": 0.7, "w": 0.55, "h": 0.2}},
    ],
    "animals": [{"species": "chicken", "count": 3, "box": {"x": 0.18, "y": 0.04, "w": 0.3, "h": 0.14}},
                {"species": "dairy_cow", "count": 4, "box": {"x": 0.53, "y": 0.03, "w": 0.28, "h": 0.13}}],
    "notes": [],
}


def test_drawing_maps_crops_animals_and_unlabelled(monkeypatch):
    h = login("ps1@t.io")
    calls = stub(monkeypatch, SKETCH)
    r = c.post("/api/onboarding/parse-sketch", headers=h, json={"image": "data:image/png;base64," + PNG, "area_m2": 10000})
    assert r.status_code == 200
    out = r.json()
    assert out["ok"] and out["source"] == "drawing"
    assert [p["crop"] for p in out["plots"]] == ["tomatoes", "olives", None, "onions"]
    assert out["plots"][2]["label"] == "" and out["plots"][2]["crop_confidence"] == "low"
    assert out["plots"][0]["crop_confidence"] == "high"
    assert abs(sum(p["share"] for p in out["plots"]) - 1) < 0.01
    assert {(a["species"], a["count"]) for a in out["animals"]} == {("chicken", 3), ("dairy_cow", 4)}
    boxes = {a["species"]: a["box"] for a in out["animals"]}
    assert boxes["chicken"] == {"x": 0.18, "y": 0.04, "w": 0.3, "h": 0.14} and boxes["dairy_cow"]["x"] == 0.53
    assert calls[0][0]["type"] == "image" and calls[0][0]["source"]["media_type"] == "image/png"


def test_description_synonyms(monkeypatch):
    h = login("ps2@t.io")
    stub(monkeypatch, {"plots": [{"label": "طماطم", "crop": "", "box": {"x": 0, "y": 0, "w": 0, "h": 0}},
                                 {"label": "زيتون", "crop": "", "box": {"x": 0, "y": 0, "w": 0, "h": 0}},
                                 {"label": "بصل", "crop": "", "box": {"x": 0, "y": 0, "w": 0, "h": 0}}],
                       "animals": [{"species": "poules", "count": 3}, {"species": "vaches", "count": 4}], "notes": []})
    out = c.post("/api/onboarding/parse-sketch", headers=h, json={"description": "3 poules, 4 vaches, tomate"}).json()
    assert out["source"] == "description" and out["ok"]
    assert [p["crop"] for p in out["plots"]] == ["tomatoes", "olives", "onions"]
    assert all(p["box"] is None and p["share"] is None for p in out["plots"])
    assert {(a["species"], a["count"]) for a in out["animals"]} == {("chicken", 3), ("dairy_cow", 4)}


def test_unreadable_and_unconfigured(monkeypatch):
    h = login("ps3@t.io")
    stub(monkeypatch, {"plots": [], "animals": [], "notes": ["blurry"]})
    out = c.post("/api/onboarding/parse-sketch", headers=h, json={"image": PNG}).json()
    assert out["ok"] is False and out["plots"] == [] and out["animals"] == [] and out["reason"]
    stub(monkeypatch, ai.AiUnavailable("down"))
    out = c.post("/api/onboarding/parse-sketch", headers=h, json={"description": "tomatoes"}).json()
    assert out["ok"] is False and out["plots"] == []
    stub(monkeypatch, "garbage")
    assert c.post("/api/onboarding/parse-sketch", headers=h, json={"description": "x"}).json()["ok"] is False
    monkeypatch.setattr(ai, "configured", lambda: False)
    out = c.post("/api/onboarding/parse-sketch", headers=h, json={"description": "tomatoes"}).json()
    assert out["ok"] is False and out["plots"] == []


def test_nothing_unknown_passes(monkeypatch):
    h = login("ps4@t.io")
    stub(monkeypatch, {"plots": [{"label": "Bananas", "crop": "bananas", "box": {"x": 0.1, "y": 0.1, "w": 0.3, "h": 0.3}},
                                 {"label": "x", "crop": "tomatoes", "box": {"x": 0.1, "y": 0.5, "w": 0, "h": 0.3}},
                                 {"label": "Wheat", "crop": "wheat", "box": {"x": 0.6, "y": 0.5, "w": 9, "h": 0.3}}],
                       "animals": [{"species": "dragon", "count": 2}, {"species": "goat", "count": -1}, {"species": "goat", "count": 2.5},
                                   {"species": "sheep", "count": 5}], "notes": []})
    out = c.post("/api/onboarding/parse-sketch", headers=h, json={"image": PNG}).json()
    assert [p["crop"] for p in out["plots"]] == [None, "wheat"]  # bananas unknown, zero-width box dropped, box clamped
    assert out["plots"][1]["box"]["x"] + out["plots"][1]["box"]["w"] <= 1
    assert out["animals"] == [{"species": "sheep", "count": 5, "box": None}]
    assert all(p["crop"] in (None, *sketch_parse.CROPS) for p in out["plots"])


def test_guards():
    h = login("ps5@t.io")
    assert c.post("/api/onboarding/parse-sketch", headers=h, json={}).status_code == 422
    assert c.post("/api/onboarding/parse-sketch", headers=h, json={"image": "bm90IGFuIGltYWdl"}).status_code == 422
    assert c.post("/api/onboarding/parse-sketch", json={"description": "x"}).status_code == 401
    w = login("ps6@t.io", "worker")
    assert c.post("/api/onboarding/parse-sketch", headers=w, json={"description": "x"}).status_code == 403


def test_plot_geometry_stored_and_returned():
    h = login("ps7@t.io")
    made = c.post("/api/onboarding/farmer", headers=h, json={
        "farm": {"name": "Drawn", "governorate": "Tunis"},
        "plots": [{"crop": "tomatoes", "area_m2": 500, "box": {"x": 0.1, "y": 0.1, "w": 0.3, "h": 0.2}},
                  {"crop": "onions", "area_m2": 300}]})
    assert made.status_code == 200, made.text
    plots = c.get(f"/api/farms/{made.json()['farm_id']}/overview", headers=h).json()["plots"]
    assert {p["crop"]: p["box"] for p in plots} == {"tomatoes": {"x": 0.1, "y": 0.1, "w": 0.3, "h": 0.2}, "onions": None}
    bad = c.post("/api/onboarding/farmer", headers=h, json={"farm": {"name": "Bad", "governorate": "Tunis"},
          "plots": [{"crop": "tomatoes", "area_m2": 5, "box": {"x": 2, "y": 0, "w": 1, "h": 1}}]})
    assert bad.status_code == 422


def test_herd_box_stored_and_returned():
    h = login("ps8@t.io")
    box = {"x": 0.1, "y": 0.05, "w": 0.3, "h": 0.15}
    made = c.post("/api/onboarding/farmer", headers=h, json={
        "farm": {"name": "Pens", "governorate": "Tunis"},
        "livestock": [{"species": "chicken", "count": 3, "box": box}, {"species": "dairy_cow", "count": 4}]})
    assert made.status_code == 200, made.text
    groups = c.get(f"/api/farms/{made.json()['farm_id']}/animals", headers=h).json()["groups"]
    assert {g["species"]: g["places"][0]["box"] for g in groups} == {"chicken": box, "dairy_cow": None}
