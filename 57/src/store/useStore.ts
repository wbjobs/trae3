import { create } from 'zustand'
import type {
  Station,
  Alert,
  DashboardOverview,
  DataQueryResponse,
  IndicatorResult,
  AggregationType,
  IndicatorType,
} from '../../shared/types'

interface RealtimeDataPoint {
  stationId: string
  timestamp: string
  values: Record<string, number | null>
}

interface AppState {
  stations: Station[]
  currentStation: string | null
  alerts: Alert[]
  dashboardData: DashboardOverview | null
  queryResult: DataQueryResponse | null
  indicatorResult: IndicatorResult | null
  loading: boolean
  realtimeData: RealtimeDataPoint[]
  sseConnected: boolean

  fetchStations: () => Promise<void>
  fetchDashboard: () => Promise<void>
  fetchAlerts: (params?: { stationId?: string; level?: string }) => Promise<void>
  queryData: (params: {
    stationIds: string[]
    startTime: string
    endTime: string
    metrics: string[]
    aggregation: AggregationType
    page?: number
    pageSize?: number
  }) => Promise<void>
  calculateIndicator: (params: {
    stationId: string
    indicatorType: IndicatorType
    startTime: string
    endTime: string
  }) => Promise<void>
  confirmAlert: (alertId: string, action: 'confirmed' | 'ignored', comment?: string) => Promise<void>
  setCurrentStation: (id: string | null) => void
  addStation: (station: Partial<Station>) => Promise<void>
  connectSSE: () => void
  disconnectSSE: () => void
}

let sseInstance: EventSource | null = null
let sseReconnectTimer: ReturnType<typeof setTimeout> | null = null

export const useStore = create<AppState>((set, get) => ({
  stations: [],
  currentStation: null,
  alerts: [],
  dashboardData: null,
  queryResult: null,
  indicatorResult: null,
  loading: false,
  realtimeData: [],
  sseConnected: false,

  fetchStations: async () => {
    set({ loading: true })
    try {
      const res = await fetch('/api/stations')
      const data = await res.json()
      set({ stations: data.stations || [], loading: false })
    } catch {
      set({ loading: false })
    }
  },

  fetchDashboard: async () => {
    set({ loading: true })
    try {
      const res = await fetch('/api/dashboard/overview')
      const data = await res.json()
      set({ dashboardData: data.success ? data : null, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  fetchAlerts: async (params) => {
    set({ loading: true })
    try {
      const qs = new URLSearchParams()
      if (params?.stationId) qs.set('stationId', params.stationId)
      if (params?.level) qs.set('level', params.level)
      const res = await fetch(`/api/anomaly/detect?${qs.toString()}`)
      const data = await res.json()
      set({ alerts: data.alerts || [], loading: false })
    } catch {
      set({ loading: false })
    }
  },

  queryData: async (params) => {
    set({ loading: true })
    try {
      const qs = new URLSearchParams({
        stationIds: params.stationIds.join(','),
        startTime: params.startTime,
        endTime: params.endTime,
        metrics: params.metrics.join(','),
        aggregation: params.aggregation || 'raw',
      })
      const res = await fetch(`/api/data/query?${qs.toString()}`)
      const data = await res.json()
      set({ queryResult: data.success ? { data: data.data, total: data.total } : null, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  calculateIndicator: async (params) => {
    set({ loading: true })
    try {
      const qs = new URLSearchParams({
        stationId: params.stationId,
        indicatorType: params.indicatorType,
        startTime: params.startTime,
        endTime: params.endTime,
      })
      const res = await fetch(`/api/indicators/calculate?${qs.toString()}`)
      const data = await res.json()
      set({ indicatorResult: data.success ? data : null, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  confirmAlert: async (alertId, action, comment) => {
    try {
      await fetch('/api/anomaly/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId, action, comment }),
      })
      set((state) => ({
        alerts: state.alerts.map((a) =>
          a.id === alertId ? { ...a, status: action === 'confirmed' ? 'confirmed' as const : 'ignored' as const } : a
        ),
      }))
    } catch {
      // ignore
    }
  },

  setCurrentStation: (id) => set({ currentStation: id }),

  addStation: async (station) => {
    try {
      await fetch('/api/stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(station),
      })
    } catch {
      // ignore
    }
  },

  connectSSE: () => {
    if (sseInstance) return

    const es = new EventSource('/api/stream')
    sseInstance = es

    es.addEventListener('open', () => {
      set({ sseConnected: true })
    })

    es.addEventListener('message', (e) => {
      try {
        const point: RealtimeDataPoint = JSON.parse(e.data)
        set((state) => {
          const updated = [...state.realtimeData, point]
          return { realtimeData: updated.length > 500 ? updated.slice(-500) : updated }
        })
      } catch {
        // ignore malformed data
      }
    })

    es.addEventListener('error', () => {
      set({ sseConnected: false })
      es.close()
      sseInstance = null

      if (sseReconnectTimer) clearTimeout(sseReconnectTimer)
      sseReconnectTimer = setTimeout(() => {
        get().connectSSE()
      }, 3000)
    })
  },

  disconnectSSE: () => {
    if (sseReconnectTimer) {
      clearTimeout(sseReconnectTimer)
      sseReconnectTimer = null
    }
    if (sseInstance) {
      sseInstance.close()
      sseInstance = null
    }
    set({ sseConnected: false })
  },
}))
