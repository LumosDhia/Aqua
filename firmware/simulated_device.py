#!/usr/bin/env python3
"""A pretend ESP32 that speaks the real Aqua device protocol, for testing the website without hardware.

    python3 simulated_device.py --server http://127.0.0.1:8000 --token aqd_xxx

It declares a pump and a valve, sends soil and tank readings every few seconds, long-polls for commands,
obeys on/off with a duration, and moves the readings the way a real farm would (soil rises while the pump
runs, the tank drains). Stop it with Ctrl-C to see the device go offline on the website.
"""
import argparse
import json
import random
import threading
import time
import urllib.error
import urllib.request


def call(server, token, method, path, body=None, timeout=10):
    req = urllib.request.Request(server + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", "X-Device-Token": token})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, {}
    except (urllib.error.URLError, TimeoutError):
        return 0, {}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--server", default="http://127.0.0.1:8000")
    ap.add_argument("--token", required=True)
    ap.add_argument("--tank", type=float, default=80.0, help="starting tank level in percent")
    ap.add_argument("--soil", type=float, default=26.0, help="starting soil moisture in percent")
    ap.add_argument("--readings-every", type=float, default=8.0)
    a = ap.parse_args()

    state = {"soil": a.soil, "tank": a.tank, "on": {"pump1": 0.0, "valve1": 0.0}}   # output -> time when it switches off
    lock = threading.Lock()
    stop = threading.Event()

    def outputs():
        now = time.time()
        return [{"key": k, "label": {"pump1": "Main pump", "valve1": "North valve"}[k], "kind": "pump" if k == "pump1" else "valve",
                 "state": "on" if until > now else "off"} for k, until in state["on"].items()]

    def physics():
        while not stop.is_set():
            time.sleep(1)
            with lock:
                if state["on"]["pump1"] > time.time():
                    state["soil"] = min(95, state["soil"] + 0.35)
                    state["tank"] = max(0, state["tank"] - 0.25)
                else:
                    state["soil"] = max(5, state["soil"] - 0.01)

    def readings():
        while not stop.is_set():
            with lock:
                body = {"soil_moisture": round(state["soil"] + random.uniform(-0.3, 0.3), 1), "tank_level": round(state["tank"], 1)}
            code, _ = call(a.server, a.token, "POST", "/api/device/readings", body)
            print(f"readings {code} {body}")
            stop.wait(a.readings_every)

    code, hello = call(a.server, a.token, "POST", "/api/device/hello",
                       {"firmware": "sim-1.0", "rssi": -58, "ip": "192.168.4.77", "actuators": outputs()})
    if code != 200:
        raise SystemExit(f"hello failed with {code}: wrong token or server address?")
    print(f"connected as device {hello['device_id']} ({hello['name']})")
    threading.Thread(target=physics, daemon=True).start()
    threading.Thread(target=readings, daemon=True).start()
    try:
        while True:
            code, data = call(a.server, a.token, "GET", "/api/device/commands?wait=20", timeout=30)
            if code != 200:
                print(f"poll failed {code}, retrying")
                time.sleep(3)
                continue
            for c in data.get("commands", []):
                key = c["actuator"]
                if key not in state["on"]:
                    call(a.server, a.token, "POST", f"/api/device/commands/{c['id']}/ack", {"status": "failed", "result": "unknown output"})
                    continue
                with lock:
                    state["on"][key] = time.time() + (c.get("duration_s") or 600) if c["action"] == "on" else 0.0
                print(f"{key} -> {c['action']}" + (f" for {c['duration_s']} s" if c["action"] == "on" else ""))
                call(a.server, a.token, "POST", f"/api/device/commands/{c['id']}/ack", {"status": "done", "result": f"{key} {c['action']}"})
    except KeyboardInterrupt:
        stop.set()
        print("bye, the website will show this device as offline in about a minute")


if __name__ == "__main__":
    main()
