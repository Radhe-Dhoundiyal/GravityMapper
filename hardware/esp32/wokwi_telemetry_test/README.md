# Wokwi Telemetry Test

ESP32 simulation sketch for testing the live GADV dashboard before physical rover hardware is available.

## Purpose

The sketch connects to Wokwi WiFi, wakes the Render service with `/api/health`, then sends synthetic rover telemetry to:

```text
https://gravitymapper.onrender.com/api/telemetry
```

Packets are sent every 3 seconds and use the same `newAnomalyPoint` shape as the dashboard expects.

## Wokwi Setup

1. Create a new Wokwi project.
2. Choose an ESP32 board target.
3. Replace the generated sketch with `wokwi_telemetry_test.ino`.
4. Add the required libraries in Wokwi/Arduino:

   - WiFi
   - HTTPClient
   - WiFiClientSecure
   - ArduinoJson

5. Start the simulation and open Serial Monitor at `115200` baud.

Wokwi network credentials are already set in the sketch:

```cpp
const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASSWORD = "";
```

## Telemetry Identity

The synthetic rover identifies itself as:

```json
{
  "device_id": "wokwi-rover-001",
  "experiment_id": "EXP-WOKWI",
  "run_id": "RUN-WOKWI-001"
}
```

## Generated Values

The simulation produces:

- small IMU oscillations
- slowly drifting GPS coordinates near Delhi
- slightly varying pressure, altitude, and temperature
- smooth anomaly and smoothed-anomaly signals
- `platformStationary: true`

## Expected Serial Output

```text
GADV Wokwi telemetry test starting...
Telemetry endpoint: https://gravitymapper.onrender.com/api/telemetry
Connecting to WiFi SSID: Wokwi-GUEST
WiFi connected. IP: 10.10.0.2 RSSI: -42 dBm
Health check status: 200
Health response: {"ok":true,"service":"gadv","time":"..."}
Packet #1
POST status: 200
Response body: {"ok":true,"broadcast":1}
Lat/Lng: 28.613930, 77.209020  anomaly=0.721 smoothed=0.108
```

`broadcast:1` means one dashboard WebSocket client was open and received the packet. If it shows `broadcast:0`, the POST succeeded but no dashboard tab was connected at that moment.

## Confirming Dashboard Success

1. Open the deployed GADV dashboard in a browser.
2. Keep the dashboard tab open.
3. Start the Wokwi simulation.
4. Watch Serial Monitor for `POST status: 200` and `broadcast:1`.
5. The dashboard telemetry panel should show:

   - `Device: wokwi-rover-001`
   - `Experiment: EXP-WOKWI`
   - `Run: RUN-WOKWI-001`

The map should receive drifting points and the telemetry panel should update every 3 seconds.
