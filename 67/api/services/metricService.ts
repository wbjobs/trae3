import { store } from '../db/store.js'
import type { MetricQuery, MetricSeries, MetricDataPoint } from '../../shared/types.js'

const INTERVAL_MS: Record<string, number> = {
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
}

function autoSelectInterval(startMs: number, endMs: number, maxPoints: number): number {
  const durationMs = endMs - startMs
  const minInterval = durationMs / maxPoints
  const available = Object.values(INTERVAL_MS).sort((a, b) => a - b)
  for (const iv of available) {
    if (iv >= minInterval) return iv
  }
  return available[available.length - 1]
}

function alignTimestamp(ts: number, bucketMs: number): number {
  return Math.floor(ts / bucketMs) * bucketMs
}

export function queryMetrics(query: MetricQuery): MetricSeries[] {
  const rows = store.queryMetrics({
    metricTypes: query.metricTypes,
    serviceNames: query.serviceNames,
    nodeIds: query.nodeIds,
    startTime: query.startTime,
    endTime: query.endTime,
    tier: query.tier,
  })

  const startMs = new Date(query.startTime).getTime()
  const endMs = new Date(query.endTime).getTime()
  const maxPoints = store.getMaxPointsPerSeries()

  let bucketMs: number
  if (query.interval) {
    bucketMs = INTERVAL_MS[query.interval] || 60000
  } else {
    bucketMs = autoSelectInterval(startMs, endMs, maxPoints)
  }

  const groups = new Map<string, { metricType: string; serviceName: string; nodeId: string; buckets: Map<number, { sum: number; count: number }> }>()

  for (const row of rows) {
    const key = `${row.metricType}:${row.serviceName}:${row.nodeId}`
    if (!groups.has(key)) {
      groups.set(key, {
        metricType: row.metricType,
        serviceName: row.serviceName,
        nodeId: row.nodeId,
        buckets: new Map(),
      })
    }
    const group = groups.get(key)!
    const bucketKey = alignTimestamp(row.timestampMs, bucketMs)
    if (!group.buckets.has(bucketKey)) {
      group.buckets.set(bucketKey, { sum: 0, count: 0 })
    }
    const bucket = group.buckets.get(bucketKey)!
    bucket.sum += row.value
    bucket.count++
  }

  const alignedStart = alignTimestamp(startMs, bucketMs)
  const alignedEnd = alignTimestamp(endMs, bucketMs)

  const series: MetricSeries[] = []
  for (const group of groups.values()) {
    const data: MetricDataPoint[] = []
    for (let t = alignedStart; t <= alignedEnd; t += bucketMs) {
      const bucket = group.buckets.get(t)
      if (bucket && bucket.count > 0) {
        data.push({
          timestamp: new Date(t).toISOString(),
          value: Math.round((bucket.sum / bucket.count) * 100) / 100,
        })
      } else {
        data.push({
          timestamp: new Date(t).toISOString(),
          value: NaN,
        })
      }
    }

    if (data.length > maxPoints) {
      const downsampled = downsampleLTTB(data, maxPoints)
      series.push({
        metricType: group.metricType as MetricSeries['metricType'],
        serviceName: group.serviceName,
        nodeId: group.nodeId,
        data: downsampled,
      })
    } else {
      series.push({
        metricType: group.metricType as MetricSeries['metricType'],
        serviceName: group.serviceName,
        nodeId: group.nodeId,
        data,
      })
    }
  }

  return series
}

function downsampleLTTB(data: MetricDataPoint[], targetPoints: number): MetricDataPoint[] {
  if (data.length <= targetPoints) return data
  if (targetPoints <= 2) return [data[0], data[data.length - 1]]

  const sampled: MetricDataPoint[] = [data[0]]
  const bucketSize = (data.length - 2) / (targetPoints - 2)

  for (let i = 0; i < targetPoints - 2; i++) {
    const avgRangeStart = Math.floor((i + 1) * bucketSize) + 1
    const avgRangeEnd = Math.floor((i + 2) * bucketSize) + 1
    const avgRange = Math.max(avgRangeEnd - avgRangeStart, 1)

    let avgX = 0
    let avgY = 0
    for (let j = avgRangeStart; j < avgRangeEnd && j < data.length - 1; j++) {
      if (!isNaN(data[j].value)) {
        avgX += j
        avgY += data[j].value
      }
    }
    avgX /= avgRange
    avgY /= avgRange

    const rangeStart = Math.floor(i * bucketSize) + 1
    const rangeEnd = Math.floor((i + 1) * bucketSize) + 1

    let pointA = sampled[sampled.length - 1]
    let aIdx = Math.floor(i * bucketSize) + 1
    while (aIdx < rangeEnd && isNaN(pointA.value)) {
      pointA = data[aIdx]
      aIdx++
    }

    if (isNaN(pointA.value) || isNaN(avgY)) {
      const midIdx = Math.floor((rangeStart + rangeEnd) / 2)
      sampled.push(data[midIdx] || data[rangeStart])
      continue
    }

    let maxArea = -1
    let maxAreaPoint: MetricDataPoint = data[rangeStart]

    for (let j = rangeStart; j < rangeEnd && j < data.length - 1; j++) {
      const point = data[j]
      if (isNaN(point.value)) continue

      const area = Math.abs(
        (aIdx - avgX) * (point.value - pointA.value) -
        (aIdx - j) * (avgY - pointA.value)
      ) * 0.5

      if (area > maxArea) {
        maxArea = area
        maxAreaPoint = point
      }
    }

    sampled.push(maxAreaPoint)
  }

  sampled.push(data[data.length - 1])
  return sampled
}
