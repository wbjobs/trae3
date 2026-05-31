import auditService from '../service/AuditService.js'

class AuditController {
  async getAuditLogs(ctx) {
    const query = ctx.validatedQuery
    const traceLogger = ctx.traceLogger

    const result = await auditService.getAuditLogs(query, traceLogger)

    ctx.body = {
      code: 200,
      message: 'success',
      data: result,
      traceId: traceLogger.traceId,
      timestamp: Date.now()
    }
  }

  async getTraceDetail(ctx) {
    const { traceId } = ctx.validatedParams
    const traceLogger = ctx.traceLogger

    const result = await auditService.getTraceDetail(traceId, traceLogger)

    ctx.status = result.code || 200
    ctx.body = {
      code: result.code || 200,
      message: result.message || 'success',
      data: result.data || null,
      traceId: traceLogger.traceId,
      timestamp: Date.now()
    }
  }

  async getAuditStats(ctx) {
    const { days = 7 } = ctx.query
    const traceLogger = ctx.traceLogger

    const result = await auditService.getAuditStats(days, traceLogger)

    ctx.body = {
      code: 200,
      message: 'success',
      data: result.data,
      traceId: traceLogger.traceId,
      timestamp: Date.now()
    }
  }

  async getModuleStats(ctx) {
    const traceLogger = ctx.traceLogger

    const result = await auditService.getModuleStats(traceLogger)

    ctx.body = {
      code: 200,
      message: 'success',
      data: result.data,
      traceId: traceLogger.traceId,
      timestamp: Date.now()
    }
  }

  async getUserStats(ctx) {
    const userId = ctx.state.user.id
    const traceLogger = ctx.traceLogger

    const result = await auditService.getUserStats(userId, traceLogger)

    ctx.body = {
      code: 200,
      message: 'success',
      data: result.data,
      traceId: traceLogger.traceId,
      timestamp: Date.now()
    }
  }

  async exportLogs(ctx) {
    const query = ctx.validatedQuery
    const traceLogger = ctx.traceLogger

    const result = await auditService.exportLogs(query, traceLogger)

    ctx.body = {
      code: 200,
      message: 'success',
      data: result.data,
      traceId: traceLogger.traceId,
      timestamp: Date.now()
    }
  }
}

export default new AuditController()
