import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Menu, Plus, Minus, Navigation, Radar } from "lucide-react";
import { AnomalyDataPoint } from "@/lib/types";

interface MapToolbarProps {
  onToggleSidebar: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCenterMap: () => void;
  isStreaming: boolean;
  onToggleStream: () => void;
  lastAnomalyPoint: AnomalyDataPoint | null;
  currentCoords: { lat: number; lng: number } | null;
}

const MapToolbar: React.FC<MapToolbarProps> = ({
  onToggleSidebar,
  onZoomIn,
  onZoomOut,
  onCenterMap,
  isStreaming,
  onToggleStream,
  lastAnomalyPoint,
  currentCoords
}) => {
  // Format coordinates for display
  const formatCoords = () => {
    if (!currentCoords) return "--° N, --° E";
    
    const lat = currentCoords.lat.toFixed(6);
    const lng = currentCoords.lng.toFixed(6);
    
    return `${lat}° ${currentCoords.lat >= 0 ? 'N' : 'S'}, ${lng}° ${currentCoords.lng >= 0 ? 'E' : 'W'}`;
  };

  return (
    <div className="bg-white shadow-sm p-2 flex justify-between items-center border-b border-gray-200">
      <div className="flex items-center space-x-2">
        <Button 
          variant="ghost" 
          size="icon" 
          className="md:hidden" 
          onClick={onToggleSidebar}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex items-center space-x-2 text-sm">
          <Button variant="ghost" size="icon" onClick={onZoomIn}>
            <Plus className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onZoomOut}>
            <Minus className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onCenterMap}>
            <Navigation className="h-5 w-5" />
          </Button>
        </div>
      </div>
      
      <div className="text-center">
        <div className="text-xs text-gray-500">Current Coordinates</div>
        <div className="font-mono text-sm">{formatCoords()}</div>
      </div>
      
      <div className="flex items-center">
        <div className="hidden md:flex flex-col mr-4 items-end">
          <span className="text-xs text-gray-500">Last Anomaly</span>
          <span className="font-mono font-medium">
            {lastAnomalyPoint ? lastAnomalyPoint.anomalyValue.toFixed(2) : '--'}
          </span>
        </div>
        <div className="relative inline-block">
          <div className={`h-3 w-3 rounded-full absolute -top-1 -right-1 ${isStreaming ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onToggleStream} 
            title="Start/Stop Data Stream"
          >
            <Radar className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MapToolbar;
