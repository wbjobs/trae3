import { getDb } from '../database/schema.js'
import type { TrendPoint } from '../../shared/types.js'

export interface DeviceRow {
  id: string
  name: string
  code: string
  type: 'hvac' | 'plumbing' | 'electrical' | 'fire'
  floor: number
  position_x: number
  position_y: number
  position_z: number
  status: 'online' | 'offline' | 'alarm'
  health_score: number
  updated_at: string
}

export interface DeviceParamRow {
  id: string
  device_id: string
  param_key: string
  label: string
  value: number
  unit: string
  threshold_min: number | null
  threshold_max: number | null
  timestamp: string
}

export function getAll(): DeviceRow[] {
  const db = getDb()
  return db.prepare('SELECT * FROM devices').all() as DeviceRow[]
}

export function getById(id: string): DeviceRow | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM devices WHERE id = ?').get(id) as
    | DeviceRow
    | undefined
}

export function getByType(type: string): DeviceRow[] {
  const db = getDb()
  return db.prepare('SELECT * FROM devices WHERE type = ?').all(type) as DeviceRow[]
}

export function getByFloor(floor: number): DeviceRow[] {
  const db = getDb()
  return db.prepare('SELECT * FROM devices WHERE floor = ?').all(floor) as DeviceRow[]
}

export function getParamsByDeviceId(deviceId: string): DeviceParamRow[] {
  const db = getDb()
  return db.prepare('SELECT * FROM device_params WHERE device_id = ?').all(deviceId) as DeviceParamRow[]
}

export function insertTrendData(
  deviceId: string,
  key: string,
  value: number,
): void {
  const db = getDb()
  db.prepare(
    'INSERT INTO device_param_trend (id, device_id, param_key, value, timestamp) VALUES (?, ?, ?, ?, datetime(\'now\'))',
  ).run(crypto.randomUUID(), deviceId, key, value)
}

export function getParamTrend(
  deviceId: string,
  key: string,
  hours: number,
): TrendPoint[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT value, timestamp FROM device_param_trend 
       WHERE device_id = ? AND param_key = ? 
       AND timestamp >= datetime('now', ?) 
       ORDER BY timestamp ASC`,
    )
    .all(deviceId, key, `-${hours} hours`) as Array<{
    value: number
    timestamp: string
  }>

  if (rows.length > 0) {
    return rows.map((r) => ({
      timestamp: new Date(r.timestamp).getTime(),
      value: r.value,
    }))
  }

  const param = db
    .prepare(
      'SELECT value FROM device_params WHERE device_id = ? AND param_key = ?',
    )
    .get(deviceId, key) as { value: number } | undefined

  const base = param?.value ?? 0
  const now = Date.now()
  const points: TrendPoint[] = []
  let current = base

  for (let i = hours; i >= 0; i--) {
    const timestamp = now - i * 3600 * 1000
    const variation = (Math.random() - 0.5) * base * 0.04
    current = current + variation
    points.push({ timestamp, value: Math.round(current * 100) / 100 })
  }

  return points
}

export function updateDeviceStatus(id: string, status: string): void {
  const db = getDb()
  db
    .prepare("UPDATE devices SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, id)
}

export function updateDeviceHealthScore(id: string, score: number): void {
  const db = getDb()
  db
    .prepare(
      "UPDATE devices SET health_score = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .run(score, id)
}

export function updateDeviceParam(
  deviceId: string,
  key: string,
  value: number,
): void {
  const db = getDb()
  const existing = db
    .prepare(
      'SELECT id FROM device_params WHERE device_id = ? AND param_key = ?',
    )
    .get(deviceId, key) as { id: string } | undefined

  if (existing) {
    db
      .prepare(
        "UPDATE device_params SET value = ?, timestamp = datetime('now') WHERE device_id = ? AND param_key = ?",
      )
      .run(value, deviceId, key)
  } else {
    db
      .prepare(
        "INSERT INTO device_params (id, device_id, param_key, label, value, unit, threshold_min, threshold_max, timestamp) VALUES (?, ?, ?, '', ?, '', NULL, NULL, datetime('now'))",
      )
      .run(crypto.randomUUID(), deviceId, key, value)
  }

  insertTrendData(deviceId, key, value)
}

export function deleteOldTrendData(maxHours: number): number {
  const db = getDb()
  const result = db
    .prepare(
      `DELETE FROM device_param_trend WHERE timestamp < datetime('now', ?)`,
    )
    .run(`-${maxHours} hours`)
  return result.changes ?? 0
}

export function getTrendDataCount(): number {
  const db = getDb()
  const result = db.prepare('SELECT COUNT(*) as count FROM device_param_trend').get() as {
    count: number
  }
  return result.count
}
