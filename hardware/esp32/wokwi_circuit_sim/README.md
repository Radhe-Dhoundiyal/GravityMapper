# GADV Wokwi Circuit Simulation

This folder is a pre-hardware simulation package for the ESP32-S3 rover telemetry flow. It sends synthetic GADV packets to:

```text
https://gravitymapper.onrender.com/api/telemetry
```

## Files

- `wokwi_circuit_sim.ino` - networked ESP32-S3 sketch that posts simulated telemetry every 3 seconds.
- `diagram.json` - Wokwi circuit layout using the approved GADV pins.

## Wokwi Setup

1. Create a new Wokwi ESP32-S3 project.
2. Replace the generated sketch with `wokwi_circuit_sim.ino`.
3. Replace the generated diagram with `diagram.json`.
4. Add the `ArduinoJson` library in Wokwi if it is not already detected.
5. Start the simulation and open Serial Monitor at `115200` baud.

Wokwi WiFi is already configured:

```cpp
const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASSWORD = "";
```

## Simulated Telemetry

The sketch generates:

- drifting GPS coordinates near Delhi
- IMU acceleration and gyro values near a stationary rover
- BMP-style pressure, altitude, and temperature
- DS18B20-style temperature
- HC-SR04-style distance
- INA219-style battery voltage
- temporary dashboard anomaly and smoothed anomaly values

The values are synthetic. They verify packet shape, Render reachability, dashboard ingestion, run persistence, and map visualization; they do not validate physical sensor accuracy.

## Expected Serial Output

```text
GADV Wokwi circuit simulation starting...
Telemetry endpoint: https://gravitymapper.onrender.com/api/telemetry
Connecting to WiFi SSID: Wokwi-GUEST
WiFi connected. IP: ...
Health check status: 200
Packet #1 POST status=200
Lat/Lng 28.6139..., 77.2090... | anomaly=...
Response: {"ok":true,"broadcast":1}
```

If Render is asleep, the health check may take a moment or fail once before later telemetry succeeds.

## Pin Map Used

| Device | Signal | ESP32-S3 GPIO |
|---|---:|---:|
| I2C bus | SDA | GPIO 8 |
| I2C bus | SCL | GPIO 9 |
| GPS | ESP32 RX | GPIO 44 |
| GPS | ESP32 TX | GPIO 43 |
| DS18B20 | DATA | GPIO 4 |
| HC-SR04 | TRIG | GPIO 6 |
| HC-SR04 | ECHO | GPIO 7 |
| microSD placeholder | SCK | GPIO 12 |
| microSD placeholder | MOSI | GPIO 11 |
| microSD placeholder | MISO | GPIO 13 |
| microSD placeholder | CS | GPIO 10 |

## Dashboard Check

Open the deployed dashboard and confirm:

- the telemetry panel shows `wokwi-circuit-rover-001`
- experiment/run IDs are `EXP-WOKWI-CIRCUIT` and `RUN-WOKWI-CIRCUIT-001`
- map points drift slowly
- `/api/runs` eventually includes the Wokwi run

