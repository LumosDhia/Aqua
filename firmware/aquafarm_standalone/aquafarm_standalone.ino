// AquaFarm standalone test sketch (ESP32).
// The board makes its own Wi-Fi network, reads 5 sensors, decides when to water (Auto)
// or waters only on a button press (Manual), and serves a phone dashboard.
// No internet and no router are needed. Libraries: "DHT sensor library" and
// "Adafruit Unified Sensor" (both from the Library Manager). DNSServer, WebServer and
// WiFi come with the ESP32 board package.

#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <DHT.h>

// ---------- CONFIG ----------
const char* AP_SSID = "AquaFarm";            // name of the Wi-Fi network the ESP32 creates
const char* AP_PASS = "123456789";           // at least 8 characters, change it
const char* AQUAFARM_VERSION = "standalone-1.1.0";

#define FARM_WIFI 0
#if FARM_WIFI
const char* FARM_SSID = "your-farm-wifi";
const char* FARM_PASS = "your-farm-password";
#endif

const int SOIL_DRY = 3000;                   // raw value in dry air (calibrate, see "raw" on the page)
const int SOIL_WET = 1400;                   // raw value in water (calibrate)
const int SOIL_NEED_PCT = 35;                // below this = needs water
const int SOIL_EMERGENCY_PCT = 15;           // below this = water even if humid air

const float FULL_CM = 3, EMPTY_CM = 15;      // tank calibration
const int TANK_MIN_PCT = 15;                 // below this = tank empty, pump blocked (auto AND manual)

const int RAIN_THRESHOLD = 600;              // water sensor value = raining now

const float HOT_C = 35.0;                    // at or above this, automatic dose is increased by 50%
const float HUMID_SKIP_PCT = 90.0;           // at or above this air humidity, skip normal watering

const unsigned long PUMP_MS = 5000;          // normal automatic dose
const unsigned long EMERGENCY_MS = 2000;     // small automatic dose
const unsigned long SOAK_WAIT_MS = 600000UL; // wait 10 min after a watering
const unsigned long CHECK_EVERY_MS = 60000;  // automatic decision once a minute
const unsigned long SAMPLE_MS = 3000;        // sensors refreshed for the dashboard
const int MANUAL_MAX_SEC = 30;               // longest timed run from the web page
const int MANUAL_HARD_CAP_SEC = 120;         // "Until Stop" never runs longer than this (2 min)

// Relay wiring options
const bool RELAY_ACTIVE_LOW = false;         // true if the relay turns ON when the pin is LOW
const bool RELAY_FLOAT_OFF = false;          // set true (with ACTIVE_LOW) if the relay stays ON
                                             // when the pin is HIGH 3.3 V (common with 5 V modules)

// Soil sensor sanity: raw values outside this range = sensor unplugged or faulty, no automatic watering
const int SOIL_RAW_MIN = 300, SOIL_RAW_MAX = 4000;
// ----------------------------

const int SOIL = 34, RAIN = 35, TRIG = 27, ECHO = 18;
const int RELAY = 26, LED_G = 25, LED_B = 33, LED_R = 32, BUZ = 23;
const int DHT_PIN = 4;

DHT dht(DHT_PIN, DHT11);
WebServer server(80);
DNSServer dns;                               // answers every name with our address (phone "sign in" popup)

int tank = 0, soil = 0, soilRaw = 0, rainRaw = 0;
bool rainNow = false, alarmOn = false, soilFault = false, tankFault = false;
bool autoMode = true;                        // true = system decides, false = buttons only
float airTemp = NAN, airHum = NAN;
bool pumpOn = false, hasWatered = false;
unsigned long pumpEnd = 0, lastWater = 0, lastSample = 0, lastDecision = 0;
int beepSteps = 0;                           // non-blocking buzzer: 6 steps = 3 beeps
unsigned long beepNext = 0;
String statusText = "Starting";

const char PAGE[] PROGMEM = R"rawliteral(
<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#1b4d3e">
<title>Aqua Farm</title>
<style>
:root{--cream:#f6f1e4;--cream2:#ebe4d2;--paper:#fffcf6;--forest:#1b4d3e;--forest2:#0f3329;--teal:#2f7a6b;
--leaf:#7cb069;--leafs:#b7d4a8;--ochre:#d4a054;--ochres:#e8c58a;--hanko:#c23b2e;--ink:#241f1a;--ink2:#5c574e;
--mute:#8a8478;--tank:#e07a3d;--line:rgba(27,77,62,.14)}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--cream);color:var(--ink);font:16px/1.4 "Zen Kaku Gothic New","Noto Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
padding-bottom:env(safe-area-inset-bottom)}
header{background:var(--forest);color:#fffcf6;padding:calc(14px + env(safe-area-inset-top)) 16px 14px;display:flex;align-items:center;gap:12px;
border-radius:0 0 24px 24px;box-shadow:0 10px 24px rgba(15,51,41,.18)}
header svg{width:38px;height:38px;flex:none;color:#fffcf6}
.ttl{flex:1;min-width:0}
.ttl b{display:block;font:600 22px/1.1 "Shippori Mincho","Noto Serif JP",Georgia,serif}
.ttl span{font-size:12px;opacity:.75}
#conn{font-size:12px;padding:5px 10px;border-radius:999px;background:rgba(255,252,246,.14);white-space:nowrap}
#conn.live::before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--leaf);margin-right:6px}
#conn.off{background:var(--hanko)}
main{max-width:560px;margin:0 auto;padding:16px 16px 8px}
#banner{padding:14px 16px;border-radius:20px;background:var(--leafs);color:var(--forest2);font-weight:600;margin-bottom:14px;border:1px solid var(--line)}
#banner.bad{background:var(--hanko);color:#fff}
#banner.info{background:var(--teal);color:#fff}
#banner.warn{background:var(--ochres);color:var(--forest2)}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.card{background:var(--paper);border:1px solid var(--line);border-radius:20px;padding:14px;box-shadow:0 6px 18px rgba(15,51,41,.06);min-width:0}
.wide{grid-column:1/-1}
.lbl{font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--mute)}
.val{font:600 28px/1.15 "Shippori Mincho","Noto Serif JP",Georgia,serif;margin:6px 0 8px;color:var(--forest2)}
.sub{font-size:12px;color:var(--ink2);min-height:16px;margin-top:6px}
.sub.bad{color:var(--hanko);font-weight:600}
.track{position:relative;height:10px;border-radius:6px;background:var(--cream2);overflow:visible}
.fill{height:100%;width:0;border-radius:6px;background:var(--leaf);transition:width .4s,background .3s}
.tick{position:absolute;top:-3px;width:2px;height:16px;background:var(--ink);opacity:.45;border-radius:1px}
.seg{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;border-radius:999px;background:var(--cream2);margin-top:10px}
button,select{font:inherit;touch-action:manipulation}
.seg button{min-height:46px;border:0;border-radius:999px;background:transparent;color:var(--ink2);font-weight:600}
.seg button.on{background:var(--forest2);color:#fffcf6;box-shadow:0 2px 8px rgba(15,51,41,.25)}
.row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
select{width:100%;min-height:52px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:var(--paper);color:var(--ink);font-size:16px}
.act{min-height:52px;border-radius:999px;border:0;font-weight:700;color:#fffcf6}
.go{background:var(--forest)}
.stop{background:var(--hanko)}
.act:active{transform:scale(.98)}
.act:disabled,select:disabled{opacity:.4}
.full{grid-column:1/-1}
#msg{margin-top:12px;font-size:14px;color:var(--ink2);min-height:20px}
.foot{max-width:560px;margin:0 auto;padding:6px 16px 28px;font-size:12px;color:var(--mute);text-align:center}
.stale .val,.stale .track{opacity:.45}
</style></head><body>
<header>
<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="currentColor"/><path d="M24 9.5C24 9.5 13.5 22 13.5 29.2a10.5 10.5 0 0 0 21 0C34.5 22 24 9.5 24 9.5z" fill="#1b4d3e"/><path d="M27.5 21c7.2-3.2 10.4 4.6 4.6 9.2-1.8-3.6-2.8-6.8-4.6-9.2z" fill="#7CB069"/></svg>
<div class="ttl"><b>Aqua</b><span>Smart irrigation</span></div>
<span id="conn">Connecting</span>
</header>
<main id="root">
<div id="banner">Waiting for data</div>
<div class="grid">
<div class="card"><div class="lbl">Tank level</div><div class="val" id="tank">--</div>
<div class="track"><div class="fill" id="tankbar"></div><div class="tick" id="tanktick"></div></div><div class="sub" id="tanksub"></div></div>
<div class="card"><div class="lbl">Soil moisture</div><div class="val" id="soil">--</div>
<div class="track"><div class="fill" id="soilbar"></div><div class="tick" id="soiltick"></div></div><div class="sub" id="soilraw"></div></div>
<div class="card"><div class="lbl">Rain sensor</div><div class="val" id="rain">--</div><div class="sub" id="rainraw"></div></div>
<div class="card"><div class="lbl">Pump</div><div class="val" id="pump">--</div><div class="sub" id="since"></div></div>
<div class="card"><div class="lbl">Air temperature</div><div class="val" id="temp">--</div></div>
<div class="card"><div class="lbl">Air humidity</div><div class="val" id="hum">--</div></div>
<div class="card wide">
<div class="lbl">Mode</div>
<div class="seg"><button id="bAuto" onclick="setMode(1)">Auto</button><button id="bMan" onclick="setMode(0)">Manual</button></div>
<div class="sub" id="modeHelp"></div>
<div class="row">
<select id="sec" aria-label="Duration" disabled><option value="3">3 s</option><option value="5" selected>5 s</option><option value="10">10 s</option><option value="15">15 s</option><option value="30">30 s</option><option value="0">Until Stop</option></select>
<button class="act go" id="bWater" onclick="waterNow()" disabled>Water now</button>
<button class="act stop full" onclick="stopPump()">Stop pump</button>
</div>
<div id="msg" role="status"></div>
</div>
</div>
</main>
<div class="foot" id="up"></div>
<script>
const $=id=>document.getElementById(id);
let busy=false,fails=0;
function fmtAgo(s){if(s<0)return "No watering since power-up";if(s<60)return "Last watering "+s+" s ago";if(s<3600)return "Last watering "+Math.floor(s/60)+" min ago";return "Last watering "+Math.floor(s/3600)+" h ago"}
function getJSON(url,opt){
 const c=new AbortController();const t=setTimeout(()=>c.abort(),5000);
 return fetch(url,Object.assign({cache:'no-store',signal:c.signal},opt||{})).then(r=>{if(!r.ok)throw new Error('http '+r.status);return r.json()}).finally(()=>clearTimeout(t));
}
function post(url){
 $('msg').textContent='Sending...';
 getJSON(url,{method:'POST'}).then(d=>{$('msg').textContent=d.msg;tick()}).catch(()=>{$('msg').textContent='Request failed, try again'});
}
function waterNow(){post('/pump?action=on&sec='+$('sec').value)}
function stopPump(){post('/pump?action=off')}
function setMode(a){post('/mode?auto='+a)}
function render(d){
 $('tank').textContent=d.tankFault?'--':d.tank+'%';$('tankbar').style.width=d.tank+'%';
 $('tankbar').style.background=d.tank<d.tankMin?'var(--hanko)':'var(--tank)';
 $('tanktick').style.left=d.tankMin+'%';
 $('tanksub').textContent=d.tankFault?'Sensor error':(d.tank<d.tankMin?'Too low, pump blocked':'');
 $('tanksub').className='sub'+((d.tankFault||d.tank<d.tankMin)?' bad':'');
 $('soil').textContent=d.soil+'%';$('soilbar').style.width=d.soil+'%';
 $('soilbar').style.background=d.soil<d.soilNeed?'var(--ochre)':'var(--leaf)';
 $('soiltick').style.left=d.soilNeed+'%';
 $('soilraw').textContent='raw '+d.soilRaw+(d.soilFault?' (sensor fault)':'');
 $('soilraw').className='sub'+(d.soilFault?' bad':'');
 $('rain').textContent=d.rain?'Raining':'Dry';
 $('rainraw').textContent='raw '+d.rainRaw;
 $('temp').textContent=d.temp===null?'--':d.temp.toFixed(1)+' °C';
 $('hum').textContent=d.hum===null?'--':Math.round(d.hum)+' %';
 $('pump').textContent=d.pump?'ON':'OFF';
 $('since').textContent=d.pump?(d.pumpLeft>0?d.pumpLeft+' s left':''):fmtAgo(d.sinceWater);
 $('bAuto').className=d.auto?'on':'';
 $('bMan').className=d.auto?'':'on';
 $('bWater').disabled=d.auto;$('sec').disabled=d.auto;
 $('modeHelp').textContent=d.auto?'The system decides when to water. Switch to Manual to use the buttons.':'The pump runs only when you press Water now.';
 const b=$('banner');b.textContent=d.status;
 b.className=d.alarm?'bad':(d.pump?'info':(d.status.indexOf('saved')>=0?'warn':''));
 $('up').textContent='Uptime '+Math.floor(d.uptime/60)+' min';
}
function tick(){
 if(busy)return;busy=true;
 getJSON('/data').then(d=>{fails=0;render(d);$('conn').textContent='Live';$('conn').className='live';$('root').className=''})
 .catch(()=>{fails++;if(fails>=2){$('conn').textContent='Disconnected';$('conn').className='off';$('root').className='stale'}})
 .finally(()=>{busy=false});
}
setInterval(()=>{if(!document.hidden)tick()},2000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});
tick();
</script></body></html>
)rawliteral";

// Relay OFF is the safe state. With RELAY_FLOAT_OFF the pin is released (high impedance)
// instead of driven HIGH, which fixes active-low 5 V modules that stay ON with 3.3 V.
void relay(bool on) {
  if (RELAY_ACTIVE_LOW && RELAY_FLOAT_OFF) {
    if (on) { pinMode(RELAY, OUTPUT); digitalWrite(RELAY, LOW); }
    else    { pinMode(RELAY, INPUT); }
  } else {
    pinMode(RELAY, OUTPUT);
    digitalWrite(RELAY, on ^ RELAY_ACTIVE_LOW);
  }
}

void leds(bool g, bool b, bool r) {
  digitalWrite(LED_G, g); digitalWrite(LED_B, b); digitalWrite(LED_R, r);
}

// Three short beeps without blocking the web server.
void startBeep() { beepSteps = 6; beepNext = millis(); }

void beepUpdate() {
  if (beepSteps <= 0) return;
  if ((long)(millis() - beepNext) < 0) return;
  digitalWrite(BUZ, (beepSteps % 2) == 0 ? HIGH : LOW);
  beepSteps--;
  beepNext = millis() + 150;
}

float readCm() {
  digitalWrite(TRIG, LOW);  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  long us = pulseIn(ECHO, HIGH, 30000);
  if (us == 0) return -1;
  return us * 0.0343 / 2.0;
}

// No echo at all = sensor unplugged or blocked: report 0 % (pump blocked) and raise tankFault.
int tankPct() {
  float s = 0; int n = 0;
  for (int i = 0; i < 5; i++) { float d = readCm(); if (d > 0) { s += d; n++; } delay(60); }
  tankFault = (n == 0);
  if (n == 0) return 0;
  float d = s / n;
  int pct = (int)((EMPTY_CM - d) * 100.0 / (EMPTY_CM - FULL_CM));
  return constrain(pct, 0, 100);
}

int soilPct() {
  long s = 0;
  for (int i = 0; i < 10; i++) { s += analogRead(SOIL); delay(10); }
  soilRaw = s / 10;
  soilFault = (soilRaw < SOIL_RAW_MIN || soilRaw > SOIL_RAW_MAX);
  int pct = map(soilRaw, SOIL_DRY, SOIL_WET, 0, 100);
  return constrain(pct, 0, 100);
}

void readAir() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (!isnan(t)) airTemp = t;
  if (!isnan(h)) airHum = h;
}

void sampleSensors() {
  tank = tankPct();
  soil = soilPct();
  rainRaw = analogRead(RAIN);
  rainNow = rainRaw > RAIN_THRESHOLD;
  readAir();
}

void pumpStart(unsigned long ms) {
  leds(true, false, false);
  relay(true);
  pumpOn = true;
  pumpEnd = millis() + ms;
  lastWater = millis();
  hasWatered = true;
}

void pumpStop(const char* why) {
  relay(false);
  pumpOn = false;
  leds(false, false, alarmOn);
  statusText = why;
}

void pumpUpdate() {
  if (pumpOn && (long)(millis() - pumpEnd) >= 0) pumpStop("Pump finished");
}

// Keeps the alarm in step with the tank on every sample, not only once a minute.
void updateAlarm() {
  bool low = tank < TANK_MIN_PCT;
  if (low && !alarmOn) {
    alarmOn = true;
    leds(false, false, true);
    startBeep();
  } else if (!low && alarmOn) {
    alarmOn = false;
    leds(false, false, false);
    lastDecision = millis() - CHECK_EVERY_MS;              // decide again right away
  }
}

// The ONLY place where the pump starts automatically. Called only when the pump is off.
void decide() {
  bool wetAir = !isnan(airHum) && airHum >= HUMID_SKIP_PCT;
  bool hot = !isnan(airTemp) && airTemp >= HOT_C;
  unsigned long dose = hot ? PUMP_MS * 3UL / 2UL : PUMP_MS;

  leds(false, false, false);
  alarmOn = false;

  if (tank < TANK_MIN_PCT) {
    alarmOn = true;
    statusText = tankFault ? "ALARM: tank sensor error, pump blocked" : "ALARM: tank low, pump blocked";
    leds(false, false, true);
    startBeep();
  } else if (!autoMode) {
    statusText = "Manual mode: use the buttons";           // never starts the pump
  } else if (soilFault) {
    statusText = "Soil sensor fault, no automatic watering";
  } else if (soil >= SOIL_NEED_PCT) {
    statusText = "Soil moisture OK";
  } else if (hasWatered && millis() - lastWater < SOAK_WAIT_MS) {
    leds(true, false, false);
    statusText = "Soaking, waiting before next watering";
  } else if (rainNow || wetAir) {
    leds(false, true, false);
    if (soil < SOIL_EMERGENCY_PCT && !rainNow) {
      statusText = "Very dry, emergency dose";
      pumpStart(EMERGENCY_MS);
    } else {
      statusText = rainNow ? "Raining, water saved" : "Humid air, water saved";
    }
  } else {
    statusText = hot ? "Watering (hot weather, longer dose)" : "Watering";
    pumpStart(dose);
  }
}

// Escapes a text for use inside a JSON string.
String jstr(const String& s) {
  String o;
  o.reserve(s.length() + 4);
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    if (c == '"' || c == '\\') { o += '\\'; o += c; }
    else if ((unsigned char)c < 0x20) o += ' ';
    else o += c;
  }
  return o;
}

void sendMsg(bool ok, const String& msg) {
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", String("{\"ok\":") + (ok ? 1 : 0) + ",\"msg\":\"" + jstr(msg) + "\"}");
}

void handleRoot() {
  server.sendHeader("Cache-Control", "no-store");
  server.send_P(200, "text/html", PAGE);
}

// Any other address (phone connectivity checks, typed names) goes to the dashboard.
void handleNotFound() {
  server.sendHeader("Location", String("http://") + WiFi.softAPIP().toString() + "/", true);
  server.send(302, "text/plain", "");
}

void handleData() {
  long left = pumpOn ? (long)(pumpEnd - millis()) / 1000 : 0;
  if (left < 0) left = 0;
  String j = "{";
  j += "\"tank\":" + String(tank);
  j += ",\"tankFault\":" + String(tankFault ? 1 : 0);
  j += ",\"soil\":" + String(soil);
  j += ",\"soilRaw\":" + String(soilRaw);
  j += ",\"soilFault\":" + String(soilFault ? 1 : 0);
  j += ",\"rain\":" + String(rainNow ? 1 : 0);
  j += ",\"rainRaw\":" + String(rainRaw);
  j += ",\"temp\":" + (isnan(airTemp) ? String("null") : String(airTemp, 1));
  j += ",\"hum\":" + (isnan(airHum) ? String("null") : String(airHum, 0));
  j += ",\"pump\":" + String(pumpOn ? 1 : 0);
  j += ",\"pumpLeft\":" + String(left);
  j += ",\"alarm\":" + String(alarmOn ? 1 : 0);
  j += ",\"auto\":" + String(autoMode ? 1 : 0);
  j += ",\"status\":\"" + jstr(statusText) + "\"";
  j += ",\"sinceWater\":" + String(hasWatered ? (long)((millis() - lastWater) / 1000) : -1L);
  j += ",\"tankMin\":" + String(TANK_MIN_PCT);
  j += ",\"soilNeed\":" + String(SOIL_NEED_PCT);
  j += ",\"uptime\":" + String(millis() / 1000);
  j += ",\"manualMaxSec\":" + String(MANUAL_MAX_SEC);
  j += ",\"hardCapSec\":" + String(MANUAL_HARD_CAP_SEC);
  j += ",\"soilEmergency\":" + String(SOIL_EMERGENCY_PCT);
  j += ",\"pumpMs\":" + String(PUMP_MS);
  j += ",\"emergencyMs\":" + String(EMERGENCY_MS);
  j += ",\"soakWait\":" + String(SOAK_WAIT_MS);
  j += ",\"hotC\":" + String(HOT_C, 1);
  j += ",\"humidSkip\":" + String(HUMID_SKIP_PCT, 1);
  j += ",\"apSsid\":\"" + jstr(String(AP_SSID)) + "\"";
  j += ",\"version\":\"" + jstr(String(AQUAFARM_VERSION)) + "\"";
  j += "}";
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", j);
}

// Buttons: "on" works only in Manual mode. "off" (Stop) works always.
void handlePump() {
  String act = server.arg("action");
  if (act == "on") {
    if (autoMode) {
      sendMsg(false, "Auto mode: the system decides. Switch to Manual to use the button");
      return;
    }
    if (tank < TANK_MIN_PCT) {
      sendMsg(false, "Blocked: tank level is too low");
      return;
    }
    int sec = server.arg("sec").toInt();
    if (sec <= 0) {                                        // "Until Stop"
      pumpStart(MANUAL_HARD_CAP_SEC * 1000UL);
      statusText = "Manual watering until you press Stop";
      sendMsg(true, "Pump running until you press Stop");
    } else {
      sec = constrain(sec, 1, MANUAL_MAX_SEC);
      pumpStart(sec * 1000UL);
      statusText = "Manual watering " + String(sec) + " s";
      sendMsg(true, "Pump running for " + String(sec) + " s");
    }
  } else if (act == "off") {
    if (pumpOn) pumpStop("Pump stopped manually");
    sendMsg(true, "Pump stopped");
  } else {
    sendMsg(false, "Unknown action");
  }
}

void handleMode() {
  String a = server.arg("auto");
  if (a != "0" && a != "1") {
    sendMsg(false, "Unknown mode");
    return;
  }
  autoMode = (a == "1");
  if (pumpOn) pumpStop("Pump stopped (mode changed)");     // a mode change always stops the pump
  if (autoMode) {
    statusText = "Automatic mode on";
    lastDecision = millis() - CHECK_EVERY_MS;              // decide right away
    sendMsg(true, "Auto mode: the system decides when to water");
  } else {
    statusText = "Manual mode: use the buttons";
    sendMsg(true, "Manual mode: the pump runs only when you press Water now");
  }
}

void setup() {
  relay(false);                                            // pump OFF first, before anything else
  Serial.begin(115200);
  pinMode(TRIG, OUTPUT); pinMode(ECHO, INPUT);
  pinMode(LED_G, OUTPUT); pinMode(LED_B, OUTPUT); pinMode(LED_R, OUTPUT); pinMode(BUZ, OUTPUT);
  digitalWrite(BUZ, LOW);
  leds(false, false, false);
  dht.begin();

#if FARM_WIFI
  WiFi.mode(WIFI_AP_STA);
#else
  WiFi.mode(WIFI_AP);
#endif
  WiFi.softAP(AP_SSID, AP_PASS, 1, 0, 4);
#if FARM_WIFI
  WiFi.begin(FARM_SSID, FARM_PASS);
#endif
  dns.start(53, "*", WiFi.softAPIP());
  Serial.print("Wi-Fi network: "); Serial.println(AP_SSID);
  Serial.print("Open http://"); Serial.println(WiFi.softAPIP());

  server.on("/", HTTP_GET, handleRoot);
  server.on("/data", HTTP_GET, handleData);
  server.on("/pump", HTTP_POST, handlePump);
  server.on("/mode", HTTP_POST, handleMode);
  server.onNotFound(handleNotFound);
  server.begin();

  delay(1500);                                             // DHT11 needs about 1 s after power-up
  sampleSensors();
  lastSample = millis();
  decide();
  lastDecision = millis();
}

void loop() {
#if FARM_WIFI
  static bool farmConnected = false;
  bool connected = WiFi.status() == WL_CONNECTED;
  if (connected && !farmConnected) {
    Serial.print("Farm network: http://"); Serial.println(WiFi.localIP());
  }
  farmConnected = connected;
#endif
  dns.processNextRequest();
  server.handleClient();
  pumpUpdate();
  beepUpdate();

  if (millis() - lastSample >= SAMPLE_MS) {
    sampleSensors();
    lastSample = millis();
    updateAlarm();

    if (pumpOn && tank < TANK_MIN_PCT) {                   // never keep running dry
      pumpStop("ALARM: tank low, pump stopped");
    }

    Serial.printf("tank=%d%% soil=%d%% (raw %d) rain=%d(%d) temp=%.1fC hum=%.0f%% pump=%d auto=%d | %s\n",
                  tank, soil, soilRaw, rainNow, rainRaw, airTemp, airHum, pumpOn, autoMode, statusText.c_str());
  }

  // Automatic decisions run once a minute while the pump is off (Manual only refreshes alarm and status)
  if (!pumpOn && millis() - lastDecision >= CHECK_EVERY_MS) {
    decide();
    lastDecision = millis();
  }
}
