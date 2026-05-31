import BaseRepository from './BaseRepository.js'
import { TraceSpan } from '../models/index.js'
import { v4 as uuidv4 } from 'uuid'

class TraceSpanRepository extends BaseRepository {
  constructor() {
    super(TraceSpan)
  }

  async createSpan(data) {
    const spanId = data.spanId || uuidv4()
    return this.create({
      traceId: data.traceId,
      spanId,
      parentSpanId: data.parentSpanId || null,
      service: data.service,
      operation: data.operation,
      startTime: data.startTime,
      endTime: data.endTime,
      status: data.status,
      errorMessage: data.errorMessage || null,
      nodeId: data.nodeId || null,
      tags: data.tags || null
    })
  }

  async findByTraceId(traceId) {
    return this.findAll({ traceId }, {
      order: [['startTime', 'ASC']]
    })
  }

  async findByService(service) {
    return this.findAll({ service }, {
      order: [['startTime', 'DESC']],
      limit: 100
    })
  }

  async getTraceTimeline(traceId) {
    const spans = await this.findByTraceId(traceId)

    if (!spans || spans.length === 0) {
      return {
        traceId,
        totalTime: 0,
        spans: []
      }
    }

    const minTime = Math.min(...spans.map(s => s.startTime))
    const maxTime = Math.max(...spans.map(s => s.endTime))
    const totalTime = maxTime - minTime

    const spanMap = new Map()
    spans.forEach(s => spanMap.set(s.spanId, s))

    return {
      traceId,
      totalTime,
      spans: spans.map(s => ({
        spanId: s.spanId,
        parentSpanId: s.parentSpanId || null,
        service: s.service,
        operation: s.operation,
        name: s.operation,
        duration: s.endTime - s.startTime,
        startTime: s.startTime,
        endTime: s.endTime,
        startTimeStr: new Date(s.startTime).toISOString(),
        endTimeStr: new Date(s.endTime).toISOString(),
        status: s.status,
        errorMessage: s.errorMessage || null,
        nodeId: s.nodeId || null,
        tags: s.tags
      }))
    }
  }

  async batchCreate(spans) {
    if (!spans || spans.length === 0) return []
    return this.bulkCreate(
      spans.map(s => ({
        traceId: s.traceId,
        spanId: s.spanId || uuidv4(),
        parentSpanId: s.parentSpanId || null,
        service: s.service,
        operation: s.operation,
        startTime: s.startTime,
        endTime: s.endTime,
        status: s.status,
        errorMessage: s.errorMessage || null,
        nodeId: s.nodeId || null,
        tags: s.tags || null
      }))
    )
  }
}

export default new TraceSpanRepository()
