# Aqua firmware

Three sketches for the ESP32.

- `aqua_device/`: the current one. Reads the soil probe and the tank level, sends them to Aqua, and switches the pump relay when the website tells it to.
- `aquafarm_standalone/`: the bench-test sketch. The board makes its own Wi-Fi network (`AquaFarm`) and serves a phone dashboard with Auto and Manual modes. No internet, router or Aqua server needed.
- `esp32_sensor/`: the older sensor-only sketch that posts with the shared device key.

## Connect a device to the website

1. On the website open **Devices**, press **Add device**, give it a name and pick the plot it waters. Copy the secret key it shows, it is shown once.
2. Install the Arduino IDE with the ESP32 board package, and the library **ArduinoJson** (version 7) from the Library Manager.
3. In `aqua_device/` copy `config.example.h` to `config.h` and fill in the Wi-Fi name and password of the farm network, the server address (`AQUA_SERVER`) and the key (`DEVICE_TOKEN`).
4. Choose the board "ESP32 Dev Module", upload, open the serial monitor at 115200.
5. Within a minute the device shows as **Online** on the Devices page, with a "Main pump" output you can start and stop.

## Wiring

| Part | Board pin |
|---|---|
| Soil probe signal | GPIO 34 |
| HC-SR04 trigger | GPIO 5 |
| HC-SR04 echo | GPIO 18, through a divider of two 1 kΩ resistors |
| Relay input | GPIO 26 |
| Relay VCC and GND | 5 V and GND of the board |

The pump must have its own power supply, switched by the relay contacts (common and normally open). Never power the pump from the board.

## How it stays safe

- The relay is off when the board starts.
- Every run has an end time, kept on a separate task, so the pump stops on time even if the network drops.
- The pump never runs longer than `MAX_PUMP_RUN_MS` (30 minutes), whatever the website asks.
- If the server cannot be reached for `LOST_LINK_PUMP_OFF_MS` (5 minutes) the pump switches off.
- The website also refuses to start the pump when the linked tank is below 10 percent, and caps each run per output.

This sketch has not been compiled in this repository's setup. Compile and test it on the bench with the pump disconnected (watch the relay click) before wiring the real pump.

## Try the website without hardware

`simulated_device.py` behaves like a board: it connects with a key, sends readings and obeys commands.

```bash
python3 simulated_device.py --server http://127.0.0.1:8000 --token aqd_the_key_from_the_website
```

Start the pump from the Devices page and the soil moisture and tank level in the simulator move like a real farm.

## Standalone phone test (`aquafarm_standalone/`)

1. Install the libraries **DHT sensor library** and **Adafruit Unified Sensor** from the Library Manager, choose "ESP32 Dev Module" and upload.
2. On the phone join the Wi-Fi `AquaFarm` (password `123456789`, change it in the sketch). The phone may say there is no internet: stay connected. A "sign in" popup opens the dashboard by itself, or open `http://192.168.4.1`.
3. Wiring is the one in the project report (soil GPIO 34, rain GPIO 35, trigger GPIO 27, echo GPIO 18 through a divider, DHT11 GPIO 4, relay GPIO 26, LEDs 25/33/32, buzzer 23).
4. Calibrate `SOIL_DRY`, `SOIL_WET`, `FULL_CM` and `EMPTY_CM` with the raw values shown on the dashboard.
5. Test with the pump disconnected first and watch the relay click.

The dashboard uses the same colours and logo as the Aqua website. This sketch has not been compiled here. Compile it and run through the scenarios of the report on the bench before relying on it.

### Standalone board on the farm network

`FARM_WIFI` defaults to `0` (the board runs its own access point). To also join a farm router, set it to `1`, fill in `FARM_SSID` and `FARM_PASS` at the top of the sketch, and flash the board. The `AquaFarm` access point and its dashboard stay available while the board connects to the router. The serial monitor prints the router-assigned address when it connects. Use that private address as `AQUAFARM_BRIDGE_URL` on the Aqua server and when adding the local board in Devices. The server must be able to reach the board at that address.

`/data` keeps the existing readings and adds the board's configuration, including the 30-second timed maximum and 300-second Until Stop hard cap. `pumpMs`, `emergencyMs` and `soakWait` are in milliseconds.
