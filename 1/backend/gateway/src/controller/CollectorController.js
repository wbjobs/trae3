import collectorService from '../service/CollectorService.js'

class CollectorController {
  async getStatus(ctx) {
    const traceLogger = ctx.traceLogger

    const result = await collectorService.getStatus(traceLogger)

    ctx.status = result.code || 200
    ctx.body = {
      code: result.code || 200,
      message: result.message || 'success',
      data: result.data || null,
      traceId: traceLogger.traceId,
      timestamp: Date.now()
    }
  }

  async manualCollect(ctx) {
    const { id } = ctx.validatedParams
    const traceLogger = ctx.traceLogger

    const result = await collectorService.manualCollect(id, traceLogger)

    ctx.status = result.code || 200
    ctx.body = {
      code: result.code || 200,
      message: result.message || 'success',
      data: result.data || null,
      traceId: traceLogger.traceId,
      timestamp: Date.now()
    }
  }

  async collectAll(ctx) {
    const traceLogger = ctx.traceLogger

    const result = await collectorService.collectAll(traceLogger)

    ctx.status = result.code || 200
    ctx.body = {
      code: result.code || 200,
      message: result.message || 'success',
      data: result.data || null,
      traceId: traceLogger.traceId,
      timestamp: Date.now()
    }
  }

  async startCollector(ctx) {
    const traceLogger = ctx.traceLogger

    const result = await collectorService.startCollector(traceLogger)

    ctx.status = result.code || 200
    ctx.body = {
      code: result.code || 200,
      message: result.message || 'success',
      data: result.data || null,
      traceId: traceLogger.traceId,
      timestamp: Date.now()
    }
  }

  async stopCollector(ctx) {
    const traceLogger = ctx.traceLogger

    const result = await collectorService.stopCollector(traceLogger)

    ctx.status = result.code || 200
    ctx.body = {
      code: result.code || 200,
      message: result.message || 'success',
      data: result.data || null,
      traceId: traceLogger.traceId,
      timestamp: Date.now()
    }
  }
}

export default new CollectorController()
