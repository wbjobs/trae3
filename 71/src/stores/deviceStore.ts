import { create } from 'zustand'
import type { Device, DeviceStats, DeviceParams } from '../../shared/types'

const PARAM_BOUNDS: Record<keyof DeviceParams, [number, number]> = {
  acVoltage: [100, 300],
  acCurrent: [0, 100],
  acFrequency: [45, 65],
  acPower: [0, 500],
  dcVoltage: [100, 1000],
  dcCurrent: [0, 50],
  dcPower: [0, 500],
  dailyEnergy: [0, 10000],
  totalEnergy: [0, 1000000],
  temperature: [-20, 100],
  efficiency: [0, 100],
}

function isValidParam(key: keyof DeviceParams, value: number): boolean {
  if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) return false
  const [min, max] = PARAM_BOUNDS[key]
  return value >= min && value <= max
}

interface DeviceStore {
  devices: Device[]
  selectedDevice: string | null
  stats: DeviceStats
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'reconnecting'
  reconnectAttempts: number
  fetchDevices: () => Promise<void>
  fetchStats: () => Promise<void>
  selectDevice: (id: string | null) => void
  updateDeviceStatus: (deviceId: string, status: Device['status']) => void
  updateDeviceParams: (deviceId: string, params: Partial<DeviceParams>) => void
  setConnectionStatus: (status: 'connecting' | 'connected' | 'disconnected' | 'reconnecting', attempts?: number) => void
}

const updateDebounce = new Map<string, number>()
const DEBOUNCE_MS = 50

export const useDeviceStore = create<DeviceStore>((set, get) => ({
  devices: [],
  selectedDevice: null,
  stats: { totalPower: 0, dailyEnergy: 0, onlineRate: 0, deviceCount: 0, onlineCount: 0 },
  connectionStatus: 'disconnected',
  reconnectAttempts: 0,

  setConnectionStatus: (status, attempts) =>
    set((state) => ({
      connectionStatus: status,
      reconnectAttempts: attempts !== undefined ? attempts : state.reconnectAttempts,
    })),

  fetchDevices: async () => {
    try {
      const res = await fetch('/api/devices')
      const data = await res.json()
      set({ devices: data.devices })
    } catch {}
  },

  fetchStats: async () => {
    try {
      const res = await fetch('/api/devices/stats')
      const data = await res.json()
      set({ stats: data })
    } catch {}
  },

  selectDevice: (id) => set({ selectedDevice: id }),

  updateDeviceStatus: (deviceId, status) =>
    set((state) => ({
      devices: state.devices.map((d) => (d.id === deviceId ? { ...d, status, lastSeen: Date.now() } : d)),
    })),

  updateDeviceParams: (deviceId, params) => {
    const now = Date.now()
    const lastUpdate = updateDebounce.get(deviceId) || 0
    if (now - lastUpdate < DEBOUNCE_MS) return
    updateDebounce.set(deviceId, now)

    const validParams: Partial<DeviceParams> = {}
    for (const [key, value] of Object.entries(params)) {
      const k = key as keyof DeviceParams
      if (isValidParam(k, value as number)) {
        validParams[k] = value
      }
    }

    if (Object.keys(validParams).length === 0) return

    set((state) => ({
      devices: state.devices.map((d) =>
        d.id === deviceId ? { ...d, params: { ...d.params, ...validParams }, lastSeen: Date.now() } : d
      ),
    }))
  },
}))
