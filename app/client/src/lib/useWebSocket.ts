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

  // ── Stash the latest callbacks in refs so the socket handler always
  //    invokes the freshest closure (avoids stale-state bugs, e.g. an
  //    addLivePoint that captured activeRunId=null at connect time).
  const onMessageRef = useRef(onMessage);
  const onOpenRef    = useRef(onOpen);
  const onErrorRef   = useRef(onError);
  const onCloseRef   = useRef(onClose);
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { onOpenRef.current    = onOpen; },    [onOpen]);
  useEffect(() => { onErrorRef.current   = onError; },   [onError]);
  useEffect(() => { onCloseRef.current   = onClose; },   [onClose]);

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
      onOpenRef.current?.(event);
    };

    // Handle incoming messages — always dispatch to the LATEST onMessage via ref.
    socket.onmessage = (event) => {
      try {
        const parsedData: WebSocketMessage = JSON.parse(event.data);
        onMessageRef.current?.(parsedData);
      } catch (err) {
        console.error("Error parsing WebSocket message:", err);
      }
    };

    // Handle errors
    socket.onerror = (event) => {
      onErrorRef.current?.(event);
    };

    // Handle connection close
    socket.onclose = (event) => {
      setIsConnected(false);
      onCloseRef.current?.(event);

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
    // NOTE: callbacks are intentionally NOT in deps — they are accessed via
    // refs above so the socket handler always uses the latest closure
    // without forcing reconnects.
  }, [manual, reconnectInterval, reconnectAttempts, reconnectCount]);

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
