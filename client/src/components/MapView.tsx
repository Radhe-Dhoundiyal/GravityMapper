import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { AnomalyDataPoint, AnomalyThresholds, AnomalyFilters, AppSettings } from "@/lib/types";

interface MapViewProps {
  dataPoints: AnomalyDataPoint[];
  settings: AppSettings;
  filters: AnomalyFilters;
  thresholds: AnomalyThresholds;
  onMarkerClick?: (point: AnomalyDataPoint) => void;
}

const MapView: React.FC<MapViewProps> = ({
  dataPoints,
  settings,
  filters,
  thresholds,
  onMarkerClick
}) => {
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Initialize map on component mount
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    
    // Create map instance
    const map = L.map(mapContainerRef.current).setView([settings.defaultLat, settings.defaultLng], 13);
    mapRef.current = map;
    
    // Add appropriate tile layer based on settings
    let tileLayer;
    if (settings.mapStyle === 'satellite') {
      tileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      });
    } else {
      tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      });
    }
    tileLayer.addTo(map);
    
    // Create markers layer
    const markersLayer = L.layerGroup().addTo(map);
    markersLayerRef.current = markersLayer;
    
    // Cleanup on unmount
    return () => {
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  // Update tile layer when map style changes
  useEffect(() => {
    if (!mapRef.current) return;
    
    const map = mapRef.current;
    
    // Remove existing layers
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer);
      }
    });
    
    // Add new tile layer based on settings
    let tileLayer;
    if (settings.mapStyle === 'satellite') {
      tileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      });
    } else if (settings.mapStyle === 'terrain') {
      tileLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
      });
    } else {
      tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      });
    }
    
    tileLayer.addTo(map);
  }, [settings.mapStyle]);

  // Update markers when data points or filters change
  useEffect(() => {
    if (!mapRef.current || !markersLayerRef.current) return;
    
    const markersLayer = markersLayerRef.current;
    
    // Clear existing markers
    markersLayer.clearLayers();
    
    // Filter data points
    const filteredPoints = dataPoints.filter(point => {
      // Apply minimum anomaly filter
      if (point.anomalyValue < filters.minAnomaly) {
        return false;
      }
      
      // Apply time filter
      if (filters.timeRange !== 'all') {
        const now = new Date();
        const pointTime = new Date(point.timestamp);
        
        if (filters.timeRange === 'hour') {
          return (now.getTime() - pointTime.getTime()) <= 3600000; // 1 hour in ms
        } else if (filters.timeRange === 'today') {
          return pointTime.setHours(0, 0, 0, 0) === now.setHours(0, 0, 0, 0);
        } else if (filters.timeRange === 'week') {
          const weekStart = new Date(now);
          weekStart.setDate(now.getDate() - now.getDay());
          weekStart.setHours(0, 0, 0, 0);
          return pointTime >= weekStart;
        }
      }
      
      return true;
    });
    
    // Add filtered points to map
    filteredPoints.forEach(point => {
      // Determine color based on anomaly value
      let color;
      if (point.anomalyValue < thresholds.medium) {
        color = '#4CAF50'; // Low - Green
      } else if (point.anomalyValue < thresholds.high) {
        color = '#FFEB3B'; // Medium - Yellow
      } else {
        color = '#F44336'; // High - Red
      }
      
      // Create marker
      const marker = L.circleMarker([point.latitude, point.longitude], {
        radius: 8,
        fillColor: color,
        color: '#fff',
        weight: 1,
        opacity: 1,
        fillOpacity: 0.8
      });
      
      // Add popup with info
      marker.bindPopup(`
        <div class="font-sans p-1">
          <div class="font-medium">Anomaly: ${point.anomalyValue.toFixed(3)}</div>
          <div class="text-xs text-gray-600">Lat: ${point.latitude.toFixed(6)}</div>
          <div class="text-xs text-gray-600">Lng: ${point.longitude.toFixed(6)}</div>
          <div class="text-xs text-gray-600">Time: ${new Date(point.timestamp).toLocaleTimeString()}</div>
        </div>
      `);
      
      // Handle marker click
      if (onMarkerClick) {
        marker.on('click', () => onMarkerClick(point));
      }
      
      // Add to markers layer
      markersLayer.addLayer(marker);
    });
    
    // If this is the first point, center map on it
    if (filteredPoints.length > 0 && dataPoints.length === 1) {
      const firstPoint = filteredPoints[0];
      mapRef.current?.setView([firstPoint.latitude, firstPoint.longitude], 15);
    }
  }, [dataPoints, filters, thresholds, onMarkerClick]);

  return <div ref={mapContainerRef} className="flex-1" />;
};

export default MapView;
