import { store } from '../db/store.js'
import type {
  MetricQuery,
  MetricType,
  CorrelationResult,
  CorrelationPair,
  SynchronousAnomaly,
  AnomalyRecord,
  MetricDataPoint,
} from '../../shared/types.js'

interface SeriesKey {
  metricType: MetricType
  serviceName: string
  nodeId: string
}

const SYNCHRONOUS_WINDOW_MS = 60 * 1000
const DEFAULT_THRESHOLD = 0.7

class CorrelationService {
  pearsonCorrelation(arr1: number[], arr2: number[]): number {
    if (arr1.length !== arr2.length || arr1.length === 0) return 0
    const n = arr1.length
    let sum1 = 0, sum2 = 0, sum1Sq = 0, sum2Sq = 0, pSum = 0

    for (let i = 0; i < n; i++) {
      const v1 = arr1[i], v2 = arr2[i]
      if (isNaN(v1) || isNaN(v2)) continue
      sum1 += v1; sum2 += v2; sum1Sq += v1 * v1; sum2Sq += v2 * v2; pSum += v1 * v2
    }

    const num = pSum - (sum1 * sum2) / n
    const den = Math.sqrt((sum1Sq - (sum1 * sum1) / n) * (sum2Sq - (sum2 * sum2) / n))
    return den === 0 ? 0 : Math.round((num / den) * 10000) / 10000
  }

  detectPattern(series: MetricDataPoint[]): 'spike' | 'trend' | 'oscillation' | 'step' | 'none' {
    if (series.length < 5) return 'none'
    const values = series.map(p => p.value).filter(v => !isNaN(v))
    if (values.length < 5) return 'none'

    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length)
    const peaks = this.countPeaks(values)
    const peakRatio = peaks / values.length

    const firstHalf = values.slice(0, Math.floor(values.length / 2))
    const secondHalf = values.slice(Math.floor(values.length / 2))
    const firstMean = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
    const secondMean = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
    const meanShift = Math.abs(secondMean - firstMean)

    const max = Math.max(...values), min = Math.min(...values), range = max - min
    const maxIdx = values.indexOf(max)

    if (range > 3 * std && peakRatio < 0.1) {
      const before = values.slice(Math.max(0, maxIdx - 3), maxIdx)
      const after = values.slice(maxIdx + 1, Math.min(values.length, maxIdx + 4))
      const beforeMean = before.length > 0 ? before.reduce((a, b) => a + b, 0) / before.length : 0
      const afterMean = after.length > 0 ? after.reduce((a, b) => a + b, 0) / after.length : 0
      if (max > beforeMean * 1.5 && max > afterMean * 1.5) return 'spike'
    }

    if (meanShift > std && peakRatio < 0.15) return 'step'
    if (peakRatio > 0.3) return 'oscillation'

    const avgDiff = (values[values.length - 1] - values[0]) / values.length
    if (Math.abs(avgDiff) > std * 0.1) return 'trend'

    return 'none'
  }

  private countPeaks(values: number[]): number {
    let peaks = 0
    for (let i = 1; i < values.length - 1; i++) {
      if (values[i] > values[i - 1] && values[i] > values[i + 1]) peaks++
    }
    return peaks
  }

  findSynchronousAnomalies(anomalies: AnomalyRecord[]): SynchronousAnomaly[] {
    if (anomalies.length < 2) return []
    const sorted = [...anomalies].sort((a, b) =>
      new Date(a.detectedAt).getTime() - new Date(b.detectedAt).getTime()
    )

    const groups: AnomalyRecord[][] = []
    let currentGroup: AnomalyRecord[] = [sorted[0]]

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i]
      const groupStart = new Date(currentGroup[0].detectedAt).getTime()
      const currentTime = new Date(current.detectedAt).getTime()
      if (currentTime - groupStart <= SYNCHRONOUS_WINDOW_MS) {
        currentGroup.push(current)
      } else {
        if (currentGroup.length >= 2) groups.push(currentGroup)
        currentGroup = [current]
      }
    }
    if (currentGroup.length >= 2) groups.push(currentGroup)

    return groups.map(group => {
      const times = group.map(a => new Date(a.detectedAt).getTime())
      return {
        anomalyIds: group.map(a => a.id),
        metricTypes: [...new Set(group.map(a => a.metricType))],
        services: [...new Set(group.map(a => a.serviceName))],
        nodes: [...new Set(group.map(a => a.nodeId))],
        startTime: new Date(Math.min(...times)).toISOString(),
        endTime: new Date(Math.max(...times)).toISOString(),
        correlation: this.calculateGroupCorrelation(group),
        pattern: this.detectGroupPattern(group),
      }
    })
  }

  private calculateGroupCorrelation(group: AnomalyRecord[]): number {
    if (group.length < 2) return 0
    let totalCorr = 0, pairs = 0
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const diff = Math.abs(new Date(group[i].detectedAt).getTime() - new Date(group[j].detectedAt).getTime())
        totalCorr += Math.max(0, 1 - diff / SYNCHRONOUS_WINDOW_MS)
        pairs++
      }
    }
    return pairs > 0 ? Math.round((totalCorr / pairs) * 100) / 100 : 0
  }

  private detectGroupPattern(group: AnomalyRecord[]): 'spike' | 'trend' | 'oscillation' | 'step' {
    const times = group.map(a => new Date(a.detectedAt).getTime())
    const spread = Math.max(...times) - Math.min(...times)
    if (spread < 10000) return 'spike'
    if (spread < 60000) return 'step'
    if (group.length > 5) return 'oscillation'
    return 'trend'
  }

  correlate(query: MetricQuery, threshold: number = DEFAULT_THRESHOLD): CorrelationResult {
    const startTime = Date.now()

    const rows = store.queryMetrics({
      metricTypes: query.metricTypes,
      serviceNames: query.serviceNames,
      nodeIds: query.nodeIds,
      startTime: query.startTime,
      endTime: query.endTime,
    })

    const seriesMap = new Map<string, { key: SeriesKey; data: Map<number, number> }>()
    for (const row of rows) {
      const key = `${row.metricType}:${row.serviceName}:${row.nodeId}`
      if (!seriesMap.has(key)) {
        seriesMap.set(key, {
          key: { metricType: row.metricType, serviceName: row.serviceName, nodeId: row.nodeId },
          data: new Map(),
        })
      }
      seriesMap.get(key)!.data.set(row.timestampMs, row.value)
    }

    const seriesList = Array.from(seriesMap.values())
    const pairs: CorrelationPair[] = []

    for (let i = 0; i < seriesList.length; i++) {
      for (let j = i + 1; j < seriesList.length; j++) {
        const s1 = seriesList[i], s2 = seriesList[j]
        const commonTimestamps = Array.from(s1.data.keys()).filter(t => s2.data.has(t))
        if (commonTimestamps.length < 10) continue

        const arr1 = commonTimestamps.map(t => s1.data.get(t)!)
        const arr2 = commonTimestamps.map(t => s2.data.get(t)!)
        const correlation = this.pearsonCorrelation(arr1, arr2)
        if (Math.abs(correlation) < threshold) continue

        pairs.push({
          seriesA: s1.key,
          seriesB: s2.key,
          correlation,
          lagMs: this.calculateLag(arr1, arr2),
          significance: this.calculateSignificance(correlation, commonTimestamps.length),
        })
      }
    }

    pairs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))

    const anomalies = store.queryAnomalies({
      startTime: query.startTime,
      endTime: query.endTime,
    }).anomalies

    return {
      pairs,
      synchronousAnomalies: this.findSynchronousAnomalies(anomalies),
      analysisTimeMs: Date.now() - startTime,
      parameters: {
        startTime: query.startTime,
        endTime: query.endTime,
        threshold,
      },
    }
  }

  private calculateLag(arr1: number[], arr2: number[]): number {
    let maxCorr = -Infinity, bestLag = 0
    const maxLag = Math.min(10, Math.floor(arr1.length / 4))

    for (let lag = -maxLag; lag <= maxLag; lag++) {
      const s1 = lag > 0 ? arr1.slice(lag) : arr1
      const s2 = lag < 0 ? arr2.slice(-lag) : arr2
      const minLen = Math.min(s1.length, s2.length)
      if (minLen < 5) continue
      const corr = this.pearsonCorrelation(s1.slice(0, minLen), s2.slice(0, minLen))
      if (corr > maxCorr) { maxCorr = corr; bestLag = lag }
    }
    return bestLag * 60000
  }

  private calculateSignificance(correlation: number, sampleSize: number): number {
    if (sampleSize < 3 || Math.abs(correlation) >= 1) return 1
    const t = correlation * Math.sqrt((sampleSize - 2) / (1 - correlation * correlation))
    const pValue = 2 * (1 - this.normalCDF(Math.abs(t)))
    return Math.round((1 - pValue) * 100) / 100
  }

  private normalCDF(x: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(x))
    const d = 0.3989423 * Math.exp(-x * x / 2)
    const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
    return x > 0 ? 1 - prob : prob
  }
}

export const correlationService = new CorrelationService()
