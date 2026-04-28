/*
  GADV Rover v1 telemetry firmware
  Board: ESP32-S3 DevKitC-1

  Sends live rover telemetry to:
    https://gravitymapper.onrender.com/api/telemetry

  NOTE: anomalyValue is a temporary live proxy derived from vertical
  acceleration residual. Final scientific anomaly values are produced by
  the Python analysis pipeline after filtering and correction.
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_BMP280.h>
#include <TinyGPSPlus.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Adafruit_INA219.h>
#include <time.h>

// -------------------- User configuration --------------------
const char* WIFI_SSID = "WIFI_SSID";
const char* WIFI_PASSWORD = "WIFI_PASSWORD";

const char* TELEMETRY_URL = "https://gravitymapper.onrender.com/api/telemetry";

const char* DEVICE_ID = "gadv-rover-001";
const char* EXPERIMENT_ID = "EXP-TEST";
const char* RUN_ID = "RUN-TEST";

// -------------------- Pin plan --------------------
constexpr int I2C_SDA_PIN = 8;
constexpr int I2C_SCL_PIN = 9;

constexpr int GPS_RX_PIN = 44;
constexpr int GPS_TX_PIN = 43;

constexpr int DS18B20_DATA_PIN = 4;

constexpr int ULTRASONIC_TRIG_PIN = 6;
constexpr int ULTRASONIC_ECHO_PIN = 7;

// microSD SPI placeholder pins. Full SD logging is intentionally not enabled yet.
constexpr int SD_SCK_PIN = 12;
constexpr int SD_MOSI_PIN = 11;
constexpr int SD_MISO_PIN = 13;
constexpr int SD_CS_PIN = 10;

// -------------------- Timing / thresholds --------------------
constexpr unsigned long TELEMETRY_INTERVAL_MS = 3000;
constexpr unsigned long WIFI_CONNECT_TIMEOUT_MS = 20000;
constexpr float G_MPS2 = 9.80665f;
constexpr float STATIONARY_ACCEL_DELTA_G = 0.12f;
constexpr float STATIONARY_GYRO_DPS = 8.0f;

// -------------------- Sensors --------------------
Adafruit_MPU6050 mpu;
Adafruit_BMP280 bmp;
TinyGPSPlus gps;
HardwareSerial GPSSerial(2);
OneWire oneWire(DS18B20_DATA_PIN);
DallasTemperature ds18b20(&oneWire);
Adafruit_INA219 ina219;

bool mpuReady = false;
bool bmpReady = false;
bool ds18b20Ready = false;
bool ina219Ready = false;

unsigned long lastTelemetryAt = 0;
uint32_t packetCount = 0;
float anomalySmoothed = 0.0f;

struct SensorSnapshot {
  float ax_g = 0.0f;
  float ay_g = 0.0f;
  float az_g = 0.0f;
  float gx_dps = 0.0f;
  float gy_dps = 0.0f;
  float gz_dps = 0.0f;
  float pressure_hpa = 0.0f;
  float temperature_c = 0.0f;
  float altitude_m = 0.0f;
  double latitude = 0.0;
  double longitude = 0.0;
  float speed_mps = 0.0f;
  float hdop = 0.0f;
  int satellites = 0;
  float distance_cm = 0.0f;
  float battery_voltage = 0.0f;
  float anomaly_value = 0.0f;
  bool platform_stationary = false;
};

void connectWiFi();
void initSensors();
void readGpsBytes();
SensorSnapshot readSensors();
float readDistanceCm();
String isoTimestamp();
bool postTelemetry(const SensorSnapshot& s);

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("GADV rover v1 booting...");
  Serial.printf("Target endpoint: %s\n", TELEMETRY_URL);
  Serial.printf("microSD placeholder pins: SCK=%d MOSI=%d MISO=%d CS=%d\n",
                SD_SCK_PIN, SD_MOSI_PIN, SD_MISO_PIN, SD_CS_PIN);

  pinMode(ULTRASONIC_TRIG_PIN, OUTPUT);
  pinMode(ULTRASONIC_ECHO_PIN, INPUT);

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  GPSSerial.begin(9600, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);

  connectWiFi();
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  initSensors();
}

void loop() {
  readGpsBytes();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected; reconnecting...");
    connectWiFi();
  }

  const unsigned long now = millis();
  if (now - lastTelemetryAt >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryAt = now;
    SensorSnapshot snapshot = readSensors();
    bool ok = postTelemetry(snapshot);

    packetCount++;
    Serial.printf("Packet #%lu sent=%s anomaly=%.4f stationary=%s gpsFix=%s\n",
                  static_cast<unsigned long>(packetCount),
                  ok ? "true" : "false",
                  snapshot.anomaly_value,
                  snapshot.platform_stationary ? "true" : "false",
                  gps.location.isValid() ? "true" : "false");
  }
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.printf("Connecting to WiFi SSID: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  const unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_CONNECT_TIMEOUT_MS) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("WiFi connected. IP: %s RSSI: %d dBm\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else {
    Serial.println("WARNING: WiFi connection timed out. Firmware will keep retrying.");
  }
}

void initSensors() {
  Serial.println("Initializing sensors...");

  mpuReady = mpu.begin();
  if (mpuReady) {
    mpu.setAccelerometerRange(MPU6050_RANGE_4_G);
    mpu.setGyroRange(MPU6050_RANGE_500_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
    Serial.println("MPU6050: OK");
  } else {
    Serial.println("WARNING: MPU6050 not detected. IMU fields will use safe defaults.");
  }

  bmpReady = bmp.begin(0x76) || bmp.begin(0x77);
  if (bmpReady) {
    bmp.setSampling(
      Adafruit_BMP280::MODE_NORMAL,
      Adafruit_BMP280::SAMPLING_X2,
      Adafruit_BMP280::SAMPLING_X16,
      Adafruit_BMP280::FILTER_X16,
      Adafruit_BMP280::STANDBY_MS_500
    );
    Serial.println("BMP280: OK");
  } else {
    Serial.println("WARNING: BMP280 not detected. Barometer fields will use safe defaults.");
  }

  ds18b20.begin();
  ds18b20Ready = ds18b20.getDeviceCount() > 0;
  if (ds18b20Ready) {
    Serial.printf("DS18B20: OK (%d device(s))\n", ds18b20.getDeviceCount());
  } else {
    Serial.println("WARNING: DS18B20 not detected. Temperature will fall back to BMP280/default.");
  }

  ina219Ready = ina219.begin();
  if (ina219Ready) {
    Serial.println("INA219: OK");
  } else {
    Serial.println("WARNING: INA219 not detected. Battery voltage will use safe default.");
  }

  Serial.println("GPS UART initialized at 9600 baud.");
}

void readGpsBytes() {
  while (GPSSerial.available() > 0) {
    gps.encode(GPSSerial.read());
  }
}

SensorSnapshot readSensors() {
  SensorSnapshot s;

  if (mpuReady) {
    sensors_event_t accel;
    sensors_event_t gyro;
    sensors_event_t temp;
    mpu.getEvent(&accel, &gyro, &temp);

    s.ax_g = accel.acceleration.x / G_MPS2;
    s.ay_g = accel.acceleration.y / G_MPS2;
    s.az_g = accel.acceleration.z / G_MPS2;
    s.gx_dps = gyro.gyro.x * 180.0f / PI;
    s.gy_dps = gyro.gyro.y * 180.0f / PI;
    s.gz_dps = gyro.gyro.z * 180.0f / PI;
  }

  if (bmpReady) {
    s.pressure_hpa = bmp.readPressure() / 100.0f;
    s.altitude_m = bmp.readAltitude(1013.25f);
    s.temperature_c = bmp.readTemperature();
  }

  if (ds18b20Ready) {
    ds18b20.requestTemperatures();
    const float dsTemp = ds18b20.getTempCByIndex(0);
    if (dsTemp > -100.0f && dsTemp < 125.0f) {
      s.temperature_c = dsTemp;
    } else {
      Serial.println("WARNING: DS18B20 returned invalid temperature; keeping fallback value.");
    }
  }

  if (gps.location.isValid()) {
    s.latitude = gps.location.lat();
    s.longitude = gps.location.lng();
  }
  if (gps.speed.isValid()) {
    s.speed_mps = gps.speed.mps();
  }
  if (gps.hdop.isValid()) {
    s.hdop = gps.hdop.hdop();
  }
  if (gps.satellites.isValid()) {
    s.satellites = gps.satellites.value();
  }

  s.distance_cm = readDistanceCm();

  if (ina219Ready) {
    s.battery_voltage = ina219.getBusVoltage_V() + (ina219.getShuntVoltage_mV() / 1000.0f);
  }

  const float accelMagnitudeG = sqrtf(s.ax_g * s.ax_g + s.ay_g * s.ay_g + s.az_g * s.az_g);
  const float gyroMagnitudeDps = sqrtf(
    s.gx_dps * s.gx_dps + s.gy_dps * s.gy_dps + s.gz_dps * s.gz_dps
  );
  s.platform_stationary =
    fabsf(accelMagnitudeG - 1.0f) < STATIONARY_ACCEL_DELTA_G &&
    gyroMagnitudeDps < STATIONARY_GYRO_DPS;

  // Temporary live anomaly proxy:
  // Treat vertical acceleration residual from 1 g as a rough mGal-like signal.
  // This is only for real-time dashboard visualization; final anomaly values
  // come from analysis/scripts/gravity_pipeline.py after corrections/filtering.
  s.anomaly_value = mpuReady ? (s.az_g - 1.0f) * 980665.0f : 0.0f;
  anomalySmoothed = 0.8f * anomalySmoothed + 0.2f * s.anomaly_value;

  return s;
}

float readDistanceCm() {
  digitalWrite(ULTRASONIC_TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(ULTRASONIC_TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(ULTRASONIC_TRIG_PIN, LOW);

  const unsigned long duration = pulseIn(ULTRASONIC_ECHO_PIN, HIGH, 30000UL);
  if (duration == 0) {
    return 0.0f;
  }
  return duration / 58.0f;
}

String isoTimestamp() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 100)) {
    return "1970-01-01T00:00:00Z";
  }

  char buffer[25];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buffer);
}

bool postTelemetry(const SensorSnapshot& s) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WARNING: Cannot POST telemetry while WiFi is disconnected.");
    return false;
  }

  WiFiClientSecure client;
  client.setInsecure();  // Testing only. Replace with Render CA certificate for production field use.

  HTTPClient http;
  if (!http.begin(client, TELEMETRY_URL)) {
    Serial.println("ERROR: HTTPClient begin() failed.");
    return false;
  }

  StaticJsonDocument<2048> doc;
  doc["type"] = "newAnomalyPoint";

  JsonObject data = doc.createNestedObject("data");
  data["device_id"] = DEVICE_ID;
  data["experiment_id"] = EXPERIMENT_ID;
  data["run_id"] = RUN_ID;
  data["timestamp"] = isoTimestamp();
  data["ax"] = s.ax_g;
  data["ay"] = s.ay_g;
  data["az"] = s.az_g;
  data["gx"] = s.gx_dps;
  data["gy"] = s.gy_dps;
  data["gz"] = s.gz_dps;
  data["pressure"] = s.pressure_hpa;
  data["temperature"] = s.temperature_c;
  data["altitude"] = s.altitude_m;
  data["latitude"] = s.latitude;
  data["longitude"] = s.longitude;
  data["speed"] = s.speed_mps;
  data["hdop"] = s.hdop;
  data["satellites"] = s.satellites;
  data["distance_cm"] = s.distance_cm;
  data["battery_voltage"] = s.battery_voltage;
  data["anomalyValue"] = s.anomaly_value;
  data["anomalySmoothed"] = anomalySmoothed;
  data["platformStationary"] = s.platform_stationary;

  String payload;
  serializeJson(doc, payload);

  http.addHeader("Content-Type", "application/json");
  const int httpCode = http.POST(payload);
  const String response = http.getString();

  Serial.printf("HTTP POST code: %d\n", httpCode);
  Serial.printf("Server response: %s\n", response.c_str());
  http.end();

  return httpCode >= 200 && httpCode < 300;
}
