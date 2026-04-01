import { useState, useEffect, useRef, useCallback } from "react";
import { WebSocketMessage } from "./types";

interface UseWebSocketOptions {
  onOpen?: (event: Event) => void;
  onMessage?: (data: any) => void;
  onError?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
  reconnectInterval?: number;
  reconnectAttempts?: number;
  autoConnect?: boolean;
  manual?: boolean;
}

export function useWebSocket(
  options: UseWebSocketOptions = {}
) {
  const {
    onOpen,
    onMessage,
    onError,
    onClose,
    reconnectInterval = 5000,
    reconnectAttempts = 10,
    autoConnect = true,
    manual = false,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Create WebSocket connection
  const connect = useCallback(() => {
    // Close any existing connection
    if (socketRef.current) {
      socketRef.current.close();
    }

    // Determine WebSocket URL
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    // Create new WebSocket
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    // Handle connection open
    socket.onopen = (event) => {
      setIsConnected(true);
      setReconnectCount(0);
      if (onOpen) onOpen(event);
    };

    // Handle incoming messages
    socket.onmessage = (event) => {
      try {
        const parsedData: WebSocketMessage = JSON.parse(event.data);
        if (onMessage) onMessage(parsedData);
      } catch (err) {
        console.error("Error parsing WebSocket message:", err);
      }
    };

    // Handle errors
    socket.onerror = (event) => {
      if (onError) onError(event);
    };

    // Handle connection close
    socket.onclose = (event) => {
      setIsConnected(false);
      if (onClose) onClose(event);

      // Attempt to reconnect if not closed cleanly and within retry limits
      if (
        !manual &&
        reconnectCount < reconnectAttempts && 
        event.code !== 1000 && // Normal closure
        event.code !== 1001 // Going away
      ) {
        // Schedule reconnect
        reconnectTimerRef.current = setTimeout(() => {
          setReconnectCount(prev => prev + 1);
          connect();
        }, reconnectInterval);
      }
    };
  }, [
    manual,
    onOpen,
    onMessage,
    onError,
    onClose,
    reconnectInterval,
    reconnectAttempts,
    reconnectCount
  ]);

  // Disconnect WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
  }, []);

  // Send message through WebSocket
  const sendMessage = useCallback((data: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(typeof data === 'string' ? data : JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (autoConnect && !manual) {
      connect();
    }

    // Clean up on unmount
    return () => {
      disconnect();
    };
  }, [connect, disconnect, autoConnect, manual]);

  return {
    isConnected,
    connect,
    disconnect,
    sendMessage,
    reconnectCount
  };
}
