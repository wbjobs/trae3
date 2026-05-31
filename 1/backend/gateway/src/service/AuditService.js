import {
  AuditLogRepository,
  TraceSpanRepository
} from 'persistence'

class AuditService {
  async getAuditLogs(query, traceLogger) {
    traceLogger.debug('获取审计日志', { query })

    try {
      const result = await AuditLogRepository.search(query)

      const list = (result.rows || []).map(log => {
        const item = log.toJSON ? log.toJSON() : log
        return {
          id: item.id,
          traceId: item.traceId,
          operator: item.username,
          action: item.action,
          content: item.content || item.action,
          ip: item.ip,
          status: item.result === 'success' ? 'success' : 'failed',
          duration: item.duration || null,
          userAgent: item.userAgent || null,
          requestParams: item.params || null,
          responseData: null,
          errorMessage: item.errorMessage || null,
          nodeId: item.nodeId || null,
          roomId: item.roomId || null,
          createdAt: item.createdAt
        }
      })

      return {
        list,
        total: result.count || 0,
        page: query.page || 1,
        pageSize: query.pageSize || 20
      }
    } catch (error) {
      traceLogger.error('获取审计日志失败', { error: error.message })
      return {
        list: [],
        total: 0,
        page: query.page || 1,
        pageSize: query.pageSize || 20
      }
    }
  }

  async getTraceDetail(traceId, traceLogger) {
    traceLogger.debug('获取追踪详情', { traceId })

    try {
      const timeline = await TraceSpanRepository.getTraceTimeline(traceId)
      const auditLog = await AuditLogRepository.findByTraceId(traceId)

      if (!timeline.spans.length && !auditLog) {
        return {
          success: false,
          code: 404,
          message: '追踪记录不存在'
        }
      }

      const spans = timeline.spans.map(span => ({
        spanId: span.spanId,
        parentSpanId: span.parentSpanId || null,
        service: span.service,
        name: span.operation,
        operation: span.operation,
        startTime: span.startTimeStr || new Date(span.startTime).toISOString(),
        endTime: span.endTimeStr || new Date(span.endTime).toISOString(),
        duration: span.duration,
        status: span.status,
        errorMessage: span.errorMessage || null,
        tags: span.tags || null
      }))

      return {
        success: true,
        data: spans
      }
    } catch (error) {
      traceLogger.error('获取追踪详情失败', { traceId, error: error.message })
      return {
        success: true,
        data: []
      }
    }
  }

  async getAuditStats(days, traceLogger) {
    traceLogger.debug('获取审计统计', { days })

    try {
      const todayStats = await AuditLogRepository.getTodayStats()
      return {
        success: true,
        data: todayStats
      }
    } catch (error) {
      traceLogger.error('获取审计统计失败', { error: error.message })
      return {
        success: true,
        data: {
          todayTotal: 0,
          todaySuccess: 0,
          todayFailed: 0,
          totalTraces: 0
        }
      }
    }
  }

  async getModuleStats(traceLogger) {
    traceLogger.debug('获取模块统计')

    try {
      const stats = await AuditLogRepository.getStats(7)
      return {
        success: true,
        data: stats
      }
    } catch (error) {
      traceLogger.error('获取模块统计失败', { error: error.message })
      return {
        success: true,
        data: []
      }
    }
  }

  async getUserStats(userId, traceLogger) {
    traceLogger.debug('获取用户操作统计', { userId })

    try {
      const sql = `
        SELECT
          DATE(createdAt) as date,
          module,
          COUNT(*) as count
        FROM audit_log
        WHERE userId = ? AND createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY DATE(createdAt), module
        ORDER BY date DESC
      `

      const result = await AuditLogRepository.query(sql, [userId])

      return {
        success: true,
        data: result
      }
    } catch (error) {
      traceLogger.error('获取用户统计失败', { error: error.message })
      return {
        success: true,
        data: []
      }
    }
  }

  async exportLogs(query, traceLogger) {
    traceLogger.info('导出审计日志', { query })

    try {
      const result = await AuditLogRepository.search({
        ...query,
        pageSize: 10000
      })

      return {
        success: true,
        data: result.rows || []
      }
    } catch (error) {
      traceLogger.error('导出审计日志失败', { error: error.message })
      return {
        success: true,
        data: []
      }
    }
  }
}

export default new AuditService()
