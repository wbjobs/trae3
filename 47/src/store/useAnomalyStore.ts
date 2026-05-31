import { create } from 'zustand'
import type { AnomalyEvent, HeatmapResponse, AnomalyListResponse } from '../../shared/types'

interface AnomalyFilter {
  level?: string
  type?: string
}

interface AnomalyState {
  events: AnomalyEvent[]
  heatmapData: HeatmapResponse | null
  selectedEvent: AnomalyEvent | null
  filter: AnomalyFilter
  fetchEvents: () => Promise<void>
  fetchHeatmap: () => Promise<void>
  selectEvent: (event: AnomalyEvent | null) => void
  setFilter: (filter: Partial<AnomalyFilter>) => void
}

export const useAnomalyStore = create<AnomalyState>((set, get) => ({
  events: [],
  heatmapData: null,
  selectedEvent: null,
  filter: {},

  fetchEvents: async () => {
    try {
      const { filter } = get()
      const params = new URLSearchParams()
      const now = new Date()
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      params.set('start', filter.level ? new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString() : dayStart)
      params.set('end', now.toISOString())
      if (filter.level) params.set('level', filter.level)
      if (filter.type) params.set('type', filter.type)
      const res = await fetch(`/api/anomaly/events?${params.toString()}`)
      const json = await res.json()
      const data: AnomalyListResponse = json.data ?? json
      set({ events: data.events ?? [] })
    } catch {
      console.error('Failed to fetch anomaly events')
    }
  },

  fetchHeatmap: async () => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const res = await fetch(`/api/anomaly/heatmap?date=${today}`)
      const json = await res.json()
      const data: HeatmapResponse = json.data ?? json
      set({ heatmapData: data })
    } catch {
      console.error('Failed to fetch anomaly heatmap')
    }
  },

  selectEvent: (event) => set({ selectedEvent: event }),

  setFilter: (partial) =>
    set((state) => ({
      filter: { ...state.filter, ...partial },
    })),
}))
