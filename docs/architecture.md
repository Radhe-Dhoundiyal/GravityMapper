# System Architecture

## Overview

GADV is a distributed sensing system composed of three layers:

```
┌─────────────────────────────────────────────┐
│              Web Dashboard (app/)           │
│   React frontend  ←→  Express/Node backend  │
│           WebSocket real-time feed          │
└─────────────────────┬───────────────────────┘
                      │ WebSocket /ws
┌─────────────────────▼───────────────────────┐
│           ESP32 Sensor Node                 │
│  MEMS IMU + GNSS + Barometer                │
│  Sensor fusion → anomaly estimate           │
└─────────────────────┬───────────────────────┘
                      │ Rover platform
┌─────────────────────▼───────────────────────┐
│           Physical Survey Area              │
│  Transect / grid paths over target zones    │
└─────────────────────────────────────────────┘
```

## Web Application (`app/`)

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Frontend | React + Vite + Leaflet | Interactive map and statistics dashboard |
| Backend | Node.js + Express | REST API, WebSocket relay |
| Shared | TypeScript schemas | Type-safe data contracts |

## ESP32 Firmware

The ESP32 connects to the dashboard's WebSocket endpoint and streams JSON data at a configurable rate (default 1 Hz). See `hardware/sensors/` for sensor wiring and `hardware/circuit/` for the full schematic.

## Data Flow

1. ESP32 samples IMU + GNSS + barometer at 100 Hz
2. Onboard sensor fusion computes a calibrated gravity estimate
3. Result is packaged as JSON and sent over WiFi to the WebSocket server
4. The backend broadcasts the message to all connected browser clients
5. The React frontend renders the reading as a colour-coded point on the map

See `docs/methodology.md` for the signal processing approach.
