import { create } from 'zustand'
import type { HistoryQuery, HistoryResponse } from '../../shared/types'

interface HistoryState {
  chartData: HistoryResponse | null
  loading: boolean
  query: HistoryQuery
  fetchHistory: () => Promise<void>
  setQuery: (query: Partial<HistoryQuery>) => void
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  chartData: null,
  loading: false,
  query: {
    start: '',
    end: '',
    metrics: ['power'],
    arrayIds: [],
    interval: '5m',
  },

  fetchHistory: async () => {
    try {
      set({ loading: true })
      const { query } = get()
      if (!query.start || !query.end) {
        set({ loading: false })
        return
      }
      const params = new URLSearchParams()
      params.set('start', query.start)
      params.set('end', query.end)
      params.set('metrics', query.metrics.join(','))
      if (query.arrayIds && query.arrayIds.length > 0) {
        params.set('arrayIds', query.arrayIds.join(','))
      }
      if (query.interval) {
        params.set('interval', query.interval)
      }
      const res = await fetch(`/api/history?${params.toString()}`)
      const json = await res.json()
      set({ chartData: json.data ?? json, loading: false })
    } catch {
      console.error('Failed to fetch history data')
      set({ loading: false })
    }
  },

  setQuery: (partial) =>
    set((state) => ({
      query: { ...state.query, ...partial },
    })),
}))
