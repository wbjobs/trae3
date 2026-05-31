import { create } from 'zustand'
import type {
  MetricType,
  AnomalyRecord,
  ServiceInfo,
  HealthSummary,
  SSEMessage,
  WindowAggregate,
  StreamStats,
  CorrelationResult,
  TraceResult,
} from '../../shared/types'

interface Filters {
  metricTypes: MetricType[]
  serviceNames: string[]
  nodeIds: string[]
  timeRange: string
  customStartTime: string
  customEndTime: string
}

interface MonitorState {
  filters: Filters
  anomalies: AnomalyRecord[]
  services: ServiceInfo[]
  healthSummary: HealthSummary[]
  wsConnected: boolean
  sseConnected: boolean
  sseMessages: SSEMessage[]
  windowAggregates: WindowAggregate[]
  streamStats: StreamStats | null
  correlationResult: CorrelationResult | null
  traceResult: TraceResult | null
  setFilters: (filters: Partial<Filters>) => void
  updateAnomalies: (anomalies: AnomalyRecord[]) => void
  updateServices: (services: ServiceInfo[]) => void
  updateHealth: (health: HealthSummary[]) => void
  setWsConnected: (connected: boolean) => void
  addAnomaly: (anomaly: AnomalyRecord) => void
  resolveAnomaly: (id: string) => void
  setSSEConnected: (connected: boolean) => void
  addSSEMessage: (message: SSEMessage) => void
  updateWindowAggregates: (aggregates: WindowAggregate[]) => void
  updateStreamStats: (stats: StreamStats) => void
  setCorrelationResult: (result: CorrelationResult | null) => void
  setTraceResult: (result: TraceResult | null) => void
}

const defaultFilters: Filters = {
  metricTypes: ['cpu', 'memory', 'disk', 'network'],
  serviceNames: [],
  nodeIds: [],
  timeRange: '1h',
  customStartTime: '',
  customEndTime: '',
}

const defaultStreamStats: StreamStats = {
  totalPointsProcessed: 0,
  pointsPerSecond: 0,
  windowsActive: 0,
  backlogSize: 0,
  anomaliesDetected: 0,
  processingLatencyMs: 0,
}

export const useMonitorStore = create<MonitorState>((set) => ({
  filters: defaultFilters,
  anomalies: [],
  services: [],
  healthSummary: [],
  wsConnected: false,
  sseConnected: false,
  sseMessages: [],
  windowAggregates: [],
  streamStats: defaultStreamStats,
  correlationResult: null,
  traceResult: null,
  setFilters: (partial) =>
    set((state) => ({
      filters: { ...state.filters, ...partial },
    })),
  updateAnomalies: (anomalies) => set({ anomalies }),
  updateServices: (services) => set({ services }),
  updateHealth: (health) => set({ healthSummary: health }),
  setWsConnected: (connected) => set({ wsConnected: connected }),
  addAnomaly: (anomaly) =>
    set((state) => ({
      anomalies: [anomaly, ...state.anomalies],
    })),
  resolveAnomaly: (id) =>
    set((state) => ({
      anomalies: state.anomalies.map((a) =>
        a.id === id ? { ...a, recoveredAt: new Date().toISOString() } : a
      ),
    })),
  setSSEConnected: (connected) => set({ sseConnected: connected }),
  addSSEMessage: (message) =>
    set((state) => ({
      sseMessages: [...state.sseMessages.slice(-99), message],
    })),
  updateWindowAggregates: (aggregates) => set({ windowAggregates: aggregates }),
  updateStreamStats: (stats) => set({ streamStats: stats }),
  setCorrelationResult: (result) => set({ correlationResult: result }),
  setTraceResult: (result) => set({ traceResult: result }),
}))
