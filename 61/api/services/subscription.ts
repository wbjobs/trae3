import type WebSocket from 'ws';
import type { ClientMessage, ServerMessage } from '../../shared/types.js';

export enum ClientPriority {
  high = 'high',
  medium = 'medium',
  low = 'low',
}

const BACKPRESSURE_THRESHOLD = 65536;
const BATCH_INTERVAL_MS = 50;

interface ClientInfo {
  ws: WebSocket;
  subscribedSensorIds: Set<string>;
  lastPing: number;
  priority: ClientPriority;
  sendQueue: ServerMessage[];
  batchTimer: ReturnType<typeof setTimeout> | null;
  paused: boolean;
}

const clients = new Map<WebSocket, ClientInfo>();
const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 60000;

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function flushClientQueue(info: ClientInfo): void {
  info.batchTimer = null;
  if (info.sendQueue.length === 0) return;

  const items = info.sendQueue.splice(0);
  const data = JSON.stringify(items);
  const ws = info.ws;

  if (ws.readyState !== ws.OPEN) return;

  if ('bufferedAmount' in ws && (ws as any).bufferedAmount > BACKPRESSURE_THRESHOLD) {
    info.sendQueue.unshift(...items);
    info.paused = true;
    return;
  }

  ws.send(data, (err) => {
    if (err) return;
    if ('bufferedAmount' in ws && (ws as any).bufferedAmount < BACKPRESSURE_THRESHOLD) {
      if (info.paused && info.sendQueue.length > 0) {
        info.paused = false;
        scheduleFlush(info);
      } else {
        info.paused = false;
      }
    }
  });
}

function scheduleFlush(info: ClientInfo): void {
  if (info.batchTimer) return;
  info.batchTimer = setTimeout(() => flushClientQueue(info), BATCH_INTERVAL_MS);
}

function enqueueMessage(info: ClientInfo, msg: ServerMessage): void {
  info.sendQueue.push(msg);
  if (!info.paused) {
    scheduleFlush(info);
  }
}

export function addClient(ws: WebSocket): void {
  const info: ClientInfo = {
    ws,
    subscribedSensorIds: new Set(),
    lastPing: Date.now(),
    priority: ClientPriority.medium,
    sendQueue: [],
    batchTimer: null,
    paused: false,
  };

  clients.set(ws, info);

  ws.on('message', (raw: WebSocket.Data) => {
    try {
      const msg = JSON.parse(raw.toString()) as ClientMessage;
      handleMessage(ws, msg);
    } catch {}
  });

  ws.on('close', () => {
    removeClient(ws);
  });

  ws.on('pong', () => {
    const info = clients.get(ws);
    if (info) {
      info.lastPing = Date.now();
    }
  });

  if (!heartbeatTimer) {
    heartbeatTimer = setInterval(checkHeartbeats, HEARTBEAT_INTERVAL);
  }
}

export function removeClient(ws: WebSocket): void {
  const info = clients.get(ws);
  if (info?.batchTimer) {
    clearTimeout(info.batchTimer);
  }
  clients.delete(ws);
  if (clients.size === 0 && heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function handleMessage(ws: WebSocket, msg: ClientMessage): void {
  const info = clients.get(ws);
  if (!info) return;

  switch (msg.type) {
    case 'subscribe':
      for (const id of msg.sensorIds) {
        info.subscribedSensorIds.add(id);
      }
      break;
    case 'unsubscribe':
      for (const id of msg.sensorIds) {
        info.subscribedSensorIds.delete(id);
      }
      break;
    case 'ping':
      info.lastPing = Date.now();
      enqueueMessage(info, { type: 'pong' });
      break;
    case 'set_priority':
      if (msg.priority === 'high' || msg.priority === 'medium' || msg.priority === 'low') {
        info.priority = ClientPriority[msg.priority];
      }
      break;
  }
}

export function broadcastToSubscribers(sensorId: string, message: ServerMessage): void {
  for (const [, info] of clients) {
    if (info.subscribedSensorIds.has(sensorId)) {
      enqueueMessage(info, message);
    }
  }
}

export function broadcastAll(message: ServerMessage): void {
  for (const [, info] of clients) {
    enqueueMessage(info, message);
  }
}

function checkHeartbeats(): void {
  const now = Date.now();
  for (const [ws, info] of clients) {
    if (now - info.lastPing > HEARTBEAT_TIMEOUT) {
      ws.terminate();
      clients.delete(ws);
    } else {
      ws.ping();
    }
  }
}

export function getSubscribedClientCount(sensorId: string): number {
  let count = 0;
  for (const [, info] of clients) {
    if (info.subscribedSensorIds.has(sensorId)) count++;
  }
  return count;
}

export function getClientCount(): number {
  return clients.size;
}

export function getPoolStats(): {
  totalClients: number;
  priorityBreakdown: { high: number; medium: number; low: number };
  totalSubscriptions: number;
  queuedMessages: number;
} {
  let high = 0;
  let medium = 0;
  let low = 0;
  let totalSubscriptions = 0;
  let queuedMessages = 0;

  for (const [, info] of clients) {
    switch (info.priority) {
      case ClientPriority.high: high++; break;
      case ClientPriority.medium: medium++; break;
      case ClientPriority.low: low++; break;
    }
    totalSubscriptions += info.subscribedSensorIds.size;
    queuedMessages += info.sendQueue.length;
  }

  return {
    totalClients: clients.size,
    priorityBreakdown: { high, medium, low },
    totalSubscriptions,
    queuedMessages,
  };
}
