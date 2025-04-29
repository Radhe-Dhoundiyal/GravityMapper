# Gravitational Anomaly Mapper

A web application for visualizing and mapping gravitational anomalies from ESP32 sensor data with real-time plotting and data export capabilities.

## Project Structure

This project is organized as a monorepo with three main packages:

- `client/`: React frontend application
- `server/`: Express backend server 
- `shared/`: Common types and utilities shared between client and server

## Development

To start the development server:

```bash
npm run dev
```

This will start both the client and server in development mode.

## Connecting ESP32 Hardware

The application receives real-time data from ESP32 sensors via WebSocket. Your ESP32 device should connect to the `/ws` WebSocket endpoint and send data in the following format:

```json
{
  "type": "anomalyData",
  "data": {
    "latitude": 37.7749,
    "longitude": -122.4194,
    "anomalyValue": 1.25,
    "timestamp": "2025-04-29T10:30:00.000Z"
  }
}
```

See the ESP32 connection documentation for detailed hardware integration instructions.

## Deployment

This application is configured for deployment on Render. See `RENDER_DEPLOYMENT.md` for detailed deployment instructions.

To test the build process locally:

```bash
./build-render.sh
```

## Features

- Real-time data visualization via WebSocket
- Interactive map with color-coded anomaly points
- Data filtering and export (CSV/JSON)
- Connection settings for different data sources
- Responsive design for mobile and desktop