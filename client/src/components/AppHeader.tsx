import React from "react";
import { Button } from "@/components/ui/button";
import { ChartScatter, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ConnectionStatus } from "@/lib/types";

interface AppHeaderProps {
  connectionStatus: ConnectionStatus;
  onOpenSettings: () => void;
}

const AppHeader: React.FC<AppHeaderProps> = ({
  connectionStatus,
  onOpenSettings
}) => {
  const getStatusBadge = () => {
    switch (connectionStatus) {
      case 'connected':
        return (
          <Badge variant="outline" className="bg-green-100 text-green-800 hover:bg-green-100">
            <span className="h-2 w-2 mr-1 rounded-full bg-green-500"></span>
            Connected
          </Badge>
        );
      case 'simulation':
        return (
          <Badge variant="outline" className="bg-green-100 text-green-800 hover:bg-green-100">
            <span className="h-2 w-2 mr-1 rounded-full bg-green-500"></span>
            Simulation
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-red-100 text-red-800 hover:bg-red-100">
            <span className="h-2 w-2 mr-1 rounded-full bg-red-500"></span>
            Disconnected
          </Badge>
        );
    }
  };

  return (
    <header className="bg-white shadow-md px-4 py-2 flex justify-between items-center">
      <div className="flex items-center space-x-2">
        <ChartScatter className="text-primary h-6 w-6" />
        <h1 className="text-xl font-medium">Gravitational Anomaly Mapper</h1>
      </div>
      <div className="flex items-center space-x-4">
        {getStatusBadge()}
        <Button variant="ghost" size="icon" onClick={onOpenSettings}>
          <Settings className="h-5 w-5 text-gray-600" />
        </Button>
      </div>
    </header>
  );
};

export default AppHeader;
