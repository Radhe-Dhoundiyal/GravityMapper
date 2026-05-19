# GADV Sensor Placement Guide

Sensor placement affects repeatability. These notes are intended for early validation and science-fair documentation.

## MPU6050 IMU

- Mount near the rover center of mass where vibration is lower.
- Keep the board rigidly fixed; loose mounting will dominate acceleration readings.
- Record the sensor orientation in lab notes.
- Add foam or mechanical isolation only if it does not allow the sensor to wobble.

## BMP280 Barometer

- Place away from motor exhaust, hot regulators, and direct sunlight.
- Avoid enclosing it in a fully sealed box; pressure must equalize with ambient air.
- Shield from wind gusts during outdoor testing if possible.

## GPS Receiver

- Place antenna at the top of the rover with a clear sky view.
- Keep it away from high-current motor wires and switching regulators.
- Expect weak or no fix indoors.
- Let the module sit outdoors for several minutes before judging performance.

## DS18B20 Temperature Sensor

- Use it to monitor ambient or local electronics temperature consistently.
- Keep it away from heat sources unless intentionally measuring them.
- If using a waterproof probe, allow thermal settling time before recording.

## HC-SR04 Distance Sensor

- Mount facing the intended target direction with a clear acoustic path.
- Avoid soft, angled, or narrow targets during validation.
- Keep it away from vibrating frame members.

## INA219 Battery Monitor

- Place close to the battery or monitored load path.
- Use wire gauge appropriate for expected current.
- Keep shunt wiring secure because intermittent power readings can look like telemetry faults.

