// Aqua device: reports soil and tank readings, and obeys commands from the Aqua website.
// Needs the ArduinoJson library (Library Manager, "ArduinoJson" by Benoit Blanchon, version 7).
// Board: "ESP32 Dev Module". Copy config.example.h to config.h first.
//
// Protocol (all calls carry the header X-Device-Token):
//   POST /api/device/hello      announce, declare outputs
//   POST /api/device/readings   soil_moisture, tank_level
//   GET  /api/device/commands?wait=20   long poll, returns {"commands":[{"id","actuator","action","duration_s"}]}
//   POST /api/device/commands/{id}/ack  {"status":"done"|"failed","result":"..."}
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include "config.h"

#define FIRMWARE_VERSION "1.0.0"

volatile bool pumpOn = false;
volatile unsigned long pumpOffAt = 0;        // millis() when the current run must end
volatile unsigned long lastServerOk = 0;     // millis() of the last successful call
unsigned long lastReading = 0, lastHello = 0;
bool helloDone = false;

void setPump(bool on) {
  digitalWrite(RELAY_PIN, (on ^ (RELAY_ACTIVE_LOW == 1)) ? HIGH : LOW);
  pumpOn = on;
  if (!on) pumpOffAt = 0;
}

// Runs on its own core, so the pump stops on time even while a long poll is waiting.
void safetyTask(void*) {
  for (;;) {
    unsigned long now = millis();
    if (pumpOn) {
      bool timeUp = pumpOffAt != 0 && (long)(now - pumpOffAt) >= 0;
      bool linkLost = now - lastServerOk > LOST_LINK_PUMP_OFF_MS;
      if (timeUp || linkLost) setPump(false);
    }
    vTaskDelay(pdMS_TO_TICKS(100));
  }
}

float readSoilPercent() {
  long sum = 0;
  for (int i = 0; i < 8; i++) { sum += analogRead(SOIL_PIN); delay(5); }
  float p = 100.0 * (SOIL_DRY - sum / 8.0) / (SOIL_DRY - SOIL_WET);
  return constrain(p, 0, 100);
}

float readTankPercent() {
  digitalWrite(TRIG_PIN, LOW); delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10); digitalWrite(TRIG_PIN, LOW);
  long us = pulseIn(ECHO_PIN, HIGH, 30000);
  if (us == 0) return -1;                      // no echo: do not report a made-up level
  float cm = us * 0.0343 / 2.0;
  float p = 100.0 * (TANK_EMPTY_CM - cm) / (TANK_EMPTY_CM - TANK_FULL_CM);
  return constrain(p, 0, 100);
}

bool ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) delay(250);
  if (WiFi.status() == WL_CONNECTED) { Serial.printf("Wi-Fi ok %s\n", WiFi.localIP().toString().c_str()); return true; }
  return false;
}

// One HTTP call. Returns the status code, fills `out` with the body.
int call(const char* method, const String& path, const String& body, String& out, int timeoutMs = 10000) {
  String url = String(AQUA_SERVER) + path;
  HTTPClient http;
  WiFiClientSecure tls;
  WiFiClient plain;
  bool https = url.startsWith("https://");
  if (https) {
#if AQUA_INSECURE_TLS
    tls.setInsecure();
#endif
    http.begin(tls, url);
  } else {
    http.begin(plain, url);
  }
  http.setTimeout(timeoutMs);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  int code = strcmp(method, "GET") == 0 ? http.GET() : http.POST(body);
  out = code > 0 ? http.getString() : "";
  http.end();
  if (code >= 200 && code < 300) lastServerOk = millis();
  return code;
}

void sendHello() {
  JsonDocument doc;
  doc["firmware"] = FIRMWARE_VERSION;
  doc["rssi"] = WiFi.RSSI();
  doc["ip"] = WiFi.localIP().toString();
  JsonObject a = doc["actuators"].add<JsonObject>();
  a["key"] = "pump1"; a["label"] = "Main pump"; a["kind"] = "pump"; a["state"] = pumpOn ? "on" : "off";
  String body, out; serializeJson(doc, body);
  int code = call("POST", "/api/device/hello", body, out);
  Serial.printf("hello %d\n", code);
  if (code == 200) { helloDone = true; lastHello = millis(); }
}

void sendReadings() {
  JsonDocument doc;
  doc["soil_moisture"] = readSoilPercent();
  float tank = readTankPercent();
  if (tank >= 0) doc["tank_level"] = tank;
  String body, out; serializeJson(doc, body);
  int code = call("POST", "/api/device/readings", body, out);
  Serial.printf("readings %d %s\n", code, body.c_str());
  lastReading = millis();
}

void ack(int id, const char* status, const char* result) {
  JsonDocument doc;
  doc["status"] = status; doc["result"] = result;
  String body, out; serializeJson(doc, body);
  call("POST", "/api/device/commands/" + String(id) + "/ack", body, out);
}

void handleCommand(JsonObject c) {
  int id = c["id"];
  const char* actuator = c["actuator"] | "";
  const char* action = c["action"] | "";
  if (strcmp(actuator, "pump1") != 0) { ack(id, "failed", "unknown output"); return; }
  if (strcmp(action, "on") == 0) {
    unsigned long run = (c["duration_s"] | 600) * 1000UL;
    if (run > MAX_PUMP_RUN_MS) run = MAX_PUMP_RUN_MS;
    pumpOffAt = millis() + run;            // set before switching on so the safety task never sees a run with no end
    setPump(true);
    ack(id, "done", "pump on");
  } else if (strcmp(action, "off") == 0) {
    setPump(false);
    ack(id, "done", "pump off");
  } else {
    ack(id, "failed", "unknown action");
  }
}

void pollCommands() {
  String out;
  int code = call("GET", "/api/device/commands?wait=20", "", out, 30000);
  if (code != 200) { Serial.printf("poll %d\n", code); delay(3000); return; }
  JsonDocument doc;
  if (deserializeJson(doc, out)) return;
  for (JsonObject c : doc["commands"].as<JsonArray>()) handleCommand(c);
}

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  setPump(false);                              // always start with the pump off
  pinMode(TRIG_PIN, OUTPUT); pinMode(ECHO_PIN, INPUT);
  lastServerOk = millis();
  xTaskCreatePinnedToCore(safetyTask, "safety", 2048, nullptr, 3, nullptr, 0);
  ensureWifi();
}

void loop() {
  if (!ensureWifi()) { delay(2000); return; }
  unsigned long now = millis();
  if (!helloDone || now - lastHello > HELLO_EVERY_MS) sendHello();
  if (now - lastReading > READINGS_EVERY_MS) sendReadings();
  if (helloDone) pollCommands();               // waits up to 20 s for a command, then returns
}
