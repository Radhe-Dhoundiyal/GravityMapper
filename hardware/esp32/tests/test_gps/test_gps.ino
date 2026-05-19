/*
  GADV NEO-6M GPS bench test
  Board: ESP32-S3 DevKitC-1

  Approved GADV UART pin map:
    ESP32-S3 RX = GPIO 44  <- GPS TX
    ESP32-S3 TX = GPIO 43  -> GPS RX

  Expected readings:
    - Indoors, fix may be unavailable or slow.
    - Outdoors with sky view, expect latitude/longitude, satellites > 3, and HDOP usually below 3.
    - Raw NMEA bytes should increase even before a valid fix is acquired.
*/

#include <TinyGPSPlus.h>

constexpr int GPS_RX_PIN = 44;
constexpr int GPS_TX_PIN = 43;
constexpr unsigned long STATUS_INTERVAL_MS = 2000;

TinyGPSPlus gps;
HardwareSerial GPSSerial(2);
unsigned long lastStatusAt = 0;
unsigned long lastCharsSeen = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("GADV GPS bench test");
  Serial.printf("GPS UART: ESP32 RX=GPIO %d, ESP32 TX=GPIO %d, baud=9600\n", GPS_RX_PIN, GPS_TX_PIN);

  GPSSerial.begin(9600, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial.println("Waiting for NMEA data. Move antenna near a window or outdoors for a fix.");
}

void loop() {
  while (GPSSerial.available() > 0) {
    gps.encode(GPSSerial.read());
  }

  if (millis() - lastStatusAt < STATUS_INTERVAL_MS) return;
  lastStatusAt = millis();

  const unsigned long chars = gps.charsProcessed();
  Serial.println("--- GPS status ---");
  Serial.printf("NMEA chars processed: %lu\n", chars);

  if (chars == lastCharsSeen) {
    Serial.println("WARNING: No new GPS serial data. Check GPS power, GND, and TX/RX crossover.");
  }
  lastCharsSeen = chars;

  if (gps.location.isValid()) {
    Serial.printf("Location: %.6f, %.6f\n", gps.location.lat(), gps.location.lng());
  } else {
    Serial.println("Location: no valid fix yet.");
  }

  Serial.printf("Satellites: %s\n", gps.satellites.isValid() ? String(gps.satellites.value()).c_str() : "not available");
  Serial.printf("HDOP: %s\n", gps.hdop.isValid() ? String(gps.hdop.hdop(), 2).c_str() : "not available");
  Serial.printf("Speed: %s m/s\n", gps.speed.isValid() ? String(gps.speed.mps(), 2).c_str() : "not available");
}
