import React, { useState, useEffect, useRef } from "react";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastProps {
  id: string;
  message: string;
  type: ToastType;
  onDismiss: (id: string) => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
  id,
  message,
  type,
  onDismiss,
  duration = 3000
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Set up type-based styles
  const getTypeStyles = (): { bgClass: string; textClass: string; icon: JSX.Element } => {
    switch (type) {
      case "success":
        return {
          bgClass: "bg-green-100",
          textClass: "text-green-800",
          icon: <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
        };
      case "error":
        return {
          bgClass: "bg-red-100",
          textClass: "text-red-800",
          icon: <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
        };
      case "warning":
        return {
          bgClass: "bg-yellow-100",
          textClass: "text-yellow-800",
          icon: <AlertTriangle className="h-5 w-5 text-yellow-500 mr-2" />
        };
      case "info":
      default:
        return {
          bgClass: "bg-blue-100",
          textClass: "text-blue-800",
          icon: <Info className="h-5 w-5 text-blue-500 mr-2" />
        };
    }
  };

  const { bgClass, textClass, icon } = getTypeStyles();

  useEffect(() => {
    // Animate in
    setTimeout(() => setIsVisible(true), 10);

    // Auto-dismiss after duration
    timerRef.current = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onDismiss(id), 300); // Wait for animation to complete
    }, duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [id, duration, onDismiss]);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(() => onDismiss(id), 300);
  };

  return (
    <div
      className={cn(
        "flex items-center p-3 max-w-xs rounded shadow-md transition-all duration-300 transform",
        bgClass,
        textClass,
        isVisible ? "translate-x-0" : "translate-x-full opacity-0"
      )}
    >
      {icon}
      <span className="mr-2">{message}</span>
      <button onClick={handleDismiss} className="ml-auto">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export interface ToastContainerProps {
  children: React.ReactNode;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ children }) => {
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 flex flex-col items-end">
      {children}
    </div>
  );
};
