# GADV Rover Power Plan

This plan is for bench validation and early rover integration while parts are being ordered.

## Power Rails

| Rail | Intended Loads | Notes |
|---|---|---|
| USB 5 V | ESP32-S3 development board during bench tests | Preferred for first bring-up |
| 3.3 V | MPU6050, BMP280, DS18B20 pull-up, INA219 logic | Use the ESP32 board 3V3 only for low-current sensors |
| 5 V regulated | HC-SR04 if using a 5 V-only module | Level-shift ECHO to 3.3 V |
| Battery input | Rover drive system and optional monitored supply | Route monitored load through INA219 VIN+ to VIN- |

## Bench Bring-Up Order

1. Power ESP32-S3 from USB only.
2. Verify Serial Monitor at 115200 baud.
3. Add I2C sensors one at a time: MPU6050, BMP280, INA219.
4. Add DS18B20 with 4.7k pull-up to 3V3.
5. Add GPS and verify NMEA characters before expecting a fix.
6. Add HC-SR04 last, with ECHO level shifting if powered from 5 V.
7. Only then move to battery-powered rover tests.

## INA219 Use

- Connect supply positive to INA219 VIN+.
- Connect INA219 VIN- to the load positive input.
- Connect grounds together.
- The INA219 measures current through its shunt; it does not power the rover by itself.

## Safety Notes

- Check polarity before connecting battery packs.
- Avoid powering motors from the ESP32-S3 5 V or 3.3 V pins.
- Keep motor power wiring physically separated from I2C and GPS wiring.
- Add strain relief for battery and motor leads before field testing.
- If a sensor becomes hot, disconnect power immediately and inspect wiring.

