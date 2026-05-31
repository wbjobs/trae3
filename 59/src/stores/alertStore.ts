import { create } from 'zustand'
import type { Alert } from '../../shared/types'

interface AlertFilters {
  level?: string
  status?: string
}

interface AlertPagination {
  total: number
  page: number
  limit: number
}

interface AlertState {
  alerts: Alert[]
  selectedAlert: Alert | null
  pagination: AlertPagination
  filters: AlertFilters
  loading: boolean

  fetchAlerts: (filters?: AlertFilters) => Promise<void>
  fetchAlert: (id: string) => Promise<void>
  confirmAlert: (id: string, confirmedBy: string) => Promise<void>
  resolveAlert: (id: string, remark: string) => Promise<void>
  setFilters: (filters: AlertFilters) => void
  setPage: (page: number) => void
}

export const useAlertStore = create<AlertState>((set, get) => ({
  alerts: [],
  selectedAlert: null,
  pagination: { total: 0, page: 1, limit: 20 },
  filters: {},
  loading: false,

  fetchAlerts: async (filters) => {
    set({ loading: true })
    try {
      const merged = { ...get().filters, ...filters }
      const params = new URLSearchParams()
      if (merged.level) params.set('level', merged.level)
      if (merged.status) params.set('status', merged.status)
      params.set('page', String(get().pagination.page))
      params.set('limit', String(get().pagination.limit))
      const res = await fetch(`/api/alerts?${params.toString()}`)
      const result = await res.json()
      const data = result.success ? result.data : result
      set({
        alerts: data.items ?? data.data ?? data,
        pagination: { total: data.total ?? 0, page: data.page ?? get().pagination.page, limit: data.limit ?? get().pagination.limit },
        filters: merged,
        loading: false,
      })
    } catch {
      set({ loading: false })
    }
  },

  fetchAlert: async (id) => {
    set({ loading: true })
    try {
      const res = await fetch(`/api/alerts/${id}`)
      const result = await res.json()
      set({ selectedAlert: result.success ? result.data : result, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  confirmAlert: async (id, confirmedBy) => {
    try {
      const res = await fetch(`/api/alerts/${id}/confirm`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmedBy }),
      })
      const data = await res.json()
      set((state) => ({
        alerts: state.alerts.map((a) => (a.id === id ? data : a)),
        selectedAlert: state.selectedAlert?.id === id ? data : state.selectedAlert,
      }))
    } catch {}
  },

  resolveAlert: async (id, remark) => {
    try {
      const res = await fetch(`/api/alerts/${id}/resolve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remark }),
      })
      const data = await res.json()
      set((state) => ({
        alerts: state.alerts.map((a) => (a.id === id ? data : a)),
        selectedAlert: state.selectedAlert?.id === id ? data : state.selectedAlert,
      }))
    } catch {}
  },

  setFilters: (filters) => {
    set({ filters, pagination: { ...get().pagination, page: 1 } })
  },

  setPage: (page) => {
    set({ pagination: { ...get().pagination, page } })
  },
}))
