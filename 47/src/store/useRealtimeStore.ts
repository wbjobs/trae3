import { create } from 'zustand'
import type { PvDataPoint, KpiData, DeviceStatus, SlidingWindowMetrics, ForecastData } from '../../shared/types'

interface RealtimeState {
  pvDataMap: Record<string, PvDataPoint[]>
  kpi: KpiData | null
  devices: DeviceStatus[]
  isConnected: boolean
  windowMetricsMap: Record<string, SlidingWindowMetrics>
  forecastMap: Record<string, ForecastData>
  updatePvData: (point: PvDataPoint) => void
  batchUpdatePvData: (points: PvDataPoint[]) => void
  updateKpi: (data: KpiData) => void
  updateDevice: (device: DeviceStatus) => void
  batchUpdateDevices: (devices: DeviceStatus[]) => void
  setConnected: (connected: boolean) => void
  updateWindowMetrics: (arrayId: string, metrics: SlidingWindowMetrics) => void
  updateForecast: (arrayId: string, forecast: ForecastData) => void
}

const MAX_POINTS = 60

export const useRealtimeStore = create<RealtimeState>((set) => ({
  pvDataMap: {},
  kpi: null,
  devices: [],
  isConnected: false,
  windowMetricsMap: {},
  forecastMap: {},

  updatePvData: (point) =>
    set((state) => {
      const existing = state.pvDataMap[point.arrayId] || []
      const updated = [...existing, point].slice(-MAX_POINTS)
      return {
        pvDataMap: {
          ...state.pvDataMap,
          [point.arrayId]: updated,
        },
      }
    }),

  batchUpdatePvData: (points) =>
    set((state) => {
      const newMap = { ...state.pvDataMap }
      for (const point of points) {
        const existing = newMap[point.arrayId] || []
        newMap[point.arrayId] = [...existing, point].slice(-MAX_POINTS)
      }
      return { pvDataMap: newMap }
    }),

  updateKpi: (data) => set({ kpi: data }),

  updateDevice: (device) =>
    set((state) => {
      const idx = state.devices.findIndex((d) => d.deviceId === device.deviceId)
      if (idx >= 0) {
        const updated = [...state.devices]
        updated[idx] = device
        return { devices: updated }
      }
      return { devices: [...state.devices, device] }
    }),

  batchUpdateDevices: (incomingDevices) =>
    set((state) => {
      const updated = [...state.devices]
      for (const device of incomingDevices) {
        const idx = updated.findIndex((d) => d.deviceId === device.deviceId)
        if (idx >= 0) {
          updated[idx] = device
        } else {
          updated.push(device)
        }
      }
      return { devices: updated }
    }),

  setConnected: (connected) => set({ isConnected: connected }),

  updateWindowMetrics: (arrayId, metrics) =>
    set((state) => ({
      windowMetricsMap: {
        ...state.windowMetricsMap,
        [arrayId]: metrics,
      },
    })),

  updateForecast: (arrayId, forecast) =>
    set((state) => ({
      forecastMap: {
        ...state.forecastMap,
        [arrayId]: forecast,
      },
    })),
}))
