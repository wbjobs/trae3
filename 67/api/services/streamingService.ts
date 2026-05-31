import type { MetricType, WindowAggregate, StreamStats, DataPoint } from '../../shared/types.js'

interface WindowState {
  windowStartMs: number
  windowEndMs: number
  values: number[]
  count: number
  sum: number
  min: number
  max: number
}

const WINDOW_SIZES_MS: Record<string, number> = {
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
}

const MAX_BACKLOG = 1000
const STATS_UPDATE_INTERVAL_MS = 1000

class StreamingService {
  private windows: Map<string, Map<number, WindowState>> = new Map()
  private backlog: DataPoint[] = []
  private totalPointsProcessed = 0
  private pointsInLastSecond = 0
  private pointsPerSecond = 0
  private processingLatencyMs = 0
  private anomaliesDetected = 0
  private lastStatsUpdate = Date.now()
  private statsInterval: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.startStatsUpdater()
  }

  private getWindowKey(metricType: MetricType, serviceName: string, nodeId: string, windowSize: string): string {
    return `${metricType}:${serviceName}:${nodeId}:${windowSize}`
  }

  private alignToWindow(tsMs: number, windowMs: number): number {
    return Math.floor(tsMs / windowMs) * windowMs
  }

  private calculatePercentiles(values: number[], percentiles: number[]): number[] {
    if (values.length === 0) return percentiles.map(() => 0)
    const sorted = [...values].sort((a, b) => a - b)
    return percentiles.map(p => {
      const idx = Math.ceil((p / 100) * sorted.length) - 1
      return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]
    })
  }

  processPoint(dp: DataPoint): void {
    const startTime = Date.now()
    const timestamp = dp.timestamp ? new Date(dp.timestamp).getTime() : Date.now()

    this.backlog.push({ ...dp, timestamp: new Date(timestamp).toISOString() })

    if (this.backlog.length > MAX_BACKLOG) {
      this.backlog.shift()
    }

    while (this.backlog.length > 0) {
      const point = this.backlog.shift()!
      const tsMs = new Date(point.timestamp!).getTime()

      for (const [windowName, windowMs] of Object.entries(WINDOW_SIZES_MS)) {
        const windowKey = this.getWindowKey(point.metricType, point.serviceName, point.nodeId, windowName)
        const windowStart = this.alignToWindow(tsMs, windowMs)

        if (!this.windows.has(windowKey)) {
          this.windows.set(windowKey, new Map())
        }

        const windowMap = this.windows.get(windowKey)!
        if (!windowMap.has(windowStart)) {
          windowMap.set(windowStart, {
            windowStartMs: windowStart,
            windowEndMs: windowStart + windowMs,
            values: [],
            count: 0,
            sum: 0,
            min: Infinity,
            max: -Infinity,
          })
        }

        const window = windowMap.get(windowStart)!
        window.values.push(point.value)
        window.count++
        window.sum += point.value
        window.min = Math.min(window.min, point.value)
        window.max = Math.max(window.max, point.value)
      }

      this.totalPointsProcessed++
      this.pointsInLastSecond++
    }

    this.processingLatencyMs = Date.now() - startTime
  }

  getWindowAggregates(windowSize?: string): WindowAggregate[] {
    const result: WindowAggregate[] = []
    const sizes = windowSize ? [windowSize] : Object.keys(WINDOW_SIZES_MS)

    for (const [fullKey, windowMap] of this.windows.entries()) {
      const [metricType, serviceName, nodeId, ws] = fullKey.split(':')
      if (windowSize && ws !== windowSize) continue

      for (const window of windowMap.values()) {
        const [p50, p95, p99] = this.calculatePercentiles(window.values, [50, 95, 99])
        result.push({
          windowStart: new Date(window.windowStartMs).toISOString(),
          windowEnd: new Date(window.windowEndMs).toISOString(),
          metricType: metricType as MetricType,
          serviceName,
          nodeId,
          count: window.count,
          min: window.min === Infinity ? 0 : window.min,
          max: window.max === -Infinity ? 0 : window.max,
          avg: window.count > 0 ? Math.round((window.sum / window.count) * 100) / 100 : 0,
          sum: Math.round(window.sum * 100) / 100,
          p50: Math.round(p50 * 100) / 100,
          p95: Math.round(p95 * 100) / 100,
          p99: Math.round(p99 * 100) / 100,
        })
      }
    }

    return result
  }

  getStreamStats(): StreamStats {
    const now = Date.now()
    if (now - this.lastStatsUpdate >= STATS_UPDATE_INTERVAL_MS) {
      this.pointsPerSecond = this.pointsInLastSecond
      this.pointsInLastSecond = 0
      this.lastStatsUpdate = now
    }

    let windowsActive = 0
    for (const windowMap of this.windows.values()) {
      windowsActive += windowMap.size
    }

    return {
      totalPointsProcessed: this.totalPointsProcessed,
      pointsPerSecond: this.pointsPerSecond,
      windowsActive,
      backlogSize: this.backlog.length,
      anomaliesDetected: this.anomaliesDetected,
      processingLatencyMs: this.processingLatencyMs,
    }
  }

  purgeOldWindows(maxAgeMs: number = 60 * 60 * 1000): number {
    const now = Date.now()
    let purgedCount = 0

    for (const [windowKey, windowMap] of this.windows.entries()) {
      const toDelete: number[] = []
      for (const [windowStart, window] of windowMap.entries()) {
        if (now - window.windowEndMs > maxAgeMs) {
          toDelete.push(windowStart)
        }
      }
      for (const start of toDelete) {
        windowMap.delete(start)
        purgedCount++
      }
      if (windowMap.size === 0) {
        this.windows.delete(windowKey)
      }
    }

    return purgedCount
  }

  incrementAnomaliesDetected(): void {
    this.anomaliesDetected++
  }

  private startStatsUpdater(): void {
    this.statsInterval = setInterval(() => {
      this.pointsPerSecond = this.pointsInLastSecond
      this.pointsInLastSecond = 0
      this.lastStatsUpdate = Date.now()
      this.purgeOldWindows()
    }, STATS_UPDATE_INTERVAL_MS)
  }

  stop(): void {
    if (this.statsInterval) {
      clearInterval(this.statsInterval)
      this.statsInterval = null
    }
  }
}

export const streamingService = new StreamingService()
