import { useState, useEffect, useRef, useCallback } from "react";
import { WebSocketMessage } from "./types";

export type WebSocketConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

interface UseWebSocketOptions {
  onOpen?: (event: Event) => void;
  onMessage?: (data: any) => void;
  onError?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
  reconnectInterval?: number;
  autoConnect?: boolean;
  manual?: boolean;
}

const wsLog = (...args: unknown[]) => {
  if (import.meta.env.DEV) {
    console.debug(...args);
  }
};

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    onOpen,
    onMessage,
    onError,
    onClose,
    reconnectInterval = 5000,
    autoConnect = true,
    manual = false,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState<WebSocketConnectionStatus>('disconnected');
  const [reconnectCount, setReconnectCount] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectingRef = useRef(false);
  const shouldReconnectRef = useRef(autoConnect && !manual);

  const onMessageRef = useRef(onMessage);
  const onOpenRef = useRef(onOpen);
  const onErrorRef = useRef(onError);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { onOpenRef.current = onOpen; }, [onOpen]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const getWebSocketUrl = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws`;
  }, []);

  const connectRef = useRef<() => void>(() => {});

  const scheduleReconnect = useCallback(() => {
    if (manual || !shouldReconnectRef.current || reconnectTimerRef.current) return;

    setStatus('reconnecting');
    wsLog('[WS] reconnecting');

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      setReconnectCount(prev => prev + 1);
      connectRef.current();
    }, reconnectInterval);
  }, [manual, reconnectInterval]);

  const connect = useCallback(() => {
    if (typeof window === 'undefined') return;

    shouldReconnectRef.current = !manual;

    const existing = socketRef.current;
    if (
      existing?.readyState === WebSocket.OPEN ||
      existing?.readyState === WebSocket.CONNECTING ||
      isConnectingRef.current
    ) {
      return;
    }

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    const wsUrl = getWebSocketUrl();
    isConnectingRef.current = true;
    setStatus('reconnecting');
    wsLog('[WS] connecting to', wsUrl);

    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = (event) => {
      isConnectingRef.current = false;
      setIsConnected(true);
      setStatus('connected');
      setReconnectCount(0);
      wsLog('[WS] connected');
      onOpenRef.current?.(event);
    };

    socket.onmessage = (event) => {
      try {
        const parsedData: WebSocketMessage = JSON.parse(event.data);
        wsLog('[WS] message received');
        onMessageRef.current?.(parsedData);
      } catch (err) {
        console.error("Error parsing WebSocket message:", err);
      }
    };

    socket.onerror = (event) => {
      isConnectingRef.current = false;
      onErrorRef.current?.(event);
    };

    socket.onclose = (event) => {
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      isConnectingRef.current = false;
      setIsConnected(false);
      setStatus('disconnected');
      wsLog('[WS] disconnected');
      onCloseRef.current?.(event);
      scheduleReconnect();
    };
  }, [getWebSocketUrl, manual, scheduleReconnect]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    isConnectingRef.current = false;
    setIsConnected(false);
    setStatus('disconnected');
  }, []);

  const sendMessage = useCallback((data: any) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(typeof data === 'string' ? data : JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    shouldReconnectRef.current = autoConnect && !manual;
    if (autoConnect && !manual) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [connect, disconnect, autoConnect, manual]);

  return {
    isConnected,
    status,
    connect,
    disconnect,
    sendMessage,
    reconnectCount,
  };
}
