// ESP32: reads soil moisture + tank level, POSTs to the API every INTERVAL_MS.
#include <WiFi.h>
#include <HTTPClient.h>

const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASS = "YOUR_PASSWORD";
const char* API_URL   = "https://api.example.com/api/readings";  // your VPS
const char* API_KEY   = "change-me";                               // same as DEVICE_API_KEY
const int   PLOT_ID   = 1;
const unsigned long INTERVAL_MS = 15UL * 60UL * 1000UL;            // 15 min

const int SOIL_PIN = 34;       // analog soil probe
const int TRIG_PIN = 5, ECHO_PIN = 18;   // HC-SR04 ultrasonic on the tank
const int SOIL_DRY = 3200, SOIL_WET = 1300;   // CALIBRATE: raw value in air / in water
const float TANK_EMPTY_CM = 100, TANK_FULL_CM = 10; // CALIBRATE: distance when empty / full

float readSoilPercent() {
  int raw = analogRead(SOIL_PIN);
  float p = 100.0 * (SOIL_DRY - raw) / (SOIL_DRY - SOIL_WET);
  return constrain(p, 0, 100);
}

float readTankPercent() {
  digitalWrite(TRIG_PIN, LOW); delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10); digitalWrite(TRIG_PIN, LOW);
  long us = pulseIn(ECHO_PIN, HIGH, 30000);
  float cm = us * 0.0343 / 2.0;
  float p = 100.0 * (TANK_EMPTY_CM - cm) / (TANK_EMPTY_CM - TANK_FULL_CM);
  return constrain(p, 0, 100);
}

void setup() {
  Serial.begin(115200);
  pinMode(TRIG_PIN, OUTPUT); pinMode(ECHO_PIN, INPUT);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nWiFi ok");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(API_URL);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-API-Key", API_KEY);
    String body = "{\"plot_id\":" + String(PLOT_ID) +
                  ",\"soil_moisture\":" + String(readSoilPercent(), 1) +
                  ",\"tank_level\":" + String(readTankPercent(), 1) + "}";
    int code = http.POST(body);
    Serial.printf("POST %d %s\n", code, body.c_str());
    http.end();
  }
  delay(INTERVAL_MS);
}
