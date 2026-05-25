# GADV Validation Log 001

## Objective

This validation phase establishes the first formal engineering baseline for the GADV system. The purpose is to document which software, telemetry, data-processing, visualization, export, and simulation capabilities have been validated before physical rover hardware is fully assembled and field experiments begin.

This log is an engineering validation record. It confirms that the dashboard, backend telemetry path, run persistence model, processing workflow, and simulated rover data flow are ready for controlled hardware bring-up. It does not claim scientific validation of gravity anomaly measurement accuracy.

## System Version

- System name: GADV, Gravitational Anomaly Detection Vehicle
- Version reference: GADV v1.0
- Deployment target: Render web service deployment
- Dashboard: React + Vite frontend served by the Express backend
- Backend: Express REST API and WebSocket bridge
- Telemetry firmware: ESP32-S3 rover telemetry firmware
- Simulation firmware: Wokwi ESP32 telemetry simulation
- Processing pipeline: `analysis/scripts/gravity_pipeline.py`
- Runtime storage model: JSON-backed run files under `data/runs` with processed outputs under `data/processed`

## Software Validation Completed

| Item | Status | Verification Method | Outcome |
|---|---|---|---|
| Dashboard rendering | Completed | Production frontend build and local TypeScript/build verification | Dashboard source builds successfully into `dist/public`; known non-blocking large chunk warning remains. |
| WebSocket telemetry | Completed | Code-path verification and prior dashboard integration testing with `/ws` packet shape | WebSocket client/server flow supports `newAnomalyPoint`, reconnect state, dashboard broadcast, and live UI updates. |
| HTTPS telemetry ingestion | Completed | Backend route review and ESP32/Wokwi payload alignment | `/api/telemetry` accepts bare sensor payloads or `newAnomalyPoint` envelopes, validates data, stores runs when IDs are present, and broadcasts to dashboards. |
| Wokwi simulation | Completed | Simulation sketch creation and packet-shape alignment with backend schema | Wokwi simulation produces synthetic rover telemetry for Render endpoint testing; physical sensor accuracy is not represented. |
| Run recording | Completed | Dashboard and backend flow verification | Telemetry points can be associated with experiment/run IDs and accumulated into run records. |
| Persistent storage | Completed | JSON run storage implementation review | Runs are persisted under `data/runs/<experiment_id>/<run_id>.json`; local persistence is available, while Render filesystem durability remains limited without persistent disk. |
| Process Run pipeline | Completed with caveat | Backend processor integration and Python pipeline syntax/build checks | Stored JSON runs can be converted to raw CSV and passed to `gravity_pipeline.py`; full end-to-end processing depends on Python and required scientific libraries being available at runtime. |
| Heatmap generation | Completed | Frontend map feature implementation and build verification | Dashboard can generate an IDW-style heatmap overlay from visible telemetry points. |
| Gradient map | Completed | Frontend map feature implementation and build verification | Dashboard can derive and render a gradient visualization from interpolated anomaly values. |
| Anomaly detection | Completed | Frontend anomaly-region implementation and build verification | Dashboard can detect positive and negative anomaly regions from interpolated grids using current threshold settings. |
| Confidence scoring | Completed | Frontend region scoring implementation and build verification | Detected regions receive relative confidence scores based on peak anomaly, area, and nearby point density. |
| Export system | Completed | Frontend export implementation and build verification | CSV, JSON, run summaries, experiment summaries, anomaly exports, survey-grid export, and Markdown report export are implemented. |
| Survey grid | Completed | Frontend survey-grid implementation and build verification | Dashboard can generate survey grids from a map origin, show visited/unvisited nodes, and export grid coordinates. |

## Known Limitations

- Simulation anomaly values are synthetic and are intended for telemetry and dashboard validation only.
- No real gravimetric calibration has been completed.
- No terrain correction has been implemented in the scientific pipeline.
- No field experiments have been completed with the physical rover.
- Render free-tier services may sleep, causing delayed first telemetry after inactivity.
- Render free-tier filesystem persistence may be ephemeral unless persistent disk storage is configured.
- WebSocket and HTTPS telemetry ingestion are currently unauthenticated.
- Dashboard anomaly confidence scores are relative engineering indicators, not validated probabilities.
- Heatmap and gradient maps use lightweight interpolation suitable for visualization, not final geostatistical analysis.
- Process Run behavior depends on Python, numpy, and pandas availability in the runtime environment.

## Planned Hardware Validation Sequence

1. ESP32 bench power test
   - Verify board power, USB connection, serial output, and upload workflow.

2. I2C scan
   - Confirm SDA GPIO 8 and SCL GPIO 9 are wired correctly and I2C devices respond.

3. Sensor-by-sensor validation
   - Validate MPU6050, BMP280, DS18B20, GPS, HC-SR04, and INA219 using the individual test sketches.

4. Integrated sensor stack
   - Load the rover telemetry firmware with all sensors attached and motors disconnected.

5. Static noise test
   - Record stationary telemetry to characterize baseline IMU, pressure, temperature, and anomaly-proxy drift.

6. Vibration test
   - Compare sensor behavior with motors off and motors running to quantify vibration effects.

7. First rover telemetry
   - Run the rover with live telemetry to the dashboard and confirm stable recording and map updates.

8. First survey grid experiment
   - Execute a small controlled grid survey and verify coverage, persistence, exports, and post-run processing workflow.

## Scientific Validation Status

Engineering and software validation are partially complete and sufficient for controlled hardware bring-up. The dashboard, telemetry ingestion path, storage layer, visualization tools, export system, Wokwi simulation, and processing pipeline integration have been prepared and checked at the engineering level.

Scientific validation is still pending. The project has not yet demonstrated that consumer-grade MEMS sensors can produce repeatable, geo-referenced gravity anomaly signals under field conditions. That claim requires real hardware calibration, repeat static tests, controlled survey runs, environmental correction review, comparison against known references where possible, and documented uncertainty analysis.

## Current Readiness Assessment

Software maturity: The software stack is ready for hardware integration testing. Core dashboard workflows, telemetry ingestion, run recording, processing hooks, map analysis views, survey planning, and exports are implemented. Remaining software risks are mainly operational: runtime Python availability, unauthenticated telemetry, and long-term storage durability on Render.

Hardware readiness: Hardware readiness is in the pre-assembly validation stage. The pin map, ordering plan, bench test sketches, Wokwi simulation, and wiring documentation are prepared. Physical readiness depends on receiving parts, verifying each module independently, and completing an integrated no-motor sensor stack test.

Scientific readiness: Scientific readiness is early-stage. The methodology and processing pipeline are established, but no real calibration, terrain correction, repeatability study, or field survey evidence has been collected yet. The system is ready to begin collecting the engineering data required for later scientific validation.

