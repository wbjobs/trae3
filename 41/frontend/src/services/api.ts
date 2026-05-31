import type { Node, Metric, Alert, StatsSummary, LogEntry, MetricPoint, StatusHistory, HistorySummary } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

export const api = {
  getStats: (): Promise<StatsSummary> =>
    fetchJSON('/stats/summary'),

  getNodes: (status?: string): Promise<Node[]> =>
    fetchJSON(`/nodes${status ? `?status=${status}` : ''}`),

  getNode: (nodeId: string): Promise<Node> =>
    fetchJSON(`/nodes/${nodeId}`),

  getNodeMetrics: (nodeId: string, start?: string, end?: string, limit = 100): Promise<Metric[]> => {
    const params = new URLSearchParams();
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    params.set('limit', String(limit));
    return fetchJSON(`/nodes/${nodeId}/metrics?${params}`);
  },

  getNodeAlerts: (nodeId: string, resolved?: boolean, limit = 50): Promise<Alert[]> => {
    const params = new URLSearchParams();
    if (resolved !== undefined) params.set('resolved', String(resolved));
    params.set('limit', String(limit));
    return fetchJSON(`/nodes/${nodeId}/alerts?${params}`);
  },

  getNodeHistory: (nodeId: string, limit = 100): Promise<StatusHistory[]> =>
    fetchJSON(`/nodes/${nodeId}/history?limit=${limit}`),

  getAlerts: (resolved?: boolean, minSeverity = 1, limit = 100): Promise<Alert[]> => {
    const params = new URLSearchParams();
    if (resolved !== undefined) params.set('resolved', String(resolved));
    params.set('min_severity', String(minSeverity));
    params.set('limit', String(limit));
    return fetchJSON(`/alerts?${params}`);
  },

  resolveAlert: (alertId: number): Promise<{ success: boolean; message: string }> =>
    fetchJSON(`/alerts/${alertId}/resolve`, { method: 'POST' }),

  escalateAlert: (alertId: number): Promise<{ success: boolean; alert: Alert }> =>
    fetchJSON(`/alerts/${alertId}/escalate`, { method: 'POST' }),

  getRealtimeMetrics: (nodeId?: string): Promise<Record<string, MetricPoint[]>> =>
    fetchJSON(`/metrics/realtime${nodeId ? `?node_id=${nodeId}` : ''}`),

  getMetricsRange: (start: string, end?: string, nodeId?: string): Promise<Metric[]> => {
    const params = new URLSearchParams({ start });
    if (end) params.set('end', end);
    if (nodeId) params.set('node_id', nodeId);
    return fetchJSON(`/metrics/range?${params}`);
  },

  getStatusHistory: (limit = 100): Promise<StatusHistory[]> =>
    fetchJSON(`/status/history?limit=${limit}`),

  getStatusRange: (start: string, end?: string): Promise<StatusHistory[]> => {
    const params = new URLSearchParams({ start });
    if (end) params.set('end', end);
    return fetchJSON(`/status/range?${params}`);
  },

  getHistorySummary: (hours = 24): Promise<HistorySummary> =>
    fetchJSON(`/history/summary?hours=${hours}`),

  getLogs: (): Promise<LogEntry[]> =>
    fetchJSON('/logs'),
};

export function createEventSource(onMessage?: (data: unknown) => void, onError?: () => void) {
  const es = new EventSource(`${API_BASE}/stream`);

  es.addEventListener('metric', (e) => {
    try {
      const data = JSON.parse(e.data);
      onMessage?.(data);
    } catch { /* ignore */ }
  });

  es.addEventListener('alert', (e) => {
    try {
      const data = JSON.parse(e.data);
      onMessage?.(data);
    } catch { /* ignore */ }
  });

  es.addEventListener('node_status', (e) => {
    try {
      const data = JSON.parse(e.data);
      onMessage?.(data);
    } catch { /* ignore */ }
  });

  es.addEventListener('log', (e) => {
    try {
      const data = JSON.parse(e.data);
      onMessage?.(data);
    } catch { /* ignore */ }
  });

  es.onerror = () => {
    onError?.();
  };

  return es;
}
