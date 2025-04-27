import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AppSettings } from "@/lib/types";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (settings: AppSettings) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings
}) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);

  // Handle individual setting changes
  const handleSettingChange = (key: keyof AppSettings, value: any) => {
    setLocalSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Handle threshold changes
  const handleThresholdChange = (key: keyof AppSettings['thresholds'], value: number) => {
    setLocalSettings(prev => ({
      ...prev,
      thresholds: {
        ...prev.thresholds,
        [key]: value
      }
    }));
  };

  // Handle save
  const handleSave = () => {
    onSaveSettings(localSettings);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-3">
          <div>
            <Label htmlFor="map-style" className="mb-1">Map Style</Label>
            <Select 
              value={localSettings.mapStyle} 
              onValueChange={(value) => handleSettingChange('mapStyle', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select map style" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="satellite">Satellite</SelectItem>
                <SelectItem value="terrain">Terrain</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="default-location" className="mb-1">Default Location</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                id="default-lat"
                placeholder="Latitude"
                value={localSettings.defaultLat}
                onChange={(e) => handleSettingChange('defaultLat', parseFloat(e.target.value) || 0)}
              />
              <Input
                type="number"
                id="default-lng"
                placeholder="Longitude"
                value={localSettings.defaultLng}
                onChange={(e) => handleSettingChange('defaultLng', parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          <div>
            <Label className="mb-1">Anomaly Thresholds</Label>
            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Low (Green)</span>
                  <span>&lt; {localSettings.thresholds.medium.toFixed(1)}</span>
                </div>
                <input 
                  type="range" 
                  id="medium-threshold" 
                  min="0.1" 
                  max="1" 
                  step="0.1" 
                  value={localSettings.thresholds.medium}
                  onChange={(e) => handleThresholdChange('medium', parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>High (Red)</span>
                  <span>&gt; {localSettings.thresholds.high.toFixed(1)}</span>
                </div>
                <input 
                  type="range" 
                  id="high-threshold" 
                  min="0.5" 
                  max="2" 
                  step="0.1" 
                  value={localSettings.thresholds.high}
                  onChange={(e) => handleThresholdChange('high', parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Switch 
              id="dark-mode" 
              checked={localSettings.darkMode}
              onCheckedChange={(checked) => handleSettingChange('darkMode', checked)}
            />
            <Label htmlFor="dark-mode">Dark Mode</Label>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" onClick={handleSave} className="bg-primary hover:bg-blue-700">
            Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsModal;
