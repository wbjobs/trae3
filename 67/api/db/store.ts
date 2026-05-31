import type { MetricType, AnomalyRecord, ServiceInfo, AlertRule, HealthSummary, NodeStatus, TierStats, DataTier } from '../../shared/types.js'
import { coldStorage } from './coldStorage.js'

interface MetricRow {
  id: number
  timestampMs: number
  timestamp: string
  metricType: MetricType
  serviceName: string
  nodeId: string
  value: number
}

const SERVICES: ServiceInfo[] = [
  { name: 'api-gateway', status: 'healthy', nodes: [{ id: 'node-gw-01', status: 'healthy' }, { id: 'node-gw-02', status: 'healthy' }] },
  { name: 'user-service', status: 'healthy', nodes: [{ id: 'node-user-01', status: 'healthy' }] },
  { name: 'order-service', status: 'healthy', nodes: [{ id: 'node-order-01', status: 'healthy' }, { id: 'node-order-02', status: 'healthy' }] },
  { name: 'payment-service', status: 'healthy', nodes: [{ id: 'node-pay-01', status: 'healthy' }] },
]

const ALERT_RULES: AlertRule[] = [
  { id: 1, metricType: 'cpu', condition: 'gt', threshold: 85, severity: 'high', enabled: true },
  { id: 2, metricType: 'cpu', condition: 'gt', threshold: 95, severity: 'critical', enabled: true },
  { id: 3, metricType: 'memory', condition: 'gt', threshold: 90, severity: 'high', enabled: true },
  { id: 4, metricType: 'memory', condition: 'gt', threshold: 95, severity: 'critical', enabled: true },
  { id: 5, metricType: 'disk', condition: 'gt', threshold: 85, severity: 'medium', enabled: true },
  { id: 6, metricType: 'disk', condition: 'gt', threshold: 95, severity: 'high', enabled: true },
  { id: 7, metricType: 'network', condition: 'gt', threshold: 80, severity: 'medium', enabled: true },
  { id: 8, metricType: 'network', condition: 'gt', threshold: 95, severity: 'high', enabled: true },
]

const METRIC_RANGES: Record<MetricType, [number, number]> = {
  cpu: [20, 70],
  memory: [40, 75],
  disk: [30, 60],
  network: [10, 50],
}

const HOUR_MS = 60 * 60 * 1000
const MAX_POINTS_PER_SERIES = 300
const CACHE_MAX_SIZE = 50
const CACHE_TTL_MS = 5000

function randRange(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100
}

interface CacheEntry {
  value: MetricRow[]
  timestamp: number
}

class LRUCache {
  private map = new Map<string, CacheEntry>()
  private maxSize: number

  constructor(maxSize: number) {
    this.maxSize = maxSize
  }

  get(key: string): MetricRow[] | null {
    const entry = this.map.get(key)
    if (!entry) return null
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      this.map.delete(key)
      return null
    }
    this.map.delete(key)
    this.map.set(key, entry)
    return entry.value
  }

  set(key: string, value: MetricRow[]): void {
    if (this.map.has(key)) {
      this.map.delete(key)
    }
    if (this.map.size >= this.maxSize) {
      const firstKey = this.map.keys().next().value
      this.map.delete(firstKey)
    }
    this.map.set(key, { value, timestamp: Date.now() })
  }

  invalidate(): void {
    this.map.clear()
  }
}

class DataStore {
  metricData: MetricRow[] = []
  anomalyEvents: AnomalyRecord[] = []
  services: ServiceInfo[] = JSON.parse(JSON.stringify(SERVICES))
  alertRules: AlertRule[] = JSON.parse(JSON.stringify(ALERT_RULES))

  private timeIndex: Map<number, number[]> = new Map()
  private seriesIndex: Map<string, MetricRow[]> = new Map()
  private latestBySeries: Map<string, MetricRow> = new Map()
  private queryCache: LRUCache = new LRUCache(CACHE_MAX_SIZE)
  private anomalyIndex: Map<string, AnomalyRecord> = new Map()

  private nextMetricId = 1
  private nextAnomalyId = 1
  private tierRotationInterval: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.seedMetricData()
    this.startTierRotation()
  }

  private getSeriesKey(metricType: MetricType, serviceName: string, nodeId: string): string {
    return `${metricType}:${serviceName}:${nodeId}`
  }

  private getHourBucket(tsMs: number): number {
    return Math.floor(tsMs / HOUR_MS) * HOUR_MS
  }

  private seedMetricData() {
    const now = Date.now()
    const twentyFourHours = 24 * 60 * 60 * 1000
    const oneMinute = 60 * 1000
    const allNodes: { serviceName: string; nodeId: string }[] = []
    for (const svc of this.services) {
      for (const node of svc.nodes) {
        allNodes.push({ serviceName: svc.name, nodeId: node.id })
      }
    }
    const metricTypes: MetricType[] = ['cpu', 'memory', 'disk', 'network']

    for (let t = now - twentyFourHours; t < now; t += oneMinute) {
      const alignedT = this.alignToBucket(t, oneMinute)
      for (const { serviceName, nodeId } of allNodes) {
        for (const metricType of metricTypes) {
          const [min, max] = METRIC_RANGES[metricType]
          this.insertMetricInternal(
            metricType,
            serviceName,
            nodeId,
            randRange(min, max),
            alignedT
          )
        }
      }
    }
  }

  private alignToBucket(tsMs: number, bucketMs: number): number {
    return Math.floor(tsMs / bucketMs) * bucketMs
  }

  private insertMetricInternal(
    metricType: MetricType,
    serviceName: string,
    nodeId: string,
    value: number,
    timestampMs: number
  ): MetricRow {
    const row: MetricRow = {
      id: this.nextMetricId++,
      timestampMs,
      timestamp: new Date(timestampMs).toISOString(),
      metricType,
      serviceName,
      nodeId,
      value,
    }

    this.metricData.push(row)

    const hourBucket = this.getHourBucket(timestampMs)
    if (!this.timeIndex.has(hourBucket)) {
      this.timeIndex.set(hourBucket, [])
    }
    this.timeIndex.get(hourBucket)!.push(this.metricData.length - 1)

    const seriesKey = this.getSeriesKey(metricType, serviceName, nodeId)
    if (!this.seriesIndex.has(seriesKey)) {
      this.seriesIndex.set(seriesKey, [])
    }
    this.seriesIndex.get(seriesKey)!.push(row)

    this.latestBySeries.set(seriesKey, row)

    return row
  }

  insertMetric(
    metricType: MetricType,
    serviceName: string,
    nodeId: string,
    value: number,
    timestamp?: string
  ): MetricRow {
    const tsMs = timestamp ? new Date(timestamp).getTime() : Date.now()
    const alignedTs = this.alignToBucket(tsMs, 60000)
    this.queryCache.invalidate()
    return this.insertMetricInternal(metricType, serviceName, nodeId, value, alignedTs)
  }

  queryMetrics(filters: {
    metricTypes: MetricType[]
    serviceNames?: string[]
    nodeIds?: string[]
    startTime: string
    endTime: string
    tier?: DataTier
  }): MetricRow[] {
    if (filters.tier === 'cold' || filters.tier === 'archive') {
      const coldPoints = coldStorage.queryCold({
        metricTypes: filters.metricTypes,
        serviceNames: filters.serviceNames,
        nodeIds: filters.nodeIds,
        startTime: filters.startTime,
        endTime: filters.endTime,
      })
      return coldPoints.map((p, i) => ({
        id: i,
        timestampMs: new Date(p.timestamp).getTime(),
        timestamp: p.timestamp,
        metricType: filters.metricTypes[0],
        serviceName: filters.serviceNames?.[0] || '',
        nodeId: filters.nodeIds?.[0] || '',
        value: p.value,
      }))
    }

    const startMs = new Date(filters.startTime).getTime()
    const endMs = new Date(filters.endTime).getTime()
    const cacheKey = JSON.stringify({ ...filters, startMs, endMs })

    const cached = this.queryCache.get(cacheKey)
    if (cached) return cached

    const startHour = this.getHourBucket(startMs)
    const endHour = this.getHourBucket(endMs)
    const candidateIndices: number[] = []

    for (let h = startHour; h <= endHour; h += HOUR_MS) {
      const indices = this.timeIndex.get(h)
      if (indices) candidateIndices.push(...indices)
    }

    const results: MetricRow[] = []
    const metricTypesSet = new Set(filters.metricTypes)
    const serviceNamesSet = filters.serviceNames?.length ? new Set(filters.serviceNames) : null
    const nodeIdsSet = filters.nodeIds?.length ? new Set(filters.nodeIds) : null

    for (const idx of candidateIndices) {
      const m = this.metricData[idx]
      if (!m) continue
      if (m.timestampMs < startMs || m.timestampMs > endMs) continue
      if (!metricTypesSet.has(m.metricType)) continue
      if (serviceNamesSet && !serviceNamesSet.has(m.serviceName)) continue
      if (nodeIdsSet && !nodeIdsSet.has(m.nodeId)) continue
      results.push(m)
    }

    this.queryCache.set(cacheKey, results)
    return results
  }

  insertAnomaly(record: Omit<AnomalyRecord, 'id'>): AnomalyRecord {
    const anomaly: AnomalyRecord = { ...record, id: String(this.nextAnomalyId++) }
    this.anomalyEvents.push(anomaly)
    const activeKey = this.getSeriesKey(anomaly.metricType, anomaly.serviceName, anomaly.nodeId)
    if (!anomaly.recoveredAt) {
      this.anomalyIndex.set(activeKey, anomaly)
    } else {
      this.anomalyIndex.delete(activeKey)
    }
    return anomaly
  }

  queryAnomalies(filters: {
    severity?: string
    metricType?: string
    serviceName?: string
    startTime?: string
    endTime?: string
    limit?: number
    offset?: number
  }): { anomalies: AnomalyRecord[]; total: number } {
    const startMs = filters.startTime ? new Date(filters.startTime).getTime() : 0
    const endMs = filters.endTime ? new Date(filters.endTime).getTime() : Infinity

    let results = this.anomalyEvents.filter(a => {
      const detectedMs = new Date(a.detectedAt).getTime()
      if (filters.severity && a.severity !== filters.severity) return false
      if (filters.metricType && a.metricType !== filters.metricType) return false
      if (filters.serviceName && a.serviceName !== filters.serviceName) return false
      if (detectedMs < startMs || detectedMs > endMs) return false
      return true
    })

    results.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
    const total = results.length
    const offset = filters.offset || 0
    const limit = filters.limit || 50
    results = results.slice(offset, offset + limit)
    return { anomalies: results, total }
  }

  getAnomalyById(id: string): AnomalyRecord | undefined {
    return this.anomalyEvents.find(a => a.id === id)
  }

  getServices(): ServiceInfo[] {
    return this.services
  }

  getAlertRules(): AlertRule[] {
    return this.alertRules.filter(r => r.enabled)
  }

  getLatestMetric(metricType: MetricType, serviceName: string, nodeId: string): MetricRow | undefined {
    const key = this.getSeriesKey(metricType, serviceName, nodeId)
    return this.latestBySeries.get(key)
  }

  getHealthSummary(): HealthSummary[] {
    const metricTypes: MetricType[] = ['cpu', 'memory', 'disk', 'network']
    const summaries: HealthSummary[] = []
    const allNodes: { serviceName: string; nodeId: string }[] = []

    for (const svc of this.services) {
      for (const node of svc.nodes) {
        allNodes.push({ serviceName: svc.name, nodeId: node.id })
      }
    }

    for (const mt of metricTypes) {
      let totalValue = 0
      let count = 0
      let prevTotal = 0
      let prevCount = 0
      let worstStatus: NodeStatus = 'healthy'

      for (const { serviceName, nodeId } of allNodes) {
        const key = this.getSeriesKey(mt, serviceName, nodeId)
        const series = this.seriesIndex.get(key)
        if (!series || series.length < 2) continue

        const current = series[series.length - 1].value
        const prevIdx = Math.max(0, series.length - 10)
        const prev = series[prevIdx].value

        totalValue += current
        prevTotal += prev
        count++
        prevCount++

        const rules = this.alertRules.filter(r => r.metricType === mt && r.enabled)
        for (const rule of rules) {
          if (current > rule.threshold) {
            if (rule.severity === 'critical') worstStatus = 'critical'
            else if (rule.severity === 'high' && worstStatus !== 'critical') worstStatus = 'warning'
            else if (worstStatus === 'healthy') worstStatus = 'warning'
          }
        }
      }

      if (count === 0) continue

      const currentAvg = totalValue / count
      const prevAvg = prevTotal / prevCount
      const diff = currentAvg - prevAvg
      const trend: 'up' | 'down' | 'stable' = Math.abs(diff) < 2 ? 'stable' : diff > 0 ? 'up' : 'down'
      const trendPercent = prevAvg !== 0 ? Math.round(Math.abs(diff / prevAvg) * 10000) / 100 : 0

      summaries.push({
        metricType: mt,
        currentValue: Math.round(currentAvg * 100) / 100,
        status: worstStatus,
        trend,
        trendPercent,
      })
    }
    return summaries
  }

  findActiveAnomaly(metricType: MetricType, serviceName: string, nodeId: string): AnomalyRecord | undefined {
    const key = this.getSeriesKey(metricType, serviceName, nodeId)
    return this.anomalyIndex.get(key)
  }

  updateAnomaly(id: string, updates: Partial<AnomalyRecord>): void {
    const idx = this.anomalyEvents.findIndex(a => a.id === id)
    if (idx !== -1) {
      Object.assign(this.anomalyEvents[idx], updates)
      const updated = this.anomalyEvents[idx]
      const activeKey = this.getSeriesKey(updated.metricType, updated.serviceName, updated.nodeId)
      if (updated.recoveredAt) {
        this.anomalyIndex.delete(activeKey)
      } else {
        this.anomalyIndex.set(activeKey, updated)
      }
    }
  }

  getMetricRowsForRange(
    metricType: MetricType,
    serviceName: string,
    nodeId: string,
    startTime: string,
    endTime: string
  ): MetricRow[] {
    const key = this.getSeriesKey(metricType, serviceName, nodeId)
    const series = this.seriesIndex.get(key)
    if (!series) return []

    const startMs = new Date(startTime).getTime()
    const endMs = new Date(endTime).getTime()

    const results: MetricRow[] = []
    for (const row of series) {
      if (row.timestampMs >= startMs && row.timestampMs <= endMs) {
        results.push(row)
      }
    }
    return results
  }

  getMaxPointsPerSeries(): number {
    return MAX_POINTS_PER_SERIES
  }

  getTierStats(): TierStats {
    const hotPoints = this.metricData
    return {
      tier: 'hot',
      pointCount: hotPoints.length,
      timeRange: hotPoints.length > 0 ? {
        start: hotPoints[0].timestamp,
        end: hotPoints[hotPoints.length - 1].timestamp,
      } : null,
    }
  }

  rotateToCold(): number {
    const now = Date.now()
    const cutoff = now - 24 * 60 * 60 * 1000
    const toMove: { timestampMs: number; value: number; metricType: MetricType; serviceName: string; nodeId: string }[] = []
    const toKeep: MetricRow[] = []

    for (const row of this.metricData) {
      if (row.timestampMs <= cutoff) {
        toMove.push({
          timestampMs: row.timestampMs,
          value: row.value,
          metricType: row.metricType,
          serviceName: row.serviceName,
          nodeId: row.nodeId,
        })
      } else {
        toKeep.push(row)
      }
    }

    if (toMove.length > 0) {
      this.metricData = toKeep
      this.rebuildIndices()
      coldStorage.moveToCold(toMove)
    }

    return toMove.length
  }

  private startTierRotation(): void {
    this.tierRotationInterval = setInterval(() => {
      this.rotateToCold()
      coldStorage.moveToArchive()
    }, 60 * 1000)
  }

  private rebuildIndices(): void {
    this.timeIndex.clear()
    this.seriesIndex.clear()
    this.latestBySeries.clear()

    for (let i = 0; i < this.metricData.length; i++) {
      const row = this.metricData[i]
      const hourBucket = this.getHourBucket(row.timestampMs)
      if (!this.timeIndex.has(hourBucket)) {
        this.timeIndex.set(hourBucket, [])
      }
      this.timeIndex.get(hourBucket)!.push(i)

      const seriesKey = this.getSeriesKey(row.metricType, row.serviceName, row.nodeId)
      if (!this.seriesIndex.has(seriesKey)) {
        this.seriesIndex.set(seriesKey, [])
      }
      this.seriesIndex.get(seriesKey)!.push(row)
      this.latestBySeries.set(seriesKey, row)
    }

    this.queryCache.invalidate()
  }
}

export const store = new DataStore()
