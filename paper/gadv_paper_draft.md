# Low-Cost Mobile Gravitational Anomaly Detection Using MEMS Sensor Fusion and Satellite Gravity Baselines

**Draft — Work in Progress**

---

## Abstract

We present GADV, a Gravitational Anomaly Detection Vehicle that uses a low-cost ESP32 microcontroller, consumer-grade MEMS inertial measurement units, and a satellite-based GNSS receiver to map local gravitational anomalies. By fusing accelerometer, gyroscope, and barometric pressure readings and comparing against the WGS-84 theoretical gravity model and GRACE satellite free-air anomaly grids, we estimate local gravity anomalies with a demonstrated noise floor of approximately 12 mGal. We describe the sensor fusion methodology, platform design, and a web-based real-time visualisation dashboard. Preliminary field results are presented and compared against published geological data.

---

## 1. Introduction

Gravimetry — the measurement of local gravitational acceleration — has traditionally required expensive superconducting or spring-based instruments costing tens of thousands of dollars. Recent advances in MEMS accelerometer technology and satellite positioning have opened the possibility of conducting gravity surveys with consumer hardware at a fraction of the cost.

[Introduction to be expanded]

---

## 2. Related Work

[Literature review: MEMS gravimetry, citizen science geophysics, GRACE data applications]

---

## 3. System Design

### 3.1 Hardware Platform

[Describe ESP32 node, sensors, rover chassis — see `hardware/`]

### 3.2 Sensor Fusion Algorithm

[Describe complementary filter, static detection, averaging — see `docs/methodology.md`]

### 3.3 Web Dashboard

[Describe real-time WebSocket pipeline, Leaflet map, export functions — see `app/`]

---

## 4. Experimental Setup

[Describe survey sites, protocols, equipment configuration — see `experiments/`]

---

## 5. Results

[Anomaly maps, RMS comparison against GRACE, repeatability statistics — see `analysis/`]

---

## 6. Discussion

[Interpretation, limitations, future work]

---

## 7. Conclusion

[Summary of contributions]

---

## References

[To be completed]

---

*This draft is maintained in the GADV repository at `paper/gadv_paper_draft.md`. Please do not distribute without author permission.*
