import { InfluxDB, Point } from '@influxdata/influxdb-client'
import config from '../../config'

type SensorType = 'temperature' | 'humidity' | 'level' | 'pressure'

interface SensorData {
  cabinId: string
  sensorId: string
  sensorType: SensorType
  value: number
  unit: string
  timestamp: Date
}

interface CacheEntry<T> {
  data: T
  timestamp: number
}

let writeApi: any = null
let queryApi: any = null
let influxDB: InfluxDB | null = null
let isConnected = false

const queryCache = new Map<string, CacheEntry<any>>()
const CACHE_TTL_MS = 30000

function getCacheKey(sensorId: string, startTime: Date, endTime: Date, interval: string): string {
  return `${sensorId}:${startTime.getTime()}:${endTime.getTime()}:${interval}`
}

function getFromCache<T>(key: string): T | null {
  const entry = queryCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    queryCache.delete(key)
    return null
  }
  return entry.data as T
}

function setCache<T>(key: string, data: T): void {
  queryCache.set(key, { data, timestamp: Date.now() })
  if (queryCache.size > 100) {
    const oldestKey = queryCache.keys().next().value
    if (oldestKey) queryCache.delete(oldestKey)
  }
}

export const getInfluxDB = (): InfluxDB => {
  if (!influxDB) {
    influxDB = new InfluxDB({
      url: config.influxdb.url,
      token: config.influxdb.token,
    })
  }
  return influxDB
}

export const getWriteApi = () => {
  if (!writeApi) {
    writeApi = getInfluxDB().getWriteApi(
      config.influxdb.org,
      config.influxdb.bucket
    )
    writeApi.useDefaultTags({ source: 'ship-gateway' })
  }
  return writeApi
}

export const getQueryApi = () => {
  if (!queryApi) {
    queryApi = getInfluxDB().getQueryApi(config.influxdb.org)
  }
  return queryApi
}

export const testInfluxConnection = async (): Promise<boolean> => {
  try {
    const api = getQueryApi()
    const fluxQuery = `buckets()`
    await api.collectRows(fluxQuery)
    isConnected = true
    return true
  } catch (error) {
    console.warn('InfluxDB 连接失败，使用内存模式:', (error as Error).message)
    isConnected = false
    return false
  }
}

export const writeSensorData = async (data: SensorData): Promise<void> => {
  if (!isConnected) {
    return
  }
  
  const point = new Point('sensor_reading')
    .tag('cabinId', data.cabinId)
    .tag('sensorId', data.sensorId)
    .tag('sensorType', data.sensorType)
    .floatField('value', data.value)
    .timestamp(new Date(data.timestamp))
  
  getWriteApi().writePoint(point)
}

export const writeSensorDataBatch = async (data: SensorData[]): Promise<void> => {
  if (!isConnected || data.length === 0) {
    return
  }
  
  const points = data.map(d => {
    return new Point('sensor_reading')
      .tag('cabinId', d.cabinId)
      .tag('sensorId', d.sensorId)
      .tag('sensorType', d.sensorType)
      .floatField('value', d.value)
      .timestamp(new Date(d.timestamp))
  })
  
  getWriteApi().writePoints(points)
}

export const querySensorHistory = async (
  sensorId: string,
  startTime: Date,
  endTime: Date,
  interval: string = '1m'
): Promise<Array<{ time: Date; value: number }>> => {
  const cacheKey = getCacheKey(sensorId, startTime, endTime, interval)
  const cached = getFromCache<Array<{ time: Date; value: number }>>(cacheKey)
  if (cached) return cached

  if (!isConnected) {
    const data = generateMockHistoryData(startTime, endTime, interval)
    setCache(cacheKey, data)
    return data
  }

  const autoInterval = interval === '1m' ? getAutoInterval(startTime, endTime) : interval

  const fluxQuery = `
    from(bucket: "${config.influxdb.bucket}")
      |> range(start: ${startTime.getTime() / 1000}, stop: ${endTime.getTime() / 1000})
      |> filter(fn: (r) => r["_measurement"] == "sensor_reading")
      |> filter(fn: (r) => r["sensorId"] == "${sensorId}")
      |> filter(fn: (r) => r["_field"] == "value")
      |> aggregateWindow(every: ${autoInterval}, fn: mean, createEmpty: false)
      |> yield(name: "mean")
  `

  try {
    const rows = await getQueryApi().collectRows(fluxQuery)
    const data = rows.map((row: any) => ({
      time: new Date(row._time),
      value: row._value,
    }))
    setCache(cacheKey, data)
    return data
  } catch (error) {
    console.error('查询历史数据失败:', error)
    const data = generateMockHistoryData(startTime, endTime, interval)
    setCache(cacheKey, data)
    return data
  }
}

function getAutoInterval(startTime: Date, endTime: Date): string {
  const rangeMs = endTime.getTime() - startTime.getTime()
  if (rangeMs <= 3600000) return '1m'
  if (rangeMs <= 21600000) return '5m'
  if (rangeMs <= 86400000) return '15m'
  if (rangeMs <= 604800000) return '1h'
  return '6h'
}

const generateMockHistoryData = (
  startTime: Date,
  endTime: Date,
  interval: string
): Array<{ time: Date; value: number }> => {
  const data: Array<{ time: Date; value: number }> = []
  const intervalMs = parseInterval(interval)
  let currentTime = startTime.getTime()
  let baseValue = 50

  while (currentTime <= endTime.getTime()) {
    baseValue += (Math.random() - 0.5) * 5
    baseValue = Math.max(10, Math.min(90, baseValue))
    
    data.push({
      time: new Date(currentTime),
      value: Math.round(baseValue * 100) / 100,
    })
    
    currentTime += intervalMs
  }

  return data
}

const parseInterval = (interval: string): number => {
  const match = interval.match(/(\d+)([mhd])/)
  if (!match) return 60000
  
  const value = parseInt(match[1])
  const unit = match[2]
  
  switch (unit) {
    case 'm': return value * 60000
    case 'h': return value * 3600000
    case 'd': return value * 86400000
    default: return 60000
  }
}

export const flushInfluxDB = async (): Promise<void> => {
  if (writeApi) {
    await writeApi.close()
    writeApi = null
  }
}

export const clearQueryCache = (): void => {
  queryCache.clear()
}

export default {
  getInfluxDB,
  getWriteApi,
  getQueryApi,
  testInfluxConnection,
  writeSensorData,
  writeSensorDataBatch,
  querySensorHistory,
  flushInfluxDB,
  clearQueryCache,
}
