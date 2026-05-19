# GADV ESP32-S3 Pin Map

Approved pin assignment for the GADV rover validation package.

## Controller

- Board: ESP32-S3 DevKitC-1 or compatible ESP32-S3 development board
- Logic level: 3.3 V
- Serial monitor: 115200 baud

## Sensor Pins

| Subsystem | Signal | ESP32-S3 GPIO | Notes |
|---|---:|---:|---|
| I2C bus | SDA | GPIO 8 | Shared by MPU6050, BMP280, INA219 |
| I2C bus | SCL | GPIO 9 | Shared by MPU6050, BMP280, INA219 |
| NEO-6M GPS | ESP32 RX | GPIO 44 | Connect to GPS TX |
| NEO-6M GPS | ESP32 TX | GPIO 43 | Connect to GPS RX |
| DS18B20 | DATA | GPIO 4 | Add 4.7k pull-up to 3V3 |
| HC-SR04 | TRIG | GPIO 6 | ESP32 output |
| HC-SR04 | ECHO | GPIO 7 | Level-shift to 3.3 V if module is powered at 5 V |
| microSD placeholder | SCK | GPIO 12 | Reserved; SD logging not implemented yet |
| microSD placeholder | MOSI | GPIO 11 | Reserved |
| microSD placeholder | MISO | GPIO 13 | Reserved |
| microSD placeholder | CS | GPIO 10 | Reserved |

## I2C Addresses

| Device | Typical Address | Validation Sketch |
|---|---:|---|
| MPU6050 | `0x68` or `0x69` | `hardware/esp32/tests/test_mpu6050/test_mpu6050.ino` |
| BMP280 | `0x76` or `0x77` | `hardware/esp32/tests/test_bmp280/test_bmp280.ino` |
| INA219 | `0x40` default | `hardware/esp32/tests/test_ina219/test_ina219.ino` |

## Wiring Rules

- Use a common ground between the ESP32-S3, sensors, GPS, battery monitor, and distance sensor.
- Keep I2C leads short during bench testing.
- Use 3.3 V modules where possible.
- Do not feed 5 V signals directly into ESP32-S3 GPIOs.
- Confirm each individual sensor sketch works before loading the full rover telemetry firmware.

