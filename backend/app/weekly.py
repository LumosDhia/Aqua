"""The weekly farm summary, how it compares with earlier weeks, advice, and the PDF report."""
import html
import logging
import threading
import shutil
import subprocess
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import ai, models
from .config import settings
from .crops import CROPS
from .routers.farmlife import collect_activity

logger = logging.getLogger(__name__)
try:
    TUNIS = ZoneInfo("Africa/Tunis")
except ZoneInfoNotFoundError:
    TUNIS = timezone(timedelta(hours=1))

LOGO = ('<svg viewBox="0 0 48 48" width="34" height="34"><circle cx="24" cy="24" r="24" fill="#1b4d3e"/>'
        '<path d="M24 9.5C24 9.5 13.5 22 13.5 29.2a10.5 10.5 0 0 0 21 0C34.5 22 24 9.5 24 9.5z" fill="#F4F7F1"/>'
        '<path d="M27.5 21c7.2-3.2 10.4 4.6 4.6 9.2-1.8-3.6-2.8-6.8-4.6-9.2z" fill="#7CB069"/></svg>')


def monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


def current_week() -> date:
    return monday_of(models.now().astimezone(TUNIS).date())


def _bounds(week_start: date) -> tuple[datetime, datetime]:
    start = datetime.combine(week_start, time.min, tzinfo=TUNIS)
    return start.astimezone(timezone.utc), (start + timedelta(days=7)).astimezone(timezone.utc)


def week_savings(decisions: list[models.Decision]) -> float | None:
    latest: dict[tuple[int, date], models.Decision] = {}
    for d in decisions:
        ts = d.ts if d.ts.tzinfo else d.ts.replace(tzinfo=timezone.utc)
        key = (d.plot_id, ts.astimezone(TUNIS).date())
        previous = latest.get(key)
        if previous is None or (d.ts, d.id) > (previous.ts, previous.id):
            latest[key] = d
    return round(sum(d.litres_saved for d in latest.values()), 1) if latest else None


def farm_week_savings(db: Session, farm_id: int, week_start: date) -> float | None:
    start, end = _bounds(week_start)
    decisions = list(db.scalars(select(models.Decision).join(models.Plot).where(
        models.Plot.farm_id == farm_id, models.Decision.ts >= start, models.Decision.ts < end,
    )))
    return week_savings(decisions)


def week_metrics(db: Session, farm: models.Farm, week_start: date) -> dict:
    a, b = _bounds(week_start)
    plots = list(farm.plots)
    ids = [p.id for p in plots]
    per_plot, healthy, total = [], 0, 0
    moist_all: list[float] = []
    for p in plots:
        target = CROPS.get(p.crop, CROPS["tomatoes"])["min_moisture"]
        rs = [r.soil_moisture for r in db.scalars(select(models.Reading).where(models.Reading.plot_id == p.id, models.Reading.ts >= a, models.Reading.ts < b,
                                                                              models.Reading.soil_moisture.is_not(None))).all()]
        ok = sum(1 for v in rs if v >= target - 5)
        healthy += ok; total += len(rs); moist_all += rs
        per_plot.append({"name": p.name, "crop": p.crop, "target": target, "readings": len(rs), "average": round(sum(rs) / len(rs), 1) if rs else None,
                         "healthy_share": round(ok / len(rs), 2) if rs else None, **models.attribution(p)})
    decisions = db.scalars(select(models.Decision).where(models.Decision.plot_id.in_(ids), models.Decision.ts >= a, models.Decision.ts < b)).all() if ids else []
    irrigations = sum(1 for d in decisions if d.action in ("irrigate", "light"))
    saved = round(sum(d.litres_saved or 0 for d in decisions))
    estimated_savings = week_savings(decisions)
    tasks = db.scalars(select(models.Task).where(models.Task.farm_id == farm.id, models.Task.created_at >= a, models.Task.created_at < b)).all()
    notes = db.scalars(select(models.Activity).where(models.Activity.farm_id == farm.id, models.Activity.happened_at >= a, models.Activity.happened_at < b)).all()
    hires = db.scalars(select(models.Engagement).where(models.Engagement.farm_id == farm.id, models.Engagement.created_at >= a, models.Engagement.created_at < b)).all()
    healthy_share = (healthy / total) if total else None
    tasks_done = sum(1 for t in tasks if t.status == "done")
    score = None
    if healthy_share is not None:
        score = max(0, min(100, round(healthy_share * 85 + min(10, saved / 200) + min(5, tasks_done))))
    return {"week_start": week_start.isoformat(), "week_end": (week_start + timedelta(days=6)).isoformat(), "readings": total,
            "healthy_share": round(healthy_share, 2) if healthy_share is not None else None, "average_moisture": round(sum(moist_all) / len(moist_all), 1) if moist_all else None,
            "irrigations": irrigations, "irrigation_advice_count": irrigations, "irrigations_basis": "aqua_recommendations",
            "litres_saved": saved, "estimated_savings_l": estimated_savings, "plots_with_readings": sum(p["readings"] > 0 for p in per_plot), "tasks": len(tasks), "tasks_done": tasks_done, "notes": len(notes), "hires": len(hires),
            "score": score, "mood": mood_of(score), "plots": per_plot,
            **models.estimate("Aqua scores measured moisture and estimates savings from irrigation recommendations.")}


def mood_of(score: int | None) -> str:
    if score is None:
        return "ok"
    return "good" if score >= 70 else "ok" if score >= 40 else "bad"


COMPARE = [("score", "Farm score", ""), ("healthy_share", "Readings in the healthy range", "%"), ("irrigations", "Irrigation recommendations", ""), ("litres_saved", "Estimated water savings", " L"),
           ("tasks_done", "Tasks done", ""), ("notes", "Activities logged", "")]


def summary(db: Session, farm: models.Farm, week_start: date, with_ai: bool = True) -> dict:
    this = week_metrics(db, farm, week_start)
    earlier = [week_metrics(db, farm, week_start - timedelta(days=7 * i)) for i in range(1, 5)]
    rows = []
    for key, label, unit in COMPARE:
        cur = this[key] * 100 if key == "healthy_share" and this[key] is not None else this[key]
        vals = [(m[key] * 100 if key == "healthy_share" and m[key] is not None else m[key]) for m in earlier]
        have = [v for v in vals if v is not None]
        avg = round(sum(have) / len(have), 1) if have else None
        last = vals[0]
        delta = round(cur - last, 1) if cur is not None and last is not None else None
        rows.append({"key": key, "label": label, "unit": unit, "this_week": cur, "last_week": last, "four_week_average": avg, "change_vs_last_week": delta,
                     "trend": None if delta is None else "up" if delta > 0 else "down" if delta < 0 else "same", "history": list(reversed(vals)) + [cur]})
    activity = collect_activity(db, farm.id, *_bounds(week_start))[:14]
    animals = sum(h.count for h in farm.livestock)
    out = {"farm": {"id": farm.id, "name": farm.name, "region": farm.region, "demo": farm.demo, **models.attribution(farm)}, "week": this, "comparison": rows, "activity": activity, "animals": animals,
           "workers": len(farm.workers), "weeks_with_data": sum(1 for m in earlier if m["readings"])}
    out["advice"] = advice(out, earlier, with_ai)
    return out


def rule_advice(s: dict, earlier: list[dict]) -> list[str]:
    w, tips = s["week"], []
    if w["readings"] == 0:
        return ["No sensor readings were recorded this week, so Aqua could not judge your soil. Check that the farm board is online and sending data."]
    dry = [p for p in w["plots"] if p["healthy_share"] is not None and p["healthy_share"] < 0.6]
    if dry:
        tips.append("Dry soil was the main problem on " + ", ".join(p["name"] for p in dry[:3]) + ". Water earlier in the day and check that the drip lines there are not blocked.")
    prev = [m["irrigations"] for m in earlier if m["readings"]]
    if prev and w["irrigations"] > 1.3 * (sum(prev) / len(prev)) + 1:
        tips.append(f"Aqua recommended irrigation {w['irrigations']} times, above the recent average of {round(sum(prev) / len(prev), 1)}. Check the forecast before watering.")
    if w["litres_saved"] >= 500:
        tips.append(f"Good: Aqua's advice saved about {w['litres_saved']:,} litres this week by waiting for rain or watering less.")
    if w["tasks"] and w["tasks_done"] < w["tasks"]:
        tips.append(f"{w['tasks'] - w['tasks_done']} of {w['tasks']} tasks assigned to workers are not marked done. Ask your workers for an update.")
    if w["notes"] == 0:
        tips.append("Nothing was written in the activity log. Note harvests, spraying and fertiliser so next week's report can compare them.")
    if w["healthy_share"] is not None and w["healthy_share"] >= 0.85 and not dry:
        tips.append("Your soil moisture stayed in the healthy range almost all week. Keep the same routine.")
    return tips[:6] or ["A calm week. Keep logging your work so trends become clear."]


def advice(s: dict, earlier: list[dict], with_ai: bool) -> list[str]:
    base = rule_advice(s, earlier)
    if not with_ai or not ai.configured():
        return base
    schema = {"type": "object", "properties": {"advice": {"type": "array", "maxItems": 5, "items": {"type": "string", "maxLength": 300}}}, "required": ["advice"]}
    brief = {"week": s["week"], "comparison": [{k: r[k] for k in ("label", "this_week", "last_week", "four_week_average")} for r in s["comparison"]],
             "animals": s["animals"], "rule_based_advice": base}
    try:
        out = ai.call_tool("You are Aqua, a farming advisor for Tunisian farmers. From the week's numbers, write 3 to 5 short, practical, specific tips for next week in plain English. "
                           "Compare with earlier weeks where the numbers allow it. Never invent numbers that are not given. No greetings, no markdown.",
                           [{"type": "text", "text": "Numbers for the week (JSON):\n" + str(brief)}], {"name": "advice", "input_schema": schema})
        tips = [str(t).strip()[:300] for t in out.get("advice", []) if str(t).strip()]
        return tips[:5] or base
    except ai.AiUnavailable:
        return base


def _bar(values: list, color: str = "#1b4d3e", w: int = 110, h: int = 24) -> str:
    """Five tiny bars, oldest first. A week without data is a small grey dash, not a zero."""
    have = [v for v in values if v is not None]
    top = max(have + [1])
    slot = w / max(len(values), 1)
    bw = slot * 0.62
    parts = []
    for i, v in enumerate(values):
        x = i * slot + (slot - bw) / 2
        if v is None:
            parts.append(f'<rect x="{x:.1f}" y="{h - 3}" width="{bw:.1f}" height="2" rx="1" fill="#d9d2bd"/>')
        else:
            bh = max(2.0, (v / top) * (h - 3))
            parts.append(f'<rect x="{x:.1f}" y="{h - bh:.1f}" width="{bw:.1f}" height="{bh:.1f}" rx="2" fill="{color if i == len(values) - 1 else "#b9cbb8"}"/>')
    return f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}">{"".join(parts)}</svg>'


def _fmt(v, unit: str) -> str:
    if v is None:
        return "no data"
    return (f"{v:,.0f}" if float(v).is_integer() else f"{v:,.1f}") + unit


def render_html(s: dict) -> str:
    w, e = s["week"], html.escape
    mood = {"good": ("A strong week", "#3f7d4a"), "ok": ("A steady week", "#b8862f"), "bad": ("A hard week", "#b5472f")}[w["mood"]]
    score = "n/a" if w["score"] is None else str(w["score"])
    demo_label = " · Demo data" if s["farm"].get("demo") else ""
    cmp_rows = "".join(
        f'<tr><td>{e(r["label"])}</td><td class="n">{_fmt(r["this_week"], r["unit"])}</td><td class="n">{_fmt(r["last_week"], r["unit"])}</td><td class="n">{_fmt(r["four_week_average"], r["unit"])}</td>'
        f'<td class="n {"up" if r["trend"] == "up" else "down" if r["trend"] == "down" else ""}">{"" if r["change_vs_last_week"] is None else ("+" if r["change_vs_last_week"] > 0 else "") + _fmt(r["change_vs_last_week"], r["unit"])}</td>'
        f'<td>{_bar(r["history"])}</td></tr>' for r in s["comparison"])
    plots = "".join(f'<tr><td>{e(p["name"])}</td><td>{e(p["crop"].title())}</td><td class="n">{p["target"]}%</td><td class="n">{_fmt(p["average"], "%")}</td>'
                    f'<td class="n">{"no data" if p["healthy_share"] is None else str(round(p["healthy_share"] * 100)) + "%"}</td></tr>' for p in w["plots"])
    acts = "".join(f'<li><b>{e(a["title"])}</b>{"" if not a["detail"] else " <span>" + e(a["detail"][:110]) + "</span>"}<em>{a["at"][:10]}</em></li>' for a in s["activity"]) or "<li><span>Nothing was recorded this week.</span></li>"
    tips = "".join(f"<li>{e(t)}</li>" for t in s["advice"])
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
@page {{ size: A4; margin: 16mm 15mm 18mm; @bottom-center {{ content: "Aqua weekly report, page " counter(page); font: 8pt sans-serif; color: #8a8a7a; }} }}
body {{ font: 10pt/1.45 'DejaVu Sans', sans-serif; color: #1f2a24; }}
h1 {{ font: 24pt Georgia, 'DejaVu Serif', serif; margin: 0; color: #0f3329; }} h2 {{ font: 14pt Georgia, 'DejaVu Serif', serif; color: #0f3329; margin: 18pt 0 6pt; border-bottom: 1px solid #d9d2bd; padding-bottom: 3pt; }}
.head {{ display: flex; align-items: center; gap: 10pt; }} .sub {{ color: #6b7468; font-size: 9pt; }}
.hero {{ display: flex; gap: 14pt; margin: 14pt 0; }} .score {{ width: 92pt; height: 92pt; border-radius: 50%; border: 6pt solid {mood[1]}; text-align: center; padding-top: 22pt; box-sizing: border-box; }}
.score b {{ font: 26pt Georgia, serif; display: block; line-height: 1; }} .score span {{ font-size: 7.5pt; color: #6b7468; }}
.kpis {{ display: flex; gap: 8pt; flex: 1; flex-wrap: wrap; }} .kpi {{ flex: 1 1 28%; background: #f6f1e4; border-radius: 8pt; padding: 8pt 10pt; }} .kpi b {{ font: 15pt Georgia, serif; display: block; }} .kpi span {{ font-size: 8pt; color: #6b7468; }}
table {{ width: 100%; border-collapse: collapse; font-size: 9pt; }} th {{ text-align: left; color: #6b7468; font-weight: normal; font-size: 8pt; border-bottom: 1px solid #d9d2bd; padding: 3pt 4pt; }} td {{ padding: 4pt; border-bottom: 1px solid #eee8d6; vertical-align: middle; }}
.n {{ text-align: right; white-space: nowrap; }} .up {{ color: #3f7d4a; }} .down {{ color: #b5472f; }}
ul {{ margin: 0; padding-left: 14pt; }} li {{ margin-bottom: 4pt; }} li span {{ color: #6b7468; }} li em {{ color: #9a9a88; font-size: 8pt; margin-left: 6pt; }}
.tips li {{ margin-bottom: 6pt; }}
</style></head><body>
<div class="head">{LOGO}<div><h1>Weekly report</h1><div class="sub">{e(s["farm"]["name"])}{", " + e(s["farm"]["region"]) if s["farm"]["region"] else ""} &middot; {w["week_start"]} to {w["week_end"]}{demo_label}</div></div></div>
<div class="hero"><div class="score"><b>{score}</b><span>Aqua farm score</span></div>
<div class="kpis"><div class="kpi"><b>{mood[0]}</b><span>{"based on " + str(w["readings"]) + " soil readings" if w["readings"] else "no soil readings this week"}</span></div>
<div class="kpi"><b>{w["irrigations"]}</b><span>irrigations advised</span></div><div class="kpi"><b>{_fmt(w["estimated_savings_l"], " L")}</b><span>Aqua estimated savings</span></div>
<div class="kpi"><b>{w["tasks_done"]}/{w["tasks"]}</b><span>tasks done</span></div><div class="kpi"><b>{s["animals"]}</b><span>animals on the farm</span></div><div class="kpi"><b>{s["workers"]}</b><span>workers</span></div></div></div>
<h2>Compared with earlier weeks</h2>
<table><tr><th></th><th class="n">This week</th><th class="n">Last week</th><th class="n">4-week average</th><th class="n">Change</th><th>Last 5 weeks</th></tr>{cmp_rows}</table>
<h2>Advice for next week</h2><ul class="tips">{tips}</ul>
<h2>Your plots</h2><table><tr><th>Plot</th><th>Crop</th><th class="n">Target</th><th class="n">Average</th><th class="n">Healthy readings</th></tr>{plots or "<tr><td>No plots yet</td></tr>"}</table>
<h2>What happened on the farm</h2><ul>{acts}</ul>
</body></html>"""


def render_pdf(s: dict, dest: Path) -> None:
    exe = shutil.which("weasyprint") or str(Path.home() / ".local/bin/weasyprint")
    dest.parent.mkdir(parents=True, exist_ok=True)
    p = subprocess.run([exe, "-", str(dest)], input=render_html(s).encode(), capture_output=True, timeout=120)
    if p.returncode != 0 or not dest.exists():
        raise RuntimeError("The PDF could not be made: " + p.stderr.decode(errors="ignore")[-200:])


def reports_dir() -> Path:
    d = Path(settings.private_dir) / "reports"
    d.mkdir(parents=True, exist_ok=True)
    return d


def make_report(
    db: Session, farm: models.Farm, week_start: date, kind: str = "manual", with_ai: bool = True,
    *, actor: models.User | None = None, role: str | None = None,
) -> models.WeeklyReport:
    s = summary(db, farm, week_start, with_ai)
    row = db.scalar(select(models.WeeklyReport).where(models.WeeklyReport.farm_id == farm.id, models.WeeklyReport.week_start == week_start))
    name = f"f{farm.id}-{week_start.isoformat()}.pdf"
    render_pdf(s, reports_dir() / name)
    if row is None:
        row = models.WeeklyReport(farm_id=farm.id, week_start=week_start, file_name=name,
                                  **(models.entered(actor, role) if actor else {}))
        db.add(row)
    elif actor:
        row.record_edit(actor, role or actor.role)
    row.file_name, row.score, row.mood, row.kind = name, s["week"]["score"], s["week"]["mood"], kind
    db.commit(); db.refresh(row)
    return row


def run_scheduler_once(db: Session) -> int:
    """Make missing reports for the previous week and the current week on Sunday evening in Tunis."""
    now = models.now().astimezone(TUNIS)
    weeks = [monday_of(now.date()) - timedelta(days=7)]
    if now.weekday() == 6 and now.hour >= 20:
        weeks.append(monday_of(now.date()))
    made = 0
    for farm in db.scalars(select(models.Farm).where(~models.Farm.is_fixture)).all():
        for wk in weeks:
            if db.scalar(select(models.WeeklyReport.id).where(models.WeeklyReport.farm_id == farm.id, models.WeeklyReport.week_start == wk)):
                continue
            if not farm.plots:
                continue
            try:
                make_report(db, farm, wk, kind="auto")
                made += 1
            except Exception:
                logger.exception("Weekly report failed for farm %s", farm.id)
                db.rollback()
    return made


def start_scheduler() -> threading.Event | None:
    """Background thread: look every 30 minutes. Returns the event that stops it, or None when switched off."""
    from .db import SessionLocal
    if not settings.weekly_scheduler:
        return None
    stop = threading.Event()

    def loop() -> None:
        while not stop.wait(1800):
            try:
                with SessionLocal() as db:
                    run_scheduler_once(db)
            except Exception:
                logger.exception("Weekly report scheduler failed")

    threading.Thread(target=loop, name="weekly-reports", daemon=True).start()
    return stop
