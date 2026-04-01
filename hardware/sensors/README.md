# Sensors

MEMS sensor specifications and calibration files for the GADV sensing stack.

## Planned Sensors

| Sensor | Measurement | Interface |
|--------|------------|-----------|
| MPU-6050 / ICM-42688 | 3-axis acceleration, 3-axis gyroscope | I2C / SPI |
| BMP388 / BMP390 | Barometric pressure, temperature | I2C |
| NEO-M8N / ZED-F9P | GNSS (latitude, longitude, altitude) | UART |

## Calibration

Sensor calibration offsets and scale factors should be stored here as JSON or YAML files before a field campaign. Baseline gravity values from GRACE satellite data are stored in `data/processed/` for comparison.
