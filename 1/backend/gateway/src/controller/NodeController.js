import nodeService from '../service/NodeService.js'

class NodeController {
  async getNodeList(ctx) {
    const query = ctx.validatedQuery
    const traceLogger = ctx.traceLogger

    const result = await nodeService.getNodeList(query, traceLogger)

    ctx.body = {
      code: 200,
      message: 'success',
      data: result,
      traceId: traceLogger.traceId,
      timestamp: Date.now()
    }
  }

  async getNodeDetail(ctx) {
    const { id } = ctx.validatedParams
    const traceLogger = ctx.traceLogger

    const result = await nodeService.getNodeDetail(id, traceLogger)

    ctx.status = result.code || 200
    ctx.body = {
      code: result.code || 200,
      message: result.message || 'success',
      data: result.data || null,
      traceId: traceLogger.traceId,
      timestamp: Date.now()
    }
  }

  async getNodeTree(ctx) {
    const traceLogger = ctx.traceLogger

    const result = await nodeService.getNodeTree(traceLogger)

    ctx.body = {
      code: 200,
      message: 'success',
      data: result.data,
      traceId: traceLogger.traceId,
      timestamp: Date.now()
    }
  }

  async getNodeMetrics(ctx) {
    const query = ctx.validatedQuery
    const traceLogger = ctx.traceLogger

    const result = await nodeService.getNodeMetrics(query, traceLogger)

    /* 缓存友好提示 header */
    if (result.headers) {
      for (const [key, value] of Object.entries(result.headers)) {
        ctx.set(key, value)
      }
    }

    ctx.body = {
      code: 200,
      message: 'success',
      data: result.data,
      traceId: traceLogger.traceId,
      timestamp: Date.now()
    }
  }

  async getNodeStats(ctx) {
    const traceLogger = ctx.traceLogger

    const result = await nodeService.getNodeStats(traceLogger)

    ctx.body = {
      code: 200,
      message: 'success',
      data: result.data,
      traceId: traceLogger.traceId,
      timestamp: Date.now()
    }
  }

  async controlNode(ctx) {
    const { id } = ctx.validatedParams
    const { action } = ctx.request.body
    const traceLogger = ctx.traceLogger

    const result = await nodeService.controlNode(id, action, traceLogger)

    ctx.status = result.code || 200
    ctx.body = {
      code: result.code || 200,
      message: result.message,
      data: result.data || null,
      traceId: traceLogger.traceId,
      timestamp: Date.now()
    }
  }

  async getNodeLatestMetric(ctx) {
    const { id } = ctx.validatedParams
    const traceLogger = ctx.traceLogger

    const result = await nodeService.getNodeLatestMetric(id, traceLogger)

    ctx.body = {
      code: 200,
      message: 'success',
      data: result.data,
      traceId: traceLogger.traceId,
      timestamp: Date.now()
    }
  }
}

export default new NodeController()
