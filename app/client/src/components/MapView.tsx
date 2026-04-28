import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { AnomalyRegion, AnomalyThresholds, AnomalyFilters, AppSettings, ExperimentRun, MapColorMode, MapViewMode, SensorDataPoint, SurveyGrid } from "@/lib/types";

interface MapViewProps {
  runs: ExperimentRun[];
  settings: AppSettings;
  filters: AnomalyFilters;
  thresholds: AnomalyThresholds;
  colorMode: MapColorMode;
  viewMode: MapViewMode;
  surveyGrid: SurveyGrid | null;
  isPickingSurveyOrigin: boolean;
  onSurveyOriginSelected: (origin: { lat: number; lng: number }) => void;
  onAnomalyRegionsChange?: (regions: AnomalyRegion[]) => void;
  onMarkerClick?: (point: SensorDataPoint, run: ExperimentRun) => void;
}

interface HeatmapPoint {
  latitude: number;
  longitude: number;
  anomalyValue: number;
}

interface InterpolatedGrid {
  width: number;
  height: number;
  values: Float64Array;
  minValue: number;
  maxValue: number;
  dxMeters: number;
  dyMeters: number;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  bounds: [[number, number], [number, number]];
}

const MAX_IDW_POINTS = 3000;
const MAX_GRID_SIDE = 80;
const HEATMAP_OPACITY = 0.58;
const GRADIENT_OPACITY = 0.66;
const IDW_POWER = 2;
const EARTH_RADIUS_METERS = 6_371_000;
const MIN_ANOMALY_REGION_CELLS = 3;

function anomalyColor(value: number, thresholds: AnomalyThresholds): string {
  if (value < thresholds.medium) return '#4CAF50';
  if (value < thresholds.high)   return '#FFEB3B';
  return '#F44336';
}

function interpolateColor(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function heatColor(value: number, min: number, max: number): [number, number, number] {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return [34, 197, 94];
  }
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return t < 0.5
    ? interpolateColor([37, 99, 235], [34, 197, 94], t / 0.5)
    : interpolateColor([34, 197, 94], [239, 68, 68], (t - 0.5) / 0.5);
}

function gradientColor(value: number, min: number, max: number): [number, number, number] {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return [18, 18, 24];
  }
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  if (t < 0.4) return interpolateColor([18, 18, 24], [37, 99, 235], t / 0.4);
  if (t < 0.75) return interpolateColor([37, 99, 235], [34, 211, 238], (t - 0.4) / 0.35);
  return interpolateColor([34, 211, 238], [250, 250, 250], (t - 0.75) / 0.25);
}

function filteredPointsForRun(run: ExperimentRun, filters: AnomalyFilters, now: Date): SensorDataPoint[] {
  return run.points.filter(p => {
    if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude) || !Number.isFinite(p.anomalyValue)) return false;
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
}

function downsampleEvenly(points: HeatmapPoint[], maxPoints: number): HeatmapPoint[] {
  if (points.length <= maxPoints) return points;
  const sampled: HeatmapPoint[] = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    sampled.push(points[Math.round(i * step)]);
  }
  return sampled;
}

function idwValue(latitude: number, longitude: number, points: HeatmapPoint[], lngScale: number): number {
  let weightedSum = 0;
  let weightTotal = 0;

  for (const p of points) {
    const dLat = latitude - p.latitude;
    const dLng = (longitude - p.longitude) * lngScale;
    const distSq = dLat * dLat + dLng * dLng;
    if (distSq < 1e-14) return p.anomalyValue;

    const weight = 1 / Math.pow(distSq, IDW_POWER / 2);
    weightedSum += p.anomalyValue * weight;
    weightTotal += weight;
  }

  return weightTotal > 0 ? weightedSum / weightTotal : 0;
}

function buildInterpolatedGrid(points: HeatmapPoint[]): InterpolatedGrid | null {
  if (points.length < 2) return null;

  const lats = points.map(p => p.latitude);
  const lngs = points.map(p => p.longitude);
  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  let minLng = Math.min(...lngs);
  let maxLng = Math.max(...lngs);

  if (minLat === maxLat) { minLat -= 0.0005; maxLat += 0.0005; }
  if (minLng === maxLng) { minLng -= 0.0005; maxLng += 0.0005; }

  const latSpan = maxLat - minLat;
  const lngSpan = maxLng - minLng;
  const padLat = latSpan * 0.08;
  const padLng = lngSpan * 0.08;
  minLat -= padLat; maxLat += padLat;
  minLng -= padLng; maxLng += padLng;

  const aspect = Math.max(0.25, Math.min(4, lngSpan / Math.max(latSpan, 1e-9)));
  const width = aspect >= 1 ? MAX_GRID_SIDE : Math.max(28, Math.round(MAX_GRID_SIDE * aspect));
  const height = aspect >= 1 ? Math.max(28, Math.round(MAX_GRID_SIDE / aspect)) : MAX_GRID_SIDE;
  const values = points.map(p => p.anomalyValue);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const sourcePoints = downsampleEvenly(points, MAX_IDW_POINTS);
  const midLat = (minLat + maxLat) / 2;
  const lngScale = Math.max(0.1, Math.cos(midLat * Math.PI / 180));
  const gridValues = new Float64Array(width * height);

  for (let y = 0; y < height; y++) {
    const lat = maxLat - (y / Math.max(1, height - 1)) * (maxLat - minLat);
    for (let x = 0; x < width; x++) {
      const lng = minLng + (x / Math.max(1, width - 1)) * (maxLng - minLng);
      gridValues[y * width + x] = idwValue(lat, lng, sourcePoints, lngScale);
    }
  }

  const dxMeters = Math.max(0.01, distanceMeters(
    { lat: midLat, lng: minLng },
    { lat: midLat, lng: minLng + (maxLng - minLng) / Math.max(1, width - 1) },
  ));
  const dyMeters = Math.max(0.01, distanceMeters(
    { lat: minLat, lng: minLng },
    { lat: minLat + (maxLat - minLat) / Math.max(1, height - 1), lng: minLng },
  ));

  return {
    width,
    height,
    values: gridValues,
    minValue,
    maxValue,
    dxMeters,
    dyMeters,
    minLat,
    maxLat,
    minLng,
    maxLng,
    bounds: [[minLat, minLng], [maxLat, maxLng]],
  };
}

function paintGridCanvas(
  grid: InterpolatedGrid,
  colorForValue: (value: number, min: number, max: number) => [number, number, number],
  alpha: number,
  values = grid.values,
  minValue = grid.minValue,
  maxValue = grid.maxValue,
): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = grid.width;
  canvas.height = grid.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const image = ctx.createImageData(grid.width, grid.height);
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const value = values[y * grid.width + x];
      const [r, g, b] = colorForValue(value, minValue, maxValue);
      const offset = (y * grid.width + x) * 4;
      image.data[offset] = r;
      image.data[offset + 1] = g;
      image.data[offset + 2] = b;
      image.data[offset + 3] = alpha;
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

function buildHeatmapCanvas(points: HeatmapPoint[]): { canvas: HTMLCanvasElement; bounds: [[number, number], [number, number]] } | null {
  const grid = buildInterpolatedGrid(points);
  if (!grid) return null;
  const canvas = paintGridCanvas(grid, heatColor, 205);
  return canvas ? { canvas, bounds: grid.bounds } : null;
}

function buildGradientCanvas(points: HeatmapPoint[]): { canvas: HTMLCanvasElement; bounds: [[number, number], [number, number]] } | null {
  const grid = buildInterpolatedGrid(points);
  if (!grid || grid.width < 2 || grid.height < 2) return null;

  const gradients = new Float64Array(grid.width * grid.height);
  let minGradient = Infinity;
  let maxGradient = -Infinity;

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const left = grid.values[y * grid.width + Math.max(0, x - 1)];
      const right = grid.values[y * grid.width + Math.min(grid.width - 1, x + 1)];
      const up = grid.values[Math.max(0, y - 1) * grid.width + x];
      const down = grid.values[Math.min(grid.height - 1, y + 1) * grid.width + x];
      const xSpan = x === 0 || x === grid.width - 1 ? grid.dxMeters : grid.dxMeters * 2;
      const ySpan = y === 0 || y === grid.height - 1 ? grid.dyMeters : grid.dyMeters * 2;
      const dAdx = (right - left) / xSpan;
      const dAdy = (down - up) / ySpan;
      const gradient = Math.sqrt(dAdx * dAdx + dAdy * dAdy);
      gradients[y * grid.width + x] = gradient;
      if (Number.isFinite(gradient)) {
        minGradient = Math.min(minGradient, gradient);
        maxGradient = Math.max(maxGradient, gradient);
      }
    }
  }

  const canvas = paintGridCanvas(grid, gradientColor, 220, gradients, minGradient, maxGradient);
  return canvas ? { canvas, bounds: grid.bounds } : null;
}

function cellCenter(grid: InterpolatedGrid, x: number, y: number): { lat: number; lng: number } {
  return {
    lat: grid.maxLat - (y / Math.max(1, grid.height - 1)) * (grid.maxLat - grid.minLat),
    lng: grid.minLng + (x / Math.max(1, grid.width - 1)) * (grid.maxLng - grid.minLng),
  };
}

function countNearbyMeasurements(region: Pick<AnomalyRegion, 'centerLat' | 'centerLng' | 'areaSqMeters'>, points: HeatmapPoint[]): number {
  const radiusMeters = Math.max(3, Math.sqrt(region.areaSqMeters / Math.PI) * 1.5);
  return points.filter(point =>
    distanceMeters(
      { lat: region.centerLat, lng: region.centerLng },
      { lat: point.latitude, lng: point.longitude },
    ) <= radiusMeters
  ).length;
}

function detectAnomalyRegions(grid: InterpolatedGrid, sourcePoints: HeatmapPoint[]): AnomalyRegion[] {
  const n = grid.values.length;
  if (n === 0) return [];

  let sum = 0;
  for (const value of Array.from(grid.values)) sum += value;
  const mean = sum / n;
  let varianceSum = 0;
  for (const value of Array.from(grid.values)) varianceSum += (value - mean) ** 2;
  const std = Math.sqrt(varianceSum / n);
  if (!Number.isFinite(std) || std <= 0) return [];

  const positiveThreshold = mean + 2 * std;
  const negativeThreshold = mean - 2 * std;
  const visited = new Uint8Array(n);
  const regions: AnomalyRegion[] = [];
  const cellArea = grid.dxMeters * grid.dyMeters;
  let maxAbsAnomaly = 0;
  for (const value of Array.from(grid.values)) {
    maxAbsAnomaly = Math.max(maxAbsAnomaly, Math.abs(value));
  }

  const isAnomalyCell = (index: number, type: 'positive' | 'negative') => {
    const value = grid.values[index];
    return type === 'positive'
      ? value > positiveThreshold
      : value < negativeThreshold;
  };

  for (let start = 0; start < n; start++) {
    if (visited[start]) continue;
    const startValue = grid.values[start];
    const type = startValue > positiveThreshold
      ? 'positive'
      : startValue < negativeThreshold
        ? 'negative'
        : null;

    if (!type) {
      visited[start] = 1;
      continue;
    }

    const stack = [start];
    visited[start] = 1;
    let cellCount = 0;
    let latSum = 0;
    let lngSum = 0;
    let peak = startValue;

    while (stack.length > 0) {
      const index = stack.pop()!;
      const x = index % grid.width;
      const y = Math.floor(index / grid.width);
      const center = cellCenter(grid, x, y);
      const value = grid.values[index];

      cellCount++;
      latSum += center.lat;
      lngSum += center.lng;
      peak = type === 'positive' ? Math.max(peak, value) : Math.min(peak, value);

      const neighbors = [
        x > 0 ? index - 1 : -1,
        x < grid.width - 1 ? index + 1 : -1,
        y > 0 ? index - grid.width : -1,
        y < grid.height - 1 ? index + grid.width : -1,
      ];

      for (const next of neighbors) {
        if (next < 0 || visited[next] || !isAnomalyCell(next, type)) continue;
        visited[next] = 1;
        stack.push(next);
      }
    }

    if (cellCount >= MIN_ANOMALY_REGION_CELLS) {
      const centerLat = latSum / cellCount;
      const centerLng = lngSum / cellCount;
      const areaSqMeters = cellCount * cellArea;
      const nearbyPointCount = countNearbyMeasurements({ centerLat, centerLng, areaSqMeters }, sourcePoints);
      regions.push({
        id: `${type}-${regions.length + 1}`,
        type,
        centerLat,
        centerLng,
        peakAnomalyValue: peak,
        areaSqMeters,
        pointDensity: nearbyPointCount / Math.max(1, areaSqMeters),
        confidence: 0,
        cellCount,
      });
    }
  }

  const rawScores = regions.map((region) => {
    const normalizedPeakAnomaly = maxAbsAnomaly > 0
      ? Math.min(1, Math.abs(region.peakAnomalyValue) / maxAbsAnomaly)
      : 0;
    return normalizedPeakAnomaly * Math.sqrt(region.areaSqMeters) * region.pointDensity;
  });
  const maxScore = Math.max(0, ...rawScores);

  return regions
    .map((region, index) => ({
      ...region,
      confidence: maxScore > 0 ? Math.max(0, Math.min(1, rawScores[index] / maxScore)) : 0,
    }))
    .sort((a, b) => b.confidence - a.confidence);
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

function hasNearbyMeasurement(node: { lat: number; lng: number }, points: SensorDataPoint[], toleranceMeters: number): boolean {
  return points.some(p => distanceMeters(node, { lat: p.latitude, lng: p.longitude }) <= toleranceMeters);
}

const MapView: React.FC<MapViewProps> = ({
  runs,
  settings,
  filters,
  thresholds,
  colorMode,
  viewMode,
  surveyGrid,
  isPickingSurveyOrigin,
  onSurveyOriginSelected,
  onAnomalyRegionsChange,
  onMarkerClick,
}) => {
  const mapRef          = useRef<any | null>(null);
  const markersLayerRef = useRef<any | null>(null);
  const heatmapLayerRef = useRef<any | null>(null);
  const anomalyRegionsLayerRef = useRef<any | null>(null);
  const surveyGridLayerRef = useRef<any | null>(null);
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
    const anomalyRegionsLayer = L.layerGroup().addTo(map);
    anomalyRegionsLayerRef.current = anomalyRegionsLayer;
    const surveyGridLayer = L.layerGroup().addTo(map);
    surveyGridLayerRef.current = surveyGridLayer;

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
      heatmapLayerRef.current = null;
      anomalyRegionsLayerRef.current = null;
      surveyGridLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const container = map.getContainer();
    container.style.cursor = isPickingSurveyOrigin ? 'crosshair' : '';

    const handleClick = (event: any) => {
      if (!isPickingSurveyOrigin) return;
      onSurveyOriginSelected({ lat: event.latlng.lat, lng: event.latlng.lng });
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
      container.style.cursor = '';
    };
  }, [isPickingSurveyOrigin, onSurveyOriginSelected]);

  // ── Tile layer update ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    map.eachLayer((l: any) => { if (l instanceof L.TileLayer) map.removeLayer(l); });

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
    if (viewMode === 'heatmap' || viewMode === 'gradient' || viewMode === 'anomalies') return;

    const now = new Date();
    let firstPointLatLng: [number, number] | null = null;
    let totalRendered = 0;

    runs.forEach(run => {
      if (!run.visible) return;

      const filtered = filteredPointsForRun(run, filters, now);

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
        if (!firstPointLatLng) firstPointLatLng = [p.latitude, p.longitude];
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
    if (firstPointLatLng && totalRendered === 1) {
      mapRef.current?.setView(firstPointLatLng, 15);
    }
    // Fit all visible points when runs change
    if (totalRendered > 1 && firstPointLatLng) {
      const allLatLngs: Array<[number, number]> = [];
      runs.forEach(r => {
        if (r.visible) r.points.forEach(p => allLatLngs.push([p.latitude, p.longitude]));
      });
      if (allLatLngs.length > 0) {
        try { mapRef.current?.fitBounds(L.latLngBounds(allLatLngs), { padding: [30, 30], maxZoom: 17 }); }
        catch { /* ignore invalid bounds */ }
      }
    }
  }, [runs, filters, thresholds, colorMode, viewMode, onMarkerClick]);

  // â”€â”€ Heatmap update â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    if (heatmapLayerRef.current) {
      map.removeLayer(heatmapLayerRef.current);
      heatmapLayerRef.current = null;
    }

    if (anomalyRegionsLayerRef.current) {
      anomalyRegionsLayerRef.current.clearLayers();
    }

    if (viewMode !== 'heatmap' && viewMode !== 'gradient' && viewMode !== 'anomalies') {
      onAnomalyRegionsChange?.([]);
      return;
    }

    const now = new Date();
    const heatmapPoints: HeatmapPoint[] = runs.flatMap(run => {
      if (!run.visible) return [];
      return filteredPointsForRun(run, filters, now).map(p => ({
        latitude: p.latitude,
        longitude: p.longitude,
        anomalyValue: p.anomalyValue,
      }));
    });

    if (viewMode === 'anomalies') {
      const grid = buildInterpolatedGrid(heatmapPoints);
      if (!grid || !anomalyRegionsLayerRef.current) {
        onAnomalyRegionsChange?.([]);
        return;
      }

      const regions = detectAnomalyRegions(grid, heatmapPoints);
      onAnomalyRegionsChange?.(regions);
      regions.forEach((region) => {
        const color = region.type === 'positive' ? '#dc2626' : '#2563eb';
        const radius = Math.max(4, Math.sqrt(region.areaSqMeters / Math.PI));
        const circle = L.circle([region.centerLat, region.centerLng], {
          radius,
          color,
          fillColor: color,
          weight: 2,
          opacity: 0.9,
          fillOpacity: 0.22,
        });
        circle.bindPopup(`
          <div class="font-sans p-1 text-xs">
            <div class="font-semibold mb-1">${region.type === 'positive' ? 'Positive' : 'Negative'} anomaly</div>
            <div>Peak: <b>${region.peakAnomalyValue.toFixed(3)}</b> mGal</div>
            <div>Area: ${(region.areaSqMeters / 1000).toFixed(2)}k m²</div>
            <div>Confidence: ${region.confidence.toFixed(2)}</div>
            <div class="text-gray-500 mt-1">${region.centerLat.toFixed(6)}°, ${region.centerLng.toFixed(6)}°</div>
          </div>
        `);
        anomalyRegionsLayerRef.current?.addLayer(circle);
      });

      try {
        map.fitBounds(L.latLngBounds(grid.bounds), { padding: [30, 30], maxZoom: 17 });
      } catch {
        /* ignore invalid bounds */
      }
      return;
    }

    onAnomalyRegionsChange?.([]);
    const overlayImage = viewMode === 'gradient'
      ? buildGradientCanvas(heatmapPoints)
      : buildHeatmapCanvas(heatmapPoints);
    if (!overlayImage) return;

    const overlay = L.imageOverlay(overlayImage.canvas.toDataURL('image/png'), overlayImage.bounds, {
      opacity: viewMode === 'gradient' ? GRADIENT_OPACITY : HEATMAP_OPACITY,
      interactive: false,
    }).addTo(map);
    heatmapLayerRef.current = overlay;

    try {
      map.fitBounds(L.latLngBounds(overlayImage.bounds), { padding: [30, 30], maxZoom: 17 });
    } catch {
      /* ignore invalid bounds */
    }
  }, [runs, filters, viewMode, onAnomalyRegionsChange]);

  // â”€â”€ Survey grid update â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (!mapRef.current || !surveyGridLayerRef.current) return;
    const layer = surveyGridLayerRef.current;
    layer.clearLayers();

    if (!surveyGrid) return;

    const measurementPoints = runs
      .filter(run => run.visible)
      .flatMap(run => run.points)
      .filter(p =>
        Number.isFinite(p.latitude) &&
        Number.isFinite(p.longitude)
      );

    surveyGrid.points.forEach((node) => {
      const visited = hasNearbyMeasurement(node, measurementPoints, surveyGrid.tolerance_meters);
      const marker = L.circleMarker([node.lat, node.lng], {
        radius: visited ? 6 : 5,
        fillColor: visited ? '#16a34a' : '#9ca3af',
        color: '#ffffff',
        weight: 1,
        opacity: 1,
        fillOpacity: visited ? 0.9 : 0.72,
      });

      marker.bindPopup(`
        <div class="font-sans p-1 text-xs">
          <div class="font-semibold mb-1">Survey node R${node.row} C${node.column}</div>
          <div>${visited ? 'Visited' : 'Unvisited'}</div>
          <div class="text-gray-500 mt-1">${node.lat.toFixed(6)}Â°, ${node.lng.toFixed(6)}Â°</div>
          <div class="text-gray-400">Tolerance: ${surveyGrid.tolerance_meters.toFixed(1)} m</div>
        </div>
      `);
      layer.addLayer(marker);
    });

    const gridBounds = L.latLngBounds(surveyGrid.points.map(p => [p.lat, p.lng] as [number, number]));
    try {
      mapRef.current.fitBounds(gridBounds, { padding: [40, 40], maxZoom: 18 });
    } catch {
      /* ignore invalid bounds */
    }
  }, [runs, surveyGrid]);

  return <div ref={mapContainerRef} className="flex-1" />;
};

export default MapView;
