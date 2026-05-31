import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/database.js'
import type { AlertLevel, AlertStatus } from '../../shared/types.js'

const METRIC_LABELS: Record<string, string> = {
  waterLevel: '水位',
  flowRate: '流量',
  rainfall: '降雨量',
  waterTemp: '水温',
  ph: 'pH值',
  dissolvedOxygen: '溶解氧',
}

const METRIC_UNITS: Record<string, string> = {
  waterLevel: 'm',
  flowRate: 'm³/s',
  rainfall: 'mm',
  waterTemp: '°C',
  ph: '',
  dissolvedOxygen: 'mg/L',
}

export function detectAnomalies(params: {
  stationId?: string
  level?: AlertLevel
  startTime?: string
  endTime?: string
  page?: number
  pageSize?: number
}): { alerts: Array<Record<string, unknown>>; total: number } {
  const db = getDb()
  const page = Math.max(1, params.page || 1)
  const pageSize = Math.min(100, Math.max(1, params.pageSize || 20))
  const offset = (page - 1) * pageSize

  let where = '1=1'
  const args: unknown[] = []

  if (params.stationId) {
    where += ' AND a.station_id = ?'
    args.push(params.stationId)
  }
  if (params.level) {
    where += ' AND a.level = ?'
    args.push(params.level)
  }
  if (params.startTime) {
    where += ' AND a.timestamp >= ?'
    args.push(params.startTime.replace('T', ' ').substring(0, 19))
  }
  if (params.endTime) {
    where += ' AND a.timestamp <= ?'
    args.push(params.endTime.replace('T', ' ').substring(0, 19))
  }

  const totalRow = db.prepare(`SELECT COUNT(*) as count FROM alerts a WHERE ${where}`).get(...args) as { count: number }
  const total = totalRow.count

  const rows = db.prepare(`
    SELECT a.*, s.name as station_name
    FROM alerts a
    LEFT JOIN stations s ON a.station_id = s.id
    WHERE ${where}
    ORDER BY a.timestamp DESC
    LIMIT ? OFFSET ?
  `).all(...args, pageSize, offset) as Record<string, unknown>[]

  const alerts = rows.map(row => ({
    id: row.id,
    stationId: row.station_id,
    stationName: row.station_name,
    ruleId: row.rule_id,
    level: row.level,
    metric: row.metric,
    value: row.value,
    threshold: row.threshold,
    message: row.message,
    status: row.status,
    timestamp: row.timestamp,
    comment: row.comment,
  }))

  return { alerts, total }
}

export function confirmAlert(alertId: string, action: 'confirm' | 'ignore', comment?: string): { success: boolean } {
  const db = getDb()

  const alert = db.prepare('SELECT id FROM alerts WHERE id = ?').get(alertId)
  if (!alert) {
    return { success: false }
  }

  const status: AlertStatus = action === 'confirm' ? 'confirmed' : 'ignored'
  db.prepare('UPDATE alerts SET status = ?, comment = ? WHERE id = ?').run(status, comment || null, alertId)

  return { success: true }
}

export function checkAndCreateAlerts(stationId: string, metrics: Record<string, number | undefined>): string[] {
  const db = getDb()

  const rules = db.prepare(`
    SELECT * FROM alert_rules WHERE station_id = ? AND enabled = 1
  `).all(stationId) as Array<{
    id: string
    metric: string
    level: string
    threshold: number
    operator: string
  }>

  const metricColumnMap: Record<string, string> = {
    waterLevel: 'water_level',
    flowRate: 'flow_rate',
    rainfall: 'rainfall',
    waterTemp: 'water_temp',
    ph: 'ph',
    dissolvedOxygen: 'dissolved_oxygen',
  }

  const station = db.prepare('SELECT name FROM stations WHERE id = ?').get(stationId) as { name: string } | undefined
  const stationName = station?.name ?? '未知站点'

  const alertIds: string[] = []
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19)

  for (const rule of rules) {
    const camelMetric = Object.entries(metricColumnMap).find(([, col]) => col === rule.metric)?.[0] ?? rule.metric
    const value = metrics[camelMetric] ?? metrics[rule.metric]

    if (value === undefined || value === null || Number.isNaN(value) || !Number.isFinite(value)) continue

    if (!validateMetricValue(camelMetric, value)) continue

    let triggered = false
    if (rule.operator === 'gt' && value > rule.threshold) triggered = true
    else if (rule.operator === 'lt' && value < rule.threshold) triggered = true
    else if (rule.operator === 'gte' && value >= rule.threshold) triggered = true
    else if (rule.operator === 'lte' && value <= rule.threshold) triggered = true

    if (!triggered) continue

    if (isRecentDuplicateAlert(db, stationId, rule.id, value, rule.threshold, rule.operator)) {
      continue
    }

    const alertId = uuidv4()
    const label = METRIC_LABELS[camelMetric] ?? METRIC_LABELS[rule.metric] ?? rule.metric
    const unit = METRIC_UNITS[camelMetric] ?? METRIC_UNITS[rule.metric] ?? ''

    db.prepare(`
      INSERT INTO alerts (id, station_id, rule_id, level, metric, value, threshold, message, status, timestamp, comment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      alertId,
      stationId,
      rule.id,
      rule.level,
      rule.metric,
      value,
      rule.threshold,
      `${stationName} ${label}超限，当前值${value.toFixed(2)}${unit}，阈值${rule.threshold.toFixed(2)}${unit}`,
      'active',
      now,
      null,
    )

    alertIds.push(alertId)
  }

  return alertIds
}

const ALERT_DEDUP_WINDOW_MINUTES = 30
const HYSTERESIS_RATIO = 0.95

function isRecentDuplicateAlert(
  db: any,
  stationId: string,
  ruleId: string,
  value: number,
  threshold: number,
  operator: string
): boolean {
  const cutoffTime = new Date()
  cutoffTime.setMinutes(cutoffTime.getMinutes() - ALERT_DEDUP_WINDOW_MINUTES)
  const cutoffStr = cutoffTime.toISOString().replace('T', ' ').substring(0, 19)

  const recent = db.prepare(`
    SELECT value, status FROM alerts
    WHERE station_id = ? AND rule_id = ? AND timestamp >= ?
    ORDER BY timestamp DESC LIMIT 1
  `).get(stationId, ruleId, cutoffStr)

  if (!recent) return false

  if (recent.status === 'active') return true

  const hysteresisThreshold = threshold * HYSTERESIS_RATIO
  if (operator === 'gt' || operator === 'gte') {
    return recent.value >= hysteresisThreshold && value >= hysteresisThreshold
  } else {
    return recent.value <= hysteresisThreshold && value <= hysteresisThreshold
  }
}

function validateMetricValue(metric: string, value: number): boolean {
  const ranges: Record<string, { min: number; max: number }> = {
    waterLevel: { min: -10, max: 200 },
    flowRate: { min: 0, max: 1_000_000 },
    rainfall: { min: 0, max: 1000 },
    waterTemp: { min: -20, max: 60 },
    ph: { min: 0, max: 14 },
    dissolvedOxygen: { min: 0, max: 50 },
  }

  const range = ranges[metric]
  if (!range) return true
  return value >= range.min && value <= range.max
}
