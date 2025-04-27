import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  bgColor?: string;
  textColor?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  bgColor = "bg-blue-50",
  textColor
}) => {
  return (
    <Card className={cn("border-none shadow-none", bgColor)}>
      <CardContent className="p-3 flex flex-col">
        <div className="text-xs text-gray-500 mb-1">{label}</div>
        <div className={cn("text-2xl font-mono font-medium", textColor)}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
};

export default StatCard;
