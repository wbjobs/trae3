import { v4 as uuid } from 'uuid'
import { getDb, insertHistoryRaw } from './database.js'
import type { RealtimeData, AlarmRecord } from '../shared/types.js'

const cache = new Map<string, RealtimeData>()
const activeAlarms = new Map<string, AlarmRecord>()
let simulatorTimer: ReturnType<typeof setInterval> | null = null
let onAlarm: ((alarm: AlarmRecord) => void) | null = null
let onStatusChange: ((pipeId: string, status: string) => void) | null = null

export function setAlarmCallback(cb: (alarm: AlarmRecord) => void): void {
  onAlarm = cb
}

export function setStatusChangeCallback(cb: (pipeId: string, status: string) => void): void {
  onStatusChange = cb
}

export function initCache(): void {
  const db = getDb()
  const segments = db.prepare('SELECT id FROM pipe_segment').all() as { id: string }[]
  const now = Date.now()

  for (const seg of segments) {
    cache.set(seg.id, generateData(seg.id, now))
  }

  const unacked = db.prepare('SELECT * FROM alarm_record WHERE acknowledged = 0').all() as Record<string, unknown>[]
  for (const row of unacked) {
    const alarm = rowToAlarm(row)
    activeAlarms.set(alarm.pipeId, alarm)
  }
}

function rowToAlarm(row: Record<string, unknown>): AlarmRecord {
  return {
    id: row.id as string,
    pipeId: row.pipe_id as string,
    type: row.type as AlarmRecord['type'],
    level: row.level as AlarmRecord['level'],
    value: row.value as number,
    threshold: row.threshold as number,
    message: row.message as string,
    timestamp: row.timestamp as number,
    acknowledged: (row.acknowledged as number) === 1,
    acknowledgedBy: (row.acknowledged_by as string) || undefined,
  }
}

let historyWriteCounter = 0
const HISTORY_WRITE_INTERVAL = 5

export function startSimulator(): void {
  if (simulatorTimer) return

  simulatorTimer = setInterval(() => {
    const now = Date.now()
    const updates: RealtimeData[] = []
    historyWriteCounter++

    for (const [pipeId, prev] of cache) {
      const next = evolveData(prev, now)
      cache.set(pipeId, next)
      updates.push(next)

      if (historyWriteCounter >= HISTORY_WRITE_INTERVAL) {
        insertHistoryRaw({
          pipeId: next.pipeId,
          timestamp: next.timestamp,
          pressure: next.pressure,
          flow: next.flow,
          temperature: next.temperature,
          status: next.status,
        })
      }

      if (next.status !== 'normal' && prev.status === 'normal') {
        const alarm = createAlarm(pipeId, next)
        if (alarm && onAlarm) {
          onAlarm(alarm)
        }
      }

      if (next.status === 'normal' && prev.status !== 'normal') {
        activeAlarms.delete(pipeId)
      }

      if (next.status !== prev.status && onStatusChange) {
        onStatusChange(pipeId, next.status)
      }
    }

    if (historyWriteCounter >= HISTORY_WRITE_INTERVAL) {
      historyWriteCounter = 0
    }
  }, 1000)
}

export function stopSimulator(): void {
  if (simulatorTimer) {
    clearInterval(simulatorTimer)
    simulatorTimer = null
  }
}

export function getRealtimeData(pipeId: string): RealtimeData | undefined {
  return cache.get(pipeId)
}

export function getAllRealtimeData(): RealtimeData[] {
  return Array.from(cache.values())
}

export function clearActiveAlarm(pipeId: string): void {
  activeAlarms.delete(pipeId)
}

export function getChangedData(since: Map<string, RealtimeData>): (Partial<RealtimeData> & { pipeId: string; timestamp: number })[] {
  const changes: (Partial<RealtimeData> & { pipeId: string; timestamp: number })[] = []

  for (const [pipeId, current] of cache) {
    const prev = since.get(pipeId)
    if (!prev) {
      changes.push({
        pipeId,
        pressure: current.pressure,
        flow: current.flow,
        temperature: current.temperature,
        status: current.status,
        timestamp: current.timestamp,
      })
      continue
    }

    const delta: Partial<RealtimeData> & { pipeId: string; timestamp: number } = {
      pipeId,
      timestamp: current.timestamp,
    }

    if (Math.abs(current.pressure - prev.pressure) > 0.02) {
      delta.pressure = current.pressure
    }
    if (Math.abs(current.flow - prev.flow) > 50) {
      delta.flow = current.flow
    }
    if (Math.abs(current.temperature - prev.temperature) > 0.5) {
      delta.temperature = current.temperature
    }
    if (current.status !== prev.status) {
      delta.status = current.status
    }

    if (delta.pressure !== undefined || delta.flow !== undefined || delta.temperature !== undefined || delta.status !== undefined) {
      changes.push(delta)
    }
  }

  return changes
}

function generateData(pipeId: string, timestamp: number): RealtimeData {
  const pressure = 0.5 + Math.random() * 0.6
  const flow = 500 + Math.random() * 2000
  const temperature = 20 + Math.random() * 10

  return {
    pipeId,
    pressure,
    flow,
    temperature,
    timestamp,
    status: 'normal',
  }
}

function evolveData(prev: RealtimeData, timestamp: number): RealtimeData {
  let pressure = prev.pressure + (Math.random() - 0.5) * 0.08
  let flow = prev.flow + (Math.random() - 0.5) * 200
  let temperature = prev.temperature + (Math.random() - 0.5) * 1.5

  pressure = Math.max(0.1, Math.min(2.0, pressure))
  flow = Math.max(50, Math.min(6000, flow))
  temperature = Math.max(10, Math.min(50, temperature))

  if (Math.random() < 0.005) {
    pressure = 1.5 + Math.random() * 0.3
  }
  if (Math.random() < 0.005) {
    pressure = 0.15 + Math.random() * 0.1
  }
  if (Math.random() < 0.005) {
    flow = 100 + Math.random() * 200
  }
  if (Math.random() < 0.003) {
    temperature = 42 + Math.random() * 5
  }

  let status: 'normal' | 'warning' | 'alarm' = 'normal'
  if (pressure > 1.6 || pressure < 0.2 || temperature > 45) {
    status = 'alarm'
  } else if (pressure > 1.4 || pressure < 0.3 || flow < 150 || temperature > 40) {
    status = 'warning'
  }

  return {
    pipeId: prev.pipeId,
    pressure: Math.round(pressure * 100) / 100,
    flow: Math.round(flow * 10) / 10,
    temperature: Math.round(temperature * 10) / 10,
    timestamp,
    status,
  }
}

function createAlarm(pipeId: string, data: RealtimeData): AlarmRecord | null {
  const existing = activeAlarms.get(pipeId)
  if (existing && !existing.acknowledged) {
    return null
  }

  const db = getDb()
  let type: AlarmRecord['type'] | null = null
  let level: AlarmRecord['level'] = 'info'
  let value = 0
  let threshold = 0
  let message = ''

  if (data.pressure > 1.6) {
    type = 'pressure_high'
    level = 'critical'
    value = data.pressure
    threshold = 1.6
    message = `管道 ${pipeId.slice(0, 8)} 压力超限: ${data.pressure} MPa > 1.6 MPa`
  } else if (data.pressure < 0.2) {
    type = 'pressure_low'
    level = 'critical'
    value = data.pressure
    threshold = 0.2
    message = `管道 ${pipeId.slice(0, 8)} 压力过低: ${data.pressure} MPa < 0.2 MPa`
  } else if (data.temperature > 45) {
    type = 'temperature_high'
    level = 'warning'
    value = data.temperature
    threshold = 45
    message = `管道 ${pipeId.slice(0, 8)} 温度超限: ${data.temperature}°C > 45°C`
  } else if (data.flow < 150) {
    type = 'flow_abnormal'
    level = 'warning'
    value = data.flow
    threshold = 150
    message = `管道 ${pipeId.slice(0, 8)} 流量异常: ${data.flow} m³/h < 150 m³/h`
  }

  if (!type) return null

  const alarm: AlarmRecord = {
    id: uuid(),
    pipeId,
    type,
    level,
    value,
    threshold,
    message,
    timestamp: data.timestamp,
    acknowledged: false,
  }

  db.prepare(
    `INSERT INTO alarm_record (id, pipe_id, type, level, value, threshold, message, timestamp, acknowledged)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`
  ).run(alarm.id, alarm.pipeId, alarm.type, alarm.level, alarm.value, alarm.threshold, alarm.message, alarm.timestamp)

  activeAlarms.set(pipeId, alarm)

  return alarm
}

export function generateHistoryData(pipeId: string, range: '24h' | '7d'): {
  timestamps: number[]
  pressure: number[]
  flow: number[]
  temperature: number[]
} {
  const now = Date.now()
  const interval = range === '24h' ? 60000 : 300000
  const count = range === '24h' ? 1440 : 2016
  const timestamps: number[] = []
  const pressure: number[] = []
  const flow: number[] = []
  const temperature: number[] = []

  let p = 0.6 + Math.random() * 0.4
  let f = 800 + Math.random() * 1500
  let t = 22 + Math.random() * 6

  for (let i = 0; i < count; i++) {
    const ts = now - (count - i) * interval
    timestamps.push(ts)

    p += (Math.random() - 0.5) * 0.03
    p = Math.max(0.2, Math.min(1.6, p))
    pressure.push(Math.round(p * 100) / 100)

    f += (Math.random() - 0.5) * 100
    f = Math.max(100, Math.min(5000, f))
    flow.push(Math.round(f * 10) / 10)

    t += (Math.random() - 0.5) * 0.5
    t = Math.max(15, Math.min(45, t))
    temperature.push(Math.round(t * 10) / 10)
  }

  return { timestamps, pressure, flow, temperature }
}
