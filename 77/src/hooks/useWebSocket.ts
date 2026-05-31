import { useEffect, useRef, useCallback } from 'react';
import type { WebSocketMessage, MetricData, AlertEvent } from '@/types';

interface UseWebSocketOptions {
  onData?: (data: MetricData, anomaly?: any) => void;
  onAlert?: (alert: AlertEvent) => void;
  onLatestValues?: (values: any[]) => void;
  onOpen?: () => void;
  onClose?: () => void;
  autoConnect?: boolean;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optionsRef = useRef(options);

  optionsRef.current = options;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/stream`;

    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      optionsRef.current.onOpen?.();
      send({ action: 'get_latest' });
    };

    wsRef.current.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        switch (message.type) {
          case 'data':
            optionsRef.current.onData?.(message.data as MetricData, message.anomaly);
            break;
          case 'alert':
            optionsRef.current.onAlert?.(message.data as AlertEvent);
            break;
          case 'latest_values':
            optionsRef.current.onLatestValues?.(message.data as any[]);
            break;
        }
      } catch (e) {
        console.error('WebSocket message parse error:', e);
      }
    };

    wsRef.current.onclose = () => {
      optionsRef.current.onClose?.();
      reconnectTimerRef.current = setTimeout(connect, 3000);
    };

    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      wsRef.current?.close();
    };
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const send = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const subscribe = useCallback((params: { metrics?: string[]; sources?: string[]; includeAlerts?: boolean }) => {
    send({
      action: 'subscribe',
      metrics: params.metrics,
      sources: params.sources,
      include_alerts: params.includeAlerts,
    });
  }, [send]);

  const unsubscribe = useCallback((params: { metrics?: string[]; sources?: string[] }) => {
    send({
      action: 'unsubscribe',
      metrics: params.metrics,
      sources: params.sources,
    });
  }, [send]);

  useEffect(() => {
    if (options.autoConnect !== false) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [connect, disconnect, options.autoConnect]);

  return {
    connect,
    disconnect,
    send,
    subscribe,
    unsubscribe,
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
  };
}
