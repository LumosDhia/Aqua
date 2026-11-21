
import re

from fastapi.testclient import TestClient  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.decision import decide  # noqa: E402
from app.main import app  # noqa: E402
from app import models  # noqa: E402

c = TestClient(app)



def legacy(fake):
    """Let the older fakes keep their simple shape: show them system, prompt, files and schema, and wrap their answer like the model server does."""
    import json as jsonlib

    class Reply:
        def __init__(self, code, body): self.status_code, self._body = code, body
        def json(self): return self._body

    def post(url, headers=None, json=None, timeout=None):
        system, user = json["messages"][0]["content"], json["messages"][1]["content"]
        text, files = ("", [])
        if isinstance(user, str):
            text = user
        else:
            for part in user:
                if part["type"] == "text":
                    text += part["text"]
                else:
                    uri = (part.get("image_url") or part["file"])
                    uri = uri.get("url") or uri["file_data"]
                    files.append({"media_type": uri[5:uri.index(";")], "data": uri.split(",", 1)[1]})
        old = {"system": system, "prompt": text, "files": files, "schema": json["response_format"]["json_schema"]["schema"]}
        res = fake(url, {}, old, timeout)
        if res.status_code != 200:
            return Reply(res.status_code, {})
        return Reply(200, {"choices": [{"message": {"content": jsonlib.dumps(res.json()["data"])}}]})
    return post

def signup(email: str, role: str = "user", *, name: str = "") -> dict[str, str]:
    assert c.post("/api/auth/register", json={"email": email, "password": "password1", "name": name}).status_code == 200
    if role != "user":
        with SessionLocal() as db:
            db.query(models.User).filter_by(email=email).one().role = role
            db.commit()
    tok = c.post("/api/auth/login", json={"email": email, "password": "password1"}).json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


def test_health():
    assert c.get("/health").json() == {"ok": True}


def test_unauthenticated():
    assert c.get("/api/farms").status_code == 401
    assert c.get("/api/farms", headers={"Authorization": "Bearer junk"}).status_code == 401
    assert c.post("/api/auth/login", json={"email": "no@x.io", "password": "whatever1"}).status_code == 401


def test_rbac_matrix():
    owner, mgr, tech, view, stranger = (signup(f"{n}@t.io") for n in ["o", "m", "t", "v", "s"])
    farm = c.post("/api/farms", headers=owner, json={"name": "F"}).json()
    fid = farm["id"]
    for email, role in [("m@t.io", "manager"), ("t@t.io", "technician"), ("v@t.io", "viewer")]:
        assert c.put(f"/api/farms/{fid}/members", headers=owner, json={"email": email, "role": role}).status_code == 200
    # only owner manages members
    assert c.put(f"/api/farms/{fid}/members", headers=mgr, json={"email": "s@t.io", "role": "viewer"}).status_code == 403
    # plots: manager+ write
    assert c.post(f"/api/farms/{fid}/plots", headers=tech, json={"name": "P"}).status_code == 403
    assert c.post(f"/api/farms/{fid}/plots", headers=view, json={"name": "P"}).status_code == 403
    plot = c.post(f"/api/farms/{fid}/plots", headers=mgr, json={"name": "P"})
    assert plot.status_code == 200
    pid = plot.json()["id"]
    # read: everyone in the farm, nobody outside (404 hides existence)
    assert c.get(f"/api/plots/{pid}/readings", headers=view).status_code == 200
    assert c.get(f"/api/plots/{pid}/readings", headers=stranger).status_code == 404
    assert c.get("/api/farms", headers=stranger).json() == []
    assert len(c.get("/api/farms", headers=view).json()) == 1
    # decide: technician+
    assert c.post(f"/api/plots/{pid}/decide", headers=view).status_code == 403
    assert c.post(f"/api/plots/{pid}/decide", headers=stranger).status_code == 404
    # farm edit/delete: owner only
    assert c.patch(f"/api/farms/{fid}", headers=mgr, json={"name": "X"}).status_code == 403
    assert c.delete(f"/api/farms/{fid}", headers=mgr).status_code == 403
    assert c.patch(f"/api/farms/{fid}", headers=owner, json={"name": "X"}).status_code == 200
    # last owner cannot be removed or demoted
    me = c.get("/api/auth/me", headers=owner).json()["id"]
    assert c.delete(f"/api/farms/{fid}/members/{me}", headers=owner).status_code == 400
    assert c.put(f"/api/farms/{fid}/members", headers=owner, json={"email": "o@t.io", "role": "viewer"}).status_code == 400
    # user admin endpoints
    assert c.get("/api/users", headers=owner).status_code == 403
    admin = signup("a@t.io", "admin")
    assert c.get("/api/users", headers=admin).status_code == 200
    assert len(c.get("/api/farms", headers=admin).json()) >= 1
    assert c.post(f"/api/plots/{pid}/decide", headers=admin).status_code != 403
    # disabled user loses access
    uid = c.get("/api/auth/me", headers=view).json()["id"]
    assert c.patch(f"/api/users/{uid}", headers=admin, json={"active": False}).status_code == 200
    assert c.get("/api/farms", headers=view).status_code == 401


def test_register_cannot_pick_role_and_validates():
    r = c.post("/api/auth/register", json={"email": "x@y.io", "password": "password1", "role": "admin"})
    assert r.json()["role"] == "user"
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert c.get("/api/auth/me", headers=headers).json()["farm_count"] == 0
    assert c.post("/api/auth/register", json={"email": "x@y.io", "password": "password1"}).status_code == 409
    assert c.post("/api/auth/register", json={"email": "bad", "password": "password1"}).status_code == 422
    assert c.post("/api/auth/register", json={"email": "z@y.io", "password": "short"}).status_code == 422


def test_record_attribution_and_viewer_permissions(monkeypatch) -> None:
    from app.config import settings

    owner = signup("at-owner@t.io", name="Farm Owner")
    manager = signup("at-manager@t.io", name="Farm Manager")
    tech = signup("at-tech@t.io", name="Farm Technician")
    viewer = signup("at-view@t.io", name="Farm Viewer")
    farm = c.post("/api/farms", headers=owner, json={"name": "Attribution Farm"}).json()
    base = f"/api/farms/{farm['id']}"
    for email, role in (("at-manager@t.io", "manager"), ("at-tech@t.io", "technician"), ("at-view@t.io", "viewer")):
        member = c.put(f"{base}/members", headers=owner, json={"email": email, "role": role}).json()
        assert member["entered_by"]["name"] == "Farm Owner"
    assert c.get(base, headers=viewer).json()["entered_by"] == farm["entered_by"]
    assert c.get("/api/farms", headers=viewer).json()[0]["entered_by"]["role"] == "owner"

    worker = c.post(f"{base}/workers", headers=manager, json={"name": "Field worker"}).json()
    cases = [
        ("plots", {"name": "Plot One", "crop": "wheat", "area_m2": 100}, manager, "Farm Manager", "manager"),
        ("livestock", {"species": "goat", "count": 4}, manager, "Farm Manager", "manager"),
        ("water-sources", {"kind": "tank", "name": "Tank One"}, manager, "Farm Manager", "manager"),
        ("activity", {"title": "Walked the field"}, tech, "Farm Technician", "technician"),
        ("tasks", {"worker_id": worker["id"], "title": "Check the tank"}, tech, "Farm Technician", "technician"),
    ]
    records = {}
    for path, body, headers, name, role in cases:
        body.update(created_by_id=99999, entered_by={"name": "Forged actor", "role": "owner", "at": "2000-01-01T00:00:00Z"})
        assert c.post(f"{base}/{path}", headers=viewer, json=body).status_code == 403
        res = c.post(f"{base}/{path}", headers=headers, json=body)
        assert res.status_code == 200
        record = res.json()
        assert record["entered_by"]["name"] == name and record["entered_by"]["role"] == role
        assert record["entered_by"]["at"].endswith("Z") and record["updated_by"] is None
        records[path] = record

    assert c.get(base, headers=viewer).json()["plots"][0]["entered_by"] == records["plots"]["entered_by"]
    for path, key in (("livestock", "herds"), ("water-sources", "sources")):
        record = c.get(f"{base}/{path}", headers=viewer).json()[key][0]
        assert record["entered_by"] == records[path]["entered_by"]
    listed_task = c.get(f"{base}/tasks", headers=viewer).json()[0]
    assert listed_task["entered_by"] == records["tasks"]["entered_by"]
    assert any(row["entered_by"] == records["activity"]["entered_by"]
               for row in c.get(f"{base}/activity", headers=viewer).json()["items"])
    source = records["water-sources"]
    level_url = f"{base}/water-sources/{source['id']}/level"
    assert c.put(level_url, headers=viewer, json={"level_l": 0}).status_code == 403
    level = c.put(level_url, headers=tech, json={"level_l": 0}).json()
    assert level["entered_by"] == source["entered_by"]
    assert level["updated_by"]["name"] == "Farm Technician" and level["updated_by"]["role"] == "technician"
    assert level["level_l"] == 0 and level["level_recorded"] is True
    assert level["level_entered_by"] == level["updated_by"]
    assert c.post(f"/api/plots/{records['plots']['id']}/readings", headers=viewer,
                  json={"soil_moisture": 2}).status_code == 403


def test_legacy_sqlite_attribution_upgrade_is_idempotent(tmp_path) -> None:
    from sqlalchemy import create_engine, inspect
    from app.db import init_schema

    engine = create_engine(f"sqlite:///{tmp_path / 'legacy-aqua.db'}")
    try:
        with engine.begin() as conn:
            conn.exec_driver_sql(
                "CREATE TABLE livestock (id INTEGER PRIMARY KEY, farm_id INTEGER NOT NULL, "
                "species TEXT NOT NULL, count INTEGER NOT NULL, UNIQUE (farm_id, species))"
            )
            conn.exec_driver_sql("INSERT INTO livestock VALUES (1, 1, 'goat', 4)")
        init_schema(engine)
        init_schema(engine)
        with engine.begin() as conn:
            row = conn.exec_driver_sql(
                "SELECT count, place, created_by_id, created_at, updated_by_id FROM livestock WHERE id=1"
            ).one()
            assert tuple(row) == (4, "", None, None, None)
            conn.exec_driver_sql(
                "INSERT INTO livestock (id, farm_id, species, count, place) VALUES (2, 1, 'goat', 3, 'North pasture')"
            )
        fks = inspect(engine).get_foreign_keys("livestock")
        assert any(fk["constrained_columns"] == ["updated_by_id"] and fk["options"]["ondelete"] == "SET NULL" for fk in fks)
    finally:
        engine.dispose()


def test_missing_readings_and_attributed_manual_zero(monkeypatch) -> None:
    from app import forecast

    monkeypatch.setattr(forecast, "get_forecast", lambda lat, lon: None)
    owner = signup("at-reading@t.io", name="Reading Recorder")
    fid = c.post("/api/farms", headers=owner, json={"name": "Sensor Farm"}).json()["id"]
    pid = c.post(f"/api/farms/{fid}/plots", headers=owner, json={"name": "Sensor Plot"}).json()["id"]
    overview_url = f"/api/farms/{fid}/overview"
    readings_url = f"/api/plots/{pid}/readings"
    overview = c.get(overview_url, headers=owner).json()
    assert overview["weather"]["rain_mm"] is None and overview["weather"]["max_temp"] is None
    plot = overview["plots"][0]
    assert plot["status"] == "no_data"
    assert all(plot[key] is None for key in ("soil_moisture", "tank_level", "temperature", "last_ts", "reading_source"))
    assert c.get(readings_url, headers=owner).json() == []
    assert c.post(readings_url, headers=owner, json={}).status_code == 422

    reading = c.post(readings_url, headers=owner, json={"soil_moisture": 0, "source": "device"}).json()
    assert reading["source"] == "manual" and reading["soil_moisture"] == 0
    assert reading["entered_by"]["name"] == "Reading Recorder"
    assert c.get(readings_url, headers=owner).json()[0]["entered_by"] == reading["entered_by"]
    latest = c.get(overview_url, headers=owner).json()["plots"][0]
    assert latest["soil_moisture"] == 0 and latest["reading_source"] == "manual"
    assert latest["reading_entered_by"] == reading["entered_by"]


def test_fresh_account_has_no_demo_farm_or_public_demo_records() -> None:
    from app.security import hash_password

    with SessionLocal() as db:
        owner = models.User(name="Demo Owner", email="nesrine.hamdi@aqua.test",
                            password_hash=hash_password("demo-testing"))
        farm = models.Farm(name="Fixture for attribution", is_fixture=True)
        db.add_all([owner, farm])
        db.flush()
        farm.members.append(models.FarmMember(user_id=owner.id, role="owner"))
        job = models.JobPost(farm_id=farm.id, title="Fixture job attribution", kind="task")
        listing = models.WaterListing(farm_id=farm.id, title="Fixture listing attribution", litres_available=100)
        db.add_all([job, listing])
        db.commit()
        farm_id, job_id, listing_id = farm.id, job.id, listing.id

    fresh = signup("at-new@t.io")
    assert c.get("/api/me", headers=fresh).json()["farms"] == []
    assert c.get("/api/auth/me", headers=fresh).json()["farm_count"] == 0
    assert c.get("/api/farms", headers=fresh).json() == []
    assert c.get(f"/api/farms/{farm_id}", headers=fresh).status_code == 404
    assert c.get(f"/api/jobs/{job_id}", headers=fresh).status_code == 404
    assert c.get(f"/api/market/listings/{listing_id}", headers=fresh).status_code == 404
    assert c.get("/api/jobs?q=Fixture+job+attribution", headers=fresh).json()["items"] == []
    assert c.get("/api/market/listings?q=Fixture+listing+attribution", headers=fresh).json()["items"] == []

    login = c.post("/api/auth/login", json={"email": "nesrine.hamdi@aqua.test", "password": "demo-testing"}).json()
    selected = login["user"]["farms"]
    assert [row["id"] for row in selected] == [farm_id]
    assert selected[0]["demo"] is True and selected[0]["entered_by"] is None


def test_device_ingest():
    h = signup("dev@t.io")
    fid = c.post("/api/farms", headers=h, json={"name": "D"}).json()["id"]
    pid = c.post(f"/api/farms/{fid}/plots", headers=h, json={"name": "P"}).json()["id"]
    assert c.post("/api/readings", json={"plot_id": pid, "soil_moisture": 20}).status_code == 401
    assert c.post("/api/readings", headers={"X-API-Key": "k"}, json={"plot_id": pid, "soil_moisture": 20}).status_code == 200
    readings = c.get(f"/api/plots/{pid}/readings", headers=h).json()
    assert len(readings) == 1 and readings[0]["source"] == "device" and readings[0]["entered_by"] is None


def test_decision_rules():
    dry_rain = decide(20, "tomatoes", 1000, {"rain_prob": 80})
    assert dry_rain["action"] == "wait" and dry_rain["litres_saved"] > 0
    assert decide(20, "tomatoes", 1000, {"rain_prob": 5})["action"] == "irrigate"
    assert decide(50, "tomatoes", 1000, {"rain_prob": 5})["action"] == "skip"


def test_overview(monkeypatch):
    from app.routers import farms
    monkeypatch.setattr(farms, "forecast", lambda lat, lon: {"rain_prob": 80, "rain_mm": 3, "max_temp": 30, "max_wind": 10})
    h = signup("ov@t.io")
    fid = c.post("/api/farms", headers=h, json={"name": "Ov"}).json()["id"]
    pid = c.post(f"/api/farms/{fid}/plots", headers=h, json={"name": "T", "crop": "tomatoes", "area_m2": 500}).json()["id"]
    assert c.get(f"/api/farms/{fid}/overview", headers=h).json()["plots"][0]["status"] == "no_data"
    c.post("/api/readings", headers={"X-API-Key": "k"}, json={"plot_id": pid, "soil_moisture": 30, "tank_level": 10})
    o = c.get(f"/api/farms/{fid}/overview", headers=h).json()
    assert o["my_role"] == "owner" and o["plots"][0]["status"] == "rain_wait"
    assert any("Tank" in w for w in o["plots"][0]["warnings"])
    other = signup("ov2@t.io")
    assert c.get(f"/api/farms/{fid}/overview", headers=other).status_code == 404


def test_chat(monkeypatch):
    import base64
    from app import forecast as fc
    from app.config import settings
    from app.routers import chat as chat_mod, farms
    from app import ai as ai_mod
    monkeypatch.setattr(fc, "get_forecast", lambda lat, lon: None)
    monkeypatch.setattr(farms, "forecast", lambda lat, lon: {"rain_prob": 10, "rain_mm": 0, "max_temp": 30, "max_wind": 5})
    h, other = signup("ch@t.io"), signup("ch2@t.io")
    fid = c.post("/api/farms", headers=h, json={"name": "Chat farm"}).json()["id"]
    c.post(f"/api/farms/{fid}/plots", headers=h, json={"name": "Tom", "crop": "tomatoes", "area_m2": 300})
    msg = {"messages": [{"role": "user", "content": "Which plot needs water?"}]}

    monkeypatch.setattr(settings, "llm_api_url", "")
    assert c.post(f"/api/farms/{fid}/chat", headers=h, json=msg).status_code == 503

    monkeypatch.setattr(settings, "llm_api_url", "http://llm.test/v1")
    sent = {}

    class R:
        status_code = 200
        def json(self): return {"data": {"reply": "Water Tom."}}

    def fake_post(url, headers, json, timeout):
        sent.update(json); sent["url"] = url; sent["token"] = headers.get("X-Bridge-Token")
        return R()
    monkeypatch.setattr(ai_mod.httpx, "post", legacy(fake_post))

    assert c.post(f"/api/farms/{fid}/chat", headers=other, json=msg).status_code == 404
    assert c.post(f"/api/farms/{fid}/chat").status_code == 401
    ok = c.post(f"/api/farms/{fid}/chat", headers=h, json=msg)
    assert ok.status_code == 200 and ok.json()["reply"] == "Water Tom."
    assert any(re.search(r"\bTom\b", line) and "Tomatoes" in line for line in sent["system"].splitlines())
    assert sent["url"] == "http://llm.test/v1/chat/completions"
    assert msg["messages"][0]["content"] in sent["prompt"]

    img = base64.b64encode(b"\x89PNG fake").decode()
    with_file = {**msg, "attachments": [{"name": "leaf.png", "media_type": "image/png", "data": img}]}
    assert c.post(f"/api/farms/{fid}/chat", headers=h, json=with_file).status_code == 200
    assert sent["files"] == [{"media_type": "image/png", "data": img}]

    bad = {**msg, "attachments": [{"name": "x.exe", "media_type": "application/x-msdownload", "data": img}]}
    assert c.post(f"/api/farms/{fid}/chat", headers=h, json=bad).status_code == 422
    big = base64.b64encode(b"a" * (5 * 1024 * 1024 + 1)).decode()
    huge = {**msg, "attachments": [{"name": "b.txt", "media_type": "text/plain", "data": big}]}
    assert c.post(f"/api/farms/{fid}/chat", headers=h, json=huge).status_code == 413
    five = {**msg, "attachments": [{"name": f"{i}.png", "media_type": "image/png", "data": img} for i in range(5)]}
    assert c.post(f"/api/farms/{fid}/chat", headers=h, json=five).status_code == 422
    assert c.post(f"/api/farms/{fid}/chat", headers=h, json={"messages": [{"role": "assistant", "content": "hi"}]}).status_code == 422


def test_worker_and_task_permissions(monkeypatch) -> None:
    from app.config import settings

    owner, mgr, tech, viewer = (signup(f"w{n}@t.io") for n in "omtv")
    fid = c.post("/api/farms", headers=owner, json={"name": "Wfarm"}).json()["id"]
    for email, role in [("wm@t.io", "manager"), ("wt@t.io", "technician"), ("wv@t.io", "viewer")]:
        assert c.put(f"/api/farms/{fid}/members", headers=owner, json={"email": email, "role": role}).status_code == 200

    workers = f"/api/farms/{fid}/workers"
    tasks = f"/api/farms/{fid}/tasks"
    assert c.post(workers, headers=tech, json={"name": "Karim"}).status_code == 403
    assert c.post(workers, headers=mgr, json={"name": ""}).status_code == 422
    worker = c.post(workers, headers=mgr, json={"name": "Karim", "role_label": "Irrigation"}).json()
    worker_id = worker["id"]

    task_body = {"worker_id": worker_id, "title": "Water North"}
    assert c.post(tasks, headers=viewer, json=task_body).status_code == 403
    assert c.post(tasks, headers=tech, json={**task_body, "worker_id": 999}).status_code == 404
    assert c.post(tasks, headers=tech, json={**task_body, "plot_id": 999}).status_code == 404
    task = c.post(tasks, headers=tech, json=task_body).json()
    assert task["status"] == "pending"

    task_url = f"{tasks}/{task['id']}"
    assert c.patch(task_url, headers=viewer, json={"status": "done"}).status_code == 403
    assert c.patch(task_url, headers=tech, json={"status": "open"}).status_code == 422
    done = c.patch(task_url, headers=tech, json={"status": "done"}).json()
    assert done["status"] == "done"
    assert c.patch(task_url, headers=tech, json={"status": "done"}).json() == done

    worker_url = f"{workers}/{worker_id}"
    assert c.delete(worker_url, headers=tech).status_code == 403
    assert c.delete(worker_url, headers=mgr).status_code == 204
    assert c.get(workers, headers=mgr).json() == []
    other = signup("wother@t.io")
    assert c.get(workers, headers=other).status_code == 404


def test_chat_proposes_tasks(monkeypatch):
    from datetime import date
    from app import forecast as fc
    from app.config import settings
    from app.routers import chat as chat_mod, farms
    from app import ai as ai_mod
    day = date.today().isoformat()
    monkeypatch.setattr(fc, "get_forecast", lambda lat, lon: {"daily": [{
        "date": day, "condition": "Clear sky", "icon": "clear", "temp_max": 38, "temp_min": 22, "rain_mm": 0, "rain_probability": 0,
        "wind_max_kmh": 15, "wind_gust_max": 30, "et0_mm": 6.0}], "alerts": [{"date": day, "title": "Hot day", "text": "Up to 38 C."}]})
    monkeypatch.setattr(farms, "forecast", lambda lat, lon: {"rain_prob": 5, "rain_mm": 0, "max_temp": 30, "max_wind": 5})
    monkeypatch.setattr(settings, "llm_api_url", "http://llm.test/v1")
    h = signup("cp@t.io")
    fid = c.post("/api/farms", headers=h, json={"name": "CP"}).json()["id"]
    c.post(f"/api/farms/{fid}/plots", headers=h, json={"name": "North field", "crop": "tomatoes"})
    wk = c.post(f"/api/farms/{fid}/workers", headers=h, json={"name": "Karim", "role_label": "Irrigation"}).json()
    c.post(f"/api/farms/{fid}/water-sources", headers=h, json={"kind": "tank", "name": "Yard tank", "capacity_l": 10000, "level_l": 4000, "refill_l_per_day": 500})
    seen = {}

    class R:
        status_code = 200
        def json(self):
            return {"data": {"reply": "North field is dry.", "tasks": [
                {"worker_name": "karim", "plot_name": "North field", "title": "Irrigate", "details": "30 min"},
                {"worker_name": "Ghost", "title": "Check tank"},
                {"worker_name": "Karim", "title": "   "},
            ]}}

    def fake_post(url, headers, json, timeout):
        seen.update(json)
        return R()
    monkeypatch.setattr(ai_mod.httpx, "post", legacy(fake_post))
    r = c.post(f"/api/farms/{fid}/chat", headers=h, json={"messages": [{"role": "user", "content": "tell my workers"}]}).json()
    prompt_lines = seen["system"].splitlines()

    worker_line = next((line for line in prompt_lines if "Karim" in line), "")
    assert "Irrigation" in worker_line

    tank_line = next((line for line in prompt_lines if "Yard tank" in line), "")
    assert re.search(r"\btank\b", tank_line.replace("Yard tank", "", 1), re.IGNORECASE)
    assert re.search(r"\b(?:4000\s*L\s+stored|stored\s*[:=]?\s*4000\s*L)\b", tank_line, re.IGNORECASE)
    assert re.search(r"\b(?:10000\s*L\s+capacity|capacity\s*[:=]?\s*10000\s*L)\b", tank_line, re.IGNORECASE)
    assert "refill" in tank_line.casefold()
    assert re.search(r"\b500\s*L\s*(?:per\s+|/\s*)day\b", tank_line, re.IGNORECASE)
    assert any(line.lstrip("- ").casefold().startswith("water outlook") for line in prompt_lines)

    forecast_line = next((line for line in prompt_lines if day in line and "Clear sky" in line), "")
    assert forecast_line, f"Missing Clear sky forecast for {day}"
    celsius = r"\s*°?\s*C\b"
    low = r"(?<![\w.-])22(?:\.0+)?"
    high = r"38(?:\.0+)?"
    assert (
        re.search(rf"{low}{celsius}", forecast_line)
        and re.search(rf"(?<![\w.-]){high}{celsius}", forecast_line)
    ) or re.search(rf"{low}\s*(?:to|[-–—])\s*{high}{celsius}", forecast_line)
    assert any(
        re.match(r"\s*(?:-\s*)?Alert\b", line, re.IGNORECASE) and day in line and "hot day" in line.casefold()
        for line in prompt_lines
    )
    assert any("North field" in line and "water plan" in line.casefold() for line in prompt_lines)
    assert re.search(r"\bmarket\b", seen["system"], re.IGNORECASE)
    assert "tasks" in seen["schema"]["properties"] and seen["schema"]["required"] == ["reply"]
    assert r["reply"] == "North field is dry."
    assert len(r["proposed_tasks"]) == 2
    first, second = r["proposed_tasks"]
    assert first["worker_id"] == wk["id"] and first["plot_name"] == "North field"
    assert second["worker_id"] is None and second["worker_name"] == "Ghost"


def test_timestamps_are_utc():
    from datetime import datetime
    from app import models
    assert models.iso(datetime(2026, 1, 1, 12, 0)) == "2026-01-01T12:00:00+00:00"
    assert models.iso(None) is None


def test_water_sources():
    owner, mgr, tech, view, out = (signup(f"ws{n}@t.io") for n in "omtvx")
    fid = c.post("/api/farms", headers=owner, json={"name": "Wsfarm"}).json()["id"]
    for email, role in [("wsm@t.io", "manager"), ("wst@t.io", "technician"), ("wsv@t.io", "viewer")]:
        c.put(f"/api/farms/{fid}/members", headers=owner, json={"email": email, "role": role})
    base = f"/api/farms/{fid}/water-sources"
    tank = {"kind": "tank", "name": "Main tank", "capacity_l": 20000, "level_l": 12000}
    assert c.post(base, headers=tech, json=tank).status_code == 403
    assert c.post(base, headers=mgr, json={**tank, "kind": "river"}).status_code == 422
    assert c.post(base, headers=mgr, json={**tank, "level_l": 25000}).status_code == 422
    assert c.post(base, headers=mgr, json={**tank, "level_l": -1}).status_code == 422
    t = c.post(base, headers=mgr, json=tank).json()
    assert t["fill_percent"] == 60.0
    w = c.post(base, headers=owner, json={"kind": "well", "name": "Well", "refill_l_per_day": 8000, "level_l": 0}).json()
    assert w["fill_percent"] is None
    got = c.get(base, headers=view).json()
    assert got["summary"] == {"total_stored_l": 12000.0, "total_capacity_l": 20000.0, "total_refill_l_per_day": 8000.0, "count": 2}
    assert c.put(f"{base}/{t['id']}/level", headers=view, json={"level_l": 5000}).status_code == 403
    assert c.put(f"{base}/{t['id']}/level", headers=tech, json={"level_l": 5000}).json()["fill_percent"] == 25.0
    assert c.put(f"{base}/{t['id']}/level", headers=tech, json={"level_l": 30000}).status_code == 422
    assert c.patch(f"{base}/{t['id']}", headers=tech, json=tank).status_code == 403
    assert c.patch(f"{base}/{t['id']}", headers=mgr, json={**tank, "name": "Big tank"}).json()["name"] == "Big tank"
    assert c.get(base, headers=out).status_code == 404
    assert c.delete(f"{base}/{w['id']}", headers=tech).status_code == 403
    assert c.delete(f"{base}/{w['id']}", headers=mgr).status_code == 204
    assert c.delete(f"{base}/{w['id']}", headers=mgr).status_code == 404


def _fake_open_meteo(days=3):
    from datetime import date, timedelta
    d0 = date(2026, 7, 1)
    dates = [(d0 + timedelta(days=i)).isoformat() for i in range(days)]
    hours = [f"{dates[0]}T{h:02d}:00" for h in range(24)] + [f"{dates[1]}T{h:02d}:00" for h in range(24)]
    return {"timezone": "Africa/Tunis",
            "current": {"time": f"{dates[0]}T12:00", "temperature_2m": 41.2, "apparent_temperature": 42, "relative_humidity_2m": 18,
                        "precipitation": 0, "weather_code": 0, "wind_speed_10m": 12, "wind_gusts_10m": 30},
            "hourly": {"time": hours, "temperature_2m": [30] * 48, "precipitation_probability": [10] * 48,
                       "precipitation": [0] * 48, "wind_speed_10m": [10] * 48, "weather_code": [1] * 48},
            "daily": {"time": dates, "weather_code": [0, 95, 61], "temperature_2m_max": [41, 30, 25],
                      "temperature_2m_min": [24, 1, 12], "precipitation_sum": [0, 25, 5],
                      "precipitation_probability_max": [0, 90, 80], "wind_speed_10m_max": [20, 40, 20],
                      "wind_gusts_10m_max": [35, 70, 30], "et0_fao_evapotranspiration": [7.5, 3.0, 4.0],
                      "uv_index_max": [10, 4, 6], "sunrise": [f"{x}T06:00" for x in dates], "sunset": [f"{x}T20:00" for x in dates]}}


def test_forecast(monkeypatch):
    from app import forecast
    forecast._cache.clear()
    calls = []

    class R:
        def raise_for_status(self): pass
        def json(self): return _fake_open_meteo()

    def fake_get(url, params, timeout):
        calls.append(params)
        return R()
    monkeypatch.setattr(forecast.httpx, "get", fake_get)
    h = signup("fc@t.io")
    fid = c.post("/api/farms", headers=h, json={"name": "FC", "lat": 36.45, "lon": 10.73}).json()["id"]
    r = c.get(f"/api/farms/{fid}/forecast", headers=h).json()
    assert r["current"]["condition"] == "Clear sky" and r["current"]["temperature"] == 41.2
    assert len(r["hourly"]) == 48 and len(r["daily"]) == 3
    assert r["daily"][0]["et0_mm"] == 7.5 and r["daily"][1]["condition"] == "Thunderstorm"
    kinds = {(a["kind"], a["level"]) for a in r["alerts"]}
    assert ("heat", "warning") in kinds and ("frost", "warning") in kinds and ("wind", "warning") in kinds and ("rain", "warning") in kinds
    assert calls[0]["latitude"] == 36.45 and "et0_fao_evapotranspiration" in calls[0]["daily"]
    c.get(f"/api/farms/{fid}/forecast", headers=h)
    assert len(calls) == 1                                           # served from cache
    assert c.get(f"/api/farms/{fid}/forecast", headers=signup("fc2@t.io")).status_code == 404
    assert c.get(f"/api/farms/{fid}/forecast").status_code == 401

    forecast._cache.clear()
    def down(url, params, timeout):
        raise forecast.httpx.ConnectError("offline")
    monkeypatch.setattr(forecast.httpx, "get", down)
    assert c.get(f"/api/farms/{fid}/forecast", headers=h).status_code == 502


def test_water_need_maths():
    from datetime import date, timedelta
    from app import water_need as wn
    assert round(wn.crop_litres("tomatoes", 1000, "drip", "loam", 5.0, 0)) == 6389
    assert round(wn.crop_litres("tomatoes", 1000, "drip", "sand", 5.0, 0)) == 6765      # sand loses more water
    assert wn.crop_litres("tomatoes", 1000, "drip", "loam", 5.0, 10) == 0               # 10 mm of rain covers the day
    assert round(wn.crop_litres("tomatoes", 1000, "drip", "loam", 5.0, 1.0)) == 6389    # under 2 mm of rain is ignored
    assert wn.crop_litres("olives", 1000, "flood", "loam", 5.0, 0) > wn.crop_litres("olives", 1000, "drip", "loam", 5.0, 0)
    assert wn.animal_litres("sheep", 100, False) == 800 and wn.animal_litres("sheep", 100, True) == 1000
    loam = wn.irrigation_plan("tomatoes", "loam", "sprinkler", 1000, 5.0)
    sand = wn.irrigation_plan("tomatoes", "sand", "sprinkler", 1000, 5.0)
    assert loam["interval_days"] == 7 and sand["interval_days"] < loam["interval_days"]  # sand holds less, so irrigate more often
    assert wn.irrigation_plan("olives", "clay", "drip", 1000, 2.0)["interval_days"] == 3  # drip is applied often, whatever the soil holds

    today = date(2026, 7, 1)
    daily = [{"date": (today + timedelta(days=i)).isoformat(), "et0_mm": 5.0, "rain_mm": 0, "temp_max": 30} for i in range(7)]
    plots = [{"id": 1, "crop": "tomatoes", "area_m2": 1000, "irrigation": "drip", "soil_type": "loam"}]
    herds = [{"id": 9, "species": "sheep", "count": 100}]
    short = wn.compute_balance(plots, herds, 20000, 0, 1, daily, today)
    assert short["horizons"]["today"]["crops_l"] == 6389 and short["horizons"]["today"]["animals_l"] == 800
    assert short["verdict"]["status"] == "short" and short["verdict"]["days_left"] == 2
    assert short["plots"][1]["week"] == 44722 and short["animals"][9]["week"] == 5600
    rich = wn.compute_balance(plots, herds, 10_000_000, 0, 1, daily, today)
    assert rich["verdict"]["status"] == "ok" and rich["verdict"]["surplus_l_week"] > 0
    assert wn.compute_balance(plots, herds, 0, 0, 0, daily, today)["verdict"]["status"] == "no_sources"
    assert wn.compute_balance([], [], 0, 0, 0, daily, today)["verdict"]["status"] == "ok"
    peak_days = [{**d, "et0_mm": 25.0 if i == 2 else 0.2} for i, d in enumerate(daily)]
    timing = wn.compute_balance(plots, [], 2000, 5000, 1, peak_days, today)["verdict"]
    assert timing["status"] == "short" and timing["shortfall_l_week"] == 0
    assert timing["days_left"] == 2
    assert peak_days[2]["date"] in timing["message"]
    refill = wn.compute_balance(plots, herds, 0, 50000, 1, daily, today)
    assert refill["verdict"]["days_left"] is None or refill["verdict"]["days_left"] > 30
    assert wn.compute_balance(plots, herds, None, 50000, 1, daily, today) == refill
    empty = wn.compute_balance(plots, herds, 0, None, 1, daily, today)
    assert empty["verdict"]["status"] == "short" and empty["horizons"]["week"]["supply_estimate_available"] is True
    unknown = wn.compute_balance(plots, herds, None, None, 1, daily, today)
    assert unknown["verdict"]["status"] == "no_sources" and unknown["horizons"]["week"]["supply_estimate_available"] is False


def test_livestock_and_balance_endpoint(monkeypatch):
    from datetime import date, timedelta
    from app.routers import water as water_mod
    daily = [{"date": (date.today() + timedelta(days=i)).isoformat(), "et0_mm": 5.0, "rain_mm": 0, "temp_max": 30} for i in range(7)]
    monkeypatch.setattr(water_mod.forecast, "get_forecast", lambda lat, lon: {"daily": daily, "hourly": []})
    owner, tech, out = signup("lb1@t.io"), signup("lb2@t.io"), signup("lb3@t.io")
    fid = c.post("/api/farms", headers=owner, json={"name": "LB"}).json()["id"]
    c.put(f"/api/farms/{fid}/members", headers=owner, json={"email": "lb2@t.io", "role": "technician"})
    pid = c.post(f"/api/farms/{fid}/plots", headers=owner, json={"name": "T", "crop": "tomatoes", "area_m2": 1000, "soil_type": "sand"}).json()["id"]
    assert c.get(f"/api/farms/{fid}/overview", headers=owner).json()["plots"][0]["soil_type"] == "sand"
    assert c.post(f"/api/farms/{fid}/plots", headers=owner, json={"name": "X", "soil_type": "rock"}).status_code == 422
    base = f"/api/farms/{fid}/livestock"
    assert c.post(base, headers=tech, json={"species": "sheep", "count": 10}).status_code == 403
    assert c.post(base, headers=owner, json={"species": "dragon", "count": 10}).status_code == 422
    assert c.post(base, headers=owner, json={"species": "sheep", "count": 0}).status_code == 422
    h = c.post(base, headers=owner, json={"species": "sheep", "count": 100}).json()
    assert h["litres_per_day"] == 800 and h["label"] == "Sheep"
    assert c.post(base, headers=owner, json={"species": "sheep", "count": 5}).status_code == 409
    assert c.patch(f"{base}/{h['id']}", headers=owner, json={"count": 120}).json()["litres_per_day"] == 960
    assert len(c.get(base, headers=tech).json()["species"]) == 11
    tank = c.post(f"/api/farms/{fid}/water-sources", headers=owner, json={"kind": "tank", "name": "Tank", "capacity_l": 50000, "level_l": 20000}).json()
    assert tank["refill_recorded"] is False
    b = c.get(f"/api/farms/{fid}/water-balance", headers=tech).json()
    assert b["forecast_used"] is True and b["plots"][0]["soil_label"] == "Sand" and b["plots"][0]["efficiency"] == 0.85
    assert b["animals"][0]["week_l"] > 0 and b["horizons"]["week"]["total_l"] == b["horizons"]["week"]["crops_l"] + b["horizons"]["week"]["animals_l"]
    assert b["verdict"]["status"] == "short" and len(b["daily"]) == 7
    assert b["horizons"]["week"]["supply_l"] == 20000
    assert b["horizons"]["week"]["supply_estimate_available"] is True
    refill_notes = [
        note for note in b["notes"]
        if {"unrecorded", "refill", "supply"} <= set(re.findall(r"\w+", note.casefold()))
        and re.search(r"(?<![\d.-])0\s*L\s*(?:per\s+|/\s*)day\b", note, re.IGNORECASE)
    ]
    assert len(refill_notes) == 1
    assert c.get(f"/api/farms/{fid}/water-balance", headers=out).status_code == 404
    assert c.delete(f"{base}/{h['id']}", headers=tech).status_code == 403
    assert c.delete(f"{base}/{h['id']}", headers=owner).status_code == 204


PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


def test_market(monkeypatch, tmp_path):
    import base64
    from app.config import settings
    monkeypatch.setattr(settings, "uploads_dir", str(tmp_path))
    seller, mgr, tech, buyer, buyer2 = (signup(f"mk{n}@t.io") for n in "smtbc")
    f1 = c.post("/api/farms", headers=seller, json={"name": "Sellers Farm", "region": "Nabeul", "lat": 36.45, "lon": 10.73}).json()["id"]
    f2 = c.post("/api/farms", headers=buyer, json={"name": "Buyers Farm", "region": "Tunis", "lat": 36.80, "lon": 10.18}).json()["id"]
    for e, r in [("mkm@t.io", "manager"), ("mkt@t.io", "technician")]:
        c.put(f"/api/farms/{f1}/members", headers=seller, json={"email": e, "role": r})

    b64 = base64.b64encode(PNG).decode()
    assert c.post(f"/api/farms/{f1}/market/photos", headers=tech, json={"data": b64}).status_code == 403
    assert c.post(f"/api/farms/{f1}/market/photos", headers=mgr, json={"data": base64.b64encode(b"GIF89a....").decode()}).status_code == 422
    assert c.post(f"/api/farms/{f1}/market/photos", headers=mgr, json={"data": "!!notbase64"}).status_code == 422
    big = base64.b64encode(PNG + b"0" * (3 * 1024 * 1024)).decode()
    assert c.post(f"/api/farms/{f1}/market/photos", headers=mgr, json={"data": big}).status_code == 413
    photo = c.post(f"/api/farms/{f1}/market/photos", headers=mgr, json={"data": b64}).json()
    assert photo["url"].startswith("/uploads/market/f%d-" % f1) and (tmp_path / "market" / photo["filename"]).exists()

    base = {"title": "Surplus well water", "description": "Clean well water.", "litres_available": 30000, "price_mode": "fixed",
            "price_per_m3": 1.5, "water_source": "well", "fulfilment": "both", "delivery_radius_km": 25, "governorate": "Nabeul",
            "address_text": "Road to Dar Chaabane", "photos": [photo["filename"]]}
    lp = f"/api/farms/{f1}/market/listings"
    assert c.post(lp, headers=tech, json=base).status_code == 403
    assert c.post(lp, headers=mgr, json={**base, "governorate": "Atlantis"}).status_code == 422
    assert c.post(lp, headers=mgr, json={**base, "price_per_m3": None}).status_code == 422
    assert c.post(lp, headers=mgr, json={**base, "delivery_radius_km": None}).status_code == 422
    assert c.post(lp, headers=mgr, json={**base, "available_from": "2026-08-10", "available_until": "2026-08-01"}).status_code == 422
    assert c.post(lp, headers=mgr, json={**base, "lat": 36.4}).status_code == 422
    assert c.post(lp, headers=mgr, json={**base, "photos": ["f999-aaaaaaaaaaaa.png"]}).status_code == 422
    assert c.post(lp, headers=mgr, json={**base, "photos": [f"f{f2}-{photo['filename'].split('-', 1)[1]}"]}).status_code == 422
    assert c.post(lp, headers=mgr, json={**base, "photos": ["../../etc/passwd"]}).status_code == 422
    l1 = c.post(lp, headers=mgr, json=base).json()
    l2 = c.post(lp, headers=seller, json={**base, "title": "Free rainwater", "price_mode": "free", "price_per_m3": None,
                                          "fulfilment": "pickup", "delivery_radius_km": None, "water_source": "rain_tank",
                                          "governorate": "Sfax", "litres_available": 8000, "photos": []}).json()
    l3 = c.post(lp, headers=seller, json={**base, "title": "Old tank", "status": "paused"}).json()
    assert l1["is_mine"] is True and l1["photos"] == [photo["url"]]

    got = c.get(f"/api/market/listings?near_farm_id={f2}", headers=buyer).json()
    titles = [i["title"] for i in got["items"]]
    assert got["total"] == 2 and "Old tank" not in titles
    by = {i["title"]: i for i in got["items"]}
    assert by["Surplus well water"]["distance_km"] < by["Free rainwater"]["distance_km"]
    assert by["Surplus well water"]["is_mine"] is False and "inquiry_count" not in by["Surplus well water"]
    names = lambda q: [i["title"] for i in c.get(f"/api/market/listings?{q}", headers=buyer).json()["items"]]
    assert names("governorate=Sfax") == ["Free rainwater"]
    assert names("fulfilment=delivery") == ["Surplus well water"]
    assert names("source=rain_tank") == ["Free rainwater"]
    assert names("max_price=1") == ["Free rainwater"]
    assert names("min_litres=20000") == ["Surplus well water"]
    assert names("q=rainwater") == ["Free rainwater"]
    assert names(f"sort=price") == ["Free rainwater", "Surplus well water"]
    assert names(f"sort=distance&near_farm_id={f2}")[0] == "Surplus well water"
    assert c.get(f"/api/market/listings?near_farm_id={f1}", headers=buyer).status_code == 404
    assert c.get("/api/market/listings").status_code == 401

    assert c.get(f"/api/market/listings/{l3['id']}", headers=buyer).status_code == 404
    assert c.get(f"/api/market/listings/{l3['id']}", headers=mgr).status_code == 200
    d = c.get(f"/api/market/listings/{l1['id']}", headers=buyer).json()
    assert d["my_inquiry"] is None and d["farm"]["name"] == "Sellers Farm"

    iq = f"/api/market/listings/{l1['id']}/inquiries"
    assert c.post(iq, headers=buyer, json={"message": "hi"}).status_code == 422
    assert c.post(iq, headers=seller, json={"message": "Interested in my own water"}).status_code == 409
    sent = c.post(iq, headers=buyer, json={"message": "I need 10 m3 for tomatoes next week."}).json()
    assert sent["status"] == "new" and sent["farm_name"] == "Sellers Farm"
    assert c.post(iq, headers=buyer, json={"message": "Anyone there?"}).status_code == 409
    assert c.post(f"/api/market/listings/{l3['id']}/inquiries", headers=buyer2, json={"message": "Paused one please"}).status_code == 404
    assert c.get(f"/api/market/listings/{l1['id']}", headers=buyer).json()["my_inquiry"]["status"] == "new"
    assert c.get("/api/market/my-inquiries", headers=buyer).json()[0]["listing_title"] == "Surplus well water"

    inbox = c.get(f"/api/farms/{f1}/market/inquiries", headers=mgr).json()
    assert len(inbox) == 1 and inbox[0]["sender"]["email"] == "mkb@t.io"
    assert c.get(f"/api/farms/{f1}/market/inquiries", headers=tech).status_code == 403
    assert c.get(f"/api/farms/{f1}/market/inquiries", headers=buyer).status_code == 404
    assert c.patch(f"/api/market/inquiries/{inbox[0]['id']}", headers=tech, json={"status": "read"}).status_code == 403
    assert c.patch(f"/api/market/inquiries/{inbox[0]['id']}", headers=buyer, json={"status": "read"}).status_code == 404
    assert c.patch(f"/api/market/inquiries/{inbox[0]['id']}", headers=mgr, json={"status": "accepted"}).json()["status"] == "accepted"
    mine = {i["title"]: i for i in c.get(lp, headers=tech).json()}
    assert mine["Surplus well water"]["inquiry_count"] == 1 and mine["Surplus well water"]["new_inquiries"] == 0

    assert c.patch(f"{lp}/{l1['id']}", headers=mgr, json={**base, "litres_available": 12000, "status": "paused"}).json()["status"] == "paused"
    assert c.patch(f"{lp}/{l1['id']}", headers=buyer, json=base).status_code == 404
    assert names("q=surplus") == []
    assert c.delete(f"{lp}/{l1['id']}", headers=tech).status_code == 403
    assert c.delete(f"{lp}/{l1['id']}", headers=mgr).status_code == 204
    assert c.get("/api/market/meta", headers=buyer).json()["governorates"][0]["name"] == "Tunis"


def test_jobs():
    owner, mgr, tech, seeker, seeker2 = (signup(f"jb{n}@t.io") for n in "omtsx")
    fid = c.post("/api/farms", headers=owner, json={"name": "Jobs Farm", "region": "Beja", "lat": 36.73, "lon": 9.18}).json()["id"]
    c.put(f"/api/farms/{fid}/members", headers=owner, json={"email": "jbm@t.io", "role": "manager"})
    c.put(f"/api/farms/{fid}/members", headers=owner, json={"email": "jbt@t.io", "role": "technician"})
    base = {"title": "Olive harvest crew", "description": "Hand picking.", "kind": "period", "start_date": "2099-11-20",
            "end_date": "2099-12-15", "pay_mode": "fixed", "pay_amount": 45, "pay_unit": "day", "workers_needed": 2,
            "skills": ["Harvest", "Olive picking"], "governorate": "Beja", "address_text": "Near Testour"}
    jp = f"/api/farms/{fid}/jobs"
    assert c.post(jp, headers=tech, json=base).status_code == 403
    assert c.post(jp, headers=mgr, json={**base, "governorate": "Mars"}).status_code == 422
    assert c.post(jp, headers=mgr, json={**base, "start_date": None}).status_code == 422
    assert c.post(jp, headers=mgr, json={**base, "end_date": "2099-11-01"}).status_code == 422
    assert c.post(jp, headers=mgr, json={**base, "pay_unit": None}).status_code == 422
    assert c.post(jp, headers=mgr, json={**base, "skills": ["x" * 31]}).status_code == 422
    assert c.post(jp, headers=mgr, json={**base, "kind": "forever"}).status_code == 422
    j1 = c.post(jp, headers=mgr, json=base).json()
    j2 = c.post(jp, headers=owner, json={"title": "Fix the drip lines", "kind": "task", "start_date": "2099-10-02", "pay_mode": "negotiable",
                                         "governorate": "Beja", "skills": ["Irrigation"]}).json()
    j3 = c.post(jp, headers=owner, json={"title": "Farm manager", "kind": "long_term", "pay_mode": "fixed", "pay_amount": 1800,
                                         "pay_unit": "month", "governorate": "Sfax", "status": "closed"}).json()
    assert j1["is_mine"] and j1["application_count"] == 0

    names = lambda q, h=seeker: [i["title"] for i in c.get(f"/api/jobs?{q}", headers=h).json()["items"]]
    assert set(names("")) == {"Olive harvest crew", "Fix the drip lines"}
    assert names("kind=task") == ["Fix the drip lines"] and names("governorate=Sfax") == []
    assert names("q=harvest") == ["Olive harvest crew"]
    assert names("sort=pay")[0] == "Olive harvest crew"
    sf = c.post("/api/farms", headers=seeker, json={"name": "Seeker Farm", "lat": 36.8, "lon": 10.18}).json()["id"]
    assert c.get(f"/api/jobs?near_farm_id={sf}", headers=seeker).json()["items"][0]["distance_km"] > 0
    assert c.get(f"/api/jobs?near_farm_id={fid}", headers=seeker).status_code == 404
    assert c.get("/api/jobs").status_code == 401
    assert c.get(f"/api/jobs/{j3['id']}", headers=seeker).status_code == 404 and c.get(f"/api/jobs/{j3['id']}", headers=mgr).status_code == 200
    assert c.get(f"/api/jobs/{j1['id']}", headers=seeker).json()["my_application"] is None

    ap = f"/api/jobs/{j1['id']}/applications"
    assert c.post(ap, headers=seeker, json={"message": "hey"}).status_code == 422
    assert c.post(ap, headers=mgr, json={"message": "I work here already"}).status_code == 409
    a1 = c.post(ap, headers=seeker, json={"message": "I have six seasons of olive picking."}).json()
    assert a1["status"] == "pending" and a1["farm_name"] == "Jobs Farm"
    assert c.post(ap, headers=seeker, json={"message": "Applying again please"}).status_code == 409
    a2 = c.post(ap, headers=seeker2, json={"message": "Available the whole period."}).json()
    assert c.post(f"/api/jobs/{j3['id']}/applications", headers=seeker2, json={"message": "Closed job apply"}).status_code == 404
    assert c.get(f"/api/jobs/{j1['id']}", headers=seeker).json()["my_application"]["status"] == "pending"
    assert c.get("/api/jobs/my-applications", headers=seeker).json()[0]["job_title"] == "Olive harvest crew"

    inbox = c.get(f"{jp}/applications", headers=mgr).json()
    assert len(inbox) == 2 and inbox[0]["applicant"]["email"] in ("jbs@t.io", "jbx@t.io")
    assert c.get(f"{jp}/applications", headers=tech).status_code == 403 and c.get(f"{jp}/applications", headers=seeker).status_code == 404
    assert c.patch(f"/api/jobs/applications/{a1['id']}", headers=tech, json={"status": "accepted"}).status_code == 403
    assert c.patch(f"/api/jobs/applications/{a1['id']}", headers=seeker, json={"status": "accepted"}).status_code == 404
    assert c.patch(f"/api/jobs/applications/{a1['id']}", headers=mgr, json={"status": "accepted"}).json()["status"] == "accepted"
    assert c.get(f"/api/jobs/{j1['id']}", headers=seeker).json()["status"] == "open"            # needs two workers
    assert c.patch(f"/api/jobs/applications/{a2['id']}", headers=mgr, json={"status": "accepted"}).status_code == 200
    filled = c.get(f"/api/jobs/{j1['id']}", headers=seeker).json()
    assert filled["status"] == "filled" and filled["accepted_count"] == 2
    assert "Olive harvest crew" not in names("")
    assert c.delete(f"/api/jobs/applications/{a2['id']}", headers=seeker).status_code == 404      # not theirs
    assert c.delete(f"/api/jobs/applications/{a2['id']}", headers=seeker2).status_code == 204
    assert c.get("/api/jobs/my-applications", headers=seeker2).json()[0]["status"] == "withdrawn"
    assert c.patch(f"/api/jobs/applications/{a2['id']}", headers=mgr, json={"status": "declined"}).status_code == 409

    assert c.patch(f"{jp}/{j2['id']}", headers=mgr, json={**base, "kind": "task", "start_date": "2099-10-03", "end_date": None,
                                                            "title": "Fix the drip lines (updated)"}).json()["title"].endswith("(updated)")
    assert c.patch(f"{jp}/{j2['id']}", headers=seeker, json=base).status_code == 404
    assert c.delete(f"{jp}/{j2['id']}", headers=tech).status_code == 403
    assert c.delete(f"{jp}/{j2['id']}", headers=mgr).status_code == 204


def test_devices_control_loop():
    from datetime import datetime, timedelta, timezone
    owner, mgr, tech, view, out = (signup(f"dv{n}@t.io") for n in "omtvx")
    fid = c.post("/api/farms", headers=owner, json={"name": "Dev Farm"}).json()["id"]
    for e, r in [("dvm@t.io", "manager"), ("dvt@t.io", "technician"), ("dvv@t.io", "viewer")]:
        c.put(f"/api/farms/{fid}/members", headers=owner, json={"email": e, "role": r})
    pid = c.post(f"/api/farms/{fid}/plots", headers=owner, json={"name": "Tomatoes", "crop": "tomatoes"}).json()["id"]
    base = f"/api/farms/{fid}/devices"

    assert c.post(base, headers=tech, json={"name": "Pump box"}).status_code == 403
    assert c.post(base, headers=mgr, json={"name": "Pump box", "plot_id": 9999}).status_code == 404
    made = c.post(base, headers=mgr, json={"name": "Pump box", "plot_id": pid}).json()
    token, did = made["token"], made["id"]
    assert token.startswith("aqd_") and made["online"] is False and made["token_hint"] == token[-4:] and "token_hash" not in made
    assert "token" not in c.get(base, headers=view).json()[0]
    dev = {"X-Device-Token": token}

    assert c.post("/api/device/hello", json={}).status_code == 401
    assert c.post("/api/device/hello", headers={"X-Device-Token": "nope"}, json={}).status_code == 401
    assert c.post("/api/device/readings", headers=dev, json={"soil_moisture": 101}).status_code == 422
    h = c.post("/api/device/hello", headers=dev, json={"firmware": "1.0.0", "rssi": -61, "ip": "192.168.4.20", "actuators": [
        {"key": "pump1", "label": "Main pump", "kind": "pump", "state": "off"}, {"key": "led", "kind": "banana", "state": "on"}]}).json()
    assert h["device_id"] == did and h["poll_wait_s"] == 20
    d = c.get(base, headers=view).json()[0]
    assert d["online"] is True and d["firmware"] == "1.0.0" and d["rssi"] == -61 and d["plot_name"] == "Tomatoes"
    pump = next(a for a in d["actuators"] if a["key"] == "pump1")
    led = next(a for a in d["actuators"] if a["key"] == "led")
    assert led["kind"] == "relay" and led["state"] == "on" and pump["max_run_s"] == 1800

    assert c.post("/api/device/readings", headers=dev, json={"soil_moisture": 31.5, "tank_level": 72, "temperature": 24}).json() == {"ok": True}
    assert c.get(f"/api/plots/{pid}/readings", headers=view).json()[0]["tank_level"] == 72

    cmd = f"{base}/{did}/actuators/{pump['id']}/command"
    assert c.post(cmd, headers=view, json={"action": "on"}).status_code == 403
    assert c.post(cmd, headers=out, json={"action": "on"}).status_code == 404
    assert c.post(cmd, headers=tech, json={"action": "on", "duration_s": 4}).status_code == 422
    assert c.post(cmd, headers=tech, json={"action": "on", "duration_s": 3600}).status_code == 422
    first = c.post(cmd, headers=tech, json={"action": "on", "duration_s": 300}).json()
    assert first["status"] == "pending" and first["duration_s"] == 300 and first["created_by"]
    second = c.post(cmd, headers=tech, json={"action": "on", "duration_s": 120}).json()
    hist = {x["id"]: x["status"] for x in c.get(f"{base}/{did}/commands", headers=view).json()}
    assert hist[first["id"]] == "cancelled" and hist[second["id"]] == "pending"

    polled = c.get("/api/device/commands?wait=0", headers=dev).json()["commands"]
    assert polled == [{"id": second["id"], "actuator": "pump1", "action": "on", "duration_s": 120}]
    assert c.get("/api/device/commands?wait=0", headers=dev).json()["commands"] == []          # delivered once
    assert c.get("/api/device/commands?wait=0").status_code == 401
    assert c.post(f"/api/device/commands/{second['id']}/ack", headers={"X-Device-Token": "x"}, json={"status": "done"}).status_code == 401
    assert c.post(f"/api/device/commands/{second['id']}/ack", headers=dev, json={"status": "done", "result": "relay on"}).json() == {"ok": True}
    assert c.post(f"/api/device/commands/{second['id']}/ack", headers=dev, json={"status": "done"}).status_code == 409
    state = next(a for a in c.get(base, headers=view).json()[0]["actuators"] if a["key"] == "pump1")
    assert state["state"] == "on" and state["on_until"]

    # safety: low tank blocks the pump, offline blocks everything, stop-all queues an off
    stop = c.post(f"{base}/stop-all", headers=tech).json()
    assert stop["stopping"] == 2                                    # the pump and the LED that was on
    offs = c.get("/api/device/commands?wait=0", headers=dev).json()["commands"]
    assert {o["actuator"] for o in offs} == {"pump1", "led"} and all(o["action"] == "off" and o["duration_s"] is None for o in offs)
    for o in offs:
        c.post(f"/api/device/commands/{o['id']}/ack", headers=dev, json={"status": "done"})
    assert next(a for a in c.get(base, headers=view).json()[0]["actuators"] if a["key"] == "pump1")["state"] == "off"
    c.post("/api/device/readings", headers=dev, json={"tank_level": 6})
    blocked = c.post(cmd, headers=tech, json={"action": "on", "duration_s": 60})
    assert blocked.status_code == 409
    detail = blocked.json()["detail"].casefold()
    assert "tank" in detail and re.search(r"\b(?:empty|low)\b", detail)
    fresh_off = c.post(cmd, headers=tech, json={"action": "off"})                                 # turning off is never blocked
    assert fresh_off.status_code == 200 and fresh_off.json()["status"] == "pending"

    from app.db import SessionLocal
    from app import models
    with SessionLocal() as db:
        dv = db.get(models.Device, did)
        dv.last_seen = datetime.now(timezone.utc) - timedelta(minutes=10)
        old = models.DeviceCommand(device_id=did, actuator_id=pump["id"], action="off", created_at=datetime.now(timezone.utc) - timedelta(minutes=10))
        db.add(old); db.commit(); old_id = old.id
    assert c.get(base, headers=view).json()[0]["online"] is False
    off_resp = c.post(cmd, headers=tech, json={"action": "off"})
    assert off_resp.status_code == 409 and "offline" in off_resp.json()["detail"]
    back = c.get("/api/device/commands?wait=0", headers=dev).json()["commands"]
    assert [x["id"] for x in back] == [fresh_off.json()["id"]]                                     # the fresh one arrives, the stale one does not
    assert {x["id"]: x["status"] for x in c.get(f"{base}/{did}/commands", headers=view).json()}[old_id] == "expired"

    assert c.patch(f"{base}/{did}/actuators/{pump['id']}", headers=tech, json={"label": "Pump", "max_run_s": 600}).status_code == 403
    assert c.patch(f"{base}/{did}/actuators/{pump['id']}", headers=mgr, json={"label": "North pump", "max_run_s": 600}).json()["max_run_s"] == 600
    assert c.patch(f"{base}/{did}", headers=mgr, json={"name": "Pump box 2", "plot_id": None}).json()["plot_id"] is None
    assert c.post("/api/device/readings", headers=dev, json={"soil_moisture": 20}).status_code == 409   # not linked to a plot now
    rot = c.post(f"{base}/{did}/rotate-token", headers=mgr).json()
    assert rot["token"] != token and c.post("/api/device/hello", headers=dev, json={}).status_code == 401
    assert c.post("/api/device/hello", headers={"X-Device-Token": rot["token"]}, json={}).status_code == 200
    assert c.delete(f"{base}/{did}", headers=tech).status_code == 403
    assert c.delete(f"{base}/{did}", headers=mgr).status_code == 204 and c.get(base, headers=view).json() == []


def test_long_poll_wakes_up_for_a_command():
    import threading, time
    owner = signup("lp@t.io")
    fid = c.post("/api/farms", headers=owner, json={"name": "LP"}).json()["id"]
    made = c.post(f"/api/farms/{fid}/devices", headers=owner, json={"name": "Valve"}).json()
    dev = {"X-Device-Token": made["token"]}
    c.post("/api/device/hello", headers=dev, json={"actuators": [{"key": "v1", "kind": "valve", "state": "off"}]})
    aid = c.get(f"/api/farms/{fid}/devices", headers=owner).json()[0]["actuators"][0]["id"]
    started = time.monotonic()
    threading.Timer(1.5, lambda: c.post(f"/api/farms/{fid}/devices/{made['id']}/actuators/{aid}/command", headers=owner, json={"action": "on", "duration_s": 30})).start()
    got = c.get("/api/device/commands?wait=10", headers=dev).json()["commands"]
    assert len(got) == 1 and got[0]["actuator"] == "v1" and time.monotonic() - started < 6


def configure_board(monkeypatch, url="http://192.168.4.1"):
    from app.config import settings
    monkeypatch.setattr(settings, "aquafarm_bridge_enabled", True)
    monkeypatch.setattr(settings, "aquafarm_bridge_url", url)
    monkeypatch.setattr(settings, "aquafarm_bridge_interval", 15)
    monkeypatch.setattr(settings, "aquafarm_pump_max_minutes", 2)


class FakeBoard:
    """Stands in for the farm ESP32's web server: GET /data, POST /pump, POST /mode."""
    def __init__(self):
        self.data = {"tank": 72, "tankMin": 15, "tankFault": 0, "soil": 31, "soilNeed": 35, "soilRaw": 2400, "soilFault": 0,
                     "rain": 0, "rainRaw": 4000, "temp": 23.5, "hum": 61, "pump": 0, "pumpLeft": 0, "sinceWater": -1,
                     "auto": 1, "status": "OK", "alarm": 0, "uptime": 600}
        self.calls = []

    def request(self, base_url, method, path, params=None):
        from app import bridge
        self.calls.append((method, path, dict(params or {})))
        if path == "/data":
            return dict(self.data)
        if path == "/mode":
            self.data.update(auto=int(params["auto"]), pump=0, pumpLeft=0)
            if self.data["auto"]:
                self.data["status"] = "Automatic mode on"
                return {"ok": 1, "msg": "Auto mode: the system decides when to water"}
            self.data["status"] = "Manual mode: use the buttons"
            return {"ok": 1, "msg": "Manual mode: the pump runs only when you press Water now"}
        if path == "/pump":
            if params["action"] == "off":
                if self.data["pump"]:
                    self.data["status"] = "Pump stopped manually"
                self.data.update(pump=0, pumpLeft=0)
                return {"ok": 1, "msg": "Pump stopped"}
            if self.data["auto"]:
                return {"ok": 0, "msg": "Auto mode: the system decides. Switch to Manual to use the button"}
            if self.data["tank"] < self.data.get("tankMin", 15):
                return {"ok": 0, "msg": "Blocked: tank level is too low"}
            seconds = params["sec"]
            if seconds <= 0:
                self.data.update(pump=1, pumpLeft=self.data.get("hardCapSec", 120) - 1, sinceWater=0,
                                 status="Manual watering until you press Stop")
                return {"ok": 1, "msg": "Pump running until you press Stop"}
            seconds = min(seconds, self.data.get("manualMaxSec", 30))
            self.data.update(pump=1, pumpLeft=seconds - 1, sinceWater=0, status=f"Manual watering {seconds} s")
            return {"ok": 1, "msg": f"Pump running for {seconds} s"}
        raise bridge.BoardError("unknown")


def test_local_board_bridge(monkeypatch):
    from datetime import datetime, timedelta, timezone
    from app import bridge, models
    from app.db import SessionLocal
    board = FakeBoard()
    configure_board(monkeypatch)
    monkeypatch.setattr(bridge, "board_request", board.request)

    owner, tech, view, mgr = signup("br1@t.io"), signup("br2@t.io"), signup("br3@t.io"), signup("br4@t.io")
    fid = c.post("/api/farms", headers=owner, json={"name": "Bridge Farm"}).json()["id"]
    c.put(f"/api/farms/{fid}/members", headers=owner, json={"email": "br4@t.io", "role": "manager"})
    c.put(f"/api/farms/{fid}/members", headers=owner, json={"email": "br2@t.io", "role": "technician"})
    c.put(f"/api/farms/{fid}/members", headers=owner, json={"email": "br3@t.io", "role": "viewer"})
    pid = c.post(f"/api/farms/{fid}/plots", headers=owner, json={"name": "Tomatoes", "crop": "tomatoes"}).json()["id"]
    base = f"/api/farms/{fid}/devices"

    for bad in ["https://192.168.4.1", "http://example.com", "http://8.8.8.8", "http://192.168.4.1/admin", "192.168.4.1", "http://user@192.168.4.1"]:
        assert c.post(base, headers=owner, json={"name": "Farm board", "base_url": bad}).status_code == 422, bad
    made = c.post(base, headers=owner, json={"name": "Farm board", "plot_id": pid, "base_url": "http://192.168.4.1/"}).json()
    assert made["connection"] == "local" and made["base_url"] == "http://192.168.4.1" and "token" not in made and made["online"] is False
    did = made["id"]
    bridge.forget_device(did)
    assert c.post(f"{base}/{did}/rotate-token", headers=owner).status_code == 409

    bridge.poll_once()
    d = c.get(base, headers=view).json()[0]
    assert d["online"] is True and d["status_text"] == "OK" and d["alarm"] is False and d["mode_auto"] is True
    assert d["data"]["tank"] == 72 and d["data"]["temp"] == 23.5
    pump = d["actuators"][0]
    assert pump["key"] == "pump1" and pump["state"] == "off" and pump["durations"] == [3, 5, 10, 15, 30, 0] and pump["max_run_s"] == 30
    latest = c.get(f"/api/plots/{pid}/readings", headers=view).json()[0]
    assert latest["soil_moisture"] == 31 and latest["tank_level"] == 72 and latest["temperature"] == 23.5
    bridge.poll_once()
    assert len(c.get(f"/api/plots/{pid}/readings", headers=view).json()) == 1                     # one reading a minute, not one per poll

    cmd = f"{base}/{did}/actuators/{pump['id']}/command"
    assert c.post(cmd, headers=view, json={"action": "on", "duration_s": 5}).status_code == 403
    blocked = c.post(cmd, headers=tech, json={"action": "on", "duration_s": 5})
    assert blocked.status_code == 409
    assert {"auto", "manual"} <= set(re.findall(r"\w+", blocked.json()["detail"].casefold()))
    assert not any(path == "/pump" and params.get("action") == "on" for _, path, params in board.calls)
    assert c.post(f"{base}/{did}/mode", headers=tech, json={"auto": False}).status_code == 403   # technicians cannot switch mode
    assert board.data["auto"] == 1
    mode = c.post(f"{base}/{did}/mode", headers=mgr, json={"auto": False}).json()                 # managers can
    assert mode["mode_auto"] is False and mode["message"] == "Manual mode: the pump runs only when you press Water now"
    assert mode["status_text"] == "Manual mode: use the buttons"
    ok = c.post(cmd, headers=tech, json={"action": "on", "duration_s": 5}).json()
    assert ok["status"] == "done" and ok["result"] == "Pump running for 5 s"
    assert ("POST", "/pump", {"action": "on", "sec": 5}) in board.calls
    with SessionLocal() as db:
        db.get(models.Actuator, pump["id"]).on_until = models.now() + timedelta(seconds=1)
        db.commit()
    d = c.get(base, headers=view).json()[0]
    st = d["actuators"][0]
    assert d["data"]["pumpLeft"] == 4 and d["data"]["status"] == "Manual watering 5 s"
    assert st["state"] == "on" and datetime.fromisoformat(st["on_until"]) - datetime.fromisoformat(d["last_seen"]) == timedelta(seconds=4)
    assert len(c.get(f"/api/plots/{pid}/readings", headers=view).json()) == 2  # pump start saved a sample

    clamped = c.post(cmd, headers=tech, json={"action": "on", "duration_s": 90}).json()
    assert clamped["status"] == "done" and clamped["duration_s"] == 30 and clamped["result"] == "Pump running for 30 s"
    assert ("POST", "/pump", {"action": "on", "sec": 30}) in board.calls

    off = c.post(cmd, headers=tech, json={"action": "off"}).json()
    assert off["status"] == "done" and off["result"] == "Pump stopped" and board.data["pump"] == 0

    assert c.post(f"{base}/{did}/mode", headers=view, json={"auto": True}).status_code == 403
    assert c.post(f"{base}/{did}/mode", headers=owner, json={"auto": True}).json()["mode_auto"] is True and board.data["auto"] == 1
    board.data.update(pump=1, pumpLeft=6, sinceWater=0, status="Watering")
    with SessionLocal() as db:
        db.get(models.Device, did).last_seen = models.now() - timedelta(seconds=2)
        db.commit()
    d = c.get(f"{base}?live=true", headers=view).json()[0]
    assert d["data"]["pump"] is True and d["data"]["pumpLeft"] == 6
    off = c.post(cmd, headers=tech, json={"action": "off"}).json()
    assert off["status"] == "done" and off["result"] == "Pump stopped" and board.data["pump"] == 0 and board.data["auto"] == 1
    assert c.post(f"{base}/{did}/mode", headers=mgr, json={"auto": False}).status_code == 200

    board.data["tank"] = 5
    bridge.poll_once()
    refused = c.post(cmd, headers=tech, json={"action": "on", "duration_s": 5})
    assert refused.status_code == 409
    assert {"tank", "low"} <= set(re.findall(r"\w+", refused.json()["detail"].casefold()))
    board.data["tank"] = 12                                                                       # use the board's own limit (15)
    bridge.poll_once()
    declined = c.post(cmd, headers=tech, json={"action": "on", "duration_s": 5})
    assert declined.status_code == 409
    assert {"tank", "low"} <= set(re.findall(r"\w+", declined.json()["detail"].casefold()))

    board.data.update(tank=70, pump=1, pumpLeft=20)
    bridge.poll_once()
    assert c.post(f"{base}/stop-all", headers=tech).json()["stopping"] == 1 and board.data["pump"] == 0

    def dead(*a, **k):
        raise bridge.BoardUnreachable("The AquaFarm board is unreachable (connection failed)")
    monkeypatch.setattr(bridge, "board_request", dead)
    gone = c.post(cmd, headers=tech, json={"action": "on", "duration_s": 5})
    assert gone.status_code == 503 and "unreachable" in gone.json()["detail"]
    bridge.poll_once()                                                                            # an unreachable board is skipped, not a crash
    assert c.get(base, headers=view).json()[0]["online"] is False
    assert c.delete(f"{base}/{did}", headers=owner).status_code == 204


def test_local_board_until_stop_uses_board_hard_cap(monkeypatch):
    from datetime import timedelta
    from app import bridge

    url = "http://192.168.4.2"
    configure_board(monkeypatch, url)
    board = FakeBoard()
    board.data.update(auto=0, hardCapSec=120)
    monkeypatch.setattr(bridge, "board_request", board.request)
    owner = signup("br-cap@t.io")
    farm = c.post("/api/farms", headers=owner, json={"name": "Board Runtime"}).json()
    base = f"/api/farms/{farm['id']}/devices"
    made = c.post(base, headers=owner, json={"name": "Board", "base_url": url}).json()
    pump_id = made["actuators"][0]["id"]
    cmd = f"{base}/{made['id']}/actuators/{pump_id}/command"
    now = models.now()
    monkeypatch.setattr(models, "now", lambda: now)

    for timed in (3, 5, 10, 15, 30):                                                              # timed runs are unchanged
        started = c.post(cmd, headers=owner, json={"action": "on", "duration_s": timed}).json()
        assert started["status"] == "done" and started["duration_s"] == timed
        assert board.calls[-2] == ("POST", "/pump", {"action": "on", "sec": timed})
        c.post(cmd, headers=owner, json={"action": "off"})

    for requested in (0, -1):
        started = c.post(cmd, headers=owner, json={"action": "on", "duration_s": requested}).json()
        assert started["status"] == "done" and started["duration_s"] == 0
        assert started["result"] == "Pump running until you press Stop"
        assert board.calls[-2] == ("POST", "/pump", {"action": "on", "sec": 0})
        assert c.get(base, headers=owner).json()[0]["data"]["pumpLeft"] == 119
        with SessionLocal() as db:
            assert bridge.aware(db.get(models.Actuator, pump_id).on_until) == now + timedelta(seconds=120)
        if requested == 0:
            assert c.post(cmd, headers=owner, json={"action": "off"}).json()["result"] == "Pump stopped"
            assert board.data["pump"] == 0

    now += timedelta(seconds=119)
    bridge.poll_once(poll=False)
    assert board.data["pump"] == 1
    now += timedelta(seconds=1)
    bridge.poll_once(poll=False)
    assert board.data["pump"] == 0


def test_board_flags_arrive_as_booleans(monkeypatch):
    from app import bridge, models
    from app.db import SessionLocal
    configure_board(monkeypatch)
    owner = signup("fl@t.io")
    fid = c.post("/api/farms", headers=owner, json={"name": "Flags"}).json()["id"]
    created = c.post(f"/api/farms/{fid}/devices", headers=owner, json={"name": "Board", "base_url": "http://192.168.4.1"})
    assert created.status_code == 200, created.text
    made = created.json()
    board = FakeBoard()
    board.data.update(tank=0, tankFault=1, soil=100, soilFault=1, alarm=1, auto=0, status="Manual mode: pump disabled")
    del board.data["tankMin"], board.data["soilNeed"]
    limits = {"manualMaxSec": 25, "hardCapSec": 240, "soilEmergency": 12, "pumpMs": 4500, "emergencyMs": 1700,
              "soakWait": 450000, "hotC": 34.5, "humidSkip": 88, "apSsid": "Aqua-Test", "version": "standalone-1.1.0"}
    board.data.update(limits)
    monkeypatch.setattr(bridge, "board_request", board.request)
    with SessionLocal() as db:
        d = db.get(models.Device, made["id"])
        bridge.snapshot(db, d)
    got = c.get(f"/api/farms/{fid}/devices", headers=owner).json()[0]
    assert got["alarm"] is True and got["mode_auto"] is False and got["status_text"] == "Manual mode: pump disabled"
    assert got["data"]["rain"] is False and got["data"]["pump"] is False and got["data"]["auto"] is False and got["data"]["alarm"] is True
    assert got["data"]["tankFault"] is True and got["data"]["soilFault"] is True
    assert got["data"]["soilRaw"] == 2400 and got["data"]["tankMin"] == 15 and got["data"]["soilNeed"] == 35
    assert {key: got["data"][key] for key in limits} == limits
    assert got["actuators"][0]["state"] == "off"


def test_account_types_and_profiles():
    def reg(email, kind=None):
        body = {"email": email, "password": "password1", "name": email.split("@")[0].title()}
        if kind:
            body["account_type"] = kind
        r = c.post("/api/auth/register", json=body)
        assert r.status_code == 200, r.text
        tok = c.post("/api/auth/login", json={"email": email, "password": "password1"}).json()["access_token"]
        return r.json(), {"Authorization": f"Bearer {tok}"}
    farmer, fh = reg("pf1@t.io")
    worker, wh = reg("pf2@t.io", "worker")
    other, oh = reg("pf3@t.io", "worker")
    assert farmer["account_type"] == "farmer" and worker["account_type"] == "worker"
    assert c.post("/api/auth/register", json={"email": "pf4@t.io", "password": "password1", "account_type": "boss"}).status_code == 422

    me = c.get("/api/auth/me", headers=wh).json()
    assert me["account_type"] == "worker" and me["farm_count"] == 0
    c.post("/api/farms", headers=fh, json={"name": "PF farm"})
    assert c.get("/api/auth/me", headers=fh).json()["farm_count"] == 1

    mine = c.get("/api/profile/me", headers=wh).json()
    assert mine["looking_for_work"] is True and mine["visibility"] == "public" and mine["radius_km"] == 50 and mine["complete"] is False
    assert c.get("/api/profile/me", headers=fh).json()["looking_for_work"] is False

    good = {"headline": "Olive picker, 6 seasons", "bio": "I work fast and careful.", "governorate": "Beja", "visibility": "public",
            "radius_km": 80, "looking_for_work": True, "kinds": ["period", "task", "period"], "skills": ["Olive picking", " Pruning ", "olive picking"],
            "languages": ["Arabic", "French"], "availability": "From December"}
    for bad in [{**good, "governorate": "Mars"}, {**good, "radius_km": 0}, {**good, "radius_km": 900}, {**good, "kinds": ["forever"]},
                {**good, "skills": ["x" * 31]}, {**good, "skills": [""]}, {**good, "visibility": "secret"}, {**good, "headline": "x" * 121}]:
        assert c.put("/api/profile/me", headers=wh, json=bad).status_code == 422
    saved = c.put("/api/profile/me", headers=wh, json=good).json()
    assert saved["skills"] == ["Olive picking", "Pruning"] and saved["kinds"] == ["period", "task"] and saved["complete"] is True
    assert "email" in saved and saved["farm_count"] == 0

    seen = c.get(f"/api/profiles/{worker['id']}", headers=oh).json()
    assert seen["headline"] == "Olive picker, 6 seasons" and "email" not in seen and "farm_count" not in seen
    assert c.get(f"/api/profiles/{worker['id']}").status_code == 401
    assert c.get("/api/profiles/99999", headers=oh).status_code == 404

    c.put("/api/profile/me", headers=wh, json={**good, "visibility": "private"})
    assert c.get(f"/api/profiles/{worker['id']}", headers=oh).status_code == 404                 # private: hidden from others
    assert c.get(f"/api/profiles/{worker['id']}", headers=wh).status_code == 200                 # but visible to the owner

    from app.db import SessionLocal
    from app import models
    with SessionLocal() as db:
        db.query(models.User).filter_by(email="pf3@t.io").one().role = "admin"; db.commit()
    adm = {"Authorization": "Bearer " + c.post("/api/auth/login", json={"email": "pf3@t.io", "password": "password1"}).json()["access_token"]}
    assert c.get(f"/api/profiles/{worker['id']}", headers=adm).status_code == 200                 # admins can review reported profiles


def test_farmer_wizard_sketch_and_ai(monkeypatch, tmp_path):
    import base64
    from app import ai
    from app.config import settings
    monkeypatch.setattr(settings, "private_dir", str(tmp_path))
    owner, viewer, stranger = signup("wz1@t.io"), signup("wz2@t.io"), signup("wz3@t.io")
    body = {"draft_key": "a" * 32,
            "farm": {"name": "  Domaine Test  ", "governorate": "Nabeul", "area_m2": 43125.5,
                     "description": "Citrus and a few olive trees near the sea."},
            "plots": [{"crop": "citrus", "area_m2": 20000, "irrigation": "drip", "soil_type": "loam"}, {"crop": "citrus", "area_m2": 5000},
                      {"name": "Old olives", "crop": "olives", "area_m2": 12000, "irrigation": "flood", "soil_type": "clay_loam"}],
            "water_sources": [{"kind": "well", "refill_l_per_day": 40000}, {"kind": "tank", "capacity_l": 20000, "level_l": 8000, "name": "Hill tank"}],
            "livestock": [{"species": "sheep", "count": 30, "place": "Hill pasture"}]}
    for bad in [{**body, "farm": {**body["farm"], "governorate": "Mars"}}, {**body, "farm": {**body["farm"], "name": "  "}},
                {**body, "sketch": "not a picture"}, {**body, "livestock": [{"species": "sheep", "count": 1.5}]},
                {**body, "plots": [{"crop": "bananas", "area_m2": 100}]}, {**body, "plots": [{"crop": "citrus", "area_m2": 0}]},
                {**body, "water_sources": [{"kind": "tank", "capacity_l": 100, "level_l": 500}]},
                {**body, "livestock": [{"species": "sheep", "count": 3}, {"species": "sheep", "count": 4}]}]:
        assert c.post("/api/onboarding/farmer", headers=owner, json=bad).status_code == 422
    assert c.post("/api/onboarding/farmer", json=body).status_code == 401
    assert c.get("/api/farms", headers=owner).json() == []                                   # nothing half-created by the failures
    made = c.post("/api/onboarding/farmer", headers=owner, json=body).json()
    fid = made["farm_id"]
    assert {key: value for key, value in made.items() if key not in {"demo", "entered_by", "updated_by"}} == {
        "farm_id": fid, "name": "Domaine Test", "governorate": "Nabeul",
                    "area_m2": 43125.5, "planted_area_m2": 37000, "plots": 3, "water_sources": 2,
                    "animals": 1, "animal_count": 30}
    assert c.post("/api/onboarding/farmer", headers=owner, json=body).json() == made
    assert c.get("/api/auth/me", headers=owner).json()["farm_count"] == 1
    farm = c.get("/api/farms", headers=owner).json()[0]
    assert farm["region"] == "Nabeul" and abs(farm["lat"] - 36.45) < 0.01 and farm["description"].startswith("Citrus") and farm["has_sketch"] is False
    assert [p["name"] for p in farm["plots"]] == ["Citrus field 1", "Citrus field 2", "Old olives"]
    assert farm["area_m2"] == 43125.5
    assert farm["plots"][1]["area_m2"] == 5000 and farm["plots"][1]["soil_type"] == ""
    water = c.get(f"/api/farms/{fid}/water-sources", headers=owner).json()
    assert water["summary"]["count"] == 2
    sources = {source["kind"]: source for source in water["sources"]}
    assert sources["well"]["level_recorded"] is False and sources["well"]["refill_l_per_day"] == 40000
    assert sources["tank"]["level_l"] == 8000 and sources["tank"]["refill_recorded"] is False
    herd = c.get(f"/api/farms/{fid}/livestock", headers=owner).json()["herds"][0]
    assert herd["count"] == 30 and herd["place"] == "Hill pasture"
    assert c.get(f"/api/farms/{fid}/overview", headers=owner).json()["my_role"] == "owner"

    c.put(f"/api/farms/{fid}/members", headers=owner, json={"email": "wz2@t.io", "role": "viewer"})
    assert c.put(f"/api/farms/{fid}/about", headers=viewer, json={"description": "x"}).status_code == 403
    assert c.put(f"/api/farms/{fid}/about", headers=owner, json={"description": "A new text"}).json()["description"] == "A new text"
    assert c.put(f"/api/farms/{fid}/about", headers=owner, json={"description": "x" * 2001}).status_code == 422

    png = b"\x89PNG\r\n\x1a\n" + b"1" * 80
    up = f"/api/farms/{fid}/sketch"
    assert c.post(up, headers=viewer, json={"data": base64.b64encode(png).decode()}).status_code == 403
    assert c.post(up, headers=owner, json={"data": "!!"}).status_code == 422
    assert c.post(up, headers=owner, json={"data": base64.b64encode(b"GIF89a...").decode()}).status_code == 422
    assert c.post(up, headers=owner, json={"data": base64.b64encode(png + b"0" * (6 * 1024 * 1024)).decode()}).status_code == 413
    assert c.get(up, headers=owner).status_code == 404
    assert c.post(up, headers=owner, json={"data": base64.b64encode(png).decode()}).json()["has_sketch"] is True
    first = list((tmp_path / "farm-sketches").iterdir())
    assert len(first) == 1 and c.get("/api/farms", headers=owner).json()[0]["has_sketch"] is True
    assert c.get(up, headers=owner).content == png and c.get(up, headers=viewer).status_code == 200      # members can see it
    assert c.get(up, headers=stranger).status_code == 404 and c.get(up).status_code == 401              # nobody else can
    c.post(up, headers=owner, json={"data": base64.b64encode(png + b"2").decode()})
    assert len(list((tmp_path / "farm-sketches").iterdir())) == 1                                         # the old picture was replaced
    assert c.get(f"/uploads/farm-sketches/{first[0].name}").status_code in (404, 405)                    # never served as a public file
    assert c.delete(up, headers=viewer).status_code == 403 and c.delete(up, headers=owner).status_code == 204
    assert list((tmp_path / "farm-sketches").iterdir()) == []

    monkeypatch.setattr(settings, "llm_api_url", "")
    assert c.get("/api/ai/status", headers=owner).json() == {"configured": False}
    assert c.post("/api/onboarding/suggest", headers=owner, json={"description": "two hectares of olives"}).status_code == 503
    monkeypatch.setattr(settings, "llm_api_url", "http://llm.test/v1")
    assert c.get("/api/ai/status", headers=owner).json() == {"configured": True}
    assert c.post("/api/onboarding/suggest", headers=owner, json={}).status_code == 422
    seen = {}

    class R:
        status_code = 200
        def json(self):
            return {"data": {
                "plots": [{"name": "Olive terrace", "crop": "olives", "area_m2": 20000, "irrigation": "drip"}, {"crop": "bananas", "area_m2": 10},
                          {"crop": "wheat", "area_m2": -5, "irrigation": "lasers"}],
                "water_sources": [{"kind": "well", "name": "Old well"}, {"kind": "moat"}], "livestock": [{"species": "goat", "count": 12}],
                "notes": "Areas estimated from the drawing"}}

    def fake(url, headers, json, timeout):
        seen.update(json)
        return R()
    monkeypatch.setattr(ai.httpx, "post", legacy(fake))
    out = c.post("/api/onboarding/suggest", headers=owner, json={"description": "olives and a well", "image": base64.b64encode(png).decode()}).json()
    assert [p["crop"] for p in out["plots"]] == ["olives", "wheat"] and out["plots"][1]["area_m2"] == 1.0 and out["plots"][1]["irrigation"] == "drip"
    assert out["water_sources"] == [{"kind": "well", "name": "Old well", "capacity_l": None}] and out["livestock"] == [{"species": "goat", "count": 12}]
    assert seen["files"][0]["media_type"] == "image/png" and "plots" in seen["schema"]["properties"]
    assert c.post("/api/onboarding/suggest", headers=owner, json={"description": "x", "image": base64.b64encode(b"GIF89a").decode()}).status_code == 422


def test_onboarding_farm_landing_excludes_fixtures(monkeypatch, tmp_path):
    import base64
    from app.config import settings
    from app.security import make_token

    monkeypatch.setattr(settings, "private_dir", str(tmp_path))
    owner = signup("new-farmer@t.io")
    admin = signup("real-admin@t.io", "admin")
    before = signup("other-owner@t.io")
    another = c.post("/api/farms", headers=before, json={"name": "Another farm"}).json()["id"]
    with SessionLocal() as db:
        fixture = models.Farm(name="Nabeul Farm", region="Nabeul", is_fixture=True)
        fixture_account = models.User(email="admin@aqua.test", role="admin", password_hash="")
        db.add_all([fixture, fixture_account])
        db.flush()
        fixture_id, fixture_user_id = fixture.id, fixture_account.id
        db.commit()

    explicit_fixture_login = {"Authorization": f"Bearer {make_token(fixture_user_id)}"}
    assert c.get("/api/farms", headers=owner).json() == []
    assert c.get(f"/api/farms/{fixture_id}/members", headers=admin).status_code == 404
    visible_demo = c.get("/api/farms", headers=explicit_fixture_login).json()
    assert fixture_id in {farm["id"] for farm in visible_demo} and all(farm["demo"] for farm in visible_demo)
    assert c.get(f"/api/farms/{another}/members", headers=explicit_fixture_login).status_code == 404

    drawing = b"\x89PNG\r\n\x1a\n" + b"1" * 80
    body = {"draft_key": "b" * 32, "farm": {"name": "My own farm", "governorate": "Tunis"},
            "sketch": base64.b64encode(drawing).decode()}
    payload = c.post("/api/onboarding/farmer", headers=admin, json=body).json()
    saved = payload["farm_id"]
    assert payload["plots"] == payload["water_sources"] == payload["animals"] == 0
    assert c.post("/api/onboarding/farmer", headers=admin, json=body).json() == payload
    assert c.get(f"/api/farms/{saved}/sketch", headers=admin).content == drawing
    order = [farm["id"] for farm in c.get("/api/farms", headers=admin).json()]
    assert order[0] == saved and another in order and fixture_id not in order


def test_cv_save_file_and_ai_helpers(monkeypatch, tmp_path):
    import base64, io, zipfile
    from app import ai
    from app.config import settings
    monkeypatch.setattr(settings, "private_dir", str(tmp_path))
    me, other = signup("cv1@t.io"), signup("cv2@t.io")
    assert c.get("/api/cv/me", headers=me).json()["cv"] is None
    cv = {"full_name": "Ali Ben Salah", "summary": "Olive picker", "experience": [
              {"role": "Picker", "employer": "Domaine X", "place": "Beja", "start": "2019", "end": "2023", "description": "Hand picking"},
              {"role": "", "employer": "", "place": "", "start": "", "end": "", "description": ""}],
          "education": [{"school": "", "degree": "", "year": ""}], "skills": ["Olives", " olives ", "Pruning"],
          "languages": [{"name": "Arabic", "level": "Native"}, {"name": " ", "level": "x"}], "certifications": ["Pesticide safety"]}
    saved = c.put("/api/cv/me", headers=me, json={"data": cv}).json()
    assert saved["cv"]["skills"] == ["Olives", "Pruning"] and len(saved["cv"]["experience"]) == 1 and saved["cv"]["education"] == []
    assert saved["cv"]["languages"] == [{"name": "Arabic", "level": "Native"}] and saved["source"] == "manual" and saved["has_file"] is False
    for bad in [{"data": {"experience": [{"role": "x" * 81}]}}, {"data": {"skills": ["a"] * 21}}, {"data": cv, "source": "magic"}]:
        assert c.put("/api/cv/me", headers=me, json=bad).status_code == 422
    assert c.get("/api/cv/me").status_code == 401

    assert c.post("/api/cv/me/apply-to-profile", headers=other).status_code == 409
    applied = c.post("/api/cv/me/apply-to-profile", headers=me).json()
    assert applied["skills"] == ["Olives", "Pruning"] and applied["languages"] == ["Arabic"] and applied["headline"] == "Picker"
    assert c.get("/api/profile/me", headers=me).json()["bio"] == "Olive picker"

    up = "/api/cv/me/file"
    b64 = lambda raw: base64.b64encode(raw).decode()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("word/document.xml", "<w:document><w:p><w:t>Ali Ben Salah</w:t></w:p><w:p><w:t>Olive picker 6 years</w:t></w:p></w:document>")
    docx = buf.getvalue()
    pdf = b"%PDF-1.4\n" + b"0" * 200
    assert c.post(up, headers=me, json={"name": "cv.exe", "data": b64(b"MZ\x90\x00\x03" + b"\x00" * 50)}).status_code == 422
    assert c.post(up, headers=me, json={"name": "x", "data": "!!"}).status_code == 422
    assert c.post(up, headers=me, json={"name": "big.pdf", "data": b64(pdf + b"0" * (8 * 1024 * 1024))}).status_code == 413
    assert c.post(up, headers=me, json={"name": "evil.zip", "data": b64(b"PK\x03\x04" + b"0" * 50)}).status_code == 422     # a zip that is not a Word file
    ok = c.post(up, headers=me, json={"name": "My CV (2026).pdf", "data": b64(pdf)}).json()
    assert ok["has_file"] and ok["file_name"] == "My CV (2026).pdf" and ok["file_type"] == "application/pdf"
    assert c.get(up, headers=me).content == pdf and c.get(up, headers=other).status_code == 404 and c.get(up).status_code == 401
    assert len(list((tmp_path / "cv").iterdir())) == 1
    assert c.post(up, headers=me, json={"name": "cv.docx", "data": b64(docx)}).json()["file_type"].endswith("wordprocessingml.document")
    assert len(list((tmp_path / "cv").iterdir())) == 1                                                                        # replaced, not piled up
    assert c.get("/api/cv/me", headers=me).json()["cv"]["full_name"] == "Ali Ben Salah"                                       # a new file keeps the saved CV

    monkeypatch.setattr(settings, "llm_api_url", "")
    assert c.post("/api/cv/me/parse", headers=me, json={}).status_code == 503
    assert c.post("/api/cv/me/describe", headers=me, json={"text": "I picked olives for six years"}).status_code == 503
    monkeypatch.setattr(settings, "llm_api_url", "http://llm.test/v1")
    seen = []

    class R:
        status_code = 200
        def __init__(self, tool_input): self.tool_input = tool_input
        def json(self): return {"data": self.tool_input}

    answer = {"cv": {"full_name": "Ali Ben Salah", "skills": ["Olive picking", "olive picking"], "experience": [{"role": "Picker", "start": "2019"}]},
              "understood": "You picked olives since 2019.", "unsure": ["Where did you work?"]}
    def fake(url, headers, json, timeout):
        seen.append(json)
        return R(answer)
    monkeypatch.setattr(ai.httpx, "post", legacy(fake))
    out = c.post("/api/cv/me/parse", headers=me, json={}).json()
    assert out["proposed"]["skills"] == ["Olive picking"] and out["understood"].startswith("You picked") and out["unsure"] == ["Where did you work?"]
    assert not seen[-1]["files"] and "Olive picker 6 years" in seen[-1]["prompt"]   # docx text was read
    c.post(up, headers=me, json={"name": "cv.pdf", "data": b64(pdf)})
    c.post(up, headers=me, json={"name": "scan.png", "data": b64(b"\x89PNG\r\n\x1a\n" + b"1" * 50)})
    c.post("/api/cv/me/parse", headers=me, json={})
    assert seen[-1]["files"][0]["media_type"] == "image/png"
    c.post(up, headers=me, json={"name": "cv.pdf", "data": b64(pdf)})
    c.post("/api/cv/me/parse", headers=me, json={})
    assert seen[-1]["files"][0]["media_type"] == "application/pdf"
    assert c.post("/api/cv/me/parse", headers=other, json={}).status_code == 409                                                # nothing uploaded
    typed = c.post("/api/cv/me/parse", headers=other, json={"text": "Ali, olive picker"}).json()
    assert "Ali, olive picker" in seen[-1]["prompt"] and typed["proposed"]["full_name"] == "Ali Ben Salah"
    assert c.get("/api/cv/me", headers=me).json()["cv"]["skills"] == ["Olives", "Pruning"]                                    # proposals are never saved

    assert c.post("/api/cv/me/describe", headers=me, json={"text": "short"}).status_code == 422
    assert c.post("/api/cv/me/describe", headers=me, json={"text": "I picked olives for six years near Beja"}).json()["proposed"]["full_name"]
    answer["changes"] = "Changed the start year to 2018."
    ref = c.post("/api/cv/me/refine", headers=me, json={"current": cv, "instruction": "I started in 2018 not 2019"}).json()
    assert ref["changes"] == "Changed the start year to 2018." and "2018 not 2019" in seen[-1]["prompt"]
    answer["cv"] = {"skills": ["x" * 40], "experience": [{"role": "y" * 200}]}
    assert c.post("/api/cv/me/refine", headers=me, json={"current": cv, "instruction": "anything"}).status_code == 502         # unusable AI output is refused

    c.put("/api/profile/me", headers=me, json={"headline": "h", "governorate": "Beja", "visibility": "private"})
    assert c.get(f"/api/cv/{c.get('/api/auth/me', headers=me).json()['id']}", headers=other).status_code == 404
    mid = c.get('/api/auth/me', headers=me).json()["id"]
    assert c.get(f"/api/cv/{mid}", headers=me).json()["has_file"] is True
    c.put("/api/profile/me", headers=me, json={"headline": "h", "governorate": "Beja", "visibility": "public"})
    pub = c.get(f"/api/cv/{mid}", headers=other).json()
    assert pub["cv"]["full_name"] == "Ali Ben Salah" and "has_file" not in pub                                                  # the file stays private
    assert c.delete(up, headers=other).status_code == 204 and c.delete(up, headers=me).status_code == 204
    assert list((tmp_path / "cv").iterdir()) == []


def test_discovery_radius_and_private_apply():
    from datetime import date, timedelta
    def reg(email):
        c.post("/api/auth/register", json={"email": email, "password": "password1", "name": email.split("@")[0].title(), "account_type": "worker"})
        return {"Authorization": "Bearer " + c.post("/api/auth/login", json={"email": email, "password": "password1"}).json()["access_token"]}
    def profile(h, **kw):
        base = {"headline": "Worker", "bio": "", "governorate": "Beja", "visibility": "public", "radius_km": 100, "looking_for_work": True,
                "kinds": [], "skills": [], "languages": [], "availability": ""}
        assert c.put("/api/profile/me", headers=h, json={**base, **kw}).status_code == 200
    farmer, near, far, picky, priv, nolocation = (signup(f"dc{n}@t.io") for n in "fnxpvl")
    tunis_farm = c.post("/api/farms", headers=farmer, json={"name": "Tunis Farm", "region": "Tunis", "lat": 36.80, "lon": 10.18}).json()["id"]
    base = {"description": "x", "kind": "period", "start_date": str(date.today() + timedelta(days=3)), "end_date": str(date.today() + timedelta(days=30)),
            "pay_mode": "negotiable", "workers_needed": 2, "skills": ["Olive picking", "Pruning"], "governorate": "Tunis"}
    j_open = c.post(f"/api/farms/{tunis_farm}/jobs", headers=farmer, json={**base, "title": "Olive harvest crew"}).json()
    j_short = c.post(f"/api/farms/{tunis_farm}/jobs", headers=farmer, json={**base, "title": "Pruning near the city", "radius_km": 30}).json()
    j_task = c.post(f"/api/farms/{tunis_farm}/jobs", headers=farmer, json={**base, "title": "Fix drip lines", "kind": "task", "skills": ["Irrigation"], "end_date": None}).json()
    assert c.post(f"/api/farms/{tunis_farm}/jobs", headers=farmer, json={**base, "title": "Bad radius", "radius_km": 0}).status_code == 422
    assert j_open["radius_km"] is None and j_short["radius_km"] == 30

    # Beja is about 90 km from Tunis. Sfax is about 240 km.
    profile(near, governorate="Beja", radius_km=120, kinds=["period"], skills=["Olive picking"])
    profile(far, governorate="Sfax", radius_km=300, skills=["Pruning"])
    profile(picky, governorate="Beja", radius_km=40)
    profile(priv, governorate="Beja", radius_km=200, visibility="private")
    nl = c.get("/api/opportunities", headers=nolocation)
    assert nl.status_code == 422
    detail = nl.json()["detail"].casefold()
    assert "profile" in detail and re.search(r"\b(?:location|live)\b", detail)
    assert c.get("/api/opportunities").status_code == 401

    got = c.get("/api/opportunities", headers=near).json()
    titles = [i["title"] for i in got["items"]]
    assert got["radius_km"] == 120 and got["location"] == "Beja"
    assert "Olive harvest crew" in titles and "Fix drip lines" in titles and "Pruning near the city" not in titles       # the job's own 30 km reach excludes a worker 90 km away
    assert titles[0] == "Olive harvest crew"                                                                              # skill and kind match first
    top = got["items"][0]
    assert top["matching_skills"] == ["olive picking"] and top["match"] == 3 and 80 < top["distance_km"] < 110 and top["applied"] is False
    assert [i["title"] for i in c.get("/api/opportunities?radius_km=50", headers=near).json()["items"]] == []             # a smaller radius hides them
    assert "Olive harvest crew" in [i["title"] for i in c.get("/api/opportunities?radius_km=500", headers=far).json()["items"]]
    assert [i["title"] for i in c.get("/api/opportunities?radius_km=500&q=drip", headers=far).json()["items"]] == ["Fix drip lines"]
    assert [i["title"] for i in c.get("/api/opportunities?radius_km=500&kinds=task&skills=irrigation", headers=far).json()["items"]][0] == "Fix drip lines"
    assert c.get("/api/opportunities", headers=picky).json()["total"] == 0                                                 # 40 km reach, jobs are 90 km away
    assert c.get("/api/opportunities", headers=farmer).status_code == 422                                                  # the farmer set no location

    assert c.post(f"/api/jobs/{j_open['id']}/applications", headers=priv, json={"message": "I would like to work with you."}).status_code == 403
    assert c.post(f"/api/jobs/{j_open['id']}/applications", headers=near, json={"message": "I would like to work with you."}).status_code == 200
    assert c.get("/api/opportunities", headers=near).json()["items"][0]["applied"] is True
    profile(priv, governorate="Beja", visibility="public")
    assert c.post(f"/api/jobs/{j_open['id']}/applications", headers=priv, json={"message": "Now my profile is public."}).status_code == 200

    cand = f"/api/farms/{tunis_farm}/candidates"
    assert c.get(cand, headers=near).status_code == 404 and c.get(cand).status_code == 401
    names = lambda q="": [i["name"] for i in c.get(f"{cand}?{q}", headers=farmer).json()["items"]]
    assert names("radius_km=120") == ["dcn", "dcv"] or set(names("radius_km=120")) == {"dcn", "dcv"}                          # near and the formerly private one; picky travels only 40 km; far is too far
    assert "dcp" not in names("radius_km=500") and "dcx" in names("radius_km=500")                                         # a 40 km traveller never shows, a 300 km traveller shows when the farmer looks wide
    assert names("radius_km=60") == []                                                                                      # a small farmer radius hides everyone
    with_job = c.get(f"{cand}?radius_km=500&job_id={j_open['id']}", headers=farmer).json()["items"]
    assert [i["name"] for i in with_job][0] == "dcn" and with_job[0]["matching_skills"] == ["olive picking"] and with_job[0]["has_cv"] is False
    assert c.get(f"{cand}?job_id=99999", headers=farmer).status_code == 404
    assert names("radius_km=500&q=zzz") == []
    profile(near, governorate="Beja", radius_km=120, looking_for_work=False)
    assert "dcn" not in names("radius_km=500")                                                                              # not looking for work: not shown
    profile(far, governorate="Sfax", radius_km=300, visibility="private")
    assert "dcx" not in names("radius_km=500")                                                                              # private: not shown


def test_hiring_finish_disapprove_upgrade():
    from datetime import date, timedelta
    def reg(email):
        c.post("/api/auth/register", json={"email": email, "password": "password1", "name": email.split("@")[0].title(), "account_type": "worker"})
        return {"Authorization": "Bearer " + c.post("/api/auth/login", json={"email": email, "password": "password1"}).json()["access_token"]}
    farmer, mgr, w1, w2, w3, stranger = (signup(f"hr{n}@t.io") for n in "fmabcs")
    fid = c.post("/api/farms", headers=farmer, json={"name": "Hire Farm", "region": "Tunis", "lat": 36.8, "lon": 10.18}).json()["id"]
    assert c.put(f"/api/farms/{fid}/members", headers=farmer, json={"email": "hrm@t.io", "role": "manager"}).status_code == 200
    base = {"description": "x", "kind": "task", "pay_mode": "negotiable", "workers_needed": 3, "skills": [], "governorate": "Tunis"}
    job = c.post(f"/api/farms/{fid}/jobs", headers=farmer, json={**base, "title": "Pick olives"}).json()["id"]
    apps = {}
    for n, h in (("a", w1), ("b", w2), ("c", w3)):
        c.put("/api/profile/me", headers=h, json={"headline": "Worker", "governorate": "Beja", "visibility": "public", "radius_km": 100, "looking_for_work": True})
        r = c.post(f"/api/jobs/{job}/applications", headers=h, json={"message": "Hire me please."}); assert r.status_code == 200
        apps[n] = r.json()["id"]
    assert c.get(f"/api/farms/{fid}/engagements", headers=farmer).json() == []
    for n in "abc":
        assert c.patch(f"/api/jobs/applications/{apps[n]}", headers=mgr, json={"status": "accepted"}).status_code == 200
    assert c.patch(f"/api/jobs/applications/{apps['a']}", headers=mgr, json={"status": "accepted"}).status_code == 200      # twice: still one engagement
    engs = c.get(f"/api/farms/{fid}/engagements", headers=farmer).json()
    assert len(engs) == 3 and {e["status"] for e in engs} == {"active"} and {e["kind"] for e in engs} == {"temporary"}
    assert c.get(f"/api/farms/{fid}/engagements", headers=stranger).status_code == 404 and c.get(f"/api/farms/{fid}/engagements").status_code == 401
    by_worker = {e["worker"]["name"]: e["id"] for e in engs}
    ea, eb, ec = by_worker["hra"], by_worker["hrb"], by_worker["hrc"]
    mine = c.get("/api/engagements/mine", headers=w1).json()
    assert len(mine) == 1 and mine[0]["farm"]["name"] == "Hire Farm" and "worker" not in mine[0]
    pub = c.get(f"/api/profiles/{c.get('/api/profile/me', headers=w1).json()['user_id']}", headers=stranger).json()
    assert [(row["farm"], row["title"], row["kind"]) for row in pub["works_at"]] == [("Hire Farm", "Pick olives", "temporary")]
    assert pub["verified_work"] == []
    # only farm managers act; strangers get 404, the worker gets 404
    assert c.post(f"/api/engagements/{ea}/finish", headers=stranger, json={}).status_code == 404
    assert c.post(f"/api/engagements/{ea}/finish", headers=w1, json={}).status_code == 404
    assert c.post(f"/api/engagements/{ea}/finish", headers=mgr, json={"note": "Careful, on time."}).json()["status"] == "finished"
    assert c.post(f"/api/engagements/{ea}/finish", headers=mgr, json={}).status_code == 409
    assert c.post(f"/api/engagements/{eb}/disapprove", headers=mgr, json={"reason": "x"}).status_code == 422
    d = c.post(f"/api/engagements/{eb}/disapprove", headers=mgr, json={"reason": "Did not show up twice."}).json()
    assert d["status"] == "disapproved" and d["reason"] == "Did not show up twice."
    assert c.get("/api/engagements/mine", headers=w2).json()[0]["reason"] == "Did not show up twice."
    # upgrade: only finished temporary work, once
    assert c.post(f"/api/engagements/{ec}/upgrade", headers=mgr).status_code == 409
    up = c.post(f"/api/engagements/{ea}/upgrade", headers=farmer).json()
    assert up["kind"] == "full_time" and up["status"] == "active" and up["upgraded_from_id"] == ea
    assert c.post(f"/api/engagements/{ea}/upgrade", headers=farmer).status_code == 409
    pub = c.get(f"/api/profiles/{c.get('/api/profile/me', headers=w1).json()['user_id']}", headers=stranger).json()
    assert pub["works_at"][0]["kind"] == "full_time" and pub["verified_work"][0]["note"] == "Careful, on time."
    # declining an accepted application withdraws the active engagement
    assert c.patch(f"/api/jobs/applications/{apps['c']}", headers=mgr, json={"status": "declined"}).status_code == 200
    assert c.get("/api/engagements/mine", headers=w3).json()[0]["status"] == "disapproved"
    assert [e["status"] for e in c.get(f"/api/farms/{fid}/engagements?status=active", headers=farmer).json()] == ["active"]


def test_chat_between_farm_and_worker():
    farmer, mgr, viewer, worker, other, stranger = (signup(f"ch{n}@t.io") for n in "fmvwos")
    fid = c.post("/api/farms", headers=farmer, json={"name": "Chat Farm", "region": "Tunis", "lat": 36.8, "lon": 10.18}).json()["id"]
    for email, role in (("chm@t.io", "manager"), ("chv@t.io", "viewer")):
        assert c.put(f"/api/farms/{fid}/members", headers=farmer, json={"email": email, "role": role}).status_code == 200
    job = c.post(f"/api/farms/{fid}/jobs", headers=farmer, json={"title": "Water the fields", "kind": "task", "governorate": "Tunis"}).json()["id"]
    for h in (worker, other):
        c.put("/api/profile/me", headers=h, json={"headline": "Worker", "governorate": "Beja", "visibility": "public", "radius_km": 100, "looking_for_work": True})
    a = c.post(f"/api/jobs/{job}/applications", headers=worker, json={"message": "Hire me please."}).json()["id"]
    assert c.get("/api/messages/unread", headers=worker).json() == {"total": 0, "by_engagement": {}}
    assert c.patch(f"/api/jobs/applications/{a}", headers=farmer, json={"status": "accepted"}).status_code == 200
    eid = c.get("/api/engagements/mine", headers=worker).json()[0]["id"]
    url = f"/api/engagements/{eid}/messages"
    # only the worker and farm managers take part
    for h in (viewer, other, stranger):
        assert c.get(url, headers=h).status_code == 404 and c.post(url, headers=h, json={"body": "hi"}).status_code == 404
    assert c.get(url).status_code == 401 and c.post(url, headers=worker, json={"body": "   "}).status_code == 422
    assert c.post(url, headers=worker, json={"body": "x" * 1001}).status_code == 422
    assert c.post(url, headers=farmer, json={"body": "Welcome, start Monday at 7."}).json()["mine"] is True
    assert c.post(url, headers=mgr, json={"body": "Bring boots."}).status_code == 200
    assert c.get("/api/messages/unread", headers=worker).json() == {"total": 2, "by_engagement": {str(eid): 2}}
    assert c.get("/api/messages/unread", headers=farmer).json()["total"] == 0                       # my own messages are never unread
    t = c.get("/api/messages/threads", headers=worker).json()
    assert len(t) == 1 and t[0]["unread"] == 2 and t[0]["with"] == "Chat Farm" and t[0]["last_message"] == "Bring boots." and t[0]["side"] == "worker"
    thread = c.get(url, headers=worker).json()
    assert [m["body"] for m in thread] == ["Welcome, start Monday at 7.", "Bring boots."] and not any(m["mine"] for m in thread)
    assert c.get("/api/messages/unread", headers=worker).json()["total"] == 0                       # opening the thread reads it
    assert c.post(url, headers=worker, json={"body": "Thank you, see you Monday."}).status_code == 200
    assert c.get("/api/messages/unread", headers=mgr).json()["total"] == 1 and c.get("/api/messages/unread", headers=farmer).json()["total"] == 1
    ft = c.get("/api/messages/threads", headers=mgr).json()
    assert len(ft) == 1 and ft[0]["side"] == "farm" and ft[0]["with"] == "chw" and ft[0]["unread"] == 1
    assert [m["mine"] for m in c.get(url, headers=mgr).json()] == [False, True, False]
    assert c.get("/api/messages/unread", headers=mgr).json()["total"] == 0
    assert c.get("/api/messages/threads", headers=viewer).json() == [] and c.get("/api/messages/threads", headers=stranger).json() == []


def test_reports_admin_queue_and_suspend():
    admin = signup("rpadmin@t.io", role="admin")
    farmer, worker, rando, private = (signup(f"rp{n}@t.io") for n in "fwrp")
    fid = c.post("/api/farms", headers=farmer, json={"name": "Report Farm", "region": "Tunis", "lat": 36.8, "lon": 10.18}).json()["id"]
    job = c.post(f"/api/farms/{fid}/jobs", headers=farmer, json={"title": "Harvest help", "kind": "task", "governorate": "Tunis"}).json()["id"]
    c.put("/api/profile/me", headers=worker, json={"headline": "Worker", "governorate": "Beja", "visibility": "public", "radius_km": 100, "looking_for_work": True})
    c.put("/api/profile/me", headers=private, json={"headline": "Hidden", "governorate": "Beja", "visibility": "private", "radius_km": 100})
    a = c.post(f"/api/jobs/{job}/applications", headers=worker, json={"message": "Hire me please."}).json()["id"]
    c.patch(f"/api/jobs/applications/{a}", headers=farmer, json={"status": "accepted"})
    eid = c.get("/api/engagements/mine", headers=worker).json()[0]["id"]
    uid = lambda h: c.get("/api/profile/me", headers=h).json()["user_id"]
    wid, fid_user, pid = uid(worker), uid(farmer), uid(private)
    good = {"target_user_id": wid, "reason": "no_show", "details": "Did not come on the agreed day, no message.", "engagement_id": eid}
    assert c.post("/api/reports", json=good).status_code == 401
    assert c.post("/api/reports", headers=farmer, json={**good, "details": "short"}).status_code == 422
    assert c.post("/api/reports", headers=farmer, json={**good, "reason": "weather"}).status_code == 422
    assert c.post("/api/reports", headers=farmer, json={**good, "target_user_id": fid_user}).status_code == 422          # not yourself
    assert c.post("/api/reports", headers=rando, json=good).status_code == 404                                           # not part of that work
    assert c.post("/api/reports", headers=rando, json={**good, "target_user_id": pid, "engagement_id": None}).status_code == 404   # private stranger
    r = c.post("/api/reports", headers=farmer, json=good)
    assert r.status_code == 200 and r.json()["status"] == "open" and "reporter" not in r.json()
    assert c.post("/api/reports", headers=farmer, json=good).status_code == 409                                          # one open report per person
    assert c.post("/api/reports", headers=worker, json={"target_user_id": fid_user, "reason": "scam", "details": "Asked me to pay a fee first.", "engagement_id": eid}).status_code == 200
    assert c.post("/api/reports", headers=rando, json={"target_user_id": wid, "reason": "harassment", "details": "Sent me rude messages repeatedly."}).status_code == 200   # public profile
    mine = c.get("/api/reports/mine", headers=farmer).json()
    assert len(mine) == 1 and mine[0]["target"]["name"] == "rpw"
    # admin queue
    assert c.get("/api/admin/reports", headers=farmer).status_code == 403 and c.get("/api/admin/reports").status_code == 401
    q = c.get("/api/admin/reports", headers=admin).json()
    assert len(q) == 3 and q[0]["reporter"]["email"] and {x["target"]["reports_against"] for x in q if x["target"]["id"] == wid} == {2}
    assert len(c.get("/api/admin/reports?status=resolved", headers=admin).json()) == 0
    rid = next(x["id"] for x in q if x["reporter"]["email"] == "rpf@t.io")
    assert c.patch(f"/api/admin/reports/{rid}", headers=farmer, json={"status": "resolved"}).status_code == 403
    assert c.patch("/api/admin/reports/9999", headers=admin, json={"status": "resolved"}).status_code == 404
    done = c.patch(f"/api/admin/reports/{rid}", headers=admin, json={"status": "resolved", "admin_note": "Confirmed, account suspended.", "suspend": True}).json()
    assert done["status"] == "resolved" and done["resolved_at"] and done["target"]["active"] is False
    # suspended: locked out everywhere, login refused
    assert c.get("/api/farms", headers=worker).status_code == 401
    assert c.post("/api/auth/login", json={"email": "rpw@t.io", "password": "password1"}).status_code == 401
    assert c.get("/api/reports/mine", headers=farmer).json()[0]["admin_note"] == "Confirmed, account suspended."
    # lift the suspension
    back = c.patch(f"/api/admin/reports/{rid}", headers=admin, json={"suspend": False}).json()
    assert back["target"]["active"] is True and c.post("/api/auth/login", json={"email": "rpw@t.io", "password": "password1"}).status_code == 200
    # daily rate limit: 5 per reporter
    spam = signup("rpspam@t.io")
    for i in range(5):
        t = signup(f"rpt{i}@t.io"); tid = uid(t)
        assert c.post("/api/reports", headers=spam, json={"target_user_id": tid, "reason": "other", "details": "Something about this person."}).status_code == 200
    t6 = signup("rpt6@t.io")
    assert c.post("/api/reports", headers=spam, json={"target_user_id": uid(t6), "reason": "other", "details": "One report too many today."}).status_code == 429


def test_worker_home_and_switching_sides():
    farmer, worker = signup("sw_f@t.io"), signup("sw_w@t.io")
    assert c.get("/api/home/worker").status_code == 401 and c.put("/api/account/type", json={"account_type": "worker"}).status_code == 401
    assert c.put("/api/account/type", headers=worker, json={"account_type": "pilot"}).status_code == 422
    fid = c.post("/api/farms", headers=farmer, json={"name": "Switch Farm", "region": "Tunis", "lat": 36.8, "lon": 10.18}).json()["id"]
    job = c.post(f"/api/farms/{fid}/jobs", headers=farmer, json={"title": "Plant seedlings", "kind": "task", "governorate": "Tunis"}).json()["id"]
    h = c.get("/api/home/worker", headers=worker).json()
    assert h["active_work"] == [] and h["opportunities_nearby"] is None and h["has_farm"] is False and h["profile"]["complete"] is False
    assert h["applications"] == {"pending": 0, "accepted": 0, "declined": 0, "total": 0} and h["unread_messages"] == 0
    c.put("/api/profile/me", headers=worker, json={"headline": "Planter", "governorate": "Beja", "visibility": "public", "radius_km": 150, "looking_for_work": True})
    assert c.get("/api/home/worker", headers=worker).json()["opportunities_nearby"] >= 1
    a = c.post(f"/api/jobs/{job}/applications", headers=worker, json={"message": "I can start now."}).json()["id"]
    h = c.get("/api/home/worker", headers=worker).json()
    assert h["applications"]["pending"] == 1 and h["profile"]["complete"] is True and h["opportunities_nearby"] >= 1
    c.patch(f"/api/jobs/applications/{a}", headers=farmer, json={"status": "accepted"})
    eid = c.get("/api/engagements/mine", headers=worker).json()[0]["id"]
    c.post(f"/api/engagements/{eid}/messages", headers=farmer, json={"body": "Welcome aboard."})
    h = c.get("/api/home/worker", headers=worker).json()
    assert [w["title"] for w in h["active_work"]] == ["Plant seedlings"] and h["unread_messages"] == 1 and h["applications"]["accepted"] == 1
    # a worker becomes a farmer too: the account type flips, nothing is lost
    sw = c.put("/api/account/type", headers=worker, json={"account_type": "farmer"}).json()
    assert sw == {"account_type": "farmer", "farm_count": 0, "has_farm": False}
    assert c.get("/api/auth/me", headers=worker).json()["account_type"] == "farmer"
    assert c.post("/api/farms", headers=worker, json={"name": "My Own Farm", "region": "Beja"}).status_code == 200
    assert c.get("/api/home/worker", headers=worker).json()["has_farm"] is True and len(c.get("/api/engagements/mine", headers=worker).json()) == 1
    # and a farmer can apply for jobs: the farmer gets the worker side with their own CV and applications
    job2 = c.post(f"/api/farms/{fid}/jobs", headers=farmer, json={"title": "Prune vines", "kind": "task", "governorate": "Tunis"}).json()["id"]
    assert c.post(f"/api/jobs/{job2}/applications", headers=worker, json={"message": "I also know pruning."}).status_code == 200
    assert c.put("/api/account/type", headers=farmer, json={"account_type": "worker"}).json()["has_farm"] is True
    assert c.post(f"/api/jobs/{job2}/applications", headers=farmer, json={"message": "My own post, should fail."}).status_code == 409


def test_ai_inlines_schema_refs():
    """Pydantic nests $defs inside properties. The AI helper must copy them in and close every object."""
    from app.routers.cv import CV_TOOL
    from app import ai
    flat = ai.inline_refs(CV_TOOL["input_schema"])
    text = str(flat)
    assert "$ref" not in text and "$defs" not in text
    lang = flat["properties"]["cv"]["properties"]["languages"]["items"]
    assert set(lang["properties"]) == {"name", "level"} and lang["additionalProperties"] is False          # the model cannot invent a "language" key
    assert flat["properties"]["cv"]["properties"]["experience"]["items"]["properties"]["employer"]["type"] == "string"


def test_local_board_registration(monkeypatch):
    from app.config import settings
    h = signup("board@t.io")
    fid = c.post("/api/farms", headers=h, json={"name": "B"}).json()["id"]
    url = f"/api/farms/{fid}/devices"
    # nothing pinned: any valid private address is accepted
    monkeypatch.setattr(settings, "aquafarm_bridge_enabled", False)
    r = c.post(url, headers=h, json={"name": "Board", "base_url": "http://192.168.4.91"})
    assert r.status_code == 200 and r.json()["id"]
    assert c.get(f"/api/farms/{fid}/board-address", headers=h).json() == {"url": None}
    # same address again -> 409
    assert c.post(url, headers=h, json={"name": "Dup", "base_url": "http://192.168.4.91"}).status_code == 409
    # pinned: must match
    monkeypatch.setattr(settings, "aquafarm_bridge_enabled", True)
    monkeypatch.setattr(settings, "aquafarm_bridge_url", "http://192.168.4.92")
    assert c.get(f"/api/farms/{fid}/board-address", headers=h).json() == {"url": "http://192.168.4.92"}
    assert c.post(url, headers=h, json={"name": "Bad", "base_url": "http://192.168.4.93"}).status_code == 422
    ok = c.post(url, headers=h, json={"name": "Good", "base_url": "http://192.168.4.92"})
    assert ok.status_code == 200 and ok.json()["id"]
    assert c.post(url, headers=h, json={"name": "Dup2", "base_url": "http://192.168.4.92"}).status_code == 409


def test_animals_soil_and_activity_log(monkeypatch):
    from app import forecast as fc
    from app.routers import farms as farms_mod
    monkeypatch.setattr(fc, "get_forecast", lambda lat, lon: {"daily": [{"rain_mm": 3.0}] * 7, "alerts": []})
    monkeypatch.setattr(farms_mod, "forecast", lambda lat, lon: {"rain_prob": 5, "rain_mm": 0, "max_temp": 30, "max_wind": 5})
    owner, tech, view, stranger = (signup(f"fl{n}@t.io") for n in "otvs")
    fid = c.post("/api/farms", headers=owner, json={"name": "Life Farm", "region": "Beja", "lat": 36.73, "lon": 9.18}).json()["id"]
    for email, role in (("flt@t.io", "technician"), ("flv@t.io", "viewer")):
        assert c.put(f"/api/farms/{fid}/members", headers=owner, json={"email": email, "role": role}).status_code == 200
    # animals: same species in two places are one group
    h = f"/api/farms/{fid}/livestock"
    assert c.post(h, headers=owner, json={"species": "dairy_cow", "count": 12, "place": "North barn"}).status_code == 200
    assert c.post(h, headers=owner, json={"species": "dairy_cow", "count": 8, "place": "River pasture"}).status_code == 200
    assert c.post(h, headers=owner, json={"species": "dairy_cow", "count": 3, "place": "North barn"}).status_code == 409        # same species and place twice
    assert c.post(h, headers=owner, json={"species": "sheep", "count": 40}).status_code == 200
    g = c.get(f"/api/farms/{fid}/animals", headers=view).json()
    cows = next(x for x in g["groups"] if x["species"] == "dairy_cow")
    assert cows["total"] == 20 and {p["place"]: p["count"] for p in cows["places"]} == {"North barn": 12, "River pasture": 8} and cows["litres_per_day"] == 2000
    assert g["total_animals"] == 60 and g["places"] == ["North barn", "River pasture"]
    assert g["groups"][0]["species"] == "sheep"
    assert c.get(f"/api/farms/{fid}/animals", headers=stranger).status_code == 404
    hid = next(p["herd_id"] for p in cows["places"] if p["place"] == "River pasture")
    assert c.patch(f"{h}/{hid}", headers=owner, json={"count": 8, "place": "North barn"}).status_code == 409                    # moving into an occupied place
    assert c.patch(f"{h}/{hid}", headers=owner, json={"count": 9, "place": "South pen"}).json()["place"] == "South pen"
    # soil: predicted first, then chosen, then back to predicted
    s = c.get(f"/api/farms/{fid}/soil", headers=view).json()
    assert s["source"] == "predicted" and s["soil"]["key"] == "vertisol" and s["governorate"] == "Beja" and s["reasons"] and s["live"]["rain_next_7_days_mm"] == 21.0
    assert any(x["key"] == "saline" for x in c.get("/api/soils", headers=view).json()["soils"]) and c.get("/api/soils").status_code == 401
    assert c.put(f"/api/farms/{fid}/soil", headers=tech, json={"soil_key": "alluvial"}).status_code == 403
    assert c.put(f"/api/farms/{fid}/soil", headers=owner, json={"soil_key": "moonrock"}).status_code == 422
    chosen = c.put(f"/api/farms/{fid}/soil", headers=owner, json={"soil_key": "alluvial", "description": "Dark and deep near the wadi"}).json()
    assert chosen["source"] == "farmer" and chosen["soil"]["key"] == "alluvial" and chosen["description"].startswith("Dark") and chosen["predicted"]["soil"]["key"] == "vertisol"
    assert c.delete(f"/api/farms/{fid}/soil", headers=owner).status_code == 204 and c.get(f"/api/farms/{fid}/soil", headers=view).json()["source"] == "predicted"
    # activity: notes by technicians and up, system events are collected
    pid = c.post(f"/api/farms/{fid}/plots", headers=owner, json={"name": "Wheat 1", "crop": "wheat", "area_m2": 5000}).json()["id"]
    assert c.post(f"/api/plots/{pid}/readings", headers=owner, json={"soil_moisture": 20}).status_code == 200
    assert c.post(f"/api/plots/{pid}/decide", headers=owner).json()["recorded"] is True
    a = f"/api/farms/{fid}/activity"
    assert c.post(a, headers=view, json={"kind": "harvest", "title": "Harvested the north rows"}).status_code == 403
    assert c.post(a, headers=stranger, json={"title": "Hello there"}).status_code == 404
    assert c.post(a, headers=tech, json={"kind": "spraying", "title": "Sprayed olives", "plot_id": 999999}).status_code == 422
    note = c.post(a, headers=tech, json={"kind": "spraying", "title": "Sprayed the wheat", "detail": "Copper, early morning", "plot_id": pid}).json()
    assert note["source"] == "manual" and note["plot"] == "Wheat 1" and note["who"] == "flt"
    log = c.get(a, headers=view).json()
    kinds = {i["id"].split("-")[0] for i in log["items"]}
    assert {"decision", "note"} <= kinds and log["total"] >= 2 and log["counts"]["spraying"] == 1
    assert c.get(f"{a}?days=0", headers=view).status_code == 422
    nid = int(note["id"].split("-")[1])
    assert c.delete(f"{a}/{nid}", headers=view).status_code == 403 and c.delete(f"{a}/{nid}", headers=tech).status_code == 204


def test_weekly_report_summary_pdf_and_scheduler(monkeypatch, tmp_path):
    from datetime import date, datetime, timedelta, timezone
    from sqlalchemy import select
    from app import weekly
    from app.config import settings
    from app.db import SessionLocal
    monkeypatch.setattr(settings, "llm_api_url", "")                         # advice falls back to the rules
    monkeypatch.setattr(settings, "private_dir", str(tmp_path))
    owner, view, stranger = (signup(f"wk{n}@t.io") for n in "ovs")
    fid = c.post("/api/farms", headers=owner, json={"name": "Weekly Farm", "region": "Beja"}).json()["id"]
    assert c.put(f"/api/farms/{fid}/members", headers=owner, json={"email": "wkv@t.io", "role": "viewer"}).status_code == 200
    pid = c.post(f"/api/farms/{fid}/plots", headers=owner, json={"name": "Tomato rows", "crop": "tomatoes", "area_m2": 800}).json()["id"]
    this_monday = weekly.current_week()
    with SessionLocal() as db:
        def at(week_offset, day=1):
            return datetime.combine(this_monday - timedelta(days=7 * week_offset) + timedelta(days=day), datetime.min.time(), tzinfo=timezone.utc).replace(hour=9)
        for off, moist in ((0, [20, 22, 25, 38, 40]), (1, [36, 38, 40, 41, 39]), (2, [30, 35, 41, 42, 44])):
            for i, m in enumerate(moist):
                db.add(models.Reading(plot_id=pid, ts=at(off, i % 6), soil_moisture=m, tank_level=60, temperature=24))
            db.add(models.Decision(plot_id=pid, ts=at(off, 2), action="irrigate", why="Soil dry", litres_saved=0))
            db.add(models.Decision(plot_id=pid, ts=at(off, 3), action="wait", why="Rain coming", litres_saved=600))
        db.commit()
    s = c.get(f"/api/farms/{fid}/reports/weekly", headers=view).json()
    w = s["week"]
    assert w["readings"] == 5 and w["irrigations"] == 1 and w["litres_saved"] == 600 and w["week_start"] == this_monday.isoformat()
    assert w["healthy_share"] == 0.4 and w["mood"] in ("ok", "bad") and w["plots"][0]["target"] > 0                 # 3 of 5 readings were dry
    labels = {r["key"]: r for r in s["comparison"]}
    assert labels["healthy_share"]["this_week"] == 40.0 and labels["healthy_share"]["last_week"] == 100.0 and labels["healthy_share"]["trend"] == "down"
    assert len(labels["score"]["history"]) == 5 and s["weeks_with_data"] == 2
    assert any("Tomato rows" in tip for tip in s["advice"])
    assert w["notes"] == 0
    assert any(
        re.search(r"\bactivit(?:y|ies)\b", tip) and re.search(r"\blog\w*\b", tip)
        for tip in (advice.casefold() for advice in s["advice"])
    )
    assert c.get(f"/api/farms/{fid}/reports/weekly", headers=stranger).status_code == 404 and c.get(f"/api/farms/{fid}/reports/weekly").status_code == 401
    earlier = c.get(f"/api/farms/{fid}/reports/weekly?week={(this_monday - timedelta(days=7)).isoformat()}", headers=view).json()["week"]
    assert earlier["healthy_share"] == 1.0 and earlier["mood"] == "good"
    # the PDF
    assert c.post(f"/api/farms/{fid}/reports/weekly", headers=view, json={}).status_code == 403
    made = c.post(f"/api/farms/{fid}/reports/weekly", headers=owner, json={})
    assert made.status_code == 200 and made.json()["kind"] == "manual" and made.json()["week_start"] == this_monday.isoformat()
    rid = made.json()["id"]
    pdf = c.get(f"/api/farms/{fid}/reports/{rid}/pdf", headers=view)
    assert pdf.status_code == 200 and pdf.content[:5] == b"%PDF-" and len(pdf.content) > 5000 and pdf.headers["content-type"] == "application/pdf"
    assert c.get(f"/api/farms/{fid}/reports/{rid}/pdf", headers=stranger).status_code == 404
    assert [r["id"] for r in c.get(f"/api/farms/{fid}/reports", headers=view).json()["reports"]] == [rid]
    assert c.post(f"/api/farms/{fid}/reports/weekly", headers=owner, json={}).json()["id"] == rid                       # same week again replaces, not duplicates
    # scheduler: makes the missing previous week for farms that have plots, and does it only once
    with SessionLocal() as db:
        before = len(db.scalars(select(models.WeeklyReport).where(models.WeeklyReport.farm_id == fid)).all())
        assert weekly.run_scheduler_once(db) >= 1
        assert any(r.kind == "auto" and r.farm_id == fid for r in db.scalars(select(models.WeeklyReport)).all())
        assert len(db.scalars(select(models.WeeklyReport).where(models.WeeklyReport.farm_id == fid)).all()) == before + 1
        assert weekly.run_scheduler_once(db) == 0                                                                          # nothing new the second time


def test_chat_proposes_farm_changes(monkeypatch):
    from app import forecast as fc
    from app.config import settings
    from app.routers import farms
    from app import ai as ai_mod
    monkeypatch.setattr(fc, "get_forecast", lambda lat, lon: None)
    monkeypatch.setattr(farms, "forecast", lambda lat, lon: {"rain_prob": 5, "rain_mm": 0, "max_temp": 30, "max_wind": 5})
    monkeypatch.setattr(settings, "llm_api_url", "http://llm.test/v1")
    h = signup("cfc@t.io")
    fid = c.post("/api/farms", headers=h, json={"name": "CFC"}).json()["id"]
    c.post(f"/api/farms/{fid}/livestock", headers=h, json={"species": "sheep", "count": 10, "place": "pasture"})
    seen = {}

    class R:
        status_code = 200
        def json(self):
            return {"data": {"reply": "Prepared.", "farm_changes": [
                {"kind": "add_animals", "species": "dairy_cow", "count": 1, "place": ""},
                {"kind": "add_animals", "species": "sheep", "count": 5, "place": "pasture"},
                {"kind": "add_animals", "species": "dragon", "count": 1},          # unknown species: dropped
                {"kind": "add_animals", "species": "goat", "count": 0},            # bad count: dropped
                {"kind": "delete_farm"},                                           # unknown action: dropped
            ]}}

    def fake_post(url, headers, json, timeout):
        seen.update(json); return R()
    monkeypatch.setattr(ai_mod.httpx, "post", legacy(fake_post))
    r = c.post(f"/api/farms/{fid}/chat", headers=h, json={"messages": [{"role": "user", "content": "add a cow and 5 sheep to the pasture"}]}).json()
    ch = r["proposed_changes"]
    assert [x["request"]["method"] for x in ch] == ["POST", "PATCH"]
    assert ch[0]["request"]["body"] == {"species": "dairy_cow", "count": 1, "place": ""} and ch[0]["summary"] == "Add 1 dairy cow"
    assert ch[1]["request"]["body"] == {"count": 15} and "10 now, 15 after" in ch[1]["summary"]
    # nothing is written until the farmer approves
    herds = c.get(f"/api/farms/{fid}/livestock", headers=h).json()["herds"]
    assert [(x["species"], x["count"]) for x in herds] == [("sheep", 10)]
    # the exact request on a card works with the farmer's own login
    for x in ch:
        q = x["request"]
        assert c.request(q["method"], q["path"], headers=h, json=q["body"]).status_code == 200
    herds = {x["species"]: x["count"] for x in c.get(f"/api/farms/{fid}/livestock", headers=h).json()["herds"]}
    assert herds == {"sheep": 15, "dairy_cow": 1}
    assert "farm_changes" in seen["system"] and "one task per worker" in seen["system"]


def test_chat_farm_changes_everything(monkeypatch):
    from app import forecast as fc
    from app.config import settings
    from app.routers import farms
    from app import ai as ai_mod
    monkeypatch.setattr(fc, "get_forecast", lambda lat, lon: None)
    monkeypatch.setattr(farms, "forecast", lambda lat, lon: {"rain_prob": 5, "rain_mm": 0, "max_temp": 30, "max_wind": 5})
    monkeypatch.setattr(settings, "llm_api_url", "http://llm.test/v1")
    h, viewer = signup("cfe@t.io"), signup("cfv@t.io")
    fid = c.post("/api/farms", headers=h, json={"name": "CFE", "region": "Nabeul"}).json()["id"]
    c.put(f"/api/farms/{fid}/members", headers=h, json={"email": "cfv@t.io", "role": "viewer"})
    c.post(f"/api/farms/{fid}/plots", headers=h, json={"name": "North", "crop": "tomatoes", "area_m2": 300})
    c.post(f"/api/farms/{fid}/water-sources", headers=h, json={"kind": "tank", "name": "Tank", "capacity_l": 5000, "level_l": 100})
    changes = [
        {"kind": "add_plot", "plot_name": "South", "crop": "olives", "area_m2": 600, "irrigation": "drip"},
        {"kind": "add_plot", "plot_name": "NoArea", "crop": "olives"},                          # no area: dropped
        {"kind": "add_plot", "plot_name": "Moon", "crop": "moonrock", "area_m2": 5},            # unknown crop: dropped
        {"kind": "update_plot", "plot_name": "north", "crop": "peppers", "area_m2": 500},
        {"kind": "remove_plot", "plot_name": "Ghost"},                                         # no such plot: dropped
        {"kind": "set_soil", "soil_key": "alluvial"},
        {"kind": "set_soil", "soil_key": "lava"},                                              # unknown soil: dropped
        {"kind": "add_water_source", "source_kind": "well", "source_name": "Well", "capacity_l": 1000, "level_l": 5000},  # level above capacity: dropped
        {"kind": "add_water_source", "source_kind": "well", "source_name": "Well", "capacity_l": 20000, "level_l": 5000, "refill_l_per_day": 300},
        {"kind": "set_water_level", "source_name": "tank", "level_l": 4000},
        {"kind": "add_worker", "worker_name": "Hedi", "worker_role": "Irrigation"},
        {"kind": "post_job", "job_title": "Olive helpers", "job_kind": "task", "workers_needed": 2, "pay_amount": 50, "pay_unit": "day"},
        {"kind": "log_activity", "title": "Sprayed North", "activity_kind": "spraying", "plot_name": "North"},
        {"kind": "ask_water_seller", "listing_id": 999, "message": "Please deliver water"},      # no such listing: dropped
        {"kind": "format_disk"},                                                               # unknown action: dropped
    ]

    class R:
        status_code = 200
        def json(self): return {"data": {"reply": "Prepared.", "farm_changes": changes[:10]}}

    class R2(R):
        def json(self): return {"data": {"reply": "Prepared.", "farm_changes": changes[10:]}}
    calls = iter([R(), R2()])
    monkeypatch.setattr(ai_mod.httpx, "post", legacy(lambda url, headers, json, timeout: next(calls)))
    ask = lambda who: c.post(f"/api/farms/{fid}/chat", headers=who, json={"messages": [{"role": "user", "content": "do it all"}]})
    first, second = ask(h).json(), ask(h).json()
    cards = first["proposed_changes"] + second["proposed_changes"]
    assert [x["summary"].split(":")[0].split(" ")[0] for x in cards] == ["Add", "Change", "Set", "Add", "Record", "Add", "Post", "Write"]
    assert "could not be prepared" in first["reply"] and "could not be prepared" in second["reply"]
    assert not any("moonrock" in x["summary"] or "Ghost" in x["summary"] for x in cards)
    for x in cards:                                    # approving a card sends its exact request with the farmer's own login
        q = x["request"]
        r = c.request(q["method"], q["path"], headers=h, json=q["body"])
        assert r.status_code < 300, (x["summary"], r.text)
    plots = {p["name"]: p for p in c.get(f"/api/farms/{fid}/plots", headers=h).json()} if c.get(f"/api/farms/{fid}/plots", headers=h).status_code == 200 else {}
    # a viewer who forges a card gets the normal permission refusal
    q = cards[0]["request"]
    assert c.request(q["method"], q["path"], headers=viewer, json=q["body"]).status_code == 403


def test_farm_invites_open_worker():
    def reg(email, kind):
        c.post("/api/auth/register", json={"email": email, "password": "password1", "name": email.split("@")[0].title(), "account_type": kind})
        return {"Authorization": "Bearer " + c.post("/api/auth/login", json={"email": email, "password": "password1"}).json()["access_token"]}
    farmer, other, open_w, closed_w, private_w = reg("iv_f@t.io", "farmer"), reg("iv_o@t.io", "farmer"), reg("iv_a@t.io", "worker"), reg("iv_b@t.io", "worker"), reg("iv_c@t.io", "worker")
    prof = {"headline": "Picker", "governorate": "Nabeul", "radius_km": 100}
    c.put("/api/profile/me", headers=open_w, json={**prof, "visibility": "public", "looking_for_work": True})
    c.put("/api/profile/me", headers=closed_w, json={**prof, "visibility": "public", "looking_for_work": False})
    c.put("/api/profile/me", headers=private_w, json={**prof, "visibility": "private", "looking_for_work": True})
    fid = c.post("/api/farms", headers=farmer, json={"name": "IV", "region": "Nabeul", "lat": 36.4, "lon": 10.7}).json()["id"]
    c.post("/api/farms", headers=other, json={"name": "Other"})
    base = {"description": "x", "kind": "task", "pay_mode": "negotiable", "workers_needed": 1, "skills": [], "governorate": "Nabeul"}
    job = c.post(f"/api/farms/{fid}/jobs", headers=farmer, json={**base, "title": "Pick olives"}).json()["id"]
    uid = lambda h: c.get("/api/auth/me", headers=h).json()["id"]
    inv = lambda who, h=farmer, j=job: c.post(f"/api/farms/{fid}/jobs/{j}/offers", headers=h, json={"user_id": uid(who), "message": "Come work with us"})

    assert inv(closed_w).status_code == 404 and inv(private_w).status_code == 404         # only people open to work
    assert inv(open_w, h=other).status_code == 404 and c.post(f"/api/farms/{fid}/jobs/{job}/offers", json={"user_id": 1}).status_code == 401
    assert inv(open_w, j=99999).status_code == 404
    ok = inv(open_w)
    assert ok.status_code == 200 and ok.json()["status"] == "pending"
    assert inv(open_w).status_code == 409                                                  # not twice
    assert [o["worker"]["name"] for o in c.get(f"/api/farms/{fid}/jobs/offers", headers=farmer).json()] == ["Iv_A"]
    assert c.get(f"/api/farms/{fid}/jobs/offers", headers=other).status_code == 404

    mine = c.get("/api/jobs/my-offers", headers=open_w).json()
    assert len(mine) == 1 and mine[0]["farm_name"] == "IV" and mine[0]["message"] == "Come work with us"
    assert c.get("/api/jobs/my-offers", headers=closed_w).json() == []
    oid = mine[0]["id"]
    assert c.patch(f"/api/jobs/offers/{oid}", headers=closed_w, json={"status": "accepted"}).status_code == 404     # not theirs
    assert c.get(f"/api/farms/{fid}/engagements", headers=farmer).json() == []                                   # nothing until they accept
    r = c.patch(f"/api/jobs/offers/{oid}", headers=open_w, json={"status": "accepted"})
    assert r.status_code == 200 and r.json()["status"] == "accepted"
    engs = c.get(f"/api/farms/{fid}/engagements", headers=farmer).json()
    assert len(engs) == 1 and engs[0]["title"] == "Pick olives" and engs[0]["status"] == "active"
    assert c.get(f"/api/jobs/{job}", headers=farmer).json()["status"] == "filled"
    assert c.patch(f"/api/jobs/offers/{oid}", headers=open_w, json={"status": "declined"}).status_code == 409      # answered once
    assert inv(closed_w).status_code in (404, 409)

    # declining, and withdrawing before an answer
    job2 = c.post(f"/api/farms/{fid}/jobs", headers=farmer, json={**base, "title": "Prune trees"}).json()["id"]
    o2 = inv(open_w, j=job2).json()["id"]
    assert c.patch(f"/api/jobs/offers/{o2}", headers=open_w, json={"status": "declined"}).json()["status"] == "declined"
    assert len(c.get(f"/api/farms/{fid}/engagements", headers=farmer).json()) == 1
    c.put("/api/profile/me", headers=closed_w, json={**prof, "visibility": "public", "looking_for_work": True})
    o3 = inv(closed_w, j=job2).json()["id"]
    assert c.delete(f"/api/farms/{fid}/jobs/offers/{o3}", headers=farmer).status_code == 204
    assert c.get("/api/jobs/my-offers", headers=closed_w).json() == []
    assert inv(closed_w, j=job2).status_code == 200                                         # can be invited again after withdrawing


def test_chat_invites_worker(monkeypatch):
    from app import forecast as fc
    from app.config import settings
    from app.routers import farms
    from app import ai as ai_mod
    monkeypatch.setattr(fc, "get_forecast", lambda lat, lon: None)
    monkeypatch.setattr(farms, "forecast", lambda lat, lon: {"rain_prob": 5, "rain_mm": 0, "max_temp": 30, "max_wind": 5})
    monkeypatch.setattr(settings, "llm_api_url", "http://llm.test/v1")
    c.post("/api/auth/register", json={"email": "ci_w@t.io", "password": "password1", "name": "Wafa Picker", "account_type": "worker"})
    wk = {"Authorization": "Bearer " + c.post("/api/auth/login", json={"email": "ci_w@t.io", "password": "password1"}).json()["access_token"]}
    c.put("/api/profile/me", headers=wk, json={"headline": "Picker", "skills": ["olives"], "governorate": "Nabeul", "visibility": "public", "radius_km": 100, "looking_for_work": True})
    h = signup("ci_f@t.io")
    fid = c.post("/api/farms", headers=h, json={"name": "CI", "region": "Nabeul", "lat": 36.4, "lon": 10.7}).json()["id"]
    c.post(f"/api/farms/{fid}/jobs", headers=h, json={"title": "Pick olives", "kind": "task", "pay_mode": "negotiable", "workers_needed": 1, "skills": [], "governorate": "Nabeul"})
    seen = {}

    class R:
        status_code = 200
        def json(self):
            return {"data": {"reply": "Wafa fits.", "farm_changes": [
                {"kind": "invite_worker", "worker_name": "wafa picker", "job_title": "pick olives", "message": "Join us?"},
                {"kind": "invite_worker", "worker_name": "Nobody Real", "job_title": "Pick olives"},       # not in the list: dropped
                {"kind": "invite_worker", "worker_name": "Wafa Picker", "job_title": "No such job"},       # not an open job: dropped
            ]}}

    def fake_post(url, headers, json, timeout):
        seen.update(json); return R()
    monkeypatch.setattr(ai_mod.httpx, "post", legacy(fake_post))
    r = c.post(f"/api/farms/{fid}/chat", headers=h, json={"messages": [{"role": "user", "content": "who can I hire?"}]}).json()
    assert "Wafa Picker" in seen["system"] and "Pick olives" in seen["system"]
    assert len(r["proposed_changes"]) == 1 and "could not be prepared" in r["reply"]
    q = r["proposed_changes"][0]["request"]
    assert q["method"] == "POST" and q["path"].endswith("/offers") and q["body"]["message"] == "Join us?"
    assert c.request(q["method"], q["path"], headers=h, json=q["body"]).status_code == 200
    assert [o["job_title"] for o in c.get("/api/jobs/my-offers", headers=wk).json()] == ["Pick olives"]


def test_worker_assistant(monkeypatch):
    from app.config import settings
    from app import ai as ai_mod
    monkeypatch.setattr(settings, "llm_api_url", "http://llm.test/v1")
    def reg(email, kind):
        c.post("/api/auth/register", json={"email": email, "password": "password1", "name": email.split("@")[0].title(), "account_type": kind})
        return {"Authorization": "Bearer " + c.post("/api/auth/login", json={"email": email, "password": "password1"}).json()["access_token"]}
    farmer, wk, other = reg("wa_f@t.io", "farmer"), reg("wa_w@t.io", "worker"), reg("wa_o@t.io", "worker")
    fid = c.post("/api/farms", headers=farmer, json={"name": "WA Farm", "region": "Nabeul", "lat": 36.4, "lon": 10.7}).json()["id"]
    base = {"description": "x", "kind": "task", "pay_mode": "negotiable", "workers_needed": 2, "skills": [], "governorate": "Nabeul"}
    j1 = c.post(f"/api/farms/{fid}/jobs", headers=farmer, json={**base, "title": "Pick olives"}).json()["id"]
    j2 = c.post(f"/api/farms/{fid}/jobs", headers=farmer, json={**base, "title": "Prune trees"}).json()["id"]
    c.put("/api/profile/me", headers=wk, json={"headline": "", "governorate": "Nabeul", "visibility": "public", "radius_km": 100, "looking_for_work": False, "skills": ["olives"]})
    c.put("/api/profile/me", headers=other, json={"headline": "x", "governorate": "Nabeul", "visibility": "public", "radius_km": 100, "looking_for_work": True})
    uid = c.get("/api/auth/me", headers=wk).json()["id"]
    c.put("/api/profile/me", headers=wk, json={"headline": "", "governorate": "Nabeul", "visibility": "public", "radius_km": 100, "looking_for_work": True, "skills": ["olives"]})
    oid = c.post(f"/api/farms/{fid}/jobs/{j2}/offers", headers=farmer, json={"user_id": uid, "message": "Please join"}).json()["id"]
    seen = {}

    class R:
        status_code = 200
        def json(self):
            return {"data": {"reply": "Prepared.", "changes": [
                {"kind": "apply_job", "job_id": j1, "message": "I have picked olives for five years and can start Monday."},
                {"kind": "apply_job", "job_id": 99999, "message": "A job that does not exist at all."},     # unknown job: dropped
                {"kind": "apply_job", "job_id": j1, "message": "no"},                                       # too short: dropped
                {"kind": "answer_offer", "offer_id": oid, "answer": "accepted"},
                {"kind": "answer_offer", "offer_id": 99999, "answer": "accepted"},                          # not theirs: dropped
                {"kind": "update_profile", "headline": "Olive picker", "skills": ["olives", "pruning"], "kinds": ["task", "bogus"], "governorate": "Atlantis", "radius_km": 80},
                {"kind": "send_message", "engagement_id": 99999, "message": "Hello"},                       # no such work: dropped
                {"kind": "delete_account"},                                                                 # unknown action: dropped
            ]}}

    def fake_post(url, headers, json, timeout):
        seen.update(json); return R()
    monkeypatch.setattr(ai_mod.httpx, "post", legacy(fake_post))
    ask = lambda who: c.post("/api/me/chat", headers=who, json={"messages": [{"role": "user", "content": "find me work"}]})
    assert c.post("/api/me/chat", json={"messages": [{"role": "user", "content": "hi"}]}).status_code == 401
    r = ask(wk).json()
    assert "Pick olives" in seen["system"] and "Prune trees" in seen["system"] and "WA Farm" in seen["system"] and "Please join" in seen["system"]
    cards = r["proposed_changes"]
    assert [x["request"]["method"] for x in cards] == ["POST", "PATCH", "PUT"] and "could not be prepared" in r["reply"]
    assert cards[2]["request"]["body"]["governorate"] == "Nabeul" and cards[2]["request"]["body"]["kinds"] == ["task"]      # bad values never reach the card
    # nothing happened yet
    assert c.get("/api/jobs/my-applications", headers=wk).json() == [] and c.get("/api/engagements/mine", headers=wk).json() == []
    for x in cards:                                      # approving sends the exact request with the worker's own login
        q = x["request"]
        res = c.request(q["method"], q["path"], headers=wk, json=q["body"])
        assert res.status_code < 300, (x["summary"], res.text)
    assert {a["job_title"]: a["status"] for a in c.get("/api/jobs/my-applications", headers=wk).json()} == {"Pick olives": "pending", "Prune trees": "accepted"}
    assert [e["title"] for e in c.get("/api/engagements/mine", headers=wk).json()] == ["Prune trees"]
    prof = c.get("/api/profile/me", headers=wk).json()
    assert prof["headline"] == "Olive picker" and prof["skills"] == ["olives", "pruning"] and prof["radius_km"] == 80
    # now the assistant sees the work and can write to the farm
    eid = c.get("/api/engagements/mine", headers=wk).json()[0]["id"]
    class R2(R):
        def json(self): return {"data": {"reply": "Ok.", "changes": [{"kind": "send_message", "engagement_id": eid, "message": "I will be 15 minutes late tomorrow."},
                                                                    {"kind": "withdraw_application", "application_id": 99999}]}}
    monkeypatch.setattr(ai_mod.httpx, "post", legacy(lambda url, headers, json, timeout: R2()))
    r2 = ask(wk).json()
    assert len(r2["proposed_changes"]) == 1
    q = r2["proposed_changes"][0]["request"]
    assert c.request(q["method"], q["path"], headers=wk, json=q["body"]).status_code == 200
    assert c.get(f"/api/engagements/{eid}/messages", headers=farmer).json()[-1]["body"] == "I will be 15 minutes late tomorrow."
    # another worker cannot use these cards on someone else's data
    assert c.request("PATCH", f"/api/jobs/offers/{oid}", headers=other, json={"status": "declined"}).status_code == 404
