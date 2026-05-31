import { NodeMetricRepository, NodeRepository } from 'persistence'

class DataProcessor {
  constructor() {
    this.statusThresholds = {
      warning: { cpu: 80, memory: 80, disk: 85 },
      error: { cpu: 95, memory: 95, disk: 95 }
    }
  }

  process(node, metrics, traceLogger) {
    const span = traceLogger.createSpan('process_collected_data')
    span.setTag('nodeId', node.id)

    try {
      traceLogger.debug(`开始处理节点数据: ${node.name}`)

      const processed = this.normalizeMetrics(metrics)
      const status = this.determineStatus(processed)
      const anomalies = this.detectAnomalies(node, processed)

      span.setTag('status', status)
      span.setTag('anomalyCount', anomalies.length)

      const spanData = span.finish('success')
      traceLogger.debug(`节点数据处理完成: ${node.name}`, { status })

      return {
        processed,
        status,
        anomalies,
        span: spanData
      }
    } catch (error) {
      const spanData = span.finish('error')
      traceLogger.error(`节点数据处理失败: ${node.name}`, { error: error.message })
      throw error
    }
  }

  normalizeMetrics(metrics) {
    return {
      cpuUsage: this.clamp(metrics.cpuUsage, 0, 100),
      memoryUsage: this.clamp(metrics.memoryUsage, 0, 100),
      diskUsage: this.clamp(metrics.diskUsage, 0, 100),
      networkIn: Math.max(0, metrics.networkIn || 0),
      networkOut: Math.max(0, metrics.networkOut || 0),
      uptime: Math.max(0, metrics.uptime || 0)
    }
  }

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value))
  }

  determineStatus(metrics) {
    if (metrics.cpuUsage === 0 && metrics.memoryUsage === 0 && metrics.diskUsage === 0) {
      return 'offline'
    }

    const { warning, error } = this.statusThresholds

    if (metrics.cpuUsage >= error.cpu ||
        metrics.memoryUsage >= error.memory ||
        metrics.diskUsage >= error.disk) {
      return 'error'
    }

    if (metrics.cpuUsage >= warning.cpu ||
        metrics.memoryUsage >= warning.memory ||
        metrics.diskUsage >= warning.disk) {
      return 'warning'
    }

    return 'online'
  }

  detectAnomalies(node, metrics) {
    const anomalies = []

    if (metrics.cpuUsage >= this.statusThresholds.warning.cpu) {
      anomalies.push({
        type: 'high_cpu',
        severity: metrics.cpuUsage >= this.statusThresholds.error.cpu ? 'error' : 'warning',
        value: metrics.cpuUsage,
        threshold: this.statusThresholds.warning.cpu
      })
    }

    if (metrics.memoryUsage >= this.statusThresholds.warning.memory) {
      anomalies.push({
        type: 'high_memory',
        severity: metrics.memoryUsage >= this.statusThresholds.error.memory ? 'error' : 'warning',
        value: metrics.memoryUsage,
        threshold: this.statusThresholds.warning.memory
      })
    }

    if (metrics.diskUsage >= this.statusThresholds.warning.disk) {
      anomalies.push({
        type: 'high_disk',
        severity: metrics.diskUsage >= this.statusThresholds.error.disk ? 'error' : 'warning',
        value: metrics.diskUsage,
        threshold: this.statusThresholds.warning.disk
      })
    }

    return anomalies
  }

  async saveToDatabase(nodeId, processed, status, traceLogger) {
    const span = traceLogger.createSpan('save_to_database')
    span.setTag('nodeId', nodeId)

    try {
      traceLogger.debug(`保存节点数据到数据库: ${nodeId}`)

      await NodeMetricRepository.create({
        nodeId,
        cpuUsage: processed.cpuUsage,
        memoryUsage: processed.memoryUsage,
        diskUsage: processed.diskUsage,
        networkIn: processed.networkIn,
        networkOut: processed.networkOut,
        timestamp: new Date()
      })

      await NodeRepository.update(nodeId, {
        status,
        cpuUsage: processed.cpuUsage,
        memoryUsage: processed.memoryUsage,
        diskUsage: processed.diskUsage,
        uptime: processed.uptime
      })

      const spanData = span.finish('success')
      traceLogger.debug(`节点数据保存成功: ${nodeId}`)

      return spanData
    } catch (error) {
      const spanData = span.finish('error')
      traceLogger.error(`节点数据保存失败: ${nodeId}`, { error: error.message })
      throw error
    }
  }
}

export default new DataProcessor()
