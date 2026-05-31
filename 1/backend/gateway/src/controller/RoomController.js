import roomService from '../service/RoomService.js'

class RoomController {
  async getRoomList(ctx) {
    const query = ctx.validatedQuery
    const traceLogger = ctx.traceLogger

    const result = await roomService.getRoomList(query, traceLogger)

    ctx.body = {
      code: 200,
      message: 'success',
      data: result,
      traceId: traceLogger.traceId,
      timestamp: Date.now()
    }
  }

  async getRoomDetail(ctx) {
    const { id } = ctx.validatedParams
    const traceLogger = ctx.traceLogger

    const result = await roomService.getRoomDetail(id, traceLogger)

    ctx.status = result.code || 200
    ctx.body = {
      code: result.code || 200,
      message: result.message || 'success',
      data: result.data || null,
      traceId: traceLogger.traceId,
      timestamp: Date.now()
    }
  }

  async getRoomNodes(ctx) {
    const { id } = ctx.validatedParams
    const traceLogger = ctx.traceLogger

    const result = await roomService.getRoomNodes(id, traceLogger)

    ctx.body = {
      code: 200,
      message: 'success',
      data: result.data,
      traceId: traceLogger.traceId,
      timestamp: Date.now()
    }
  }

  async getRoomStats(ctx) {
    const traceLogger = ctx.traceLogger

    const result = await roomService.getRoomStats(traceLogger)

    ctx.body = {
      code: 200,
      message: 'success',
      data: result.data,
      traceId: traceLogger.traceId,
      timestamp: Date.now()
    }
  }

  async getRoomTree(ctx) {
    const traceLogger = ctx.traceLogger

    const result = await roomService.getRoomTree(traceLogger)

    ctx.body = {
      code: 200,
      message: 'success',
      data: result.data,
      traceId: traceLogger.traceId,
      timestamp: Date.now()
    }
  }

  async batchControlNodes(ctx) {
    const { id } = ctx.validatedParams
    const { action } = ctx.request.body
    const traceLogger = ctx.traceLogger

    const result = await roomService.batchControlNodes(id, action, traceLogger)

    ctx.body = {
      code: 200,
      message: 'success',
      data: result.data,
      traceId: traceLogger.traceId,
      timestamp: Date.now()
    }
  }

  async getRegions(ctx) {
    const traceLogger = ctx.traceLogger

    const result = await roomService.getRegions(traceLogger)

    ctx.body = {
      code: 200,
      message: 'success',
      data: result.data,
      traceId: traceLogger.traceId,
      timestamp: Date.now()
    }
  }
}

export default new RoomController()
