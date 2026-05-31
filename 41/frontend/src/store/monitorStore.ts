import { create } from 'zustand';
import type { Node, Alert, StatsSummary, LogEntry, MetricPoint, StatusHistory, HistorySummary } from '../types';
import { api, createEventSource } from '../services/api';

interface MonitorState {
  nodes: Node[];
  alerts: Alert[];
  logs: LogEntry[];
  stats: StatsSummary;
  realtimeMetrics: Record<string, MetricPoint[]>;
  statusHistory: StatusHistory[];
  historySummary: HistorySummary | null;
  loading: boolean;
  error: string | null;
  selectedNodeId: string | null;
  isHistoryMode: boolean;
  history: Record<string, MetricPoint[]>;
  historyCursor: number;

  fetchStats: () => Promise<void>;
  fetchNodes: () => Promise<void>;
  fetchAlerts: () => Promise<void>;
  fetchLogs: () => Promise<void>;
  fetchRealtimeMetrics: () => Promise<void>;
  fetchStatusHistory: () => Promise<void>;
  fetchHistorySummary: (hours?: number) => Promise<void>;
  fetchNodeHistoryMetrics: (nodeId: string, start: string, end?: string) => Promise<void>;
  resolveAlert: (alertId: number) => Promise<void>;
  escalateAlert: (alertId: number) => Promise<void>;
  startEventStream: () => () => void;
  setSelectedNode: (nodeId: string | null) => void;
  setHistoryMode: (enabled: boolean) => void;
  setHistoryCursor: (cursor: number) => void;
}

export const useMonitorStore = create<MonitorState>((set, get) => ({
  nodes: [],
  alerts: [],
  logs: [],
  stats: {
    total: 0, online: 0, offline: 0, abnormal: 0,
    p1_count: 0, p2_count: 0, p3_count: 0,
    total_alerts: 0, active_alerts: 0, high_severity_alerts: 0,
  },
  realtimeMetrics: {},
  statusHistory: [],
  historySummary: null,
  loading: false,
  error: null,
  selectedNodeId: null,
  isHistoryMode: false,
  history: {},
  historyCursor: 0,

  fetchStats: async () => {
    try {
      const stats = await api.getStats();
      set({ stats });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  fetchNodes: async () => {
    try {
      set({ loading: true });
      const nodes = await api.getNodes();
      set({ nodes, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  fetchAlerts: async () => {
    try {
      const alerts = await api.getAlerts(false, 1, 50);
      set({ alerts });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  fetchLogs: async () => {
    try {
      const logs = await api.getLogs();
      set({ logs });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  fetchRealtimeMetrics: async () => {
    try {
      const metrics = await api.getRealtimeMetrics();
      set({ realtimeMetrics: metrics });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  fetchStatusHistory: async () => {
    try {
      const history = await api.getStatusHistory(100);
      set({ statusHistory: history });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  fetchHistorySummary: async (hours = 24) => {
    try {
      const summary = await api.getHistorySummary(hours);
      set({ historySummary: summary });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  fetchNodeHistoryMetrics: async (nodeId: string, start: string, end?: string) => {
    try {
      const metrics = await api.getMetricsRange(start, end, nodeId);
      const formatted: Record<string, MetricPoint[]> = {};
      formatted[nodeId] = metrics.map(m => ({
        timestamp: m.created_at || new Date().toISOString(),
        cpu_usage: m.cpu_usage,
        memory_usage: m.memory_usage,
        disk_usage: m.disk_usage,
      }));
      set({ history: formatted, historyCursor: 0 });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  resolveAlert: async (alertId: number) => {
    try {
      await api.resolveAlert(alertId);
      set((state) => ({
        alerts: state.alerts.map((a) =>
          a.id === alertId ? { ...a, resolved: true } : a
        ),
      }));
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  escalateAlert: async (alertId: number) => {
    try {
      const result = await api.escalateAlert(alertId);
      set((state) => ({
        alerts: state.alerts.map((a) =>
          a.id === alertId ? result.alert : a
        ),
      }));
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  startEventStream: () => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    function connect() {
      if (stopped) return;

      es = createEventSource(
        (data: any) => {
          if ('escalation_count' in data && 'severity' in data && 'alert_type' in data) {
            set((state) => ({
              alerts: state.alerts.some(a => a.id === data.id)
                ? state.alerts.map(a => a.id === data.id ? data : a)
                : [data, ...state.alerts].slice(0, 50)
            }));
          } else if ('alert_level' in data && data.node_id && !('level' in data)) {
            set((state) => ({
              alerts: state.alerts.some(a => a.id === data.id)
                ? state.alerts.map(a => a.id === data.id ? data : a)
                : [data, ...state.alerts].slice(0, 50)
            }));
          } else if ('cpu_usage' in data && 'node_id' in data && 'created_at' in data) {
            const metric = data as { node_id: string; created_at: string; cpu_usage: number; memory_usage: number; disk_usage: number };
            if (!get().isHistoryMode) {
              set((state) => {
                const nodeMetrics = state.realtimeMetrics[metric.node_id] || [];
                const newPoint: MetricPoint = {
                  timestamp: metric.created_at,
                  cpu_usage: metric.cpu_usage,
                  memory_usage: metric.memory_usage,
                  disk_usage: metric.disk_usage,
                };
                const updated = [...nodeMetrics, newPoint].slice(-60);
                return {
                  realtimeMetrics: {
                    ...state.realtimeMetrics,
                    [metric.node_id]: updated,
                  },
                };
              });
            }
          } else if ('status' in data && 'node_id' in data) {
            set((state) => {
              const existingNode = state.nodes.find((n) => n.node_id === data.node_id);
              if (existingNode) {
                return {
                  nodes: state.nodes.map((n) =>
                    n.node_id === data.node_id ? { ...n, ...data } : n
                  ),
                };
              }
              return {
                nodes: [...state.nodes, data as Node],
              };
            });
          } else if ('level' in data && 'message' in data) {
            set((state) => ({
              logs: [data as LogEntry, ...state.logs].slice(0, 200),
            }));
          }
        },
        () => {
          if (!stopped) {
            scheduleReconnect();
          }
        }
      );
    }

    function scheduleReconnect() {
      if (stopped) return;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        connect();
      }, 3000);
    }

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (es) es.close();
    };
  },

  setSelectedNode: (nodeId: string | null) => {
    set({ selectedNodeId: nodeId });
  },

  setHistoryMode: (enabled: boolean) => {
    set({ isHistoryMode: enabled });
    if (!enabled) {
      set({ history: {}, historyCursor: 0 });
    }
  },

  setHistoryCursor: (cursor: number) => {
    set({ historyCursor: cursor });
  },
}));
