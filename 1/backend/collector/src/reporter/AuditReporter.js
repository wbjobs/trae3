import { AuditLogRepository, TraceSpanRepository } from 'persistence'

class AuditReporter {
  constructor() {
    this.systemUserId = 'u_collector'
    this.systemUsername = 'collector_service'
  }

  async reportCollection(node, result, spans, traceLogger) {
    const traceId = traceLogger.traceId
    const span = traceLogger.createSpan('report_audit_log')

    try {
      traceLogger.debug(`上报采集审计日志: ${node.name}`)

      const auditLog = await AuditLogRepository.createLog({
        traceId,
        userId: this.systemUserId,
        username: this.systemUsername,
        action: 'collect_node_data',
        content: `采集节点 ${node.name} (${node.ip}) 数据`,
        module: 'collector',
        ip: '127.0.0.1',
        params: {
          nodeId: node.id,
          nodeName: node.name,
          nodeIp: node.ip
        },
        result: result.error ? 'failed' : 'success',
        duration: result.metrics ? Date.now() - (spans[0]?.startTime || Date.now()) : null,
        errorMessage: result.error || null,
        nodeId: node.id,
        roomId: node.roomId || null
      })

      const traceSpans = spans.map(s => ({
        traceId,
        spanId: s.spanId,
        parentSpanId: s.parentSpanId || traceId + '-collector',
        service: 'collector',
        operation: s.operation,
        startTime: s.startTime,
        endTime: s.endTime,
        status: s.status,
        errorMessage: s.tags?.error || null,
        nodeId: node.id,
        tags: s.tags
      }))

      await TraceSpanRepository.batchCreate(traceSpans)

      const spanData = span.finish('success')
      traceLogger.info(`采集审计日志上报成功: ${node.name}`, {
        auditLogId: auditLog.id,
        traceId
      })

      return { auditLog, traceSpans, span: spanData }
    } catch (error) {
      const spanData = span.finish('error')
      traceLogger.error(`采集审计日志上报失败: ${node.name}`, {
        error: error.message,
        traceId
      })
      return null
    }
  }

  async reportCollectorStatus(status, traceLogger) {
    const traceId = traceLogger.traceId

    try {
      await AuditLogRepository.createLog({
        traceId,
        userId: this.systemUserId,
        username: this.systemUsername,
        action: 'collector_status_change',
        content: `采集服务状态变更为: ${status}`,
        module: 'collector',
        ip: '127.0.0.1',
        params: { status },
        result: 'success',
        duration: null
      })

      traceLogger.info(`采集服务状态变更: ${status}`, { traceId })
    } catch (error) {
      traceLogger.error('采集服务状态上报失败', { error: error.message })
    }
  }
}

export default new AuditReporter()
