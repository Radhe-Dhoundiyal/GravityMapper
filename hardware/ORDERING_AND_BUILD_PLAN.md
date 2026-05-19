# GADV Ordering and Build Plan

This plan is the final pre-purchase and first-build checklist for the GADV ESP32-S3 rover hardware. It assumes the approved GADV pin map and the validation sketches under `hardware/esp32/tests/`.

## 1. Final Purchase List

### Required Core Electronics

| Item | Preferred Module | Quantity | Purpose |
|---|---|---:|---|
| Microcontroller | ESP32-S3 DevKitC-1 | 1-2 | Main rover controller, WiFi telemetry |
| IMU | MPU6050 breakout | 1 | Acceleration and gyroscope measurements |
| Barometer | BMP280 breakout | 1 | Pressure, temperature, barometric altitude |
| GPS receiver | NEO-6M GPS module with antenna | 1 | Latitude, longitude, speed, fix quality |
| Temperature probe | DS18B20 waterproof or TO-92 sensor | 1 | Independent temperature measurement |
| Distance sensor | HC-SR04 ultrasonic module | 1 | Rover clearance / obstacle distance |
| Battery monitor | INA219 breakout | 1 | Voltage/current monitoring |
| Local logging | microSD module | 1 | Reserved for later offline logging |

### Recommended Support Electronics

| Item | Preferred Module | Quantity | Purpose |
|---|---|---:|---|
| Motor driver | TB6612FNG motor driver | 1 | Preferred efficient motor control |
| Alternate motor driver | L298N motor driver | 1 | Acceptable backup, less efficient |
| Power regulator | Adjustable buck converter | 1-2 | Step battery voltage down to safe rails |
| Battery holder | 18650 battery holder | 1 | Rover battery pack |
| Breadboard | Half-size or full-size breadboard | 1 | Bench testing before soldering |
| Jumpers | Male-male, male-female, female-female | 1 set | Prototype wiring |
| Resistors | 4.7k, 1k, 2k or 2.2k | 1 kit | DS18B20 pull-up and HC-SR04 voltage divider |
| Switch | Inline power switch | 1 | Safe rover power control |
| Fuse or resettable polyfuse | Suitable current rating | 1 | Battery protection during tests |

### Rover / Mechanical Parts

| Item | Preferred Module | Quantity | Purpose |
|---|---|---:|---|
| Rover chassis | 4WD robot chassis | 1 | Mobile survey platform |
| Motors | Chassis-matched DC gear motors | 4 | Drive system |
| Wheels | Chassis-matched wheels | 4 | Drive traction |
| Sensor deck | Acrylic, plywood, or 3D-printed plate | 1 | Rigid upper sensor platform |
| Isolation layer | Foam, rubber standoffs, or vibration pads | 1 set | Reduce motor vibration transfer |
| Standoffs | M2.5/M3 nylon or brass standoffs | 1 set | Mount electronics above chassis |
| Fasteners | M2.5/M3 screws, nuts, washers | 1 set | Secure modules and deck |
| Cable management | Zip ties, adhesive mounts, Velcro | 1 set | Strain relief and neat wiring |

### Tools / Consumables

| Item | Purpose |
|---|---|
| Multimeter | Check voltage rails, continuity, battery voltage |
| USB-C data cable | Program and power ESP32-S3 |
| Soldering iron and solder | Permanent wiring after bench validation |
| Heat-shrink tubing | Insulate solder joints |
| Electrical tape | Temporary insulation |
| Small screwdrivers | Chassis and terminal blocks |
| Wire stripper / cutter | Harness preparation |
| Dupont crimp kit or pre-crimped wires | Cleaner final wiring |
| Label tape or marker | Label sensors, rails, and harnesses |
| Notebook or lab log | Record failures, readings, and calibration notes |

## 2. Exact Preferred Modules

Use these modules unless availability forces a substitution:

- ESP32-S3 DevKitC-1
- MPU6050
- BMP280
- NEO-6M GPS
- DS18B20
- HC-SR04
- INA219
- microSD module
- 4WD robot chassis
- L298N or TB6612FNG motor driver
- breadboard, jumpers, and resistors
- 18650 battery holder
- buck converter

If choosing between motor drivers, prefer TB6612FNG for efficiency and lower voltage drop. Use L298N only if it is easier to source or already available.

## 3. Bench Testing Order

Follow this order before assembling the rover:

1. ESP32 only
   - Upload a minimal blink or serial sketch.
   - Confirm board selection, USB cable, and Serial Monitor at 115200 baud.

2. I2C scan
   - Wire only SDA GPIO 8, SCL GPIO 9, 3V3, and GND.
   - Confirm I2C devices appear before loading full tests.

3. MPU6050
   - Run `hardware/esp32/tests/test_mpu6050/test_mpu6050.ino`.
   - Confirm acceleration magnitude is near 1 g when still.

4. BMP280
   - Run `hardware/esp32/tests/test_bmp280/test_bmp280.ino`.
   - Confirm pressure and temperature are plausible.

5. DS18B20
   - Run `hardware/esp32/tests/test_ds18b20/test_ds18b20.ino`.
   - Confirm the 4.7k pull-up from DATA to 3V3 is installed.

6. GPS
   - Run `hardware/esp32/tests/test_gps/test_gps.ino`.
   - Confirm NMEA characters are received before expecting a GPS lock.

7. HC-SR04
   - Run `hardware/esp32/tests/test_hcsr04/test_hcsr04.ino`.
   - Confirm the ECHO line is level-shifted to 3.3 V.

8. INA219
   - Run `hardware/esp32/tests/test_ina219/test_ina219.ino`.
   - Compare bus voltage against a multimeter.

9. Dashboard telemetry
   - Run the Wokwi simulation or the rover telemetry sketch with safe defaults.
   - Confirm `/api/telemetry` accepts packets and the dashboard receives points.

10. Full integrated sensor stack
   - Load `hardware/esp32/gadv_rover_v1/gadv_rover_v1.ino`.
   - Confirm each sensor reports OK or logs a known warning.
   - Keep motors disconnected for this first integrated test.

## 4. Assembly Sequence

1. Bench wiring
   - Build the sensor stack on a breadboard first.
   - Test one sensor at a time.
   - Photograph each working wiring stage.

2. Sensor deck
   - Mount MPU6050, BMP280, DS18B20, GPS, INA219, and wiring anchors on a rigid upper deck.
   - Keep the GPS antenna high and unobstructed.
   - Keep the BMP280 away from heat sources and direct wind.

3. Isolation layer
   - Add foam, rubber standoffs, or vibration pads between the sensor deck and chassis.
   - Keep the MPU6050 rigid enough that it does not wobble independently.

4. Rover chassis
   - Assemble the 4WD robot chassis and motors.
   - Route motor wires away from I2C and GPS wiring.
   - Do not connect motors during first sensor validation.

5. Power system
   - Install the 18650 battery holder, switch, buck converter, and motor driver.
   - Set buck converter output before connecting it to electronics.
   - Verify all rails with a multimeter.

6. Final mounting
   - Secure all modules with standoffs, screws, Velcro, or adhesive mounts.
   - Add strain relief for battery and motor wires.
   - Label power rails and sensor connectors.
   - Run the full integrated sensor stack again before enabling motors.

## 5. First Experiment Plan

### Static Noise Test

- Place rover on a stable table with motors disconnected.
- Record at least 5-10 minutes of telemetry.
- Confirm IMU acceleration, barometer altitude, and anomaly proxy drift are bounded.
- Use this run to estimate baseline sensor noise.

### Telemetry Stability Test

- Keep rover stationary and connected to WiFi.
- Send telemetry to the dashboard for at least 10 minutes.
- Confirm no repeated disconnects, malformed packets, or missing run metadata.

### GPS Lock Test

- Move the rover outdoors or near a window.
- Wait for GPS lock before recording conclusions.
- Record satellites, HDOP, latitude, and longitude stability.

### Vibration Test

- Run motors with the rover lifted safely so wheels can spin freely.
- Compare IMU readings with motors off and motors on.
- Identify whether additional isolation or cable restraint is needed.

### First Survey Grid Test

- Create a small grid, such as 3 x 3 nodes with 1-2 meter spacing.
- Move slowly and pause at each node.
- Confirm dashboard points, survey coverage, and run persistence.
- Treat this as a workflow test, not a final scientific result.

## 6. Safety Warnings

- ESP32-S3 GPIO is 3.3 V only. Do not connect 5 V sensor outputs directly to GPIO pins.
- HC-SR04 ECHO needs a voltage divider or level shifter when the module is powered from 5 V.
- Motors should not be powered from the ESP32. Use a separate motor supply path through a motor driver.
- Common ground is required between ESP32, sensors, motor driver, battery monitor, and power supplies.
- Test without motors first. Validate sensors and telemetry before adding motor noise, vibration, and high-current wiring.
- Set buck converter voltage with a multimeter before connecting the ESP32 or sensors.
- Disconnect power immediately if any module becomes hot or if wiring smells unusual.

