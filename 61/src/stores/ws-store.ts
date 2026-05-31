import { create } from 'zustand';
import type { ServerMessage, ClientMessage } from '../../shared/types';

interface RealtimeData {
  value: number;
  timestamp: string;
}

interface WsState {
  connected: boolean;
  subscribedIds: Set<string>;
  realtimeData: Map<string, RealtimeData>;
  sensorStatuses: Map<string, 'online' | 'offline' | 'alarm'>;
  metadataVersion: number;
  connect: () => void;
  disconnect: () => void;
  subscribe: (sensorIds: string[]) => void;
  unsubscribe: (sensorIds: string[]) => void;
  resubscribeAll: () => void;
}

let ws: WebSocket | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000;

function getReconnectDelay(): number {
  return Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
}

export const useWsStore = create<WsState>((set, get) => ({
  connected: false,
  subscribedIds: new Set(),
  realtimeData: new Map(),
  sensorStatuses: new Map(),
  metadataVersion: 0,

  connect: () => {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      try { ws.close(); } catch {}
      ws = null;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.hostname}:3001/ws`;

    ws = new WebSocket(url);

    ws.onopen = () => {
      reconnectAttempts = 0;
      set({ connected: true });
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      heartbeatTimer = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          const msg: ClientMessage = { type: 'ping' };
          ws.send(JSON.stringify(msg));
        }
      }, 30000);
      const ids = get().subscribedIds;
      if (ids.size > 0) {
        const msg: ClientMessage = { type: 'subscribe', sensorIds: Array.from(ids) };
        ws.send(JSON.stringify(msg));
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        switch (msg.type) {
          case 'data':
            set((s) => {
              const next = new Map(s.realtimeData);
              next.set(msg.sensorId, { value: msg.value, timestamp: msg.timestamp });
              return { realtimeData: next };
            });
            break;
          case 'status':
            set((s) => {
              const next = new Map(s.sensorStatuses);
              next.set(msg.sensorId, msg.status);
              if (msg.status === 'offline') {
                const nextData = new Map(s.realtimeData);
                nextData.delete(msg.sensorId);
                return { sensorStatuses: next, realtimeData: nextData };
              }
              return { sensorStatuses: next };
            });
            break;
          case 'metadata_updated':
            set({ metadataVersion: msg.version });
            break;
          case 'batch_data':
            set((s) => {
              const next = new Map(s.realtimeData);
              for (const item of msg.items) {
                next.set(item.sensorId, { value: item.value, timestamp: item.timestamp });
              }
              return { realtimeData: next };
            });
            break;
          case 'pong':
            break;
        }
      } catch {}
    };

    ws.onclose = () => {
      set({ connected: false });
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      const delay = getReconnectDelay();
      reconnectAttempts++;
      reconnectTimer = setTimeout(() => {
        get().connect();
      }, delay);
    };

    ws.onerror = () => {
      ws?.close();
    };
  },

  disconnect: () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    reconnectAttempts = 0;
    if (ws) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }
    set({ connected: false });
  },

  subscribe: (sensorIds: string[]) => {
    const state = get();
    const newIds: string[] = [];
    set((s) => {
      const next = new Set(s.subscribedIds);
      for (const id of sensorIds) {
        if (!next.has(id)) {
          next.add(id);
          newIds.push(id);
        }
      }
      return { subscribedIds: next };
    });
    if (newIds.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { type: 'subscribe', sensorIds: newIds };
      ws.send(JSON.stringify(msg));
    }
  },

  unsubscribe: (sensorIds: string[]) => {
    const state = get();
    const removedIds: string[] = [];
    set((s) => {
      const next = new Set(s.subscribedIds);
      const nextData = new Map(s.realtimeData);
      for (const id of sensorIds) {
        if (next.has(id)) {
          next.delete(id);
          removedIds.push(id);
        }
        nextData.delete(id);
      }
      return { subscribedIds: next, realtimeData: nextData };
    });
    if (removedIds.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { type: 'unsubscribe', sensorIds: removedIds };
      ws.send(JSON.stringify(msg));
    }
  },

  resubscribeAll: () => {
    const ids = get().subscribedIds;
    if (ids.size > 0 && ws && ws.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { type: 'subscribe', sensorIds: Array.from(ids) };
      ws.send(JSON.stringify(msg));
    }
  },
}));
