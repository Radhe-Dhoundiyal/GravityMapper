/*
  GADV Wokwi telemetry test

  Target: Wokwi ESP32 simulation
  Sends synthetic rover telemetry to:
    https://gravitymapper.onrender.com/api/telemetry
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

const char* DEVICE_ID = "wokwi-rover-001";
const char* EXPERIMENT_ID = "EXP-WOKWI";
const char* RUN_ID = "RUN-WOKWI-001";

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
  Serial.println("GADV Wokwi telemetry test starting...");
  Serial.printf("Telemetry endpoint: %s\n", TELEMETRY_URL);

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
    Serial.println("WARNING: WiFi connection timed out. Will retry in loop().");
  }
}

bool wakeRender() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WARNING: Cannot run health check while WiFi is disconnected.");
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
  const float walk = packetCount * 0.000010f;

  const float ax = 0.012f * sinf(t * 0.65f);
  const float ay = 0.010f * cosf(t * 0.50f);
  const float az = 1.0f + 0.018f * sinf(t * 0.22f);
  const float gx = 0.18f * sinf(t * 0.30f);
  const float gy = 0.16f * cosf(t * 0.27f);
  const float gz = 0.08f * sinf(t * 0.17f);

  const float pressure = 1012.8f + 0.35f * sinf(t * 0.05f);
  const float altitude = 42.0f + 0.8f * cosf(t * 0.04f);
  const float temperature = 24.0f + 0.7f * sinf(t * 0.03f);

  const double latitude = 28.613900 + walk + 0.000020 * sin(t * 0.08);
  const double longitude = 77.209000 + walk * 0.7 + 0.000020 * cos(t * 0.07);
  const float speed = 0.35f + 0.10f * sinf(t * 0.11f);
  const float hdop = 1.1f + 0.15f * sinf(t * 0.09f);
  const int satellites = 9 + static_cast<int>((sinf(t * 0.06f) + 1.0f) * 2.0f);

  const float anomalyValue = 0.65f + 0.18f * sinf(t * 0.18f) + 0.05f * sinf(t * 0.77f);
  anomalySmoothed = 0.85f * anomalySmoothed + 0.15f * anomalyValue;

  StaticJsonDocument<1536> doc;
  doc["type"] = "newAnomalyPoint";

  JsonObject data = doc.createNestedObject("data");
  data["device_id"] = DEVICE_ID;
  data["experiment_id"] = EXPERIMENT_ID;
  data["run_id"] = RUN_ID;
  data["timestamp"] = isoTimestamp();
  data["ax"] = ax;
  data["ay"] = ay;
  data["az"] = az;
  data["gx"] = gx;
  data["gy"] = gy;
  data["gz"] = gz;
  data["pressure"] = pressure;
  data["temperature"] = temperature;
  data["altitude"] = altitude;
  data["latitude"] = latitude;
  data["longitude"] = longitude;
  data["speed"] = speed;
  data["hdop"] = hdop;
  data["satellites"] = satellites;
  data["anomalyValue"] = anomalyValue;
  data["anomalySmoothed"] = anomalySmoothed;
  data["platformStationary"] = true;

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

  Serial.printf("Packet #%lu\n", static_cast<unsigned long>(packetCount));
  Serial.printf("POST status: %d\n", code);
  Serial.printf("Response body: %s\n", body.c_str());
  Serial.printf("Lat/Lng: %.6f, %.6f  anomaly=%.3f smoothed=%.3f\n",
                latitude, longitude, anomalyValue, anomalySmoothed);

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
