# AquaFarm ESP32 bridge

Aqua’s backend reads the standalone AquaFarm controller over its local HTTP API. The Devices card shows the latest tank, soil, rain, air, mode and pump state, plus alarms, Online/Offline and last seen. Link the board to a plot to put sensor readings in the existing plot history and irrigation advice. Faulted tank and soil readings are stored as missing values. The website uses its existing farm roles and records pump, mode and stop actions in the device’s activity.

## Set up the farm host

1. Connect the computer running the Aqua API to the board’s `AquaFarm` access point. The stock sketch runs in access-point mode and normally serves `http://192.168.4.1`. Use the address printed at boot if it differs. Keep a separate connection to the farm LAN if other users need to reach the website.
2. Add these settings to `local/farm.env` when using `run-farm.sh`, or to the root `.env` when using Docker Compose. Make sure the API process or container can reach the configured IP. Run one bridge-enabled API worker for this controller.

   ```dotenv
   AQUAFARM_BRIDGE_ENABLED=true
   AQUAFARM_BRIDGE_URL=http://192.168.4.1
   AQUAFARM_BRIDGE_INTERVAL=15
   AQUAFARM_PUMP_MAX_MINUTES=2
   ```

   The bridge defaults to disabled. The background interval is in seconds and the server pump limit is in minutes. The example allows the stock five-minute Until Stop hard cap. A lower configured server limit still applies. Restart the API after changing the settings.

3. On the correct farm, open **Devices → Add device → Board on the farm network**. Enter the same address, give it a name and select its plot. If the board is already registered at that address, edit its existing card to link the plot. The card shows Online after a valid poll. Check the API log for a timeout, connection failure or invalid payload if it stays Offline.

## Pump control

Switch to **Manual** to use **Water now**. The website offers 3, 5, 10, 15 and 30 seconds and **Until Stop**. Timed requests are clamped to the board’s maximum, the server limit and the output’s configured timed limit. Until Stop uses the board’s hard cap and the server limit. **Stop pump** works in either mode and leaves the mode unchanged. The Devices card refreshes the board readings every two seconds while visible and displays the board’s reported pump countdown.

The bridge keeps a stop deadline and checks whether the pump has stopped. If a start reply is lost, the bridge attempts an immediate stop and records the failure. If the board cannot be reached, the action reports a failure.

**Stop everything** switches the board to Manual and checks that the pump is off, even if the last reading showed an idle pump. If it cannot confirm the stop, the website displays an error and the worker retries in the background. Re-enable Auto explicitly from Devices when you want the board to resume its own watering decisions. A controller reboot restores the firmware’s startup mode.

The backend needs a working link and power to send a physical stop. Runs started outside Aqua can pass between polls. The bridge leaves firmware, sensor calibration, relay wiring and the controller’s own automatic watering rules in place. Remote routing to the farm network and an independent physical cutoff are outside the bridge.
