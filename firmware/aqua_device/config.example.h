// Copy this file to config.h and fill it in. config.h holds secrets, do not share it.
#pragma once

// Wi-Fi the board joins (the IoT network on the farm)
#define WIFI_SSID "AquaFarm"
#define WIFI_PASS "put the Wi-Fi password here"

// Where the Aqua server is, no slash at the end. Use https:// for the VPS, http:// for a laptop on the same network.
#define AQUA_SERVER "https://aqua.example.com"
// The secret key shown once when you add the device on the Devices page
#define DEVICE_TOKEN "aqd_paste_the_key_here"

// 1 = accept any HTTPS certificate (works everywhere, but a fake server could read the key on a hostile network)
// 0 = check the certificate against AQUA_ROOT_CA below
#define AQUA_INSECURE_TLS 1

// Pins
#define SOIL_PIN 34          // capacitive soil probe, analog
#define TRIG_PIN 5           // HC-SR04 trigger
#define ECHO_PIN 18          // HC-SR04 echo, through the 1k + 1k divider
#define RELAY_PIN 26         // relay module input that switches the pump
#define RELAY_ACTIVE_LOW 1   // most relay modules switch ON when the pin is LOW

// Calibration: measure these once and edit
#define SOIL_DRY 3200        // raw value with the probe in air
#define SOIL_WET 1300        // raw value with the probe in water
#define TANK_EMPTY_CM 100.0  // sensor to water distance when the tank is empty
#define TANK_FULL_CM 10.0    // distance when full

// Timing and safety
#define READINGS_EVERY_MS 60000UL        // send soil, tank readings every minute
#define HELLO_EVERY_MS 300000UL          // announce yourself every 5 minutes
#define MAX_PUMP_RUN_MS 1800000UL        // the pump never runs longer than 30 minutes, whatever the server says
#define LOST_LINK_PUMP_OFF_MS 300000UL   // pump switches off if the server was unreachable for 5 minutes
