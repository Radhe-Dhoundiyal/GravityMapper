import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Add specific styling for the app
document.documentElement.style.setProperty('--primary', '207 90% 54%');
document.documentElement.style.setProperty('--primary-foreground', '211 100% 99%');
document.documentElement.style.setProperty('--accent', '60 4.8% 95.9%');
document.documentElement.style.setProperty('--chart-1', '120 100% 35%'); // Green
document.documentElement.style.setProperty('--chart-2', '54 100% 50%');  // Yellow
document.documentElement.style.setProperty('--chart-3', '36 100% 50%');  // Orange
document.documentElement.style.setProperty('--chart-4', '0 100% 50%');   // Red
document.documentElement.style.setProperty('--chart-5', '262 83% 58%');  // Purple

// Set the page title
document.title = "Gravitational Anomaly Mapper";

// Add a meta description
const metaDescription = document.createElement('meta');
metaDescription.name = 'description';
metaDescription.content = 'Application for visualizing and mapping gravitational anomalies from ESP32 sensor data';
document.head.appendChild(metaDescription);

// Load necessary CSS for Leaflet
const leafletCSS = document.createElement('link');
leafletCSS.rel = 'stylesheet';
leafletCSS.href = 'https://unpkg.com/leaflet@1.9.3/dist/leaflet.css';
document.head.appendChild(leafletCSS);

// Load Roboto font
const fontLink = document.createElement('link');
fontLink.rel = 'stylesheet';
fontLink.href = 'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&family=Roboto+Mono:wght@400;500&display=swap';
document.head.appendChild(fontLink);

createRoot(document.getElementById("root")!).render(<App />);
