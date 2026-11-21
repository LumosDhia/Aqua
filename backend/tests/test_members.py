from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.main import app
from app import models

c = TestClient(app)


def _auth(email: str, *, role: str = "user") -> dict[str, str]:
    assert c.post("/api/auth/register", json={"email": email, "password": "password1", "name": email.split("@")[0]}).status_code == 200
    if role != "user":
        with SessionLocal() as db:
            db.query(models.User).filter_by(email=email).one().role = role
            db.commit()
    token = c.post("/api/auth/login", json={"email": email, "password": "password1"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _public(headers: dict[str, str], *, visibility: str = "public") -> None:
    assert c.put("/api/profile/me", headers=headers, json={
        "headline": "Irrigator",
        "bio": "Works olive rows",
        "governorate": "Nabeul",
        "visibility": visibility,
        "radius_km": 40,
        "looking_for_work": True,
        "kinds": ["task"],
        "skills": ["Irrigation"],
        "languages": ["Arabic"],
        "availability": "Weekdays",
    }).status_code == 200


def test_members_lists_public_people_only():
    owner = _auth("mem-owner@t.io")
    public = _auth("mem-public@t.io")
    private = _auth("mem-private@t.io")
    admin = _auth("mem-admin@t.io", role="admin")
    _public(public)
    _public(private, visibility="private")
    _public(admin)
    page = c.get("/api/members", headers=owner)
    assert page.status_code == 200
    ids = {row["user_id"] for row in page.json()["items"]}
    public_id = c.get("/api/auth/me", headers=public).json()["id"]
    private_id = c.get("/api/auth/me", headers=private).json()["id"]
    admin_id = c.get("/api/auth/me", headers=admin).json()["id"]
    assert public_id in ids
    assert private_id not in ids
    assert admin_id not in ids
    assert c.get("/api/members").status_code == 401
