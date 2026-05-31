import { create } from 'zustand'
import type { ConfigTemplate, ConfigHistory, ConfigParams } from '../../shared/types'

interface ConfigStore {
  templates: ConfigTemplate[]
  history: ConfigHistory[]
  progress: Record<string, 'success' | 'failed' | 'pending'>
  fetchTemplates: () => Promise<void>
  fetchHistory: () => Promise<void>
  applyConfig: (deviceIds: string[], params: ConfigParams) => Promise<string | null>
  saveTemplate: (template: Omit<ConfigTemplate, 'id' | 'createdAt'>) => Promise<void>
  updateProgress: (deviceId: string, status: 'success' | 'failed' | 'pending') => void
  clearProgress: () => void
}

export const useConfigStore = create<ConfigStore>((set) => ({
  templates: [],
  history: [],
  progress: {},

  fetchTemplates: async () => {
    try {
      const res = await fetch('/api/config/templates')
      const data = await res.json()
      set({ templates: data.templates ?? data })
    } catch {}
  },

  fetchHistory: async () => {
    try {
      const res = await fetch('/api/config/history')
      const data = await res.json()
      set({ history: data.history ?? data })
    } catch {}
  },

  applyConfig: async (deviceIds, params) => {
    try {
      const res = await fetch('/api/config/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceIds, params }),
      })
      const data = await res.json()
      const results = data.results ?? {}
      set({ progress: results })
      return data.taskId ?? null
    } catch {
      return null
    }
  },

  saveTemplate: async (template) => {
    try {
      const res = await fetch('/api/config/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template),
      })
      const data = await res.json()
      set((state) => ({ templates: [...state.templates, data.template ?? data] }))
    } catch {}
  },

  updateProgress: (deviceId, status) =>
    set((state) => ({ progress: { ...state.progress, [deviceId]: status } })),

  clearProgress: () => set({ progress: {} }),
}))
