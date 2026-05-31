
import type { Cabin, Sensor, Device, AlarmLog, ControlLog, LinkageRule, SystemStats } from '../types'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  })

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  return response.json()
}

export const api = {
  cabin: {
    getAll: () => request<{ cabins: Cabin[] }>('/data/cabins'),
    getById: (id: string) => request<{ cabin: Cabin }>(`/data/cabins/${id}`),
  },

  sensor: {
    getAll: () => request<{ sensors: Sensor[] }>('/data/sensors'),
    getByCabin: (cabinId: string) => request<{ sensors: Sensor[] }>(`/data/sensors/cabin/${cabinId}`),
    getRealtime: (cabinId?: string) => 
      cabinId 
        ? request<{ cabinId: string; data: any[] }>(`/data/realtime/${cabinId}`)
        : request<{ data: any[] }>('/data/realtime'),
    getHistory: (sensorId: string, startTime?: Date, endTime?: Date, interval?: string) => {
      const params = new URLSearchParams()
      if (startTime) params.set('startTime', startTime.toISOString())
      if (endTime) params.set('endTime', endTime.toISOString())
      if (interval) params.set('interval', interval)
      return request<{ sensorId: string; data: any[] }>(`/data/history/${sensorId}?${params}`)
    },
  },

  device: {
    getAll: () => request<{ devices: Device[] }>('/data/devices'),
    getByCabin: (cabinId: string) => request<{ devices: Device[] }>(`/data/devices/cabin/${cabinId}`),
    control: (deviceId: string, action: 'turnOn' | 'turnOff' | 'setValue', value?: number) =>
      request<{ success: boolean; message: string }>('/control/device', {
        method: 'POST',
        body: JSON.stringify({ deviceId, action, value, operatorId: 'web-user' }),
      }),
    batchControl: (commands: any[]) =>
      request<{ success: boolean; results: any[] }>('/control/batch', {
        method: 'POST',
        body: JSON.stringify({ commands }),
      }),
  },

  alarm: {
    getPending: () => request<{ alarms: AlarmLog[]; count: number }>('/alarm/pending'),
    getLogs: (limit?: number, offset?: number) => {
      const params = new URLSearchParams()
      if (limit) params.set('limit', String(limit))
      if (offset) params.set('offset', String(offset))
      return request<{ logs: AlarmLog[]; total: number }>(`/alarm/logs?${params}`)
    },
    getStats: () => request<{ stats: any }>('/alarm/stats'),
    acknowledge: (alarmId: string, handlerId?: string) =>
      request<{ success: boolean; message: string }>(`/alarm/${alarmId}/acknowledge`, {
        method: 'POST',
        body: JSON.stringify({ handlerId: handlerId || 'web-user' }),
      }),
    resolve: (alarmId: string, handlerId?: string) =>
      request<{ success: boolean; message: string }>(`/alarm/${alarmId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ handlerId: handlerId || 'web-user' }),
      }),
  },

  stats: {
    getSystem: () => request<{ stats: SystemStats }>('/data/stats'),
  },

  logs: {
    getControl: (limit?: number, offset?: number) => {
      const params = new URLSearchParams()
      if (limit) params.set('limit', String(limit))
      if (offset) params.set('offset', String(offset))
      return request<{ logs: ControlLog[]; total: number }>(`/data/control-logs?${params}`)
    },
  },

  linkage: {
    getAll: () => request<{ rules: LinkageRule[] }>('/data/linkage-rules'),
  },

  health: {
    check: () => request<{ success: boolean; message: string; environment: string }>('/health'),
  },
}

export default api
