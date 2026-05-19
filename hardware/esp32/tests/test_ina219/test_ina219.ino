/*
  GADV INA219 bench test
  Board: ESP32-S3 DevKitC-1

  Approved GADV I2C pin map:
    SDA = GPIO 8
    SCL = GPIO 9

  Expected readings:
    - Bus voltage should match the measured battery or supply rail.
    - Current may be near 0 mA if no load passes through VIN+ to VIN-.
    - Power is calculated by the INA219 from bus voltage and shunt current.
*/

#include <Wire.h>
#include <Adafruit_INA219.h>

constexpr int I2C_SDA_PIN = 8;
constexpr int I2C_SCL_PIN = 9;
constexpr unsigned long SAMPLE_INTERVAL_MS = 1000;

Adafruit_INA219 ina219;
bool inaReady = false;
unsigned long lastSampleAt = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("GADV INA219 bench test");
  Serial.printf("I2C pins: SDA=GPIO %d, SCL=GPIO %d\n", I2C_SDA_PIN, I2C_SCL_PIN);

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  inaReady = ina219.begin();

  if (inaReady) {
    Serial.println("INA219 detected.");
  } else {
    Serial.println("WARNING: INA219 not found. Check 3V3, GND, SDA, SCL, and address solder pads.");
    Serial.println("The test will keep running and retry setup every 5 seconds.");
  }
}

void loop() {
  if (!inaReady) {
    delay(5000);
    inaReady = ina219.begin();
    Serial.println(inaReady ? "INA219 detected after retry." : "INA219 still not detected.");
    return;
  }

  if (millis() - lastSampleAt < SAMPLE_INTERVAL_MS) return;
  lastSampleAt = millis();

  const float busVoltage = ina219.getBusVoltage_V();
  const float shuntVoltageMv = ina219.getShuntVoltage_mV();
  const float currentMa = ina219.getCurrent_mA();
  const float powerMw = ina219.getPower_mW();
  const float loadVoltage = busVoltage + (shuntVoltageMv / 1000.0f);

  Serial.println("--- INA219 sample ---");
  Serial.printf("Bus voltage: %.3f V\n", busVoltage);
  Serial.printf("Shunt voltage: %.3f mV\n", shuntVoltageMv);
  Serial.printf("Load voltage: %.3f V\n", loadVoltage);
  Serial.printf("Current: %.2f mA\n", currentMa);
  Serial.printf("Power: %.2f mW\n", powerMw);
}
