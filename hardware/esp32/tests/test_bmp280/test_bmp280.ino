/*
  GADV BMP280 bench test
  Board: ESP32-S3 DevKitC-1

  Approved GADV I2C pin map:
    SDA = GPIO 8
    SCL = GPIO 9

  Expected readings:
    - Room temperature is typically 20-35 C indoors.
    - Sea-level pressure is often near 1013 hPa, but local weather can vary.
    - Altitude is estimated from pressure and is only approximate without calibration.
*/

#include <Wire.h>
#include <Adafruit_BMP280.h>

constexpr int I2C_SDA_PIN = 8;
constexpr int I2C_SCL_PIN = 9;
constexpr float SEA_LEVEL_HPA = 1013.25f;
constexpr unsigned long SAMPLE_INTERVAL_MS = 1000;

Adafruit_BMP280 bmp;
bool bmpReady = false;
unsigned long lastSampleAt = 0;

bool initBmp280() {
  if (bmp.begin(0x76) || bmp.begin(0x77)) {
    bmp.setSampling(
      Adafruit_BMP280::MODE_NORMAL,
      Adafruit_BMP280::SAMPLING_X2,
      Adafruit_BMP280::SAMPLING_X16,
      Adafruit_BMP280::FILTER_X16,
      Adafruit_BMP280::STANDBY_MS_500
    );
    return true;
  }
  return false;
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("GADV BMP280 bench test");
  Serial.printf("I2C pins: SDA=GPIO %d, SCL=GPIO %d\n", I2C_SDA_PIN, I2C_SCL_PIN);

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  bmpReady = initBmp280();

  if (bmpReady) {
    Serial.println("BMP280 detected at 0x76 or 0x77.");
  } else {
    Serial.println("WARNING: BMP280 not found. Check 3V3, GND, SDA, SCL, and address jumper.");
    Serial.println("The test will keep running and retry setup every 5 seconds.");
  }
}

void loop() {
  if (!bmpReady) {
    delay(5000);
    bmpReady = initBmp280();
    Serial.println(bmpReady ? "BMP280 detected after retry." : "BMP280 still not detected.");
    return;
  }

  if (millis() - lastSampleAt < SAMPLE_INTERVAL_MS) return;
  lastSampleAt = millis();

  const float temperatureC = bmp.readTemperature();
  const float pressureHpa = bmp.readPressure() / 100.0f;
  const float altitudeM = bmp.readAltitude(SEA_LEVEL_HPA);

  Serial.println("--- BMP280 sample ---");
  Serial.printf("Temperature: %.2f C\n", temperatureC);
  Serial.printf("Pressure: %.2f hPa\n", pressureHpa);
  Serial.printf("Approx altitude: %.2f m using sea-level %.2f hPa\n", altitudeM, SEA_LEVEL_HPA);
}
