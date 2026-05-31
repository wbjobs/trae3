import { create } from 'zustand'
import type { Alert, AlertRule } from '../../shared/types'

interface AlertFilters {
  level?: string
  acknowledged?: boolean
  deviceId?: string
}

interface AlertStore {
  alerts: Alert[]
  rules: AlertRule[]
  filters: AlertFilters
  fetchAlerts: () => Promise<void>
  fetchRules: () => Promise<void>
  acknowledgeAlert: (id: string) => Promise<void>
  createRule: (rule: Omit<AlertRule, 'id'>) => Promise<void>
  deleteRule: (id: string) => Promise<void>
  setFilters: (filters: AlertFilters) => void
  addAlert: (alert: Alert) => void
}

export const useAlertStore = create<AlertStore>((set, get) => ({
  alerts: [],
  rules: [],
  filters: {},

  fetchAlerts: async () => {
    try {
      const params = new URLSearchParams()
      const { filters } = get()
      if (filters.level) params.set('level', filters.level)
      if (filters.acknowledged !== undefined) params.set('acknowledged', String(filters.acknowledged))
      if (filters.deviceId) params.set('deviceId', filters.deviceId)
      const res = await fetch(`/api/alerts?${params}`)
      const data = await res.json()
      set({ alerts: data.alerts ?? data })
    } catch {}
  },

  fetchRules: async () => {
    try {
      const res = await fetch('/api/alerts/rules')
      const data = await res.json()
      set({ rules: data.rules ?? data })
    } catch {}
  },

  acknowledgeAlert: async (id) => {
    try {
      await fetch(`/api/alerts/${id}/acknowledge`, { method: 'POST' })
      set((state) => ({
        alerts: state.alerts.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)),
      }))
    } catch {}
  },

  createRule: async (rule) => {
    try {
      const res = await fetch('/api/alerts/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      })
      const data = await res.json()
      set((state) => ({ rules: [...state.rules, data.rule ?? data] }))
    } catch {}
  },

  deleteRule: async (id) => {
    try {
      await fetch(`/api/alerts/rules/${id}`, { method: 'DELETE' })
      set((state) => ({ rules: state.rules.filter((r) => r.id !== id) }))
    } catch {}
  },

  setFilters: (filters) => set({ filters }),

  addAlert: (alert) => set((state) => ({ alerts: [alert, ...state.alerts] })),
}))
