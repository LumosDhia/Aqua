import base64
import binascii
import io
import re
import secrets
import zipfile
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import ai, models
from ..config import settings
from ..db import get_db
from ..farm_access import demo_mode
from ..rbac import current_user
from .profiles import get_or_create

router = APIRouter(prefix="/api", tags=["cv"])

MAX_FILE_BYTES = 8 * 1024 * 1024


class Experience(BaseModel):
    role: str = Field(default="", max_length=80)
    employer: str = Field(default="", max_length=120)
    place: str = Field(default="", max_length=80)
    start: str = Field(default="", max_length=20)
    end: str = Field(default="", max_length=20)
    description: str = Field(default="", max_length=600)


class Education(BaseModel):
    school: str = Field(default="", max_length=120)
    degree: str = Field(default="", max_length=120)
    year: str = Field(default="", max_length=20)


class Language(BaseModel):
    name: str = Field(default="", max_length=30)
    level: str = Field(default="", max_length=30)


class CvData(BaseModel):
    full_name: str = Field(default="", max_length=120)
    summary: str = Field(default="", max_length=1500)
    experience: list[Experience] = Field(default=[], max_length=15)
    education: list[Education] = Field(default=[], max_length=8)
    skills: list[str] = Field(default=[], max_length=20)
    languages: list[Language] = Field(default=[], max_length=6)
    certifications: list[str] = Field(default=[], max_length=8)


class CvSave(BaseModel):
    data: CvData
    source: Literal["manual", "uploaded", "described"] = "manual"


class FileIn(BaseModel):
    name: str = Field(max_length=120)
    data: str


class ParseIn(BaseModel):
    text: str = Field(default="", max_length=20000)


class DescribeIn(BaseModel):
    text: str = Field(min_length=10, max_length=4000)


class RefineIn(BaseModel):
    current: CvData
    instruction: str = Field(min_length=3, max_length=1000)


def _clean(d: CvData) -> dict:
    def tags(items, limit):
        out: list[str] = []
        for t in items:
            t = t.strip()[:limit]
            if t and t.lower() not in (x.lower() for x in out):
                out.append(t)
        return out
    data = d.model_dump()
    data["skills"] = tags(d.skills, 30)
    data["certifications"] = tags(d.certifications, 80)
    data["languages"] = [x for x in data["languages"] if x["name"].strip()]
    data["experience"] = [x for x in data["experience"] if any(v.strip() for v in x.values())]
    data["education"] = [x for x in data["education"] if any(v.strip() for v in x.values())]
    return data


def _private_dir() -> Path:
    d = Path(settings.private_dir) / "cv"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _docx_text(raw: bytes) -> str | None:
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            xml = z.read("word/document.xml").decode("utf-8", "ignore")
    except (zipfile.BadZipFile, KeyError):
        return None
    xml = re.sub(r"</w:p>", "\n", xml)
    return re.sub(r"<[^>]+>", "", xml)


def _kind(raw: bytes) -> tuple[str, str] | None:
    """(extension, media type) from the file's own bytes, never from its name."""
    if raw.startswith(b"%PDF"):
        return "pdf", "application/pdf"
    if raw.startswith(b"\xff\xd8\xff"):
        return "jpg", "image/jpeg"
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png", "image/png"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "webp", "image/webp"
    if raw.startswith(b"PK"):                          # zip container: only a real Word file is accepted
        if _docx_text(raw) is not None:
            return "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        return None
    if b"\x00" not in raw[:2000]:
        try:
            raw.decode("utf-8")
            return "txt", "text/plain"
        except UnicodeDecodeError:
            return None
    return None


def _mine(db: Session, user: models.User) -> models.Cv | None:
    return db.scalar(select(models.Cv).where(models.Cv.user_id == user.id))


def cv_out(cv: models.Cv | None, owner: bool) -> dict:
    if not cv:
        return {"cv": None, "source": None, "has_file": False, "updated_at": None, "entered_by": None, "updated_by": None}
    out = {"cv": cv.data, "source": cv.source, "updated_at": models.iso(cv.updated_at), **models.attribution(cv)}
    if owner:
        out.update({"has_file": bool(cv.file_name), "file_name": cv.file_original, "file_type": cv.file_type})
    return out


@router.get("/cv/me")
def my_cv(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    return cv_out(_mine(db, user), True)


@router.put("/cv/me")
def save_cv(body: CvSave, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    cv = _mine(db, user)
    if cv is None:
        cv = models.Cv(user_id=user.id, **models.entered(user))
    cv.data, cv.source = _clean(body.data), body.source
    if cv.id is not None and db.is_modified(cv):
        cv.record_edit(user, user.role)
    db.add(cv); db.commit(); db.refresh(cv)
    return cv_out(cv, True)


@router.post("/cv/me/apply-to-profile")
def apply_to_profile(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    cv = _mine(db, user)
    if not cv:
        raise HTTPException(409, "Save your CV first")
    p = get_or_create(db, user)
    skills = list(p.skills)
    for s in cv.data.get("skills", []):
        if len(skills) < 12 and s.lower() not in (x.lower() for x in skills):
            skills.append(s)
    langs = list(p.languages)
    for lang in cv.data.get("languages", []):
        if len(langs) < 6 and lang["name"].lower() not in (x.lower() for x in langs):
            langs.append(lang["name"])
    p.skills, p.languages = skills, langs
    if not p.headline and cv.data.get("experience"):
        first = cv.data["experience"][0]
        p.headline = (first.get("role") or "")[:120]
    if not p.bio and cv.data.get("summary"):
        p.bio = cv.data["summary"][:1500]
    if db.is_modified(p):
        p.record_edit(user, user.role)
    db.commit()
    return {"skills": p.skills, "languages": p.languages, "headline": p.headline, **models.attribution(p)}


@router.post("/cv/me/file")
def upload_file(body: FileIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    try:
        raw = base64.b64decode(body.data, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, "The file could not be read")
    if len(raw) > MAX_FILE_BYTES:
        raise HTTPException(413, "The file is larger than 8 MB")
    kind = _kind(raw)
    if not kind:
        raise HTTPException(422, "Use a PDF, Word, text file or a photo of your CV")
    cv = _mine(db, user)
    if cv is None:
        cv = models.Cv(user_id=user.id, **models.entered(user))
    if cv.file_name:
        (_private_dir() / cv.file_name).unlink(missing_ok=True)
    name = f"u{user.id}-{secrets.token_urlsafe(12)}.{kind[0]}"
    (_private_dir() / name).write_bytes(raw)
    cv.file_name, cv.file_original, cv.file_type = name, re.sub(r"[^\w .()-]", "", body.name)[:120], kind[1]
    if cv.id is not None:
        cv.record_edit(user, user.role)
    db.add(cv); db.commit()
    return {"has_file": True, "file_name": cv.file_original, "file_type": cv.file_type, **models.attribution(cv)}


@router.get("/cv/me/file")
def download_file(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    cv = _mine(db, user)
    path = _private_dir() / cv.file_name if cv and cv.file_name else None
    if not path or not path.exists():
        raise HTTPException(404, "not found")
    return FileResponse(path, media_type=cv.file_type, filename=cv.file_original or path.name, headers={"Cache-Control": "private, no-store"})


@router.delete("/cv/me/file", status_code=204)
def delete_file(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    cv = _mine(db, user)
    if cv and cv.file_name:
        (_private_dir() / cv.file_name).unlink(missing_ok=True)
        cv.file_name, cv.file_original, cv.file_type = None, "", ""
        cv.record_edit(user, user.role)
        db.commit()


# ---------------------------------------------------------------- AI helpers (propose only, never save)

CV_TOOL = {
    "name": "fill_cv",
    "description": "Fill in the CV from what the person gave, and say what was understood and what is unsure.",
    "input_schema": {"type": "object", "properties": {
        "cv": CvData.model_json_schema(),
        "understood": {"type": "string", "description": "One or two plain sentences telling the person what you understood, in their language"},
        "unsure": {"type": "array", "maxItems": 6, "items": {"type": "string"}, "description": "Short questions about things that were unclear, mistyped or missing"},
        "changes": {"type": "string", "description": "When fixing a CV: one sentence listing what you changed"}},
        "required": ["cv", "understood"]},
}

SYSTEM = ("You help a farm worker in Tunisia build a short, honest CV for farms. Never invent employers, dates, diplomas or skills that "
          "the person did not give. Fix obvious spelling mistakes silently but keep their meaning. Keep roles and descriptions short "
          "and concrete. Write in the language the person used (Arabic, French or English). When something is unclear, leave it empty "
          "and ask in `unsure`. Dates stay as the person wrote them, for example 2021 or March 2022.")


def _propose(content: list[dict]) -> dict:
    try:
        out = ai.call_tool(SYSTEM, content, CV_TOOL, max_tokens=3000)
    except ai.AiUnavailable as e:
        raise HTTPException(503, str(e))
    try:
        data = _clean(CvData.model_validate(out.get("cv") or {}))
    except Exception:
        raise HTTPException(502, "The AI helper gave an answer that could not be used. Try again.")
    return {"proposed": data, "understood": str(out.get("understood", ""))[:600],
            "unsure": [str(x)[:200] for x in (out.get("unsure") or [])[:6]], "changes": str(out.get("changes", ""))[:400]}


@router.post("/cv/me/parse")
def parse(body: ParseIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    """Read the uploaded CV file (or pasted text) and propose the form content."""
    if not ai.configured():
        raise HTTPException(503, "The AI helper is not switched on yet")
    content: list[dict] = []
    if body.text.strip():
        content.append({"type": "text", "text": body.text.strip()})
    else:
        cv = _mine(db, user)
        path = _private_dir() / cv.file_name if cv and cv.file_name else None
        if not path or not path.exists():
            raise HTTPException(409, "Upload your CV first")
        raw = path.read_bytes()
        ext, media = _kind(raw) or ("", "")
        if ext == "pdf":
            content.append({"type": "document", "source": {"type": "base64", "media_type": media, "data": base64.b64encode(raw).decode()}})
        elif ext in ("jpg", "png", "webp"):
            content.append({"type": "image", "source": {"type": "base64", "media_type": media, "data": base64.b64encode(raw).decode()}})
        elif ext == "docx":
            content.append({"type": "text", "text": (_docx_text(raw) or "")[:20000]})
        else:
            content.append({"type": "text", "text": raw.decode("utf-8", "ignore")[:20000]})
    content.append({"type": "text", "text": "Fill in the CV from this."})
    return _propose(content)


@router.post("/cv/me/describe")
def describe(body: DescribeIn, _: models.User = Depends(current_user)):
    """Write a CV from the person's own free description of what they know."""
    return _propose([{"type": "text", "text": f"This is how the person describes themselves and what they know:\n\n{body.text.strip()}\n\nWrite their CV from it."}])


@router.post("/cv/me/refine")
def refine(body: RefineIn, _: models.User = Depends(current_user)):
    """Apply a correction written in plain words to the CV shown on screen and say what changed."""
    import json
    current = json.dumps(_clean(body.current), ensure_ascii=False)
    return _propose([{"type": "text", "text": f"This is the CV as it is now:\n{current}\n\nThe person says: {body.instruction.strip()}\n\n"
                                               "Apply exactly that correction, change nothing else, and say what you changed in `changes`."}])


@router.get("/cv/{user_id}")
def public_cv(user_id: int, viewer: models.User = Depends(current_user), db: Session = Depends(get_db)):
    target = db.get(models.User, user_id)
    cv = _mine(db, target) if target and target.active and demo_mode(target) == demo_mode(viewer) else None
    prof = get_or_create(db, target) if cv else None
    if not cv or (prof.visibility == "private" and viewer.id != target.id and viewer.role != "admin"):
        raise HTTPException(404, "not found")
    return cv_out(cv, viewer.id == target.id)
