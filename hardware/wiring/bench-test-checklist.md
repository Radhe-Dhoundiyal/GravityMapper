# GADV Bench Test Checklist

Use this checklist before combining all hardware into the rover telemetry firmware.

## Preparation

- [ ] Confirm board selection is ESP32-S3 DevKitC-1 or compatible.
- [ ] Confirm Serial Monitor is set to 115200 baud.
- [ ] Inspect wiring for shorts before connecting USB.
- [ ] Confirm all grounds are common.
- [ ] Confirm no ESP32-S3 GPIO receives a 5 V signal.

## Individual Sensor Tests

- [ ] Run `hardware/esp32/tests/test_mpu6050/test_mpu6050.ino`.
- [ ] Confirm acceleration magnitude is near 1 g when still.
- [ ] Confirm gyro values are near 0 deg/s when still.
- [ ] Run `hardware/esp32/tests/test_bmp280/test_bmp280.ino`.
- [ ] Confirm pressure and temperature are plausible.
- [ ] Run `hardware/esp32/tests/test_gps/test_gps.ino`.
- [ ] Confirm NMEA character count increases.
- [ ] Confirm GPS fix outdoors or near a window.
- [ ] Run `hardware/esp32/tests/test_ds18b20/test_ds18b20.ino`.
- [ ] Confirm temperature is plausible and changes when warmed by hand.
- [ ] Run `hardware/esp32/tests/test_hcsr04/test_hcsr04.ino`.
- [ ] Confirm distance changes when a flat target is moved.
- [ ] Run `hardware/esp32/tests/test_ina219/test_ina219.ino`.
- [ ] Confirm bus voltage matches a multimeter reading closely enough for validation.

## Wokwi Simulation

- [ ] Run `hardware/esp32/wokwi_circuit_sim/wokwi_circuit_sim.ino` in Wokwi.
- [ ] Confirm WiFi connects to `Wokwi-GUEST`.
- [ ] Confirm `/api/health` returns a 2xx response or later telemetry succeeds.
- [ ] Confirm telemetry POST returns a 2xx response.
- [ ] Confirm dashboard receives `EXP-WOKWI-CIRCUIT` / `RUN-WOKWI-CIRCUIT-001`.

## Full Firmware Readiness

- [ ] All individual tests pass or missing sensors are intentionally documented.
- [ ] Sensor placement is photographed.
- [ ] Pin map is copied into lab notebook.
- [ ] Power source and regulator ratings are documented.
- [ ] Full firmware `hardware/esp32/gadv_rover_v1/gadv_rover_v1.ino` is ready for integration testing.

## Failure Notes

Record failures with:

- date and time
- sketch name
- sensor module model
- wiring photo
- Serial output excerpt
- suspected cause
- fix attempted

