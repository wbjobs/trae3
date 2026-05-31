import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/database.js'
import type { IndicatorType, IndicatorResult } from '../../shared/types.js'
import { INDICATOR_LABELS } from '../../shared/types.js'

export function calculateRiseRate(stationId: string, startTime: string, endTime: string): Omit<IndicatorResult, 'id' | 'calculatedAt'> {
  const db = getDb()
  const rows = db.prepare(`
    SELECT timestamp, water_level
    FROM ts_monitor_data
    WHERE station_id = ? AND timestamp >= ? AND timestamp <= ? AND water_level IS NOT NULL
    ORDER BY timestamp ASC
  `).all(stationId, startTime, endTime) as { timestamp: string; water_level: number }[]

  if (rows.length < 2) {
    return {
      stationId,
      indicatorType: 'riseRate',
      value: 0,
      unit: 'm/h',
      description: '水位涨率',
      startTime,
      endTime,
      details: {},
    }
  }

  let maxRiseRate = 0
  let totalRise = 0
  for (let i = 1; i < rows.length; i++) {
    const t1 = new Date(rows[i - 1].timestamp).getTime()
    const t2 = new Date(rows[i].timestamp).getTime()
    const diffHours = (t2 - t1) / 3600_000
    if (diffHours > 0) {
      const rise = rows[i].water_level - rows[i - 1].water_level
      const rate = rise / diffHours
      if (rate > maxRiseRate) maxRiseRate = rate
      if (rise > 0) totalRise += rise
    }
  }

  return {
    stationId,
    indicatorType: 'riseRate',
    value: Math.round(maxRiseRate * 100) / 100,
    unit: 'm/h',
    description: '水位涨率',
    startTime,
    endTime,
    details: {
      maxRiseRate: Math.round(maxRiseRate * 100) / 100,
      totalRise: Math.round(totalRise * 100) / 100,
      dataPoints: rows.length,
    },
  }
}

export function calculatePeakFlow(stationId: string, startTime: string, endTime: string): Omit<IndicatorResult, 'id' | 'calculatedAt'> {
  const db = getDb()
  const row = db.prepare(`
    SELECT MAX(flow_rate) as peak_flow, AVG(flow_rate) as avg_flow
    FROM ts_monitor_data
    WHERE station_id = ? AND timestamp >= ? AND timestamp <= ? AND flow_rate IS NOT NULL
  `).get(stationId, startTime, endTime) as { peak_flow: number | null; avg_flow: number | null }

  const peakFlow = row?.peak_flow ?? 0
  const avgFlow = row?.avg_flow ?? 0

  return {
    stationId,
    indicatorType: 'peakFlow',
    value: Math.round(peakFlow * 100) / 100,
    unit: 'm³/s',
    description: '洪峰流量',
    startTime,
    endTime,
    details: {
      peakFlow: Math.round(peakFlow * 100) / 100,
      avgFlow: Math.round(avgFlow * 100) / 100,
    },
  }
}

export function calculateRunoffCoeff(stationId: string, startTime: string, endTime: string): Omit<IndicatorResult, 'id' | 'calculatedAt'> {
  const db = getDb()
  const row = db.prepare(`
    SELECT
      SUM(flow_rate) as total_flow,
      SUM(rainfall) as total_rainfall,
      COUNT(*) as data_points
    FROM ts_monitor_data
    WHERE station_id = ? AND timestamp >= ? AND timestamp <= ?
      AND flow_rate IS NOT NULL AND rainfall IS NOT NULL
  `).get(stationId, startTime, endTime) as { total_flow: number | null; total_rainfall: number | null; data_points: number }

  const totalFlow = row?.total_flow ?? 0
  const totalRainfall = row?.total_rainfall ?? 0
  const runoffCoeff = totalRainfall > 0 ? totalFlow / totalRainfall : 0

  return {
    stationId,
    indicatorType: 'runoffCoeff',
    value: Math.round(runoffCoeff * 1000) / 1000,
    unit: '',
    description: '径流系数',
    startTime,
    endTime,
    details: {
      totalFlow: Math.round(totalFlow * 100) / 100,
      totalRainfall: Math.round(totalRainfall * 100) / 100,
      runoffCoeff: Math.round(runoffCoeff * 1000) / 1000,
    },
  }
}

export function calculateRainfallIntensity(stationId: string, startTime: string, endTime: string): Omit<IndicatorResult, 'id' | 'calculatedAt'> {
  const db = getDb()
  const row = db.prepare(`
    SELECT
      MAX(rainfall) as max_hourly_rainfall,
      AVG(rainfall) as avg_hourly_rainfall,
      SUM(rainfall) as total_rainfall
    FROM ts_monitor_data
    WHERE station_id = ? AND timestamp >= ? AND timestamp <= ? AND rainfall IS NOT NULL
  `).get(stationId, startTime, endTime) as { max_hourly_rainfall: number | null; avg_hourly_rainfall: number | null; total_rainfall: number | null }

  const maxRainfall = row?.max_hourly_rainfall ?? 0
  const avgRainfall = row?.avg_hourly_rainfall ?? 0
  const totalRainfall = row?.total_rainfall ?? 0

  return {
    stationId,
    indicatorType: 'rainfallIntensity',
    value: Math.round(maxRainfall * 100) / 100,
    unit: 'mm/h',
    description: '降雨强度',
    startTime,
    endTime,
    details: {
      maxHourlyRainfall: Math.round(maxRainfall * 100) / 100,
      avgHourlyRainfall: Math.round(avgRainfall * 100) / 100,
      totalRainfall: Math.round(totalRainfall * 100) / 100,
    },
  }
}

export function calculateReturnPeriod(stationId: string, startTime: string, endTime: string): Omit<IndicatorResult, 'id' | 'calculatedAt'> {
  const db = getDb()

  const rows = db.prepare(`
    SELECT water_level
    FROM ts_monitor_data
    WHERE station_id = ? AND water_level IS NOT NULL
    ORDER BY water_level DESC
    LIMIT 200
  `).all(stationId) as { water_level: number }[]

  const currentMax = db.prepare(`
    SELECT MAX(water_level) as max_level
    FROM ts_monitor_data
    WHERE station_id = ? AND timestamp >= ? AND timestamp <= ? AND water_level IS NOT NULL
  `).get(stationId, startTime, endTime) as { max_level: number | null }

  if (rows.length < 2) {
    return {
      stationId,
      indicatorType: 'returnPeriod',
      value: 0,
      unit: '年',
      description: '重现期',
      startTime,
      endTime,
      details: {},
    }
  }

  const levels = rows.map(r => r.water_level)
  const n = levels.length
  const mean = levels.reduce((s, v) => s + v, 0) / n
  const variance = levels.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)
  const stdDev = Math.sqrt(variance)

  const beta = stdDev * 0.7797
  const mu = mean - stdDev * 0.4500

  const x = currentMax?.max_level ?? mean

  let returnPeriod = 1
  if (beta > 0) {
    const y = (x - mu) / beta
    const expNegY = Math.exp(-y)
    if (expNegY > 0 && expNegY < 1) {
      returnPeriod = Math.max(1, Math.round(1 / (1 - Math.exp(-expNegY)) * 10) / 10)
    }
  }

  return {
    stationId,
    indicatorType: 'returnPeriod',
    value: returnPeriod,
    unit: '年',
    description: '重现期',
    startTime,
    endTime,
    details: {
      maxLevel: Math.round(x * 100) / 100,
      meanLevel: Math.round(mean * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100,
    },
  }
}

export function calculate(params: {
  stationId: string
  indicatorType: IndicatorType
  startTime: string
  endTime: string
}): Omit<IndicatorResult, 'id' | 'calculatedAt'> & { calculatedAt?: string } {
  const { stationId, indicatorType, startTime, endTime } = params
  const st = startTime.replace('T', ' ').substring(0, 19)
  const et = endTime.replace('T', ' ').substring(0, 19)

  let result: Omit<IndicatorResult, 'id' | 'calculatedAt'>

  switch (indicatorType) {
    case 'riseRate':
      result = calculateRiseRate(stationId, st, et)
      break
    case 'peakFlow':
      result = calculatePeakFlow(stationId, st, et)
      break
    case 'runoffCoeff':
      result = calculateRunoffCoeff(stationId, st, et)
      break
    case 'rainfallIntensity':
      result = calculateRainfallIntensity(stationId, st, et)
      break
    case 'returnPeriod':
      result = calculateReturnPeriod(stationId, st, et)
      break
    default:
      throw new Error(`Unknown indicator type: ${indicatorType}`)
  }

  const db = getDb()
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19)
  db.prepare(`
    INSERT INTO indicator_results (id, station_id, indicator_type, value, unit, start_time, end_time, calculated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), stationId, indicatorType, result.value, result.unit, st, et, now)

  return { ...result, calculatedAt: now }
}
