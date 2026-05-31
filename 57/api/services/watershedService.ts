import { getDb } from '../db/database.js'
import type {
  UpstreamDownstreamResult,
  RainfallRunoffResult,
  CrossStationCorrelation,
} from '../../shared/types.js'

function crossCorrelation(x: number[], y: number[], maxLag: number): { lag: number; correlation: number }[] {
  const n = x.length
  const results: { lag: number; correlation: number }[] = []
  const xMean = x.reduce((s, v) => s + v, 0) / n
  const yMean = y.reduce((s, v) => s + v, 0) / n
  const xStd = Math.sqrt(x.reduce((s, v) => s + (v - xMean) ** 2, 0) / n)
  const yStd = Math.sqrt(y.reduce((s, v) => s + (v - yMean) ** 2, 0) / n)

  if (xStd === 0 || yStd === 0 || n < 3) {
    for (let lag = 0; lag <= maxLag; lag++) {
      results.push({ lag, correlation: 0 })
    }
    return results
  }

  for (let lag = 0; lag <= maxLag; lag++) {
    let sum = 0
    let count = 0
    for (let i = 0; i < n - lag; i++) {
      sum += (x[i] - xMean) * (y[i + lag] - yMean)
      count++
    }
    const corr = count > 0 ? (sum / count) / (xStd * yStd) : 0
    results.push({ lag, correlation: Math.max(-1, Math.min(1, corr)) })
  }
  return results
}

function pearsonCorrelation(x: number[], y: number[]): { coefficient: number; pValue: number } {
  const n = Math.min(x.length, y.length)
  if (n < 3) return { coefficient: 0, pValue: 1 }

  const xSlice = x.slice(0, n)
  const ySlice = y.slice(0, n)
  const xMean = xSlice.reduce((s, v) => s + v, 0) / n
  const yMean = ySlice.reduce((s, v) => s + v, 0) / n

  let sumXY = 0
  let sumX2 = 0
  let sumY2 = 0
  for (let i = 0; i < n; i++) {
    const dx = xSlice[i] - xMean
    const dy = ySlice[i] - yMean
    sumXY += dx * dy
    sumX2 += dx * dx
    sumY2 += dy * dy
  }

  const denom = Math.sqrt(sumX2 * sumY2)
  if (denom === 0) return { coefficient: 0, pValue: 1 }

  const r = sumXY / denom
  const clampedR = Math.max(-1, Math.min(1, r))

  const t = clampedR * Math.sqrt((n - 2) / (1 - clampedR * clampedR + 1e-10))
  const df = n - 2
  const pValue = Math.min(1, 2 * Math.exp(-0.5 * t * t) * (1 / Math.sqrt(2 * Math.PI)) / (Math.abs(t) + 1e-10))

  return { coefficient: Math.round(clampedR * 10000) / 10000, pValue: Math.round(pValue * 10000) / 10000 }
}

export function getUpstreamDownstreamAnalysis(
  river: string,
  startTime: string,
  endTime: string,
): UpstreamDownstreamResult {
  const db = getDb()
  const start = startTime.replace('T', ' ').substring(0, 19)
  const end = endTime.replace('T', ' ').substring(0, 19)

  const stations = db.prepare(`
    SELECT id, name, lat, lng FROM stations WHERE river = ? ORDER BY lat DESC
  `).all(river) as Array<{ id: string; name: string; lat: number; lng: number }>

  if (stations.length < 2) {
    return { river, stations: [], pairs: [] }
  }

  const stationData: Array<{
    id: string
    name: string
    lat: number
    lng: number
    hourlyData: Array<{ timestamp: string; waterLevel: number | null; flowRate: number | null }>
  }> = []

  for (const s of stations) {
    const rows = db.prepare(`
      SELECT strftime('%Y-%m-%d %H:00:00', timestamp) as time_bucket,
             AVG(water_level) as avg_water_level,
             AVG(flow_rate) as avg_flow_rate
      FROM ts_monitor_data
      WHERE station_id = ? AND timestamp >= ? AND timestamp <= ?
      GROUP BY time_bucket
      ORDER BY time_bucket ASC
    `).all(s.id, start, end) as Array<{ time_bucket: string; avg_water_level: number | null; avg_flow_rate: number | null }>

    stationData.push({
      id: s.id,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      hourlyData: rows.map(r => ({
        timestamp: r.time_bucket,
        waterLevel: r.avg_water_level !== null ? Math.round(r.avg_water_level * 100) / 100 : null,
        flowRate: r.avg_flow_rate !== null ? Math.round(r.avg_flow_rate * 100) / 100 : null,
      })),
    })
  }

  const pairs: UpstreamDownstreamResult['pairs'] = []

  for (let i = 0; i < stationData.length - 1; i++) {
    const upstreamData = stationData[i].hourlyData
    const downstreamData = stationData[i + 1].hourlyData

    const timeMap = new Map<string, { waterLevel: number; flowRate: number }>()
    for (const d of upstreamData) {
      if (d.waterLevel !== null && d.flowRate !== null) {
        timeMap.set(d.timestamp, { waterLevel: d.waterLevel, flowRate: d.flowRate })
      }
    }

    const upWaterLevels: number[] = []
    const downWaterLevels: number[] = []
    const upFlowRates: number[] = []
    const downFlowRates: number[] = []

    for (const d of downstreamData) {
      if (d.waterLevel !== null && d.flowRate !== null) {
        const upEntry = timeMap.get(d.timestamp)
        if (upEntry) {
          upWaterLevels.push(upEntry.waterLevel)
          downWaterLevels.push(d.waterLevel)
          upFlowRates.push(upEntry.flowRate)
          downFlowRates.push(d.flowRate)
        }
      }
    }

    const maxLag = 12
    const waterLevelCCF = crossCorrelation(upWaterLevels, downWaterLevels, maxLag)
    const flowRateCCF = crossCorrelation(upFlowRates, downFlowRates, maxLag)

    let bestWLLag = 0
    let bestWLCorr = -Infinity
    for (const c of waterLevelCCF) {
      if (c.correlation > bestWLCorr) {
        bestWLCorr = c.correlation
        bestWLLag = c.lag
      }
    }

    let bestFRLag = 0
    let bestFRCorr = -Infinity
    for (const c of flowRateCCF) {
      if (c.correlation > bestFRCorr) {
        bestFRCorr = c.correlation
        bestFRLag = c.lag
      }
    }

    const avgLag = Math.round((bestWLLag + bestFRLag) / 2)
    const avgCorr = (bestWLCorr + bestFRCorr) / 2

    pairs.push({
      upstream: stationData[i].id,
      downstream: stationData[i + 1].id,
      lagHours: avgLag,
      maxCorrelation: Math.round(avgCorr * 10000) / 10000,
      waterLevelLag: bestWLLag,
      flowRateLag: bestFRLag,
    })
  }

  return { river, stations: stationData, pairs }
}

export function getRainfallRunoffResponse(
  stationId: string,
  startTime: string,
  endTime: string,
): RainfallRunoffResult {
  const db = getDb()
  const start = startTime.replace('T', ' ').substring(0, 19)
  const end = endTime.replace('T', ' ').substring(0, 19)

  const rows = db.prepare(`
    SELECT strftime('%Y-%m-%d %H:00:00', timestamp) as time_bucket,
           AVG(rainfall) as avg_rainfall,
           AVG(flow_rate) as avg_flow_rate
    FROM ts_monitor_data
    WHERE station_id = ? AND timestamp >= ? AND timestamp <= ?
    GROUP BY time_bucket
    ORDER BY time_bucket ASC
  `).all(stationId, start, end) as Array<{ time_bucket: string; avg_rainfall: number | null; avg_flow_rate: number | null }>

  const rainfallSeries: Array<{ timestamp: string; value: number | null }> = []
  const flowSeries: Array<{ timestamp: string; value: number | null }> = []
  const rainfallValues: number[] = []
  const flowValues: number[] = []

  for (const r of rows) {
    const rainVal = r.avg_rainfall !== null ? Math.round(r.avg_rainfall * 100) / 100 : null
    const flowVal = r.avg_flow_rate !== null ? Math.round(r.avg_flow_rate * 100) / 100 : null

    rainfallSeries.push({ timestamp: r.time_bucket, value: rainVal })
    flowSeries.push({ timestamp: r.time_bucket, value: flowVal })

    if (rainVal !== null) rainfallValues.push(rainVal)
    if (flowVal !== null) flowValues.push(flowVal)
  }

  const maxLag = 24
  const ccf = crossCorrelation(rainfallValues, flowValues, maxLag)

  let responseTimeHours = 0
  let maxCorrelation = -Infinity
  for (const c of ccf) {
    if (c.correlation > maxCorrelation) {
      maxCorrelation = c.correlation
      responseTimeHours = c.lag
    }
  }

  const totalRainfall = rainfallValues.reduce((s, v) => s + v, 0)
  const totalRunoff = flowValues.reduce((s, v) => s + v, 0)
  const runoffRatio = totalRainfall > 0 ? totalRunoff / totalRainfall : 0

  return {
    stationId,
    responseTimeHours,
    maxCorrelation: Math.round(maxCorrelation * 10000) / 10000,
    totalRainfall: Math.round(totalRainfall * 100) / 100,
    totalRunoff: Math.round(totalRunoff * 100) / 100,
    runoffRatio: Math.round(runoffRatio * 10000) / 10000,
    rainfallSeries,
    flowSeries,
  }
}

export function getCrossStationCorrelation(
  stationIds: string[],
  metric: string,
  startTime: string,
  endTime: string,
): CrossStationCorrelation {
  const db = getDb()
  const start = startTime.replace('T', ' ').substring(0, 19)
  const end = endTime.replace('T', ' ').substring(0, 19)

  const METRIC_COLUMN_MAP: Record<string, string> = {
    waterLevel: 'water_level',
    flowRate: 'flow_rate',
    rainfall: 'rainfall',
    waterTemp: 'water_temp',
    ph: 'ph',
    dissolvedOxygen: 'dissolved_oxygen',
  }

  const col = METRIC_COLUMN_MAP[metric]
  if (!col) {
    throw new Error(`无效的指标: ${metric}`)
  }

  const stationDataMap: Map<string, Map<string, number>> = new Map()
  const stationNameMap: Map<string, string> = new Map()

  const stationRows = db.prepare(`
    SELECT id, name FROM stations WHERE id IN (${stationIds.map(() => '?').join(',')})
  `).all(...stationIds) as Array<{ id: string; name: string }>
  for (const sr of stationRows) {
    stationNameMap.set(sr.id, sr.name)
  }

  for (const sid of stationIds) {
    const rows = db.prepare(`
      SELECT strftime('%Y-%m-%d %H:00:00', timestamp) as time_bucket,
             AVG(${col}) as avg_val
      FROM ts_monitor_data
      WHERE station_id = ? AND timestamp >= ? AND timestamp <= ? AND ${col} IS NOT NULL
      GROUP BY time_bucket
      ORDER BY time_bucket ASC
    `).all(sid, start, end) as Array<{ time_bucket: string; avg_val: number }>

    const timeMap = new Map<string, number>()
    for (const r of rows) {
      timeMap.set(r.time_bucket, Math.round(r.avg_val * 100) / 100)
    }
    stationDataMap.set(sid, timeMap)
  }

  const allTimeBuckets = new Set<string>()
  for (const timeMap of stationDataMap.values()) {
    for (const t of timeMap.keys()) {
      allTimeBuckets.add(t)
    }
  }
  const sortedBuckets = Array.from(allTimeBuckets).sort()

  const correlations: CrossStationCorrelation['correlations'] = []
  const matrix: number[][] = []

  for (let i = 0; i < stationIds.length; i++) {
    matrix[i] = []
    for (let j = 0; j < stationIds.length; j++) {
      if (i === j) {
        matrix[i][j] = 1
        continue
      }

      const xData: number[] = []
      const yData: number[] = []
      const xMap = stationDataMap.get(stationIds[i])
      const yMap = stationDataMap.get(stationIds[j])

      if (!xMap || !yMap) {
        matrix[i][j] = 0
        continue
      }

      for (const t of sortedBuckets) {
        const xVal = xMap.get(t)
        const yVal = yMap.get(t)
        if (xVal !== undefined && yVal !== undefined) {
          xData.push(xVal)
          yData.push(yVal)
        }
      }

      const result = pearsonCorrelation(xData, yData)
      matrix[i][j] = result.coefficient

      if (i < j) {
        correlations.push({
          stationA: stationIds[i],
          stationB: stationIds[j],
          stationAName: stationNameMap.get(stationIds[i]) || stationIds[i],
          stationBName: stationNameMap.get(stationIds[j]) || stationIds[j],
          coefficient: result.coefficient,
          pValue: result.pValue,
        })
      }
    }
  }

  return { metric, correlations, matrix }
}
