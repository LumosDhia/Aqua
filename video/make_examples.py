#!/usr/bin/env python3
"""Render the three example films (good farm, ok farm, bad farm) from invented weeks.

Run from anywhere:  ~/Projects/Aqua/backend/.venv/bin/python ~/Projects/Aqua/video/make_examples.py [good|ok|bad] [--quality draft|looks]
Output: ~/Projects/Aqua/video/examples/<name>.mp4. Every farm and person is invented.
"""
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backend"))
from app import videos  # noqa: E402


def week(score, mood, readings, share, irr, saved, tasks, done, hires, plots):
    return {"week_start": "2026-11-16", "week_end": "2026-11-22", "readings": readings, "healthy_share": share, "average_moisture": None, "irrigations": irr, "litres_saved": saved,
            "tasks": tasks, "tasks_done": done, "notes": 6, "hires": hires, "score": score, "mood": mood, "plots": plots}


def cmp(share_now, share_last, trend):
    return [{"key": "healthy_share", "label": "Readings in the healthy range", "unit": "%", "this_week": share_now, "last_week": share_last, "four_week_average": share_last,
             "change_vs_last_week": None if share_last is None else share_now - share_last, "trend": trend, "history": [share_last, share_now]}]


def act(who, title, kind):
    return {"who": who, "title": title, "kind": kind, "detail": "", "at": "2026-11-20T08:00:00+00:00", "source": "system"}


EXAMPLES = {
    "good": {
        "farm": {"id": 1, "name": "Ferme Ain Zitoun", "region": "Nabeul"},
        "week": week(91, "good", 168, 0.94, 5, 2400, 9, 9, 2, [{"name": "Olive terrace", "crop": "olives", "target": 25, "readings": 56, "average": 31.0, "healthy_share": 0.97},
                                                              {"name": "Tomato rows", "crop": "tomatoes", "target": 35, "readings": 56, "average": 38.5, "healthy_share": 0.93}]),
        "comparison": cmp(94, 81, "up"), "workers": 4, "animals": 42,
        "activity": [act("Amel", "Picked the first olive crates", "harvest"), act("Youssef", "Fixed the drip lines on the tomato rows", "maintenance"),
                     act("Rim", "Started as nursery assistant", "people"), act("Karim", "Irrigated the olive terrace", "irrigation")],
        "advice": ["Soil stayed in the healthy range nearly all week. Keep the same watering routine.", "Aqua's advice saved about 2,400 litres by waiting for rain. Keep checking the forecast first.",
                   "Two new people joined. Give them a short tour of the water points."]},
    "ok": {
        "farm": {"id": 2, "name": "Ferme El Wardia", "region": "Beja"},
        "week": week(61, "ok", 140, 0.71, 7, 800, 8, 5, 1, [{"name": "Wheat field", "crop": "wheat", "target": 30, "readings": 48, "average": 29.0, "healthy_share": 0.75},
                                                            {"name": "Pepper rows", "crop": "peppers", "target": 40, "readings": 48, "average": 33.0, "healthy_share": 0.58}]),
        "comparison": cmp(71, 74, "down"), "workers": 3, "animals": 25,
        "activity": [act("Slim", "Weeded the pepper rows", "maintenance"), act("Hatem", "Sprayed the wheat field", "spraying"), act("Sonia", "Carried the harvest to the barn", "harvest")],
        "advice": ["The pepper rows were dry on two afternoons. Water earlier in the day.", "Three of eight tasks are not marked done. Ask your team for an update.",
                   "Log your spraying and fertiliser so next week can be compared."]},
    "bad": {
        "farm": {"id": 3, "name": "Ferme Sidi Khalfa", "region": "Kairouan"},
        "week": week(24, "bad", 96, 0.27, 11, 0, 7, 2, 0, [{"name": "Olive grove", "crop": "olives", "target": 25, "readings": 48, "average": 14.0, "healthy_share": 0.2},
                                                           {"name": "Barley strip", "crop": "barley", "target": 30, "readings": 48, "average": 17.0, "healthy_share": 0.35}]),
        "comparison": cmp(27, 63, "down"), "workers": 2, "animals": 18,
        "activity": [act("Nizar", "Repaired the broken pump", "maintenance"), act("Khadija", "Carried water to the olive grove by hand", "irrigation")],
        "advice": ["The olive grove stayed dry nearly all week. Check the borehole pump and the water level in the tank.", "You irrigated 11 times but soil stayed dry. Look for blocked or leaking drip lines.",
                   "Only 2 of 7 tasks are done. Ask for help from a neighbour or hire seasonal workers."]},
}


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    quality = sys.argv[sys.argv.index("--quality") + 1] if "--quality" in sys.argv else "looks"
    names = [a for a in args if a in EXAMPLES] or list(EXAMPLES)
    out_dir = HERE / "examples"
    for name in names:
        s = dict(EXAMPLES[name])
        s["comparison"] = s["comparison"]
        with tempfile.TemporaryDirectory(prefix="aqua-ex-") as tmp:
            facts = videos.build_project(s, Path(tmp) / "project", mood=name)
            print(f"{name}: {facts['duration']} s, scenes {facts['scenes']}", flush=True)
            videos.render(Path(tmp) / "project", out_dir / f"{name}-farm.mp4", quality=quality)
            print("  ->", out_dir / f"{name}-farm.mp4", flush=True)


if __name__ == "__main__":
    main()
