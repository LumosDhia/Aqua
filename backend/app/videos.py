"""The weekly farm film: a short video in the style of Irasutoya, made from a week's numbers and rendered with HyperFrames.

`build_project` writes a small HyperFrames project (HTML scenes with the week's data baked in), `render` runs the CLI on it.
The illustrations are Takashi Mifune's, from irasutoya.com, saved in ../video/assets/irasutoya (see CREDITS.md there). The film's mood (good, ok, bad) picks the scenery and the faces.
One film may use at most 20 distinct pictures (the site's free limit); build_project refuses more.
"""
import html
import json
import shutil
import subprocess
from datetime import date
from pathlib import Path

VIDEO_DIR = Path(__file__).resolve().parents[2] / "video"
W, H, FPS = 1920, 1080, 30

IRAS_DIR = VIDEO_DIR / "assets" / "irasutoya"
MAX_ILLUSTRATIONS = 20          # Irasutoya's free-use limit for one work (21 or more needs a paid licence)

# the pictures each mood uses: names are files in video/assets/irasutoya (see its CREDITS.md)
MOODS = {
    "good": {"word": "A strong week", "bg": "bg_paddy_mountain_1", "sun": "suns_yellow_1", "face": "farmer_m_faces_4", "crops": ["rice_1", "minitomato_1", "olive_1"],
             "team": ["tilling_man_1", "farm_girl_1", "gardening_man_1", "tractor_man_1"], "ink": "#0f3329", "accent": "#3f7d4a", "card": "#fffdf6"},
    "ok": {"word": "A steady week", "bg": "bg_autumn_paddy_1", "sun": "suns_yellow_3", "face": "farmer_m_faces2_4", "crops": ["rice_1", "minitomato_1"],
           "team": ["tilling_woman_1", "farmer_hyakusho_1", "farm_girl_1", "gardening_man_1"], "ink": "#2b3a2f", "accent": "#b8862f", "card": "#fffaf0"},
    "bad": {"word": "A hard week", "bg": "drought_1", "sun": "sun_1", "face": "farmer_m_faces_3", "crops": [],
            "team": ["farmer_m_faces2_2", "farmer_w_faces_3", "farmer_m_faces2_4", "farmer_m_faces_1"], "ink": "#3a2f26", "accent": "#b5472f", "card": "#fbf4e8"},
}


def e(s) -> str:
    return html.escape(str(s))


class Used:
    """Collects every illustration a film uses, so only those are copied and the 20 picture limit can be checked."""
    def __init__(self):
        self.names: set[str] = set()

    def __call__(self, name: str) -> str:
        self.names.add(name)
        return f"assets/irasutoya/{name}.png"


def fmt(n) -> str:
    return "n/a" if n is None else f"{n:,.0f}"


def pick_team(summary: dict) -> list[dict]:
    """Up to four people for the team scene, from what the farm recorded this week."""
    people: list[dict] = []
    seen = set()
    for a in summary.get("activity", []):
        who = a.get("who")
        if not who or who in seen:
            continue
        seen.add(who)
        people.append({"name": who, "line": a["title"][:70], "kind": a.get("kind", "note")})
        if len(people) == 4:
            break
    return people


def _head() -> str:
    return f"""<meta charset="UTF-8"><meta name="viewport" content="width={W}, height={H}"><style>*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:{W}px;height:{H}px;overflow:hidden;background:#f6f1e4}} img{{display:block}}</style>"""


def build_project(summary: dict, dest: Path, mood: str | None = None, team: list[dict] | None = None) -> dict:
    """Write the HyperFrames project into `dest` and return its facts (duration, scenes, pictures used)."""
    w = summary["week"]
    m = mood or w["mood"]
    theme = MOODS[m]
    team = team if team is not None else pick_team(summary)
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "compositions").mkdir(exist_ok=True)
    (dest / "assets" / "irasutoya").mkdir(parents=True, exist_ok=True)
    art = Used()
    shutil.copy(VIDEO_DIR / "assets" / "gsap.min.js", dest / "assets" / "gsap.min.js")
    (dest / "hyperframes.json").write_text(json.dumps({"name": "aqua-week"}))
    scenes = [("title", 5.0, scene_title), ("score", 6.5, scene_score), ("fields", 6.0, scene_fields), ("team", 7.5, scene_team), ("advice", 6.5, scene_advice)]
    t, hosts = 0.0, []
    for sid, dur, fn in scenes:
        (dest / "compositions" / f"{sid}.html").write_text(fn(summary, theme, team, dur, art))
        hosts.append(f'<div id="{sid}" class="clip" data-composition-id="{sid}" data-composition-src="compositions/{sid}.html" data-start="{t}" data-duration="{dur}" data-track-index="1" data-track-kind="graphics" data-width="{W}" data-height="{H}"></div>')
        t += dur - 0.4                                                    # scenes overlap a little so each leaves as the next arrives
    if len(art.names) > MAX_ILLUSTRATIONS:
        raise RuntimeError(f"This film uses {len(art.names)} Irasutoya pictures, the free limit is {MAX_ILLUSTRATIONS}")
    for name in art.names:
        shutil.copy(IRAS_DIR / f"{name}.png", dest / "assets" / "irasutoya" / f"{name}.png")
    total = round(t + 0.4, 2)
    (dest / "index.html").write_text(f"""<!doctype html><html lang="en"><head>{_head()}<script src="assets/gsap.min.js"></script></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="{total}" data-width="{W}" data-height="{H}">{''.join(hosts)}</div>
<script>window.__timelines = window.__timelines || {{}}; const tl = gsap.timeline({{ paused: true }}); window.__timelines["main"] = tl;</script></body></html>""")
    return {"duration": total, "scenes": [s[0] for s in scenes], "mood": m, "pictures": sorted(art.names)}


COMMON_CSS = """#root{position:absolute;inset:0;overflow:hidden;font-family:'Noto Sans JP','Nunito',sans-serif}
.bg{position:absolute;inset:0}.bg img{width:100%;height:100%;object-fit:cover}
.serif{font-family:'EB Garamond','Playfair Display',serif}.abs{position:absolute}
.card{position:absolute;border-radius:36px;padding:34px 40px;box-shadow:0 18px 50px rgba(40,50,30,.16)}
.pill{display:inline-block;border-radius:999px;padding:8px 24px}
.badge{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;color:#fff;font-weight:700}"""


def _scene(sid: str, dur: float, body: str, js: str) -> str:
    return f"""<template><style>{COMMON_CSS}</style>
<div id="root" data-composition-id="{sid}" data-width="{W}" data-height="{H}">{body}</div>
<script>const tl = gsap.timeline({{ paused: true }}); const D = {dur};
tl.fromTo("#root", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.5, ease: "power1.out" }}, 0);
tl.to("#root", {{ opacity: 0, duration: 0.4, ease: "power1.in" }}, D - 0.4);
{js}
window.__timelines["{sid}"] = tl;</script></template>"""


def _bg(th, art, veil: float = 0.0) -> str:
    v = f'<div style="position:absolute;inset:0;background:rgba(246,241,228,{veil})"></div>' if veil else ""
    return f'<div class="bg"><img src="{art(th["bg"])}" alt=""></div>{v}'


def scene_title(s, th, team, dur, art) -> str:
    w, f = s["week"], s["farm"]
    body = f"""{_bg(th, art)}
<img id="t-sun" class="abs" src="{art(th['sun'])}" style="left:1470px;top:60px;width:300px" alt="">
<img id="t-face" class="abs" src="{art(th['face'])}" style="left:1260px;top:470px;width:500px" alt="">
<div id="t-card" class="card" style="left:170px;top:330px;width:960px;background:{th['card']}">
<div style="font-size:34px;letter-spacing:.14em;color:{th['accent']};font-weight:700">AQUA WEEKLY REPORT</div>
<div id="t-name" class="serif" style="font-size:112px;line-height:1.05;color:{th['ink']};margin-top:14px">{e(f['name'])}{' · Demo data' if f.get('demo') else ''}</div>
<div style="font-size:44px;color:{th['ink']};opacity:.75;margin-top:18px">{e(w['week_start'])}  to  {e(w['week_end'])}</div></div>"""
    js = """tl.fromTo("#t-card",{x:-80,opacity:0},{x:0,opacity:1,duration:1.0,ease:"expo.out"},0.4);
tl.fromTo("#t-face",{y:120,opacity:0},{y:0,opacity:1,duration:0.9,ease:"back.out(1.2)"},1.0);
tl.fromTo("#t-sun",{y:-60,opacity:0},{y:0,opacity:1,duration:1.1,ease:"power3.out"},0.2);
tl.to("#t-sun",{rotation:14,duration:D,ease:"none",transformOrigin:"50% 50%"},0);"""
    return _scene("title", dur, body, js)


def _check(color: str) -> str:
    return f'<span class="badge" style="width:96px;height:96px;font-size:60px;background:{color}">&#10003;</span>'


def scene_score(s, th, team, dur, art) -> str:
    w = s["week"]
    score = w["score"]
    circ = 2 * 3.14159 * 150
    target = (score or 0) / 100
    icons = {"irr": f'<img src="{art("wateringcan_1")}" style="width:100px" alt="">', "water": f'<img src="{art("drop_1")}" style="width:100px" alt="">', "task": _check(th["accent"])}
    kp = [("Irrigations advised", fmt(w["irrigations"]), "irr"), ("Aqua estimated savings", f"{fmt(w['estimated_savings_l'])} L" if w.get("estimated_savings_l") is not None else "n/a", "water"), ("Tasks done", f"{w['tasks_done']} of {w['tasks']}", "task")]
    cards = "".join(f"""<div class="card kpi" style="left:820px;top:{250 + i * 230}px;width:880px;background:{th['card']};display:flex;align-items:center;gap:30px">
{icons[ic]}<div><div style="font-size:42px;color:{th['ink']};opacity:.7">{e(lab)}</div>
<div class="serif" style="font-size:84px;line-height:1;color:{th['ink']}">{e(val)}</div></div></div>""" for i, (lab, val, ic) in enumerate(kp))
    body = f"""{_bg(th, art, 0.55)}
<div class="card" style="left:150px;top:210px;width:600px;height:640px;background:{th['card']};text-align:center">
<svg class="abs" viewBox="0 0 340 340" style="left:130px;top:70px;width:340px;height:340px"><circle cx="170" cy="170" r="150" fill="none" stroke="#e3dcc6" stroke-width="26"/>
<circle cx="170" cy="170" r="150" fill="none" stroke="{th['accent']}" stroke-width="26" stroke-linecap="round" stroke-dasharray="{circ:.1f}" stroke-dashoffset="{circ:.1f}" transform="rotate(-90 170 170)" id="s-arc"/></svg>
<div id="s-num" class="serif abs" style="left:0;top:128px;width:600px;font-size:150px;color:{th['ink']}">{score if score is not None else 'n/a'}</div>
<div class="abs" style="left:0;top:392px;width:600px;font-size:34px;color:{th['ink']};opacity:.65">Aqua farm score</div>
<div id="s-word" class="serif abs" style="left:0;top:462px;width:600px;font-size:64px;color:{th['accent']}">{e(th['word'])}</div>
<div class="abs" style="left:0;top:560px;width:600px;font-size:32px;color:{th['ink']};opacity:.6">{w['readings']} soil readings this week</div></div>{cards}"""
    js = f"""tl.fromTo("#s-arc",{{strokeDashoffset:{circ:.1f}}},{{strokeDashoffset:{circ * (1 - target):.1f},duration:2.0,ease:"power2.out"}},0.7);
const num={{v:0}}; tl.fromTo(num,{{v:0}},{{v:{score or 0},duration:2.0,ease:"power2.out",onUpdate:()=>{{document.getElementById("s-num").textContent={'Math.round(num.v)' if score is not None else '"n/a"'}}}}},0.7);
tl.fromTo(".kpi",{{x:120,opacity:0}},{{x:0,opacity:1,duration:0.8,ease:"power3.out",stagger:0.35}},1.2);
tl.fromTo("#s-word",{{y:20,opacity:0}},{{y:0,opacity:1,duration:0.7,ease:"power2.out"}},2.4);"""
    return _scene("score", dur, body, js)


def scene_fields(s, th, team, dur, art) -> str:
    w = s["week"]
    share = w["healthy_share"]
    cmp = {r["key"]: r for r in s["comparison"]}["healthy_share"]
    trend = {"up": "Better than last week", "down": "Drier than last week", "same": "Same as last week", None: "No earlier week to compare"}[cmp["trend"]]
    plots = [p for p in w["plots"] if p["readings"]][:3]
    chips = "".join(f'<div class="pill" style="background:#fffdf6;color:{th["ink"]};font-size:34px;margin:6px 10px 0 0">{e(p["name"])}: {fmt(p["average"])}%</div>' for p in plots)
    crops = th["crops"]
    row = ""
    xs = [1150, 1380, 1610]
    for i, c in enumerate(crops[:3]):
        row += f'<img class="abs fc" src="{art(c)}" style="left:{xs[i]}px;top:{560 + (i % 2) * 40}px;width:{250 if c != "olive_1" else 190}px" alt="">'
    if not crops:                                                          # a hard week: show the dry land itself, and the watering can that is needed
        row = f'<img class="abs fc" src="{art("drought_1")}" style="left:1180px;top:520px;width:560px;border-radius:30px;box-shadow:0 18px 50px rgba(40,30,20,.3)" alt="">' \
              f'<img class="abs fc" src="{art("wateringcan_1")}" style="left:1580px;top:380px;width:230px" alt="">'
    body = f"""{_bg(th, art, 0.1 if th["bg"] != "drought_1" else 0.0)}
<div id="f-card" class="card" style="left:150px;top:110px;width:1020px;background:{th['card']}">
<div style="font-size:40px;color:{th['accent']};font-weight:700;letter-spacing:.08em">YOUR FIELDS</div>
<div class="serif" style="font-size:150px;line-height:1;color:{th['ink']};margin-top:6px">{'n/a' if share is None else str(round(share * 100)) + '%'}</div>
<div style="font-size:42px;color:{th['ink']};opacity:.8;margin-top:6px">of soil readings were in the healthy range</div>
<div class="pill" style="background:{th['accent']};color:#fff;font-size:36px;margin-top:22px">{e(trend)}</div><div style="margin-top:14px">{chips}</div></div>{row}"""
    js = """tl.fromTo("#f-card",{y:-60,opacity:0},{y:0,opacity:1,duration:0.9,ease:"expo.out"},0.4);
tl.fromTo(".fc",{y:90,opacity:0},{y:0,opacity:1,duration:0.8,ease:"back.out(1.1)",stagger:0.25},0.9);
tl.to(".fc",{rotation:2.5,duration:2.4,ease:"sine.inOut",yoyo:true,repeat:1,transformOrigin:"50% 100%"},2.2);"""
    return _scene("fields", dur, body, js)


def scene_team(s, th, team, dur, art) -> str:
    head = f"{s['workers']} workers on the farm" if s["workers"] else "Your team"
    cards = ""
    for i, p in enumerate(team):
        x = 120 + i * 430
        cards += f"""<div class="card tm" style="left:{x}px;top:580px;width:390px;height:380px;background:{th['card']};text-align:center;padding:30px 24px">
<img src="{art(th['team'][i % len(th['team'])])}" style="height:290px;max-width:340px;object-fit:contain;margin:-245px auto 10px" alt="">
<div class="serif" style="font-size:52px;color:{th['ink']}">{e(p['name'])}</div><div style="font-size:30px;line-height:1.3;color:{th['ink']};opacity:.78;margin-top:10px">{e(p['line'])}</div></div>"""
    if not team:
        cards = f'<div class="card" style="left:300px;top:470px;width:1320px;background:{th["card"]};text-align:center;font-size:44px;color:{th["ink"]}">No team activity was recorded this week. Add workers and log their tasks to see them here.</div>'
    hires = f" &nbsp;&middot;&nbsp; {s['week']['hires']} newly hired" if s["week"]["hires"] else ""
    body = f"""{_bg(th, art, 0.45)}
<div id="m-head" class="abs serif" style="left:120px;top:90px;font-size:104px;color:{th['ink']}">Your team this week</div>
<div id="m-sub" class="abs" style="left:124px;top:225px;font-size:46px;color:{th['accent']};font-weight:700">{e(head)}{hires}</div>
{cards}"""
    js = """tl.fromTo("#m-head",{x:-70,opacity:0},{x:0,opacity:1,duration:0.9,ease:"expo.out"},0.4);
tl.fromTo("#m-sub",{opacity:0},{opacity:1,duration:0.7,ease:"power2.out"},0.9);
tl.fromTo(".tm",{y:100,opacity:0},{y:0,opacity:1,duration:0.8,ease:"back.out(1.1)",stagger:0.4},1.4);"""
    return _scene("team", dur, body, js)


def scene_advice(s, th, team, dur, art) -> str:
    tips = s["advice"][:3]
    mark = "&#9733;" if th["word"] != "A hard week" else "!"
    rows = "".join(f"""<div class="card tip" style="left:520px;top:{210 + i * 230}px;width:1280px;background:{th['card']};display:flex;gap:28px;align-items:center;padding:26px 36px">
<span class="badge" style="width:86px;height:86px;font-size:52px;flex:none;background:{th['accent']}">{mark}</span><div style="font-size:40px;line-height:1.3;color:{th['ink']}">{e(t[:150])}</div></div>""" for i, t in enumerate(tips))
    body = f"""{_bg(th, art, 0.5)}
<img id="a-face" class="abs" src="{art(th['face'])}" style="left:60px;top:470px;width:400px" alt="">
<div id="a-head" class="abs serif" style="left:520px;top:80px;font-size:100px;color:{th['ink']}">For next week</div>{rows}
<div id="a-end" class="abs" style="left:0;top:940px;width:1920px;text-align:center;font-size:44px;color:{th['ink']};opacity:.85">See you next week &nbsp; <span class="badge" style="width:70px;height:70px;font-size:40px;background:#c23b2e">æ°´</span></div>"""
    js = """tl.fromTo("#a-head",{x:-60,opacity:0},{x:0,opacity:1,duration:0.9,ease:"expo.out"},0.4);
tl.fromTo("#a-face",{x:-120,opacity:0},{x:0,opacity:1,duration:0.9,ease:"power3.out"},0.6);
tl.fromTo(".tip",{x:140,opacity:0},{x:0,opacity:1,duration:0.8,ease:"power3.out",stagger:0.5},1.2);
tl.fromTo("#a-end",{opacity:0},{opacity:1,duration:0.8,ease:"power2.out"},D-4.2);"""
    return _scene("advice", dur, body, js)


def render(project: Path, out: Path, quality: str = "draft", timeout: int = 600) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    p = subprocess.run(["npx", "--yes", "hyperframes", "render", str(project), "-o", str(out), "-q", quality, "--quiet"], capture_output=True, timeout=timeout, cwd=project)
    if p.returncode != 0 or not out.exists() or out.stat().st_size < 10_000:
        raise RuntimeError("The video could not be made: " + (p.stderr or p.stdout).decode(errors="ignore")[-300:])
