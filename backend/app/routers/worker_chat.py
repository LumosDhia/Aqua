"""The worker's own AI assistant: it reads the worker's jobs, applications, invitations, work and messages, answers
in their language, and prepares changes (apply, answer an invitation, update the profile, write to a farm) as cards.
Nothing happens until the worker approves a card, and each card is a normal request sent with the worker's own login."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import ai, models
from ..db import get_db
from ..farm_access import demo_mode
from ..geo import GOVERNORATES
from ..rbac import current_user, farm_role
from .chat import MAX_FILES, MAX_HISTORY, ChatIn, _attachment_block
from .profiles import get_or_create

router = APIRouter(prefix="/api", tags=["worker-chat"])

SYSTEM = """You are the Aqua assistant for a worker (or someone looking for work) on Tunisian farms, inside the Aqua app.
You help with finding jobs, applying, answering invitations from farms, keeping the profile strong, and writing to the farms they work for.
Reply in the language the person writes in (Tunisian Arabic, Arabic, French, English or Japanese). Be warm, short and concrete.
Use only the data below. If something is missing, say so instead of guessing. Never invent jobs, farms, pay or messages.

You change nothing yourself. Put each thing the person asks you to do in the `changes` field, one entry per change: apply_job, withdraw_application, answer_offer, update_profile, send_message. The person sees a card for each and approves it. Say in your reply what you prepared and that it waits for approval.
- apply_job: use a job_id from the open jobs list and write a short, honest message in the person's voice from their profile and skills (at least a full sentence). If they have no profile details, ask first.
- withdraw_application: use an application_id from their applications that is still pending.
- answer_offer: use an offer_id from their invitations that is still pending, answer accepted or declined. Accepting means starting the job, so only prepare accepted when they clearly said yes.
- update_profile: only fields the person asked to change or that you suggest and they agreed to. Skills are short words. Kinds are task (one-off), period (for a period) and long_term. Governorates must be exactly from the list: {governorates}. The person is "open to work" when looking_for_work is true.
- send_message: only to a farm they work for (use an engagement_id from their work list) with the words they asked for, kept polite.
When asked "what should I do", look at pending invitations, unanswered messages, a thin profile and the best open jobs, and say the next one or two steps.

Data (live):
{context}"""

TOOL = {
    "name": "answer",
    "description": "The assistant's reply, with optional changes the worker must approve first.",
    "input_schema": {
        "type": "object",
        "properties": {
            "reply": {"type": "string", "description": "The reply to show, in the language the person wrote in"},
            "changes": {"type": "array", "maxItems": 8, "items": {
                "type": "object",
                "properties": {
                    "kind": {"type": "string", "enum": ["apply_job", "withdraw_application", "answer_offer", "update_profile", "send_message"]},
                    "job_id": {"type": "integer"}, "application_id": {"type": "integer"}, "offer_id": {"type": "integer"},
                    "engagement_id": {"type": "integer"},
                    "answer": {"type": "string", "enum": ["accepted", "declined"]},
                    "message": {"type": "string", "description": "application text or message to the farm"},
                    "headline": {"type": "string"}, "bio": {"type": "string"}, "availability": {"type": "string"},
                    "governorate": {"type": "string"}, "radius_km": {"type": "integer"},
                    "looking_for_work": {"type": "boolean"}, "visibility": {"type": "string", "enum": ["public", "private"]},
                    "skills": {"type": "array", "items": {"type": "string"}},
                    "languages": {"type": "array", "items": {"type": "string"}},
                    "kinds": {"type": "array", "items": {"type": "string", "enum": ["task", "period", "long_term"]}},
                },
                "required": ["kind"],
            }},
        },
        "required": ["reply"],
    },
}


def _context(user: models.User, db: Session) -> tuple[str, dict]:
    from . import discovery
    from .messages import _my_engagements
    prof = get_or_create(db, user)
    lines = [f"Person: {user.name or user.email.split('@')[0]}",
             f"Profile: headline \"{prof.headline}\"; bio \"{prof.bio[:300]}\"; governorate {prof.governorate or 'not set'}; travels up to {prof.radius_km} km; "
             f"open to work: {'yes' if prof.looking_for_work else 'no'}; visibility {prof.visibility}; skills {', '.join(prof.skills) or 'none'}; "
             f"kinds {', '.join(prof.kinds) or 'any'}; languages {', '.join(prof.languages) or 'none'}; availability \"{prof.availability}\"",
             "CV: " + ("added" if db.scalar(select(models.Cv.id).where(models.Cv.user_id == user.id)) else "not added yet")]
    apps = db.scalars(select(models.JobApplication).where(models.JobApplication.applicant_id == user.id)
                      .order_by(models.JobApplication.created_at.desc()).limit(15)).all()
    lines.append("Applications:" if apps else "Applications: none yet")
    lines += [f"- application_id {a.id}: \"{a.job.title}\" at {a.job.farm.name}, {a.status}" for a in apps]
    offers = db.scalars(select(models.JobOffer).where(models.JobOffer.worker_id == user.id, models.JobOffer.status != "withdrawn")
                        .order_by(models.JobOffer.created_at.desc()).limit(10)).all()
    lines.append("Invitations from farms:" if offers else "Invitations from farms: none")
    lines += [f"- offer_id {o.id}: \"{o.job.title}\" at {o.job.farm.name}, {o.status}, job {o.job.status}" + (f", they wrote \"{o.message[:150]}\"" if o.message else "") for o in offers]
    ids: dict[str, set[int]] = {"apps": {a.id for a in apps if a.status == "pending"}, "offers": {o.id for o in offers if o.status == "pending"}, "engagements": set()}
    work = [(e, side) for e, side in _my_engagements(db, user) if side == "worker"]
    lines.append("Work (farms they work for):" if work else "Work: not hired anywhere right now")
    for e, _ in work:
        last = db.scalars(select(models.Message).where(models.Message.engagement_id == e.id).order_by(models.Message.id.desc()).limit(3)).all()
        lines.append(f"- engagement_id {e.id}: \"{e.title}\" at {e.farm.name}, {e.status}"
                     + ("; recent messages (newest first): " + " | ".join(("me: " if m.sender_id == user.id else "farm: ") + m.body[:120] for m in last) if last else ""))
        if e.status == "active":
            ids["engagements"].add(e.id)
    try:
        opp = discovery.opportunities(radius_km=None, kinds="", skills="", q="", limit=8, offset=0, user=user, db=db)
        lines.append(f"Open jobs near them (best match first, within {opp['radius_km']} km of {opp['location']}):" if opp["items"] else "Open jobs near them: none right now")
        for j in opp["items"]:
            pay = f"{j['pay_amount']:g} TND per {j['pay_unit']}" if j["pay_mode"] == "fixed" and j["pay_amount"] else "pay negotiable"
            lines.append(f"- job_id {j['id']}: \"{j['title']}\" at {j['farm']['name']}, {j['governorate']}, {j['distance_km']} km, {j['kind']}, {pay}, skills {', '.join(j['skills']) or 'none listed'}"
                         + (", already applied" if j["applied"] else ""))
    except HTTPException:
        lines.append("Open jobs near them: unknown, the profile has no governorate yet")
    return "\n".join(lines), ids


def _cards(changes: object, user: models.User, db: Session, ids: dict) -> list[dict]:
    prof = get_or_create(db, user)
    out: list[dict] = []

    def card(summary: str, method: str, path: str, body: dict | None, done: str) -> None:
        out.append({"kind": "change", "summary": summary, "danger": False, "done": done, "request": {"method": method, "path": path, "body": body}})

    for c in (changes if isinstance(changes, list) else [])[:8]:
        if not isinstance(c, dict):
            continue
        kind = str(c.get("kind", ""))
        text = lambda k, n=1000: str(c.get(k, "") or "").strip()[:n]
        if kind == "apply_job":
            job = db.get(models.JobPost, c.get("job_id")) if isinstance(c.get("job_id"), int) else None
            msg = text("message")
            if (not job or job.status != "open" or job.farm.demo != demo_mode(user)
                    or farm_role(db, user, job.farm_id) is not None or len(msg) < 5):
                continue
            if db.scalar(select(models.JobApplication.id).where(models.JobApplication.job_id == job.id, models.JobApplication.applicant_id == user.id)):
                continue
            card(f"Apply to \"{job.title}\" at {job.farm.name}: {msg[:140]}", "POST", f"/api/jobs/{job.id}/applications", {"message": msg}, "Applied")
        elif kind == "withdraw_application":
            aid = c.get("application_id")
            if aid in ids["apps"]:
                a = db.get(models.JobApplication, aid)
                card(f"Withdraw your application to \"{a.job.title}\" at {a.job.farm.name}", "DELETE", f"/api/jobs/applications/{aid}", None, "Withdrawn")
        elif kind == "answer_offer":
            oid, ans = c.get("offer_id"), text("answer", 10)
            if oid in ids["offers"] and ans in ("accepted", "declined"):
                o = db.get(models.JobOffer, oid)
                card(("Accept the invitation and start: " if ans == "accepted" else "Decline the invitation: ") + f"\"{o.job.title}\" at {o.job.farm.name}",
                     "PATCH", f"/api/jobs/offers/{oid}", {"status": ans}, "You are hired" if ans == "accepted" else "Declined")
        elif kind == "update_profile":
            body = {"headline": prof.headline, "bio": prof.bio, "governorate": prof.governorate, "visibility": prof.visibility, "radius_km": prof.radius_km,
                    "looking_for_work": prof.looking_for_work, "kinds": list(prof.kinds), "skills": list(prof.skills), "languages": list(prof.languages),
                    "availability": prof.availability}
            changed: list[str] = []
            for k, n in (("headline", 120), ("bio", 1500), ("availability", 200)):
                if k in c and text(k, n) != body[k]:
                    body[k] = text(k, n); changed.append(k)
            gov = text("governorate", 40)
            if gov and gov in GOVERNORATES and gov != body["governorate"]:
                body["governorate"] = gov; changed.append(f"governorate {gov}")
            if isinstance(c.get("radius_km"), int) and 1 <= c["radius_km"] <= 500 and c["radius_km"] != body["radius_km"]:
                body["radius_km"] = c["radius_km"]; changed.append(f"travel {c['radius_km']} km")
            if isinstance(c.get("looking_for_work"), bool) and c["looking_for_work"] != body["looking_for_work"]:
                body["looking_for_work"] = c["looking_for_work"]; changed.append("open to work" if c["looking_for_work"] else "not looking for work")
            if c.get("visibility") in ("public", "private") and c["visibility"] != body["visibility"]:
                body["visibility"] = c["visibility"]; changed.append(f"profile {c['visibility']}")
            for k, limit, n in (("skills", 12, 30), ("languages", 6, 30)):
                if isinstance(c.get(k), list):
                    vals = list(dict.fromkeys(str(x).strip() for x in c[k] if str(x).strip() and len(str(x).strip()) <= n))[:limit]
                    if vals and vals != body[k]:
                        body[k] = vals; changed.append(f"{k}: {', '.join(vals)}")
            if isinstance(c.get("kinds"), list):
                vals = [x for x in dict.fromkeys(c["kinds"]) if x in ("task", "period", "long_term")]
                if vals and vals != body["kinds"]:
                    body["kinds"] = vals; changed.append("kinds of work")
            if changed:
                card("Update your profile: " + ", ".join(changed), "PUT", "/api/profile/me", body, "Saved")
        elif kind == "send_message":
            eid, msg = c.get("engagement_id"), text("message")
            if eid in ids["engagements"] and msg:
                e = db.get(models.Engagement, eid)
                card(f"Message {e.farm.name}: {msg[:160]}", "POST", f"/api/engagements/{eid}/messages", {"body": msg}, "Sent")
    return out


@router.post("/me/chat")
def worker_chat(body: ChatIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    if not ai.configured():
        raise HTTPException(503, "Chatbot is not configured: set LLM_API_URL on the server")
    if len(body.attachments) > MAX_FILES:
        raise HTTPException(422, f"At most {MAX_FILES} files per message")
    if body.messages[-1].role != "user":
        raise HTTPException(422, "The last message must be from the user")
    history = body.messages[-MAX_HISTORY:]
    while history and history[0].role != "user":
        history = history[1:]
    earlier = "\n".join(("Person: " if m.role == "user" else "Assistant: ") + m.content for m in history[:-1])
    question = history[-1].content or "Please look at the attached file(s)."
    content = [_attachment_block(a) for a in body.attachments]
    content.append({"type": "text", "text": (f"Conversation so far:\n{earlier}\n\n" if earlier else "") + f"The person now writes: {question}\n\nWrite the assistant's next reply."})
    context, ids = _context(user, db)
    system = SYSTEM.format(context=context, governorates=", ".join(GOVERNORATES))
    try:
        out = ai.call_tool(system, content, TOOL)
    except ai.AiUnavailable as e:
        raise HTTPException(502, str(e))
    reply = str(out.get("reply", "")).strip()
    cards = _cards(out.get("changes"), user, db, ids)
    asked = len(out.get("changes")) if isinstance(out.get("changes"), list) else 0
    if not reply:
        reply = "I prepared some steps. Check them below and approve the ones you want." if cards else "I could not produce an answer. Please try again."
    if asked > len(cards):
        n = asked - len(cards)
        reply += f"\n\nNote: {n} of the steps I mentioned could not be prepared because something was missing or does not match your account, so there is no card for {'it' if n == 1 else 'them'}."
    return {"reply": reply, **({"proposed_changes": cards} if cards else {})}
