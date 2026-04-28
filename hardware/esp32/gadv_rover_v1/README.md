# GADV Rover v1 ESP32-S3 Firmware

First real Arduino firmware sketch for the GADV rover telemetry stack.

## Board

- ESP32-S3 DevKitC-1

## Required Arduino Libraries

Install these through the Arduino IDE Library Manager where available:

- WiFi
- HTTPClient
- WiFiClientSecure
- ArduinoJson
- Wire
- Adafruit MPU6050
- Adafruit BMP280
- TinyGPSPlus
- OneWire
- DallasTemperature
- Adafruit INA219

The first four ESP32 networking libraries and `Wire` are provided by the ESP32 Arduino core.

## Pin Map

| Device | Signal | ESP32-S3 GPIO |
|---|---:|---:|
| I2C bus | SDA | GPIO 8 |
| I2C bus | SCL | GPIO 9 |
| NEO-6M GPS | RX | GPIO 44 |
| NEO-6M GPS | TX | GPIO 43 |
| DS18B20 | DATA | GPIO 4 |
| HC-SR04 | TRIG | GPIO 6 |
| HC-SR04 | ECHO | GPIO 7 |
| microSD placeholder | SCK | GPIO 12 |
| microSD placeholder | MOSI | GPIO 11 |
| microSD placeholder | MISO | GPIO 13 |
| microSD placeholder | CS | GPIO 10 |

The microSD pins are reserved as a placeholder only. Full SD logging is not implemented in this sketch yet.

## Setup

1. Open `gadv_rover_v1.ino` in the Arduino IDE.
2. Select `ESP32S3 Dev Module` or the matching `ESP32-S3 DevKitC-1` board entry.
3. Install the required libraries listed above.
4. Replace the placeholder WiFi values:

   ```cpp
   const char* WIFI_SSID = "WIFI_SSID";
   const char* WIFI_PASSWORD = "WIFI_PASSWORD";
   ```

5. Confirm the telemetry endpoint is:

   ```text
   https://gravitymapper.onrender.com/api/telemetry
   ```

6. Upload the sketch and open Serial Monitor at `115200` baud.

## Telemetry

The sketch sends an HTTPS POST every 3 seconds using `WiFiClientSecure` with `client.setInsecure()` for testing. Each payload uses:

```json
{
  "type": "newAnomalyPoint",
  "data": {
    "device_id": "gadv-rover-001",
    "experiment_id": "EXP-TEST",
    "run_id": "RUN-TEST"
  }
}
```

Sensor fields are added to the same `data` object before upload.

## Expected Serial Output

Typical boot output:

```text
GADV rover v1 booting...
Target endpoint: https://gravitymapper.onrender.com/api/telemetry
Connecting to WiFi SSID: WIFI_SSID
WiFi connected. IP: 192.168.1.42 RSSI: -50 dBm
Initializing sensors...
MPU6050: OK
BMP280: OK
DS18B20: OK (1 device(s))
INA219: OK
GPS UART initialized at 9600 baud.
HTTP POST code: 200
Server response: {"ok":true,"broadcast":1}
Packet #1 sent=true anomaly=-12.3456 stationary=true gpsFix=true
```

If a sensor is missing, the sketch prints a warning and continues sending safe default values.

## Scientific Note

`anomalyValue` is a temporary live proxy derived from the `az` vertical acceleration residual. It exists only to make the live dashboard useful during early rover tests. Final scientific gravity anomaly values should come from `analysis/scripts/gravity_pipeline.py`, which applies tilt compensation, altitude correction, latitude correction, smoothing, and outlier rejection.
