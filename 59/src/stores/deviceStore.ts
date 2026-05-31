import { create } from 'zustand'
import type { Device, DeviceParam, TrendPoint, DashboardStats, LayerVisibility, CutPlane, MarkerPoint } from '../../shared/types'

const initialMarkers: MarkerPoint[] = [
  {
    id: 'm1',
    type: 'inspection',
    position: { x: -10, y: 1, z: 0 },
    title: '日常巡检点',
    description: '每周检查一次阀门状态',
    floor: -1,
    createdAt: Date.now(),
    createdBy: 'system',
  },
  {
    id: 'm2',
    type: 'maintenance',
    position: { x: 5, y: 5, z: 5 },
    title: '待维护设备',
    description: '计划下周一更换滤芯',
    floor: 1,
    createdAt: Date.now(),
    createdBy: 'system',
  },
  {
    id: 'm3',
    type: 'danger',
    position: { x: 15, y: 9, z: -10 },
    title: '高压区域',
    description: '非专业人员禁止靠近',
    floor: 2,
    createdAt: Date.now(),
    createdBy: 'system',
  },
]

interface DeviceState {
  devices: Device[]
  selectedDevice: Device | null
  stats: DashboardStats | null
  layers: LayerVisibility
  searchQuery: string
  currentFloor: number
  loading: boolean
  cutPlane: CutPlane
  markers: MarkerPoint[]
  selectedMarker: MarkerPoint | null
  showMarkers: boolean

  fetchDevices: (type?: string, floor?: number) => Promise<void>
  fetchDevice: (id: string) => Promise<void>
  fetchTrend: (deviceId: string, key: string, hours?: number) => Promise<TrendPoint[]>
  fetchStats: () => Promise<void>
  setSelectedDevice: (device: Device | null) => void
  toggleLayer: (key: keyof LayerVisibility) => void
  setSearchQuery: (query: string) => void
  setCurrentFloor: (floor: number) => void
  updateDeviceFromWS: (deviceId: string, updates: Partial<Device>) => void
  addAlertFromWS: (alert: any) => void
  setCutPlane: (plane: Partial<CutPlane>) => void
  toggleCutPlane: () => void
  addMarker: (marker: Omit<MarkerPoint, 'id' | 'createdAt'>) => void
  removeMarker: (id: string) => void
  setSelectedMarker: (marker: MarkerPoint | null) => void
  toggleShowMarkers: () => void
}

export const useDeviceStore = create<DeviceState>((set, get) => ({
  devices: [],
  selectedDevice: null,
  stats: null,
  layers: { hvac: true, plumbing: true, electrical: true, fire: true },
  searchQuery: '',
  currentFloor: -1,
  loading: false,
  cutPlane: { enabled: false, axis: 'y', position: 6, inverse: false },
  markers: initialMarkers,
  selectedMarker: null,
  showMarkers: true,

  fetchDevices: async (type, floor) => {
    set({ loading: true })
    try {
      const params = new URLSearchParams()
      if (type) params.set('type', type)
      if (floor !== undefined && floor !== -1) params.set('floor', String(floor))
      const res = await fetch(`/api/devices?${params.toString()}`)
      const result = await res.json()
      set({ devices: result.success ? result.data : result, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  fetchDevice: async (id) => {
    set({ loading: true })
    try {
      const res = await fetch(`/api/devices/${id}`)
      const result = await res.json()
      set({ selectedDevice: result.success ? result.data : result, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  fetchTrend: async (deviceId, key, hours) => {
    const params = new URLSearchParams()
    params.set('key', key)
    if (hours) params.set('hours', String(hours))
    const res = await fetch(`/api/devices/${deviceId}/trend?${params.toString()}`)
    const result = await res.json()
    return result.success ? result.data : result
  },

  fetchStats: async () => {
    try {
      const res = await fetch('/api/stats/overview')
      const result = await res.json()
      set({ stats: result.success ? result.data : result })
    } catch {}
  },

  setSelectedDevice: (device) => set({ selectedDevice: device }),

  toggleLayer: (key) =>
    set((state) => ({
      layers: { ...state.layers, [key]: !state.layers[key] },
    })),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setCurrentFloor: (floor) => set({ currentFloor: floor }),

  updateDeviceFromWS: (deviceId, updates) =>
    set((state) => {
      const existingDevice = state.devices.find((d) => d.id === deviceId)
      if (!existingDevice) return state

      let updatedParams = existingDevice.params
      if (updates.params && updates.params.length > 0) {
        const paramMap = new Map(existingDevice.params.map((p) => [p.key, p]))
        for (const p of updates.params) {
          const existing = paramMap.get(p.key)
          if (existing) {
            paramMap.set(p.key, { ...existing, ...p, timestamp: p.timestamp || Date.now() })
          } else {
            paramMap.set(p.key, { ...p, timestamp: Date.now() })
          }
        }
        updatedParams = Array.from(paramMap.values())
      }

      const updatedDevice = {
        ...existingDevice,
        ...updates,
        params: updatedParams,
      }

      return {
        devices: state.devices.map((d) => (d.id === deviceId ? updatedDevice : d)),
        selectedDevice: state.selectedDevice?.id === deviceId ? updatedDevice : state.selectedDevice,
      }
    }),

  addAlertFromWS: (alert) =>
    set((state) => {
      if (!state.stats) return state
      const level = alert.level as keyof DashboardStats['alertsByLevel']
      return {
        stats: {
          ...state.stats,
          alarm: state.stats.alarm + 1,
          alertsByLevel: {
            ...state.stats.alertsByLevel,
            [level]: (state.stats.alertsByLevel[level] ?? 0) + 1,
          },
        },
      }
    }),

  setCutPlane: (plane) =>
    set((state) => ({
      cutPlane: { ...state.cutPlane, ...plane },
    })),

  toggleCutPlane: () =>
    set((state) => ({
      cutPlane: { ...state.cutPlane, enabled: !state.cutPlane.enabled },
    })),

  addMarker: (marker) =>
    set((state) => ({
      markers: [
        ...state.markers,
        {
          ...marker,
          id: 'm' + Date.now(),
          createdAt: Date.now(),
        },
      ],
    })),

  removeMarker: (id) =>
    set((state) => ({
      markers: state.markers.filter((m) => m.id !== id),
      selectedMarker: state.selectedMarker?.id === id ? null : state.selectedMarker,
    })),

  setSelectedMarker: (marker) => set({ selectedMarker: marker }),

  toggleShowMarkers: () =>
    set((state) => ({
      showMarkers: !state.showMarkers,
    })),
}))
