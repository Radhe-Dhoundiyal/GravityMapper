/*
  GADV DS18B20 bench test
  Board: ESP32-S3 DevKitC-1

  Approved GADV pin map:
    DS18B20 DATA = GPIO 4

  Expected readings:
    - Room temperature is typically 20-35 C indoors.
    - Touching the metal probe should slowly increase the reading.
    - Use a 4.7k pull-up resistor from DATA to 3V3.
*/

#include <OneWire.h>
#include <DallasTemperature.h>

constexpr int DS18B20_DATA_PIN = 4;
constexpr unsigned long SAMPLE_INTERVAL_MS = 1000;

OneWire oneWire(DS18B20_DATA_PIN);
DallasTemperature ds18b20(&oneWire);
bool dsReady = false;
unsigned long lastSampleAt = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("GADV DS18B20 bench test");
  Serial.printf("DS18B20 DATA pin: GPIO %d\n", DS18B20_DATA_PIN);

  ds18b20.begin();
  dsReady = ds18b20.getDeviceCount() > 0;

  if (dsReady) {
    Serial.printf("DS18B20 detected: %d device(s).\n", ds18b20.getDeviceCount());
  } else {
    Serial.println("WARNING: DS18B20 not found. Check 3V3, GND, DATA, and 4.7k pull-up.");
    Serial.println("The test will keep running and retry detection every 5 seconds.");
  }
}

void loop() {
  if (!dsReady) {
    delay(5000);
    ds18b20.begin();
    dsReady = ds18b20.getDeviceCount() > 0;
    Serial.println(dsReady ? "DS18B20 detected after retry." : "DS18B20 still not detected.");
    return;
  }

  if (millis() - lastSampleAt < SAMPLE_INTERVAL_MS) return;
  lastSampleAt = millis();

  ds18b20.requestTemperatures();
  const float tempC = ds18b20.getTempCByIndex(0);

  Serial.println("--- DS18B20 sample ---");
  if (tempC <= -100.0f || tempC >= 125.0f) {
    Serial.printf("WARNING: Invalid temperature %.2f C. Check wiring and pull-up resistor.\n", tempC);
  } else {
    Serial.printf("Temperature: %.2f C\n", tempC);
  }
}
