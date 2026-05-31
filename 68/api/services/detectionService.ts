import { isDBConnected } from '../db.js'
import { preprocessImage } from './preprocessService.js'
import { runInference } from './inferenceService.js'
import { classifyRegions } from './classifyService.js'
import type { Detection as IDetection, DetectionListItem, DetectionListResponse, Severity } from '../../shared/types.js'
import Detection from '../models/Detection.js'
import FaultRegion from '../models/FaultRegion.js'
import FaultClassification from '../models/FaultClassification.js'
import mongoose from 'mongoose'

const mockStore: Map<string, IDetection> = new Map()

interface QueryCacheEntry {
  value: DetectionListResponse
  timestamp: number
}

const queryCache = new Map<string, QueryCacheEntry>()
const QUERY_CACHE_TTL = 30 * 1000

function generateListCacheKey(page: number, pageSize: number, status?: string, faultType?: string, startDate?: string, endDate?: string): string {
  return `list:${page}:${pageSize}:${status || ''}:${faultType || ''}:${startDate || ''}:${endDate || ''}`
}

function getCachedQuery(key: string): DetectionListResponse | null {
  const entry = queryCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > QUERY_CACHE_TTL) {
    queryCache.delete(key)
    return null
  }
  return entry.value
}

function setCachedQuery(key: string, value: DetectionListResponse): void {
  queryCache.set(key, { value, timestamp: Date.now() })
}

export async function ensureIndexes(): Promise<void> {
  if (!isDBConnected()) return

  try {
    await Detection.collection.createIndex({ status: 1, createdAt: -1 })
    await Detection.collection.createIndex({ createdAt: -1 })
    await Detection.collection.createIndex({ _id: 1, createdAt: -1 })
    await FaultRegion.collection.createIndex({ detectionId: 1, _id: -1 })
    await FaultClassification.collection.createIndex({ detectionId: 1, _id: -1 })
    await FaultClassification.collection.createIndex({ regionId: 1 })
  } catch (error) {
  }
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function createInitialDetection(filename: string, originalUrl: string): IDetection {
  const id = generateId()
  const now = new Date().toISOString()
  return {
    id,
    filename,
    originalUrl,
    processedUrl: originalUrl,
    status: 'processing',
    preprocessing: {
      denoised: false,
      enhanced: false,
      normalized: false,
      contrastRatio: 0,
      enhancementFactor: 1,
      noiseLevel: 0,
      dynamicRange: 0,
      isLowContrast: false,
      multiScaleEnhanced: false,
      claheApplied: false,
      bilateralFiltered: false,
      edgeDetected: false,
      clipLimit: 0,
      tileGridSize: 0,
      enhancementLevels: { low: 0, medium: 0, high: 0 },
      edgeStrength: 0,
      processingTimeMs: 0,
    },
    regions: [],
    classifications: [],
    createdAt: now,
    updatedAt: now,
  }
}

export async function createDetection(filename: string, originalUrl: string): Promise<IDetection> {
  if (!isDBConnected()) {
    return createMockDetectionPipeline(filename, originalUrl)
  }

  const detection = await Detection.create({
    filename,
    originalUrl,
    processedUrl: originalUrl,
    status: 'processing',
  })

  try {
    const preprocessResult = await preprocessImage(originalUrl)
    detection.preprocessing = preprocessResult
    detection.processedUrl = originalUrl
    await detection.save()

    const inferenceResult = await runInference(String(detection._id), preprocessResult)
    const inferenceRegions = inferenceResult.regions

    const regionDocs = await FaultRegion.insertMany(
      inferenceRegions.map((r) => ({
        detectionId: detection._id,
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        confidence: r.confidence,
        isManual: false,
      }))
    )

    const classifyResults = await classifyRegions(inferenceRegions)

    const classificationDocs = await FaultClassification.insertMany(
      classifyResults.map((c, i) => ({
        regionId: regionDocs[i]._id,
        detectionId: detection._id,
        faultType: c.faultType,
        severity: c.severity,
        confidence: c.confidence,
        description: c.description,
        suggestion: c.suggestion,
        isManual: false,
        notes: '',
      }))
    )

    detection.status = 'completed'
    await detection.save()

    queryCache.clear()

    return formatDetection(detection, regionDocs, classificationDocs)
  } catch (error) {
    detection.status = 'failed'
    await detection.save()
    throw error
  }
}

async function createMockDetectionPipeline(filename: string, originalUrl: string): Promise<IDetection> {
  const detection = createInitialDetection(filename, originalUrl)
  mockStore.set(detection.id, detection)

  try {
    const preprocessResult = await preprocessImage(originalUrl)
    detection.preprocessing = preprocessResult
    detection.updatedAt = new Date().toISOString()
    mockStore.set(detection.id, detection)

    const inferenceResult = await runInference(detection.id, preprocessResult)
    const inferenceRegions = inferenceResult.regions

    detection.regions = inferenceRegions.map((r, i) => ({
      id: `${detection.id}-r${i}`,
      detectionId: detection.id,
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      confidence: r.confidence,
      isManual: false,
    }))
    detection.updatedAt = new Date().toISOString()
    mockStore.set(detection.id, detection)

    const classifyResults = await classifyRegions(inferenceRegions)
    detection.classifications = classifyResults.map((c, i) => ({
      id: `${detection.id}-c${i}`,
      regionId: `${detection.id}-r${i}`,
      detectionId: detection.id,
      faultType: c.faultType,
      severity: c.severity,
      confidence: c.confidence,
      description: c.description,
      suggestion: c.suggestion,
      isManual: false,
      notes: '',
    }))

    detection.status = 'completed'
    detection.updatedAt = new Date().toISOString()
    mockStore.set(detection.id, detection)

    return detection
  } catch (error) {
    detection.status = 'failed'
    detection.updatedAt = new Date().toISOString()
    mockStore.set(detection.id, detection)
    throw error
  }
}

function formatDetection(detection: any, regions: any[], classifications: any[]): IDetection {
  return {
    id: String(detection._id),
    filename: detection.filename,
    originalUrl: detection.originalUrl,
    processedUrl: detection.processedUrl || '',
    status: detection.status,
    preprocessing: {
      denoised: detection.preprocessing?.denoised ?? false,
      enhanced: detection.preprocessing?.enhanced ?? false,
      normalized: detection.preprocessing?.normalized ?? false,
      contrastRatio: detection.preprocessing?.contrastRatio ?? 0,
      enhancementFactor: detection.preprocessing?.enhancementFactor ?? 1,
      noiseLevel: detection.preprocessing?.noiseLevel ?? 0,
      dynamicRange: detection.preprocessing?.dynamicRange ?? 0,
      isLowContrast: detection.preprocessing?.isLowContrast ?? false,
      multiScaleEnhanced: detection.preprocessing?.multiScaleEnhanced ?? false,
      claheApplied: detection.preprocessing?.claheApplied ?? false,
      bilateralFiltered: detection.preprocessing?.bilateralFiltered ?? false,
      edgeDetected: detection.preprocessing?.edgeDetected ?? false,
      clipLimit: detection.preprocessing?.clipLimit ?? 0,
      tileGridSize: detection.preprocessing?.tileGridSize ?? 0,
      enhancementLevels: {
        low: detection.preprocessing?.enhancementLevels?.low ?? 0,
        medium: detection.preprocessing?.enhancementLevels?.medium ?? 0,
        high: detection.preprocessing?.enhancementLevels?.high ?? 0,
      },
      edgeStrength: detection.preprocessing?.edgeStrength ?? 0,
      processingTimeMs: detection.preprocessing?.processingTimeMs ?? 0,
    },
    regions: regions.map((r) => ({
      id: String(r._id),
      detectionId: String(r.detectionId),
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      confidence: r.confidence,
      isManual: r.isManual ?? false,
    })),
    classifications: classifications.map((c) => ({
      id: String(c._id),
      regionId: String(c.regionId),
      detectionId: String(c.detectionId),
      faultType: c.faultType,
      severity: c.severity,
      confidence: c.confidence,
      description: c.description,
      suggestion: c.suggestion,
      isManual: c.isManual ?? false,
      notes: c.notes ?? '',
    })),
    createdAt: detection.createdAt.toISOString(),
    updatedAt: detection.updatedAt.toISOString(),
  }
}

export async function getDetectionById(id: string): Promise<IDetection | null> {
  if (!isDBConnected()) {
    return mockStore.get(id) || null
  }

  const results = await Detection.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(id) } },
    {
      $lookup: {
        from: 'faultregions',
        localField: '_id',
        foreignField: 'detectionId',
        as: 'regions',
      },
    },
    {
      $lookup: {
        from: 'faultclassifications',
        localField: '_id',
        foreignField: 'detectionId',
        as: 'classifications',
      },
    },
  ])

  if (!results || results.length === 0) return null

  const detection = results[0]
  return formatDetection(detection, detection.regions || [], detection.classifications || [])
}

export async function getDetectionsByIds(ids: string[]): Promise<IDetection[]> {
  if (!isDBConnected()) {
    return ids.map((id) => mockStore.get(id)).filter((d): d is IDetection => d !== undefined)
  }

  const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id))
  const results = await Detection.aggregate([
    { $match: { _id: { $in: objectIds } } },
    {
      $lookup: {
        from: 'faultregions',
        localField: '_id',
        foreignField: 'detectionId',
        as: 'regions',
      },
    },
    {
      $lookup: {
        from: 'faultclassifications',
        localField: '_id',
        foreignField: 'detectionId',
        as: 'classifications',
      },
    },
    { $sort: { createdAt: -1 } },
  ])

  return results.map((d: any) => formatDetection(d, d.regions || [], d.classifications || []))
}

export async function updateDetectionAnnotation(
  detectionId: string,
  regions: Array<{ id?: string; x: number; y: number; width: number; height: number; confidence: number; isManual: boolean }>,
  classifications: Array<{ id?: string; regionId: string; faultType: string; severity: string; confidence: number; description: string; suggestion: string; isManual: boolean; notes: string }>
): Promise<IDetection | null> {
  if (!isDBConnected()) {
    const detection = mockStore.get(detectionId)
    if (!detection) return null

    detection.regions = regions.map((r, i) => ({
      id: r.id || `${detectionId}-r${i}-manual`,
      detectionId,
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      confidence: r.confidence,
      isManual: r.isManual,
    }))
    detection.classifications = classifications.map((c, i) => ({
      id: c.id || `${detectionId}-c${i}-manual`,
      regionId: c.regionId,
      detectionId,
      faultType: c.faultType as any,
      severity: c.severity as any,
      confidence: c.confidence,
      description: c.description,
      suggestion: c.suggestion,
      isManual: c.isManual,
      notes: c.notes,
    }))
    detection.updatedAt = new Date().toISOString()
    mockStore.set(detectionId, detection)
    return detection
  }

  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const detection = await Detection.findById(detectionId).session(session)
    if (!detection) {
      await session.abortTransaction()
      session.endSession()
      return null
    }

    await FaultRegion.deleteMany({ detectionId }).session(session)
    await FaultClassification.deleteMany({ detectionId }).session(session)

    const regionDocs = await FaultRegion.insertMany(
      regions.map((r) => ({
        detectionId,
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        confidence: r.confidence,
        isManual: r.isManual,
      })),
      { session }
    )

    const regionIdMap = new Map<string, mongoose.Types.ObjectId>()
    regionDocs.forEach((doc, index) => {
      const originalId = regions[index].id || String(index)
      regionIdMap.set(originalId, doc._id)
    })

    const classificationDocs = await FaultClassification.insertMany(
      classifications.map((c) => ({
        regionId: regionIdMap.get(c.regionId) || new mongoose.Types.ObjectId(c.regionId),
        detectionId,
        faultType: c.faultType,
        severity: c.severity,
        confidence: c.confidence,
        description: c.description,
        suggestion: c.suggestion,
        isManual: c.isManual,
        notes: c.notes,
      })),
      { session }
    )

    detection.updatedAt = new Date()
    await detection.save({ session })

    await session.commitTransaction()
    session.endSession()

    queryCache.clear()

    return formatDetection(detection, regionDocs, classificationDocs)
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    throw error
  }
}

export async function getDetectionList(
  page: number = 1,
  pageSize: number = 10,
  status?: string,
  faultType?: string,
  startDate?: string,
  endDate?: string
): Promise<DetectionListResponse> {
  const cacheKey = generateListCacheKey(page, pageSize, status, faultType, startDate, endDate)
  const cached = getCachedQuery(cacheKey)
  if (cached) return cached

  if (!isDBConnected()) {
    const allItems = Array.from(mockStore.values())
      .filter((d) => !status || d.status === status)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const items: DetectionListItem[] = allItems.map((d) => {
      const severityOrder: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 }
      let maxSeverity: Severity | '' = ''
      let maxOrder = 0
      for (const c of d.classifications) {
        const order = severityOrder[c.severity] || 0
        if (order > maxOrder) {
          maxOrder = order
          maxSeverity = c.severity as Severity
        }
      }
      return {
        id: d.id,
        filename: d.filename,
        thumbnailUrl: d.originalUrl,
        faultCount: d.regions.length,
        maxSeverity,
        status: d.status as any,
        createdAt: d.createdAt,
      }
    })

    const start = (page - 1) * pageSize
    const result = {
      total: items.length,
      page,
      pageSize,
      items: items.slice(start, start + pageSize),
    }
    setCachedQuery(cacheKey, result)
    return result
  }

  const filter: any = {}
  if (status) filter.status = status
  if (startDate || endDate) {
    filter.createdAt = {}
    if (startDate) filter.createdAt.$gte = new Date(startDate)
    if (endDate) filter.createdAt.$lte = new Date(endDate)
  }

  const projection = {
    _id: 1,
    filename: 1,
    originalUrl: 1,
    status: 1,
    createdAt: 1,
  }

  const total = await Detection.countDocuments(filter)

  const detections = await Detection.find(filter, projection)
    .sort({ createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)

  const detectionIds = detections.map((d) => d._id)

  const aggregationPipeline: any[] = [
    { $match: { detectionId: { $in: detectionIds } } },
  ]

  if (faultType) {
    aggregationPipeline.push({ $match: { faultType } })
  }

  aggregationPipeline.push(
    {
      $group: {
        _id: '$detectionId',
        regions: { $push: '$$ROOT' },
        maxSeverity: { $max: '$severity' },
      },
    }
  )

  const severityResults = await FaultClassification.aggregate(aggregationPipeline)
  const severityOrder: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 }
  const resultMap = new Map<string, { count: number; maxSeverity: Severity | '' }>()

  for (const s of severityResults) {
    const sev = s.maxSeverity
    let maxSeverity: Severity | '' = ''
    if (sev && severityOrder[sev]) {
      maxSeverity = sev as Severity
    }
    resultMap.set(String(s._id), {
      count: s.regions?.length || 0,
      maxSeverity,
    })
  }

  const items: DetectionListItem[] = detections.map((d) => {
    const result = resultMap.get(String(d._id)) || { count: 0, maxSeverity: '' }
    return {
      id: String(d._id),
      filename: d.filename,
      thumbnailUrl: d.originalUrl,
      faultCount: result.count,
      maxSeverity: result.maxSeverity,
      status: d.status,
      createdAt: d.createdAt.toISOString(),
    }
  })

  const result = { total, page, pageSize, items }
  setCachedQuery(cacheKey, result)
  return result
}
