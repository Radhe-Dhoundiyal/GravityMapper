# System Overview

## GADV — Gravitational Anomaly Detection Vehicle

GADV is an open-source, low-cost mobile sensing platform for mapping local gravitational anomalies using consumer-grade MEMS sensors, satellite positioning, and a comparison baseline derived from GRACE satellite gravity data.

## Goals

- Demonstrate that sub-10 mGal anomaly detection is achievable with COTS hardware below $100
- Produce geo-referenced anomaly maps that can be overlaid on geological and land-use data
- Provide an open hardware and software platform for citizen science gravity surveys

## Component Summary

| Component | Location | Description |
|-----------|----------|-------------|
| Web dashboard | `app/` | Real-time visualisation, data export, statistics |
| ESP32 firmware | `hardware/` | Sensor acquisition and WiFi streaming |
| Analysis pipeline | `analysis/` | Post-processing, GRACE comparison, reporting |
| Field data | `data/` | Raw and processed survey datasets |
| Experiment records | `experiments/` | Protocols and field logs |
| Research paper | `paper/` | Draft manuscript |

## Quick Start

### Running the Web Dashboard

```bash
NODE_ENV=development tsx app/server/index.ts
```

### Connecting an ESP32

1. Flash the firmware from `hardware/`
2. Set the WiFi SSID, password, and dashboard IP in `config.h`
3. Power on — the device connects and begins streaming automatically

### Exporting Data

Use the **Export** button in the dashboard to download all readings as CSV or JSON. Place the file in `data/raw/` and run the preprocessing script.

## Deployment

The web dashboard is configured for Render deployment. See `RENDER_DEPLOYMENT.md`.
