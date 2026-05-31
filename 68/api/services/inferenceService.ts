import type { PreprocessResult } from './preprocessService.js'
import { createHash } from 'crypto'

export interface InferenceRegion {
  x: number
  y: number
  width: number
  height: number
  confidence: number
}

export interface InferenceMetadata {
  inferenceTimeMs: number
  quantizedMode: boolean
  nmsRemovedCount: number
  cacheHit: boolean
  earlyExit: boolean
}

export interface InferenceResult {
  regions: InferenceRegion[]
  metadata: InferenceMetadata
}

interface LRUCacheEntry {
  value: InferenceRegion[]
  timestamp: number
}

class LRUCache {
  private cache: Map<string, LRUCacheEntry> = new Map()
  private maxSize = 100
  private ttl = 5 * 60 * 1000

  get(key: string): InferenceRegion[] | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key)
      return null
    }
    this.cache.delete(key)
    this.cache.set(key, entry)
    return entry.value
  }

  set(key: string, value: InferenceRegion[]): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) this.cache.delete(firstKey)
    }
    this.cache.set(key, { value, timestamp: Date.now() })
  }
}

const lruCache = new LRUCache()

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

function generateRegion(): InferenceRegion {
  const x = clamp(Math.round(Math.random() * 55 + 5), 2, 80)
  const y = clamp(Math.round(Math.random() * 50 + 5), 2, 75)
  const width = clamp(Math.round(Math.random() * 25 + 8), 5, 40)
  const height = clamp(Math.round(Math.random() * 20 + 6), 5, 35)

  if (x + width > 95) {
    return { x: clamp(x, 2, 60), y, width: clamp(95 - x, 5, 35), height, confidence: 0 }
  }
  if (y + height > 95) {
    return { x, y: clamp(y, 2, 55), width, height: clamp(95 - y, 5, 30), confidence: 0 }
  }

  return { x, y, width, height, confidence: 0 }
}

function calculateIoU(a: InferenceRegion, b: InferenceRegion): number {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)

  if (x2 <= x1 || y2 <= y1) return 0

  const intersection = (x2 - x1) * (y2 - y1)
  const areaA = a.width * a.height
  const areaB = b.width * b.height
  const union = areaA + areaB - intersection

  return intersection / union
}

function applyNMS(regions: InferenceRegion[], iouThreshold: number = 0.5): { filtered: InferenceRegion[], removed: number } {
  if (regions.length === 0) return { filtered: [], removed: 0 }

  const sorted = [...regions].sort((a, b) => b.confidence - a.confidence)
  const kept: InferenceRegion[] = []
  let removedCount = 0

  for (const region of sorted) {
    let shouldKeep = true
    for (const keptRegion of kept) {
      if (calculateIoU(region, keptRegion) > iouThreshold) {
        shouldKeep = false
        removedCount++
        break
      }
    }
    if (shouldKeep) {
      kept.push(region)
    }
  }

  return { filtered: kept, removed: removedCount }
}

function clusterRegions(regions: InferenceRegion[]): InferenceRegion[] {
  if (regions.length <= 1) return regions

  const proximityThreshold = 5
  const clustered: InferenceRegion[] = []
  const used = new Set<number>()

  for (let i = 0; i < regions.length; i++) {
    if (used.has(i)) continue

    const current = regions[i]
    const toMerge = [current]
    used.add(i)

    for (let j = i + 1; j < regions.length; j++) {
      if (used.has(j)) continue

      const other = regions[j]
      const dx = Math.abs(current.x + current.width / 2 - other.x - other.width / 2)
      const dy = Math.abs(current.y + current.height / 2 - other.y - other.height / 2)

      if (dx < proximityThreshold && dy < proximityThreshold) {
        toMerge.push(other)
        used.add(j)
      }
    }

    if (toMerge.length > 1) {
      const x = Math.min(...toMerge.map(r => r.x))
      const y = Math.min(...toMerge.map(r => r.y))
      const maxX = Math.max(...toMerge.map(r => r.x + r.width))
      const maxY = Math.max(...toMerge.map(r => r.y + r.height))
      clustered.push({
        x,
        y,
        width: maxX - x,
        height: maxY - y,
        confidence: Math.max(...toMerge.map(r => r.confidence)),
      })
    } else {
      clustered.push(current)
    }
  }

  return clustered
}

function generateHash(detectionId: string, preprocessResult?: PreprocessResult): string {
  const data = detectionId + JSON.stringify(preprocessResult || {})
  return createHash('md5').update(data).digest('hex')
}

function checkEarlyExit(preprocessResult?: PreprocessResult): boolean {
  if (!preprocessResult) return false
  return !preprocessResult.isLowContrast && preprocessResult.contrastRatio > 3.5
}

export function runInference(
  detectionId: string,
  preprocessResult?: PreprocessResult
): Promise<InferenceResult> {
  return new Promise((resolve) => {
    const startTime = Date.now()
    const quantizedMode = true
    const cacheKey = generateHash(detectionId, preprocessResult)

    const cached = lruCache.get(cacheKey)
    if (cached) {
      resolve({
        regions: cached,
        metadata: {
          inferenceTimeMs: Date.now() - startTime,
          quantizedMode,
          nmsRemovedCount: 0,
          cacheHit: true,
          earlyExit: false,
        },
      })
      return
    }

    const shouldEarlyExit = checkEarlyExit(preprocessResult)

    const baseDelay = quantizedMode ? 90 : 150
    setTimeout(() => {
      if (shouldEarlyExit) {
        const earlyRegions: InferenceRegion[] = []
        lruCache.set(cacheKey, earlyRegions)
        resolve({
          regions: earlyRegions,
          metadata: {
            inferenceTimeMs: Date.now() - startTime,
            quantizedMode,
            nmsRemovedCount: 0,
            cacheHit: false,
            earlyExit: true,
          },
        })
        return
      }

      const isLowContrast = preprocessResult?.isLowContrast ?? false
      const enhancementFactor = preprocessResult?.enhancementFactor ?? 1.0

      let count: number
      if (isLowContrast) {
        count = Math.floor(Math.random() * 3) + 2
      } else {
        count = Math.floor(Math.random() * 4) + 1
      }

      const regions: InferenceRegion[] = []
      for (let i = 0; i < count; i++) {
        const region = generateRegion()
        const baseConfidence = isLowContrast
          ? Math.random() * 0.25 + 0.55
          : Math.random() * 0.3 + 0.7
        region.confidence = Math.round(Math.min(baseConfidence * enhancementFactor, 0.99) * 100) / 100
        regions.push(region)
      }

      const { filtered: nmsFiltered, removed: nmsRemovedCount } = applyNMS(regions, 0.5)
      const clusteredRegions = clusterRegions(nmsFiltered)

      lruCache.set(cacheKey, clusteredRegions)

      resolve({
        regions: clusteredRegions,
        metadata: {
          inferenceTimeMs: Date.now() - startTime,
          quantizedMode,
          nmsRemovedCount,
          cacheHit: false,
          earlyExit: false,
        },
      })
    }, baseDelay)
  })
}
