import { useEffect, useRef, useCallback, useState } from 'react';
import { WSMessage } from '../types';

interface UseWebSocketOptions {
  onMessage?: (msg: WSMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  directPort?: number;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    onMessage,
    onOpen,
    onClose,
    autoReconnect = true,
    reconnectInterval = 3000,
    directPort,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    let wsUrl: string;
    if (directPort) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//localhost:${directPort}/ws`;
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/ws`;
    }

    console.log('[WS] Connecting to:', wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      onOpen?.();
      console.log('[WS] Connected to:', wsUrl);
    };

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        onMessage?.(msg);
      } catch (e) {
        console.error('[WS] Parse error:', e);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      onClose?.();
      console.log('[WS] Disconnected');
      if (autoReconnect) {
        reconnectTimerRef.current = setTimeout(connect, reconnectInterval);
      }
    };

    ws.onerror = (err) => {
      console.error('[WS] Connection error:', wsUrl, err);
    };
  }, [onMessage, onOpen, onClose, autoReconnect, reconnectInterval, directPort]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
  }, []);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return { connected, send, disconnect };
}
