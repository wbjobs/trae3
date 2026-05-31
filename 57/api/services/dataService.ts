import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/database.js'
import { queryCache, generateCacheKey } from './cache.js'
import { hotDataStore } from './hotDataCache.js'
import { broadcastToClients } from './streamService.js'
import type { DataReportRequest, AggregationType, DataQueryResponse } from '../../shared/types.js'

export function reportData(request: DataReportRequest): { success: boolean; message: string } {
  const db = getDb()

  const station = db.prepare('SELECT id FROM stations WHERE id = ?').get(request.stationId)
  if (!station) {
    return { success: false, message: '站点不存在' }
  }

  const id = uuidv4()
  const timestamp = request.timestamp.replace('T', ' ').substring(0, 19)

  db.prepare(`
    INSERT INTO ts_monitor_data (id, station_id, timestamp, water_level, flow_rate, rainfall, water_temp, ph, dissolved_oxygen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    request.stationId,
    timestamp,
    request.metrics.waterLevel ?? null,
    request.metrics.flowRate ?? null,
    request.metrics.rainfall ?? null,
    request.metrics.waterTemp ?? null,
    request.metrics.ph ?? null,
    request.metrics.dissolvedOxygen ?? null,
  )

  const values: Record<string, number | null> = {
    waterLevel: request.metrics.waterLevel ?? null,
    flowRate: request.metrics.flowRate ?? null,
    rainfall: request.metrics.rainfall ?? null,
    waterTemp: request.metrics.waterTemp ?? null,
    ph: request.metrics.ph ?? null,
    dissolvedOxygen: request.metrics.dissolvedOxygen ?? null,
  }
  hotDataStore.add(request.stationId, timestamp, values)

  broadcastToClients('data', { stationId: request.stationId, timestamp, values })

  return { success: true, message: '数据上报成功' }
}

const MAX_QUERY_ROWS = 10000
const QUERY_PAGE_SIZE = 5000

export function queryData(params: {
  stationIds: string
  startTime: string
  endTime: string
  metrics: string
  aggregation?: AggregationType
  page?: number
  pageSize?: number
}): DataQueryResponse & { total: number; isTruncated?: boolean } {
  const cacheKey = generateCacheKey('query', params)
  const cached = queryCache.get(cacheKey)
  if (cached) {
    return cached as DataQueryResponse & { total: number; isTruncated?: boolean }
  }

  const db = getDb()
  const stationIds = params.stationIds.split(',')
  const metrics = params.metrics.split(',')
  const aggregation = params.aggregation || 'raw'
  const startTime = params.startTime.replace('T', ' ').substring(0, 19)
  const endTime = params.endTime.replace('T', ' ').substring(0, 19)
  const page = Math.max(1, params.page || 1)
  const pageSize = Math.min(MAX_QUERY_ROWS, Math.max(1, params.pageSize || 2000))
  const offset = (page - 1) * pageSize

  const metricColumnMap: Record<string, string> = {
    waterLevel: 'water_level',
    flowRate: 'flow_rate',
    rainfall: 'rainfall',
    waterTemp: 'water_temp',
    ph: 'ph',
    dissolvedOxygen: 'dissolved_oxygen',
  }

  const validMetrics = metrics.filter(m => metricColumnMap[m])
  if (validMetrics.length === 0) {
    const result = { data: [], total: 0 }
    queryCache.set(cacheKey, result)
    return result
  }

  if (aggregation === 'raw' && page === 1 && stationIds.length === 1) {
    const sid = stationIds[0]
    if (hotDataStore.hasDataInRange(sid, startTime)) {
      const hotRange = hotDataStore.getRange(sid, startTime, endTime)
      if (hotRange.length > 0) {
        const data = hotRange.map(point => {
          const filteredValues: Record<string, number | null> = {}
          for (const m of validMetrics) {
            filteredValues[m] = point.values[m] ?? null
          }
          return {
            stationId: sid,
            timestamp: point.timestamp,
            values: filteredValues,
          }
        })
        const result = { data, total: data.length }
        queryCache.set(cacheKey, result)
        return result
      }
    }
  }

  const placeholders = stationIds.map(() => '?').join(',')

  let rows: Record<string, unknown>[]
  let total = 0

  const countStmt = db.prepare(`
    SELECT COUNT(*) as count FROM ts_monitor_data
    WHERE station_id IN (${placeholders})
      AND timestamp >= ? AND timestamp <= ?
  `)
  const countRow = countStmt.get(...stationIds, startTime, endTime) as { count: number }
  total = countRow.count

  const isTruncated = total > MAX_QUERY_ROWS && aggregation === 'raw'
  const limitRows = aggregation === 'raw' ? Math.min(pageSize, MAX_QUERY_ROWS) : pageSize

  if (aggregation === 'raw') {
    const selectColumns = validMetrics.map(m => metricColumnMap[m]).join(', ')
    rows = db.prepare(`
      SELECT station_id, timestamp, ${selectColumns}
      FROM ts_monitor_data
      WHERE station_id IN (${placeholders})
        AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
      LIMIT ? OFFSET ?
    `).all(...stationIds, startTime, endTime, limitRows, offset) as Record<string, unknown>[]
  } else {
    let truncExpr: string
    switch (aggregation) {
      case 'hourly':
        truncExpr = "strftime('%Y-%m-%d %H:00:00', timestamp)"
        break
      case 'daily':
        truncExpr = "strftime('%Y-%m-%d 00:00:00', timestamp)"
        break
      case 'monthly':
        truncExpr = "strftime('%Y-%m-01 00:00:00', timestamp)"
        break
      default:
        truncExpr = "strftime('%Y-%m-%d %H:00:00', timestamp)"
    }

    const avgColumns = validMetrics.map(m => `AVG(${metricColumnMap[m]}) as avg_${metricColumnMap[m]}`).join(', ')

    rows = db.prepare(`
      SELECT station_id, ${truncExpr} as time_bucket, ${avgColumns}
      FROM ts_monitor_data
      WHERE station_id IN (${placeholders})
        AND timestamp >= ? AND timestamp <= ?
      GROUP BY station_id, time_bucket
      ORDER BY time_bucket ASC
      LIMIT ? OFFSET ?
    `).all(...stationIds, startTime, endTime, limitRows, offset) as Record<string, unknown>[]
  }

  const data = rows.map(row => {
    const values: Record<string, number | null> = {}
    for (const m of validMetrics) {
      const col = aggregation === 'raw' ? metricColumnMap[m] : `avg_${metricColumnMap[m]}`
      const val = row[col]
      values[m] = val !== null && val !== undefined ? Math.round(val as number * 100) / 100 : null
    }
    return {
      stationId: row.station_id as string,
      timestamp: (aggregation === 'raw' ? row.timestamp : row.time_bucket) as string,
      values,
    }
  })

  const result = { data, total, isTruncated }
  queryCache.set(cacheKey, result)
  return result
}
