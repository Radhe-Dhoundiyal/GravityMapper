# Hardware

This directory contains all hardware-related documentation, schematics, and configuration files for the GADV (Gravitational Anomaly Detection Vehicle) platform.

## Subdirectories

### sensors/
Sensor specifications, datasheets, calibration procedures, and configuration files for the MEMS sensor array. The primary sensing stack includes accelerometers, gyroscopes, and barometers fused to estimate local gravitational acceleration.

### circuit/
Electrical schematics, PCB layouts, and wiring diagrams for the ESP32-based sensor node. Includes power regulation, signal conditioning, and communication interface designs.

### rover/
Mechanical design files and assembly instructions for the mobile rover platform. Covers chassis design, motor driver configuration, and mounting of the sensor payload.

## ESP32 WebSocket Data Format

The ESP32 firmware streams data to the web dashboard via WebSocket (`/ws`):

```json
{
  "type": "anomalyData",
  "data": {
    "latitude": 37.7749,
    "longitude": -122.4194,
    "anomalyValue": 1.25,
    "timestamp": "2025-04-01T10:30:00.000Z"
  }
}
```

See `docs/system-overview.md` for the full system architecture.
