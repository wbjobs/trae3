import { getDb } from '../db/database.js'
import type { ExtremeStatistics, ExtremeWarning, HistoricalExtremes } from '../../shared/types.js'

const METRIC_COLUMN_MAP: Record<string, string> = {
  waterLevel: 'water_level',
  flowRate: 'flow_rate',
  rainfall: 'rainfall',
  waterTemp: 'water_temp',
  ph: 'ph',
  dissolvedOxygen: 'dissolved_oxygen',
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(idx)
  const upper = Math.ceil(idx)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower)
}

export function getExtremeStatistics(
  stationId: string,
  metric: string,
  startTime: string,
  endTime: string,
): ExtremeStatistics {
  const db = getDb()
  const col = METRIC_COLUMN_MAP[metric]
  if (!col) {
    throw new Error(`无效的指标: ${metric}`)
  }

  const start = startTime.replace('T', ' ').substring(0, 19)
  const end = endTime.replace('T', ' ').substring(0, 19)

  const rows = db.prepare(`
    SELECT ${col} as value FROM ts_monitor_data
    WHERE station_id = ? AND timestamp >= ? AND timestamp <= ? AND ${col} IS NOT NULL
    ORDER BY ${col} ASC
  `).all(stationId, start, end) as Array<{ value: number }>

  const values = rows.map(r => r.value)
  if (values.length === 0) {
    return {
      stationId,
      metric,
      percentiles: { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0 },
      max: 0,
      min: 0,
      mean: 0,
      stdDev: 0,
      currentValue: null,
      exceedanceProbability: null,
    }
  }

  const p50 = percentile(values, 50)
  const p75 = percentile(values, 75)
  const p90 = percentile(values, 90)
  const p95 = percentile(values, 95)
  const p99 = percentile(values, 99)

  const max = values[values.length - 1]
  const min = values[0]
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
  const stdDev = Math.sqrt(variance)

  const currentRow = db.prepare(`
    SELECT ${col} as value FROM ts_monitor_data
    WHERE station_id = ? AND ${col} IS NOT NULL
    ORDER BY timestamp DESC LIMIT 1
  `).get(stationId) as { value: number } | undefined

  const currentValue = currentRow?.value ?? null
  let exceedanceProbability: number | null = null
  if (currentValue !== null && values.length > 0) {
    const aboveCount = values.filter(v => v > currentValue).length
    exceedanceProbability = Math.round((aboveCount / values.length) * 10000) / 100
  }

  return {
    stationId,
    metric,
    percentiles: {
      p50: Math.round(p50 * 100) / 100,
      p75: Math.round(p75 * 100) / 100,
      p90: Math.round(p90 * 100) / 100,
      p95: Math.round(p95 * 100) / 100,
      p99: Math.round(p99 * 100) / 100,
    },
    max: Math.round(max * 100) / 100,
    min: Math.round(min * 100) / 100,
    mean: Math.round(mean * 100) / 100,
    stdDev: Math.round(stdDev * 100) / 100,
    currentValue: currentValue !== null ? Math.round(currentValue * 100) / 100 : null,
    exceedanceProbability,
  }
}

export function getExtremeWarnings(
  stationId?: string,
  metric?: string,
  page: number = 1,
  pageSize: number = 20,
): { warnings: ExtremeWarning[]; total: number } {
  const db = getDb()

  let stationFilter = ''
  const params: unknown[] = []
  if (stationId) {
    stationFilter = 'AND s.id = ?'
    params.push(stationId)
  }

  const stations = db.prepare(`
    SELECT s.id, s.name FROM stations s WHERE 1=1 ${stationFilter}
  `).all(...params) as Array<{ id: string; name: string }>

  const metrics = metric ? [metric] : ['waterLevel', 'flowRate', 'rainfall']
  const allWarnings: ExtremeWarning[] = []

  for (const station of stations) {
    for (const m of metrics) {
      const col = METRIC_COLUMN_MAP[m]
      if (!col) continue

      const currentRow = db.prepare(`
        SELECT ${col} as value FROM ts_monitor_data
        WHERE station_id = ? AND ${col} IS NOT NULL
        ORDER BY timestamp DESC LIMIT 1
      `).get(station.id) as { value: number } | undefined

      if (!currentRow) continue
      const currentValue = currentRow.value

      const statsRows = db.prepare(`
        SELECT ${col} as value FROM ts_monitor_data
        WHERE station_id = ? AND ${col} IS NOT NULL
        ORDER BY ${col} ASC
      `).all(station.id) as Array<{ value: number }>

      if (statsRows.length === 0) continue

      const sortedValues = statsRows.map(r => r.value)
      const p90 = percentile(sortedValues, 90)
      const p95 = percentile(sortedValues, 95)
      const p99 = percentile(sortedValues, 99)
      const maxHistorical = sortedValues[sortedValues.length - 1]

      if (currentValue > p99) {
        allWarnings.push({
          stationId: station.id,
          stationName: station.name,
          metric: m,
          currentValue: Math.round(currentValue * 100) / 100,
          p95: Math.round(p95 * 100) / 100,
          p99: Math.round(p99 * 100) / 100,
          maxHistorical: Math.round(maxHistorical * 100) / 100,
          warningLevel: 'critical',
          message: `${station.name} ${m}当前值${Math.round(currentValue * 100) / 100}超过P99阈值${Math.round(p99 * 100) / 100}，极值预警`,
        })
      } else if (currentValue > p95) {
        allWarnings.push({
          stationId: station.id,
          stationName: station.name,
          metric: m,
          currentValue: Math.round(currentValue * 100) / 100,
          p95: Math.round(p95 * 100) / 100,
          p99: Math.round(p99 * 100) / 100,
          maxHistorical: Math.round(maxHistorical * 100) / 100,
          warningLevel: 'warning',
          message: `${station.name} ${m}当前值${Math.round(currentValue * 100) / 100}超过P95阈值${Math.round(p95 * 100) / 100}，超限预警`,
        })
      } else if (currentValue > p90) {
        allWarnings.push({
          stationId: station.id,
          stationName: station.name,
          metric: m,
          currentValue: Math.round(currentValue * 100) / 100,
          p95: Math.round(p95 * 100) / 100,
          p99: Math.round(p99 * 100) / 100,
          maxHistorical: Math.round(maxHistorical * 100) / 100,
          warningLevel: 'watch',
          message: `${station.name} ${m}当前值${Math.round(currentValue * 100) / 100}超过P90阈值${Math.round(p90 * 100) / 100}，关注提醒`,
        })
      }
    }
  }

  const total = allWarnings.length
  const offset = (page - 1) * pageSize
  const warnings = allWarnings.slice(offset, offset + pageSize)

  return { warnings, total }
}

export function getHistoricalExtremes(stationId: string, metric: string): HistoricalExtremes {
  const db = getDb()
  const col = METRIC_COLUMN_MAP[metric]
  if (!col) {
    throw new Error(`无效的指标: ${metric}`)
  }

  const allTimeRow = db.prepare(`
    SELECT MAX(${col}) as maxVal, MIN(${col}) as minVal,
           (SELECT timestamp FROM ts_monitor_data WHERE station_id = ? AND ${col} = (SELECT MAX(${col}) FROM ts_monitor_data WHERE station_id = ?) LIMIT 1) as dateOfMax,
           (SELECT timestamp FROM ts_monitor_data WHERE station_id = ? AND ${col} = (SELECT MIN(${col}) FROM ts_monitor_data WHERE station_id = ?) LIMIT 1) as dateOfMin
    FROM ts_monitor_data
    WHERE station_id = ? AND ${col} IS NOT NULL
  `).get(stationId, stationId, stationId, stationId, stationId) as { maxVal: number; minVal: number; dateOfMax: string; dateOfMin: string }

  const recentCutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().replace('T', ' ').substring(0, 19)
  const recentRow = db.prepare(`
    SELECT MAX(${col}) as maxVal, MIN(${col}) as minVal
    FROM ts_monitor_data
    WHERE station_id = ? AND timestamp >= ? AND ${col} IS NOT NULL
  `).get(stationId, recentCutoff) as { maxVal: number; minVal: number }

  return {
    stationId,
    metric,
    allTimeMax: Math.round(allTimeRow.maxVal * 100) / 100,
    allTimeMin: Math.round(allTimeRow.minVal * 100) / 100,
    recentMax: recentRow ? Math.round(recentRow.maxVal * 100) / 100 : Math.round(allTimeRow.maxVal * 100) / 100,
    recentMin: recentRow ? Math.round(recentRow.minVal * 100) / 100 : Math.round(allTimeRow.minVal * 100) / 100,
    dateOfMax: allTimeRow.dateOfMax || '',
    dateOfMin: allTimeRow.dateOfMin || '',
  }
}
