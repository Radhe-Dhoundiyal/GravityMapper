import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { AnomalyThresholds, AnomalyFilters, AppSettings, ExperimentRun, MapColorMode, SensorDataPoint } from "@/lib/types";

interface MapViewProps {
  runs: ExperimentRun[];
  settings: AppSettings;
  filters: AnomalyFilters;
  thresholds: AnomalyThresholds;
  colorMode: MapColorMode;
  onMarkerClick?: (point: SensorDataPoint, run: ExperimentRun) => void;
}

function anomalyColor(value: number, thresholds: AnomalyThresholds): string {
  if (value < thresholds.medium) return '#4CAF50';
  if (value < thresholds.high)   return '#FFEB3B';
  return '#F44336';
}

const MapView: React.FC<MapViewProps> = ({
  runs,
  settings,
  filters,
  thresholds,
  colorMode,
  onMarkerClick,
}) => {
  const mapRef          = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // ── Init map ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current).setView(
      [settings.defaultLat, settings.defaultLng], 13
    );
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const markersLayer = L.layerGroup().addTo(map);
    markersLayerRef.current = markersLayer;

    // Map custom events (zoom / center)
    const onZoomIn  = () => map.zoomIn();
    const onZoomOut = () => map.zoomOut();
    const onCenter  = (e: CustomEvent) => {
      if (e.detail) map.setView([e.detail.lat, e.detail.lng], map.getZoom());
    };
    window.addEventListener('map:zoomIn',  onZoomIn);
    window.addEventListener('map:zoomOut', onZoomOut);
    window.addEventListener('map:center',  onCenter as EventListener);

    return () => {
      window.removeEventListener('map:zoomIn',  onZoomIn);
      window.removeEventListener('map:zoomOut', onZoomOut);
      window.removeEventListener('map:center',  onCenter as EventListener);
      map.remove();
      mapRef.current          = null;
      markersLayerRef.current = null;
    };
  }, []);

  // ── Tile layer update ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    map.eachLayer(l => { if (l instanceof L.TileLayer) map.removeLayer(l); });

    let url: string;
    let attr: string;
    if (settings.mapStyle === 'satellite') {
      url  = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      attr = 'Tiles &copy; Esri';
    } else if (settings.mapStyle === 'terrain') {
      url  = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
      attr = 'Map &copy; OpenTopoMap';
    } else {
      url  = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      attr = '&copy; OpenStreetMap contributors';
    }
    L.tileLayer(url, { attribution: attr }).addTo(map);
  }, [settings.mapStyle]);

  // ── Markers update ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !markersLayerRef.current) return;
    const markersLayer = markersLayerRef.current;
    markersLayer.clearLayers();

    const now = new Date();
    let firstPoint: SensorDataPoint | null = null;
    let totalRendered = 0;

    runs.forEach(run => {
      if (!run.visible) return;

      const filtered = run.points.filter(p => {
        if (p.anomalyValue < filters.minAnomaly) return false;
        if (filters.timeRange !== 'all') {
          const t = new Date(p.timestamp);
          if (filters.timeRange === 'hour')  return now.getTime() - t.getTime() <= 3_600_000;
          if (filters.timeRange === 'today') return t.toDateString() === now.toDateString();
          if (filters.timeRange === 'week') {
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - now.getDay());
            weekStart.setHours(0, 0, 0, 0);
            return t >= weekStart;
          }
        }
        return true;
      });

      if (filtered.length === 0) return;

      // Polyline trace for each run
      if (filtered.length > 1) {
        const latlngs = filtered.map(p => [p.latitude, p.longitude] as [number, number]);
        L.polyline(latlngs, {
          color: run.color,
          weight: 1.5,
          opacity: 0.4,
          dashArray: '4 4',
        }).addTo(markersLayer);
      }

      filtered.forEach(p => {
        if (!firstPoint) firstPoint = p;
        totalRendered++;

        const fill = colorMode === 'run'
          ? run.color
          : anomalyColor(p.anomalyValue, thresholds);

        const isOutlier = p.outlierFlag === true;
        const radius = isOutlier ? 10 : 7;

        const marker = L.circleMarker([p.latitude, p.longitude], {
          radius,
          fillColor: fill,
          color: isOutlier ? '#ff0000' : '#fff',
          weight: isOutlier ? 2 : 1,
          opacity: 1,
          fillOpacity: 0.85,
        });

        marker.bindPopup(`
          <div class="font-sans p-1 text-xs">
            <div class="font-semibold mb-1" style="color:${run.color}">${run.experimentId} — ${run.runId.split('_').slice(-1)[0]}</div>
            <div>Δg: <b>${p.anomalyValue.toFixed(3)}</b> mGal</div>
            ${p.anomalySmoothed != null ? `<div>Smooth: ${p.anomalySmoothed.toFixed(3)} mGal</div>` : ''}
            <div class="text-gray-500 mt-1">
              ${p.latitude.toFixed(6)}°, ${p.longitude.toFixed(6)}°
            </div>
            ${p.altitude != null ? `<div class="text-gray-500">Alt: ${p.altitude.toFixed(1)} m</div>` : ''}
            ${p.temperature != null ? `<div class="text-gray-500">Temp: ${p.temperature.toFixed(1)} °C</div>` : ''}
            <div class="text-gray-400 mt-1">${new Date(p.timestamp).toLocaleTimeString()}</div>
            ${isOutlier ? `<div class="text-red-500 font-medium mt-1">⚠ Outlier</div>` : ''}
          </div>
        `);

        if (onMarkerClick) {
          marker.on('click', () => onMarkerClick(p, run));
        }

        markersLayer.addLayer(marker);
      });
    });

    // Auto-centre on first load
    if (firstPoint && totalRendered === 1) {
      mapRef.current?.setView([firstPoint.latitude, firstPoint.longitude], 15);
    }
    // Fit all visible points when runs change
    if (totalRendered > 1 && firstPoint) {
      const allLatLngs: L.LatLngExpression[] = [];
      runs.forEach(r => {
        if (r.visible) r.points.forEach(p => allLatLngs.push([p.latitude, p.longitude]));
      });
      if (allLatLngs.length > 0) {
        try { mapRef.current?.fitBounds(L.latLngBounds(allLatLngs), { padding: [30, 30], maxZoom: 17 }); }
        catch { /* ignore invalid bounds */ }
      }
    }
  }, [runs, filters, thresholds, colorMode, onMarkerClick]);

  return <div ref={mapContainerRef} className="flex-1" />;
};

export default MapView;
