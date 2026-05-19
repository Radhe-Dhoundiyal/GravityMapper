/*
  GADV MPU6050 bench test
  Board: ESP32-S3 DevKitC-1

  Approved GADV I2C pin map:
    SDA = GPIO 8
    SCL = GPIO 9

  Expected readings:
    - When the board is still and level, acceleration magnitude should be near 1 g.
    - One axis will usually read close to +/-1 g depending on sensor orientation.
    - Gyroscope values should stay near 0 deg/s when the sensor is not moving.
*/

#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <math.h>

constexpr int I2C_SDA_PIN = 8;
constexpr int I2C_SCL_PIN = 9;
constexpr float G_MPS2 = 9.80665f;
constexpr unsigned long SAMPLE_INTERVAL_MS = 1000;

Adafruit_MPU6050 mpu;
bool mpuReady = false;
unsigned long lastSampleAt = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("GADV MPU6050 bench test");
  Serial.printf("I2C pins: SDA=GPIO %d, SCL=GPIO %d\n", I2C_SDA_PIN, I2C_SCL_PIN);

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  mpuReady = mpu.begin();

  if (!mpuReady) {
    Serial.println("WARNING: MPU6050 not found. Check 3V3, GND, SDA, SCL, and I2C address.");
    Serial.println("The test will keep running and retry setup every 5 seconds.");
    return;
  }

  mpu.setAccelerometerRange(MPU6050_RANGE_4_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  Serial.println("MPU6050 detected.");
}

void loop() {
  if (!mpuReady) {
    delay(5000);
    mpuReady = mpu.begin();
    Serial.println(mpuReady ? "MPU6050 detected after retry." : "MPU6050 still not detected.");
    return;
  }

  if (millis() - lastSampleAt < SAMPLE_INTERVAL_MS) return;
  lastSampleAt = millis();

  sensors_event_t accel;
  sensors_event_t gyro;
  sensors_event_t temp;
  mpu.getEvent(&accel, &gyro, &temp);

  const float axG = accel.acceleration.x / G_MPS2;
  const float ayG = accel.acceleration.y / G_MPS2;
  const float azG = accel.acceleration.z / G_MPS2;
  const float accelMagG = sqrtf(axG * axG + ayG * ayG + azG * azG);
  const float gxDps = gyro.gyro.x * 180.0f / PI;
  const float gyDps = gyro.gyro.y * 180.0f / PI;
  const float gzDps = gyro.gyro.z * 180.0f / PI;

  Serial.println("--- MPU6050 sample ---");
  Serial.printf("Accel: ax=%.4f g ay=%.4f g az=%.4f g | magnitude=%.4f g\n", axG, ayG, azG, accelMagG);
  Serial.printf("Gyro:  gx=%.2f deg/s gy=%.2f deg/s gz=%.2f deg/s\n", gxDps, gyDps, gzDps);
  Serial.printf("Sensor temperature: %.2f C\n", temp.temperature);
}
