import type {
  PvDataPoint,
  AnomalyEvent,
  KpiData,
  DeviceStatus,
  HistoryQuery,
  HistoryResponse,
  AnomalyQuery,
  AnomalyListResponse,
  HeatmapResponse,
} from '../shared/types.js'
import { ARRAY_CONFIGS, ANOMALY_TYPES, HOT_WINDOW_MS } from '../shared/types.js'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DATA_DIR = path.resolve(__dirname, '..', 'data')
const COLD_DIR = path.join(DATA_DIR, 'cold')

interface TimeSlice {
  startMs: number
  endMs: number
  data: PvDataPoint[]
}

const TIME_SLICE_MS = 60_000
const MAX_QUERY_BUCKETS = 500

let hotSlices: TimeSlice[] = []
const anomalyEvents: AnomalyEvent[] = []
const devices: Map<string, DeviceStatus> = new Map()
const dailyEnergy: Map<string, number> = new Map()
let lastFlushCheck = 0
const FLUSH_CHECK_INTERVAL = 60_000

async function ensureDirectories(): Promise<void> {
  try {
    await fs.access(DATA_DIR)
  } catch {
    await fs.mkdir(DATA_DIR)
  }
  try {
    await fs.access(COLD_DIR)
  } catch {
    await fs.mkdir(COLD_DIR)
  }
}

function getCurrentSlice(ts: number): TimeSlice {
  const sliceStart = Math.floor(ts / TIME_SLICE_MS) * TIME_SLICE_MS
  const sliceEnd = sliceStart + TIME_SLICE_MS

  if (hotSlices.length > 0) {
    const last = hotSlices[hotSlices.length - 1]
    if (last.startMs === sliceStart) return last
  }

  const newSlice: TimeSlice = { startMs: sliceStart, endMs: sliceEnd, data: [] }
  hotSlices.push(newSlice)
  return newSlice
}

function findSliceIndex(slices: TimeSlice[], ts: number): number {
  let lo = 0
  let hi = slices.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (ts < slices[mid].startMs) {
      hi = mid - 1
    } else if (ts >= slices[mid].endMs) {
      lo = mid + 1
    } else {
      return mid
    }
  }
  return lo
}

function parseInterval(interval: string): number {
  const map: Record<string, number> = {
    '1m': 60_000,
    '5m': 300_000,
    '15m': 900_000,
    '1h': 3_600_000,
  }
  return map[interval] ?? 300_000
}

export async function insertPvData(point: PvDataPoint): Promise<void> {
  await ensureDirectories()
  
  const slice = getCurrentSlice(point.timestamp)
  slice.data.push(point)
  
  const last = dailyEnergy.get(point.arrayId) ?? 0
  dailyEnergy.set(point.arrayId, last + (point.power * 2) / 3600)

  const now = Date.now()
  if (now - lastFlushCheck > FLUSH_CHECK_INTERVAL) {
    lastFlushCheck = now
    await flushColdSlices()
  }
}

export async function flushColdSlices(): Promise<void> {
  const cutoff = Date.now() - HOT_WINDOW_MS
  const toFlush: TimeSlice[] = []
  const remaining: TimeSlice[] = []

  for (const slice of hotSlices) {
    if (slice.endMs <= cutoff) {
      toFlush.push(slice)
    } else {
      remaining.push(slice)
    }
  }

  hotSlices = remaining

  for (const slice of toFlush) {
    const filename = `cold-${slice.startMs}.json.gz`
    const filepath = path.join(COLD_DIR, filename)
    const data = JSON.stringify(slice)
    await fs.writeFile(filepath, data)
  }
}

async function loadColdSlicesFromFiles(files: string[]): Promise<TimeSlice[]> {
  const slices: TimeSlice[] = []
  for (const file of files) {
    const filepath = path.join(COLD_DIR, file)
    const data = await fs.readFile(filepath, 'utf8')
    slices.push(JSON.parse(data))
  }
  return slices
}

async function getColdFilesInRange(startMs: number, endMs: number): Promise<string[]> {
  try {
    const files = await fs.readdir(COLD_DIR)
    return files.filter(f => {
      const match = f.match(/cold-(\d+)\.json\.gz$/)
      if (!match) return false
      const ts = parseInt(match[1], 10)
      return ts <= endMs && ts + TIME_SLICE_MS >= startMs
    })
  } catch {
    return []
  }
}

export async function loadColdRange(startMs: number, endMs: number): Promise<TimeSlice[]> {
  const files = await getColdFilesInRange(startMs, endMs)
  return loadColdSlicesFromFiles(files)
}

export async function queryHistory(query: HistoryQuery): Promise<HistoryResponse> {
  const startMs = new Date(query.start).getTime()
  const endMs = new Date(query.end).getTime()
  const intervalMs = parseInterval(query.interval ?? '5m')
  const arrayIdSet = query.arrayIds?.length ? new Set(query.arrayIds) : null

  const bucketCount = Math.ceil((endMs - startMs) / intervalMs)
  const effectiveInterval = bucketCount > MAX_QUERY_BUCKETS
    ? Math.ceil((endMs - startMs) / MAX_QUERY_BUCKETS / 60000) * 60000
    : intervalMs

  const actualBuckets = Math.ceil((endMs - startMs) / effectiveInterval)

  const coldSlices = await loadColdRange(startMs, endMs)
  const allSlices = [...coldSlices, ...hotSlices]
  allSlices.sort((a, b) => a.startMs - b.startMs)

  const startSlice = findSliceIndex(allSlices, startMs)
  const endSlice = findSliceIndex(allSlices, endMs)

  const relevantSlices = allSlices.slice(
    Math.max(0, startSlice),
    Math.min(allSlices.length, endSlice + 1)
  )

  const aggMap = new Map<string, { sum: number; count: number }[]>()

  for (const slice of relevantSlices) {
    for (const point of slice.data) {
      if (point.timestamp < startMs || point.timestamp > endMs) continue
      if (arrayIdSet && !arrayIdSet.has(point.arrayId)) continue

      const bucketIdx = Math.min(
        Math.floor((point.timestamp - startMs) / effectiveInterval),
        actualBuckets - 1
      )

      for (const metric of query.metrics) {
        const val = (point as unknown as Record<string, unknown>)[metric]
        if (typeof val !== 'number') continue

        const key = `${metric}::${point.arrayId}`
        let buckets = aggMap.get(key)
        if (!buckets) {
          buckets = new Array(actualBuckets).fill(null).map(() => ({ sum: 0, count: 0 }))
          aggMap.set(key, buckets)
        }
        buckets[bucketIdx].sum += val
        buckets[bucketIdx].count += 1
      }
    }
  }

  const series: HistoryResponse['series'] = []
  for (const [key, buckets] of aggMap) {
    const [metric, arrayId] = key.split('::')
    const values = buckets.map((b) => (b.count > 0 ? b.sum / b.count : 0))
    series.push({ metric, arrayId, values })
  }

  const timestamps: string[] = []
  for (let i = 0; i < actualBuckets; i++) {
    timestamps.push(new Date(startMs + i * effectiveInterval).toISOString())
  }

  return { timestamps, series }
}

export function getHotSlices(): TimeSlice[] {
  return [...hotSlices]
}

export function getLatestData(arrayId: string): PvDataPoint | undefined {
  for (let i = hotSlices.length - 1; i >= 0; i--) {
    const data = hotSlices[i].data
    for (let j = data.length - 1; j >= 0; j--) {
      if (data[j].arrayId === arrayId) return data[j]
    }
  }
  return undefined
}

export function getRecentAverage(arrayId: string, count: number): PvDataPoint | undefined {
  const points: PvDataPoint[] = []
  for (let i = hotSlices.length - 1; i >= 0 && points.length < count; i--) {
    const data = hotSlices[i].data
    for (let j = data.length - 1; j >= 0 && points.length < count; j--) {
      if (data[j].arrayId === arrayId) {
        points.push(data[j])
      }
    }
  }
  if (points.length === 0) return undefined

  const avg: PvDataPoint = {
    timestamp: points[0].timestamp,
    arrayId,
    power: points.reduce((s, p) => s + p.power, 0) / points.length,
    voltage: points.reduce((s, p) => s + p.voltage, 0) / points.length,
    current: points.reduce((s, p) => s + p.current, 0) / points.length,
    temperature: points.reduce((s, p) => s + p.temperature, 0) / points.length,
    irradiance: points.reduce((s, p) => s + p.irradiance, 0) / points.length,
    efficiency: points.reduce((s, p) => s + p.efficiency, 0) / points.length,
  }
  return avg
}

export function getKpi(): KpiData {
  const latestPerArray = new Map<string, PvDataPoint>()
  for (let i = hotSlices.length - 1; i >= 0; i--) {
    const data = hotSlices[i].data
    for (let j = data.length - 1; j >= 0; j--) {
      const p = data[j]
      if (!latestPerArray.has(p.arrayId)) {
        latestPerArray.set(p.arrayId, p)
      }
    }
    if (latestPerArray.size >= ARRAY_CONFIGS.length) break
  }

  let totalPower = 0
  let currentIrradiance = 0
  let irradianceCount = 0
  let totalEnergy = 0

  for (const [, point] of latestPerArray) {
    totalPower += point.power
    if (point.irradiance > 0) {
      currentIrradiance += point.irradiance
      irradianceCount++
    }
  }

  let onlineCount = 0
  for (const dev of devices.values()) {
    if (dev.deviceType === 'inverter' && dev.status === 'online') onlineCount++
  }

  for (const energy of dailyEnergy.values()) {
    totalEnergy += energy
  }

  return {
    totalPower: Math.round(totalPower * 100) / 100,
    dailyEnergy: Math.round(totalEnergy * 100) / 100,
    onlineInverters: onlineCount,
    currentIrradiance: irradianceCount > 0 ? Math.round((currentIrradiance / irradianceCount) * 100) / 100 : 0,
  }
}

export function insertAnomalyEvent(event: AnomalyEvent): void {
  anomalyEvents.push(event)
}

export function queryAnomalyEvents(query: AnomalyQuery): AnomalyListResponse {
  const startMs = new Date(query.start).getTime()
  const endMs = new Date(query.end).getTime()

  let filtered = anomalyEvents.filter(
    (e) => e.timestamp >= startMs && e.timestamp <= endMs
  )

  if (query.level) {
    filtered = filtered.filter((e) => e.level === query.level)
  }
  if (query.type) {
    filtered = filtered.filter((e) => e.type === query.type)
  }

  filtered.sort((a, b) => b.timestamp - a.timestamp)

  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 20
  const total = filtered.length
  const start = (page - 1) * pageSize
  const events = filtered.slice(start, start + pageSize)

  return { total, events }
}

export function getAnomalyHeatmap(date: string): HeatmapResponse {
  const dayStart = new Date(date).setHours(0, 0, 0, 0)
  const dayEnd = dayStart + 24 * 60 * 60 * 1000

  const countMap = new Map<string, number>()
  for (const config of ARRAY_CONFIGS) {
    countMap.set(config.arrayId, 0)
  }

  for (const event of anomalyEvents) {
    if (event.timestamp >= dayStart && event.timestamp < dayEnd) {
      countMap.set(event.arrayId, (countMap.get(event.arrayId) ?? 0) + 1)
    }
  }

  return {
    arrays: ARRAY_CONFIGS.map((c) => ({
      arrayId: c.arrayId,
      row: c.rowPos,
      col: c.colPos,
      anomalyCount: countMap.get(c.arrayId) ?? 0,
    })),
  }
}

export function getDevices(): DeviceStatus[] {
  return Array.from(devices.values())
}

export function updateDeviceStatus(deviceId: string, status: string): void {
  const dev = devices.get(deviceId)
  if (dev) {
    dev.status = status as DeviceStatus['status']
    dev.lastUpdate = Date.now()
  }
}

export function getAllPvData(): PvDataPoint[] {
  return hotSlices.flatMap((s) => s.data)
}

export function getRecentPvData(limit: number): PvDataPoint[] {
  const result: PvDataPoint[] = []
  for (let i = hotSlices.length - 1; i >= 0; i--) {
    const data = hotSlices[i].data
    for (let j = data.length - 1; j >= 0; j--) {
      result.push(data[j])
      if (result.length >= limit) return result
    }
  }
  return result
}

function initDevices(): void {
  for (const config of ARRAY_CONFIGS) {
    const invId = `${config.arrayId}-INV`
    devices.set(invId, {
      deviceId: invId,
      deviceType: 'inverter',
      status: 'online',
      lastUpdate: Date.now(),
      arrayId: config.arrayId,
    })

    const strId = `${config.arrayId}-STR`
    devices.set(strId, {
      deviceId: strId,
      deviceType: 'string',
      status: 'online',
      lastUpdate: Date.now(),
      arrayId: config.arrayId,
    })
  }
}

function seedHistoricalData(): void {
  const now = Date.now()
  const interval = 120_000
  const count = (2 * 60 * 60 * 1000) / interval

  for (let i = 0; i < count; i++) {
    const ts = now - (count - i) * interval
    const hour = new Date(ts).getHours() + new Date(ts).getMinutes() / 60

    for (const config of ARRAY_CONFIGS) {
      const solarFactor = computeSolarFactor(hour)
      const noise = 1 + (Math.random() - 0.5) * 0.1

      const power = config.ratedPower * solarFactor * noise
      const irradiance = 1000 * solarFactor * (1 + (Math.random() - 0.5) * 0.05)
      const temperature = 25 + 15 * solarFactor + (Math.random() - 0.5) * 4
      const efficiency = 18 + (Math.random() - 0.5) * 4
      const voltage = 500 + 300 * solarFactor * (1 + (Math.random() - 0.5) * 0.05)
      const current = solarFactor > 0.01 ? power / voltage : 0

      const point: PvDataPoint = {
        timestamp: ts,
        arrayId: config.arrayId,
        power: Math.round(power * 100) / 100,
        voltage: Math.round(voltage * 100) / 100,
        current: Math.round(current * 100) / 100,
        temperature: Math.round(temperature * 100) / 100,
        irradiance: Math.round(Math.max(0, irradiance) * 100) / 100,
        efficiency: Math.round(efficiency * 100) / 100,
      }

      const slice = getCurrentSlice(ts)
      slice.data.push(point)

      dailyEnergy.set(
        config.arrayId,
        (dailyEnergy.get(config.arrayId) ?? 0) + (power * interval) / 3_600_000
      )
    }
  }

  for (let i = 0; i < 5; i++) {
    const config = ARRAY_CONFIGS[Math.floor(Math.random() * ARRAY_CONFIGS.length)]
    const anomalyDef = ANOMALY_TYPES[Math.floor(Math.random() * ANOMALY_TYPES.length)]
    anomalyEvents.push({
      id: `seed-${i}`,
      timestamp: now - Math.floor(Math.random() * 2 * 60 * 60 * 1000),
      arrayId: config.arrayId,
      level: ['warning', 'critical', 'fault'][Math.floor(Math.random() * 3)] as AnomalyEvent['level'],
      type: anomalyDef.type,
      description: anomalyDef.description,
      metrics: { power: Math.random() * 200 },
      suggestion: anomalyDef.suggestion,
    })
  }
}

function computeSolarFactor(hour: number): number {
  if (hour < 5.5 || hour > 18.5) return 0
  const peak = 12
  const sigma = 3
  return Math.exp(-0.5 * Math.pow((hour - peak) / sigma, 2))
}

initDevices()
seedHistoricalData()
