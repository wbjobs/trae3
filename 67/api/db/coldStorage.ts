import type { MetricType, DataTier, TierStats, DataArchiveInfo, MetricDataPoint } from '../../shared/types.js'

interface ColdPoint {
  timestampMs: number
  value: number
  metricType: MetricType
  serviceName: string
  nodeId: string
}

interface CompressedBlob {
  baseValues: Map<string, number>
  deltaEncoded: number[]
  timestampDeltas: number[]
  sizeBytes: number
}

interface ArchiveBlob {
  archiveId: string
  startTime: string
  endTime: string
  pointCount: number
  sizeBytes: number
  tier: DataTier
  createdAt: string
  data: CompressedBlob
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

class ColdStorage {
  private coldData: Map<string, ColdPoint[]> = new Map()
  private archives: Map<string, ArchiveBlob> = new Map()

  getTierStats(): TierStats[] {
    const now = Date.now()
    const coldPoints: ColdPoint[] = []
    for (const points of this.coldData.values()) {
      coldPoints.push(...points)
    }

    const coldStats: TierStats = {
      tier: 'cold',
      pointCount: coldPoints.length,
      timeRange: coldPoints.length > 0 ? {
        start: new Date(Math.min(...coldPoints.map(p => p.timestampMs))).toISOString(),
        end: new Date(Math.max(...coldPoints.map(p => p.timestampMs))).toISOString(),
      } : null,
    }

    const archivePoints = Array.from(this.archives.values())
    const archiveStats: TierStats = {
      tier: 'archive',
      pointCount: archivePoints.reduce((sum, a) => sum + a.pointCount, 0),
      timeRange: archivePoints.length > 0 ? {
        start: archivePoints[0].startTime,
        end: archivePoints[archivePoints.length - 1].endTime,
      } : null,
    }

    return [coldStats, archiveStats]
  }

  private getSeriesKey(metricType: MetricType, serviceName: string, nodeId: string): string {
    return `${metricType}:${serviceName}:${nodeId}`
  }

  private compress(points: ColdPoint[]): CompressedBlob {
    const baseValues = new Map<string, number>()
    const deltaEncoded: number[] = []
    const timestampDeltas: number[] = []

    let prevValue = 0
    let prevTs = 0

    for (let i = 0; i < points.length; i++) {
      const p = points[i]
      const key = this.getSeriesKey(p.metricType, p.serviceName, p.nodeId)
      
      if (!baseValues.has(key)) {
        baseValues.set(key, p.value)
        prevValue = p.value
        prevTs = p.timestampMs
        deltaEncoded.push(0)
        timestampDeltas.push(0)
      } else {
        deltaEncoded.push(p.value - prevValue)
        timestampDeltas.push(p.timestampMs - prevTs)
        prevValue = p.value
        prevTs = p.timestampMs
      }
    }

    const sizeBytes = (deltaEncoded.length + timestampDeltas.length) * 8 + baseValues.size * 16

    return { baseValues, deltaEncoded, timestampDeltas, sizeBytes }
  }

  private decompress(blob: CompressedBlob, keys: string[]): ColdPoint[] {
    const points: ColdPoint[] = []
    let value = 0
    let ts = 0

    for (let i = 0; i < blob.deltaEncoded.length; i++) {
      value += blob.deltaEncoded[i]
      ts += blob.timestampDeltas[i]
      
      const keyIdx = i % keys.length
      const [metricType, serviceName, nodeId] = keys[keyIdx].split(':')
      
      points.push({
        timestampMs: ts,
        value,
        metricType: metricType as MetricType,
        serviceName,
        nodeId,
      })
    }

    return points
  }

  moveToCold(points: ColdPoint[]): number {
    const now = Date.now()
    const cutoff = now - TWENTY_FOUR_HOURS_MS
    const toMove = points.filter(p => p.timestampMs <= cutoff)

    for (const p of toMove) {
      const key = this.getSeriesKey(p.metricType, p.serviceName, p.nodeId)
      if (!this.coldData.has(key)) {
        this.coldData.set(key, [])
      }
      this.coldData.get(key)!.push(p)
    }

    return toMove.length
  }

  moveToArchive(): number {
    const now = Date.now()
    const cutoff = now - SEVEN_DAYS_MS
    let archivedCount = 0

    const allColdPoints: ColdPoint[] = []
    for (const points of this.coldData.values()) {
      allColdPoints.push(...points.filter(p => p.timestampMs <= cutoff))
    }

    if (allColdPoints.length > 0) {
      const compressed = this.compress(allColdPoints)
      const archiveId = `archive-${Date.now()}`
      const archive: ArchiveBlob = {
        archiveId,
        startTime: new Date(Math.min(...allColdPoints.map(p => p.timestampMs))).toISOString(),
        endTime: new Date(Math.max(...allColdPoints.map(p => p.timestampMs))).toISOString(),
        pointCount: allColdPoints.length,
        sizeBytes: compressed.sizeBytes,
        tier: 'archive',
        createdAt: new Date().toISOString(),
        data: compressed,
      }

      this.archives.set(archiveId, archive)

      for (const [key, points] of this.coldData.entries()) {
        const remaining = points.filter(p => p.timestampMs > cutoff)
        if (remaining.length > 0) {
          this.coldData.set(key, remaining)
        } else {
          this.coldData.delete(key)
        }
      }

      archivedCount = allColdPoints.length
    }

    return archivedCount
  }

  queryCold(filters: {
    metricTypes: MetricType[]
    serviceNames?: string[]
    nodeIds?: string[]
    startTime: string
    endTime: string
  }): MetricDataPoint[] {
    const startMs = new Date(filters.startTime).getTime()
    const endMs = new Date(filters.endTime).getTime()
    const metricTypesSet = new Set(filters.metricTypes)
    const serviceNamesSet = filters.serviceNames?.length ? new Set(filters.serviceNames) : null
    const nodeIdsSet = filters.nodeIds?.length ? new Set(filters.nodeIds) : null

    const results: MetricDataPoint[] = []

    for (const [key, points] of this.coldData.entries()) {
      const [metricType, serviceName, nodeId] = key.split(':')
      if (!metricTypesSet.has(metricType as MetricType)) continue
      if (serviceNamesSet && !serviceNamesSet.has(serviceName)) continue
      if (nodeIdsSet && !nodeIdsSet.has(nodeId)) continue

      for (const p of points) {
        if (p.timestampMs >= startMs && p.timestampMs <= endMs) {
          results.push({
            timestamp: new Date(p.timestampMs).toISOString(),
            value: p.value,
          })
        }
      }
    }

    return results
  }

  restoreFromArchive(archiveId: string): boolean {
    const archive = this.archives.get(archiveId)
    if (!archive) return false

    const keys = Array.from(archive.data.baseValues.keys())
    const points = this.decompress(archive.data, keys)

    for (const p of points) {
      const key = this.getSeriesKey(p.metricType, p.serviceName, p.nodeId)
      if (!this.coldData.has(key)) {
        this.coldData.set(key, [])
      }
      this.coldData.get(key)!.push(p)
    }

    this.archives.delete(archiveId)
    return true
  }

  getArchives(): DataArchiveInfo[] {
    return Array.from(this.archives.values()).map(a => ({
      archiveId: a.archiveId,
      startTime: a.startTime,
      endTime: a.endTime,
      pointCount: a.pointCount,
      sizeBytes: a.sizeBytes,
      tier: a.tier,
      createdAt: a.createdAt,
    }))
  }

  estimateSizeBytes(points: { value: number }[]): number {
    return points.length * 8
  }
}

export const coldStorage = new ColdStorage()
