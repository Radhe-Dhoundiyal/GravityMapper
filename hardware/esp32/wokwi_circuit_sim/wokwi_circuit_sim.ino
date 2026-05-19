/*
  GADV Wokwi circuit simulation
  Board: ESP32-S3 DevKitC-1 / Wokwi ESP32-S3

  This sketch simulates the rover telemetry package and posts to:
    https://gravitymapper.onrender.com/api/telemetry

  It uses the approved GADV pin map in constants and diagram.json, but the
  sensor values are generated in software so the dashboard can be tested before
  physical parts arrive.
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <time.h>
#include <math.h>

const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASSWORD = "";

const char* HEALTH_URL = "https://gravitymapper.onrender.com/api/health";
const char* TELEMETRY_URL = "https://gravitymapper.onrender.com/api/telemetry";

const char* DEVICE_ID = "wokwi-circuit-rover-001";
const char* EXPERIMENT_ID = "EXP-WOKWI-CIRCUIT";
const char* RUN_ID = "RUN-WOKWI-CIRCUIT-001";

constexpr int I2C_SDA_PIN = 8;
constexpr int I2C_SCL_PIN = 9;
constexpr int GPS_RX_PIN = 44;
constexpr int GPS_TX_PIN = 43;
constexpr int DS18B20_DATA_PIN = 4;
constexpr int ULTRASONIC_TRIG_PIN = 6;
constexpr int ULTRASONIC_ECHO_PIN = 7;
constexpr int SD_SCK_PIN = 12;
constexpr int SD_MOSI_PIN = 11;
constexpr int SD_MISO_PIN = 13;
constexpr int SD_CS_PIN = 10;

constexpr unsigned long TELEMETRY_INTERVAL_MS = 3000;
constexpr unsigned long WIFI_CONNECT_TIMEOUT_MS = 20000;

unsigned long lastTelemetryAt = 0;
uint32_t packetCount = 0;
float anomalySmoothed = 0.0f;

void connectWiFi();
bool wakeRender();
bool postTelemetry();
String isoTimestamp();

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("GADV Wokwi circuit simulation starting...");
  Serial.printf("Telemetry endpoint: %s\n", TELEMETRY_URL);
  Serial.printf("Pin map: I2C SDA=%d SCL=%d GPS RX=%d TX=%d DS18B20=%d HC-SR04 TRIG=%d ECHO=%d\n",
                I2C_SDA_PIN, I2C_SCL_PIN, GPS_RX_PIN, GPS_TX_PIN,
                DS18B20_DATA_PIN, ULTRASONIC_TRIG_PIN, ULTRASONIC_ECHO_PIN);
  Serial.printf("Reserved SD pins: SCK=%d MOSI=%d MISO=%d CS=%d\n",
                SD_SCK_PIN, SD_MOSI_PIN, SD_MISO_PIN, SD_CS_PIN);

  pinMode(ULTRASONIC_TRIG_PIN, OUTPUT);
  pinMode(ULTRASONIC_ECHO_PIN, INPUT);

  connectWiFi();
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  wakeRender();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected; reconnecting...");
    connectWiFi();
  }

  const unsigned long now = millis();
  if (now - lastTelemetryAt >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryAt = now;
    packetCount++;
    postTelemetry();
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
    Serial.println("WARNING: WiFi connection timed out. The loop will retry.");
  }
}

bool wakeRender() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WARNING: Cannot run Render health check while WiFi is disconnected.");
    return false;
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  if (!http.begin(client, HEALTH_URL)) {
    Serial.println("ERROR: health HTTPClient begin() failed.");
    return false;
  }

  const int code = http.GET();
  const String body = http.getString();
  Serial.printf("Health check status: %d\n", code);
  Serial.printf("Health response: %s\n", body.c_str());
  http.end();

  return code >= 200 && code < 300;
}

bool postTelemetry() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WARNING: Cannot POST telemetry while WiFi is disconnected.");
    return false;
  }

  const float t = millis() / 1000.0f;
  const float path = packetCount * 0.000012f;

  const float ax = 0.010f * sinf(t * 0.7f);
  const float ay = 0.012f * cosf(t * 0.6f);
  const float az = 1.0f + 0.015f * sinf(t * 0.25f);
  const float gx = 0.22f * sinf(t * 0.33f);
  const float gy = 0.18f * cosf(t * 0.29f);
  const float gz = 0.10f * sinf(t * 0.19f);
  const float pressure = 1012.6f + 0.30f * sinf(t * 0.05f);
  const float altitude = 42.0f + 0.7f * cosf(t * 0.04f);
  const float temperature = 24.5f + 0.6f * sinf(t * 0.03f);
  const float distanceCm = 35.0f + 8.0f * sinf(t * 0.16f);
  const float batteryVoltage = 7.8f - min(packetCount * 0.0005f, 0.8f);

  const double latitude = 28.613900 + path + 0.000025 * sin(t * 0.09);
  const double longitude = 77.209000 + path * 0.75 + 0.000025 * cos(t * 0.08);
  const float speed = 0.40f + 0.08f * sinf(t * 0.12f);
  const float hdop = 1.1f + 0.20f * sinf(t * 0.07f);
  const int satellites = 8 + static_cast<int>((sinf(t * 0.06f) + 1.0f) * 2.5f);

  const float anomalyValue = 0.55f + 0.20f * sinf(t * 0.20f) + 0.12f * expf(-powf(sinf(t * 0.045f), 2.0f));
  anomalySmoothed = 0.85f * anomalySmoothed + 0.15f * anomalyValue;
  const bool stationary = fabsf(ax) < 0.02f && fabsf(ay) < 0.02f && fabsf(az - 1.0f) < 0.05f;

  StaticJsonDocument<1792> doc;
  doc["type"] = "newAnomalyPoint";

  JsonObject data = doc.createNestedObject("data");
  data["device_id"] = DEVICE_ID;
  data["experiment_id"] = EXPERIMENT_ID;
  data["run_id"] = RUN_ID;
  data["timestamp"] = isoTimestamp();
  data["latitude"] = latitude;
  data["longitude"] = longitude;
  data["anomalyValue"] = anomalyValue;
  data["ax"] = ax;
  data["ay"] = ay;
  data["az"] = az;
  data["gx"] = gx;
  data["gy"] = gy;
  data["gz"] = gz;
  data["pressure"] = pressure;
  data["temperature"] = temperature;
  data["altitude"] = altitude;
  data["speed"] = speed;
  data["hdop"] = hdop;
  data["satellites"] = satellites;
  data["distance_cm"] = distanceCm;
  data["battery_voltage"] = batteryVoltage;
  data["anomalySmoothed"] = anomalySmoothed;
  data["platformStationary"] = stationary;

  String payload;
  serializeJson(doc, payload);

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  if (!http.begin(client, TELEMETRY_URL)) {
    Serial.println("ERROR: telemetry HTTPClient begin() failed.");
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  const int code = http.POST(payload);
  const String body = http.getString();

  Serial.printf("Packet #%lu POST status=%d\n", static_cast<unsigned long>(packetCount), code);
  Serial.printf("Lat/Lng %.6f, %.6f | anomaly=%.3f smoothed=%.3f | distance=%.1f cm | battery=%.2f V\n",
                latitude, longitude, anomalyValue, anomalySmoothed, distanceCm, batteryVoltage);
  Serial.printf("Response: %s\n", body.c_str());

  http.end();
  return code >= 200 && code < 300;
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
