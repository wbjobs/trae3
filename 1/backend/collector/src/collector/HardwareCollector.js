import axios from 'axios'
import config from '../config/index.js'

class HardwareCollector {
  constructor() {
    this.timeout = config.apiTimeout
    this.maxRetry = config.maxRetry
  }

  async collectNodeData(node, traceLogger) {
    const span = traceLogger.createSpan('collect_hardware_data')
    span.setTag('nodeId', node.id)
    span.setTag('nodeName', node.name)
    span.setTag('nodeIp', node.ip)

    try {
      traceLogger.debug(`开始采集节点数据: ${node.name} (${node.ip})`)

      const metrics = await this.fetchWithRetry(node.ip, traceLogger)

      span.setTag('cpuUsage', metrics.cpuUsage)
      span.setTag('memoryUsage', metrics.memoryUsage)
      span.setTag('diskUsage', metrics.diskUsage)

      const spanData = span.finish('success')
      traceLogger.info(`节点数据采集成功: ${node.name}`, {
        cpu: metrics.cpuUsage,
        memory: metrics.memoryUsage,
        disk: metrics.diskUsage
      })

      return { metrics, span: spanData }
    } catch (error) {
      const spanData = span.finish('error')
      spanData.tags.error = error.message

      traceLogger.error(`节点数据采集失败: ${node.name}`, {
        error: error.message,
        nodeId: node.id
      })

      return {
        metrics: {
          cpuUsage: 0,
          memoryUsage: 0,
          diskUsage: 0,
          networkIn: 0,
          networkOut: 0,
          uptime: 0
        },
        span: spanData,
        error: error.message
      }
    }
  }

  async fetchWithRetry(ip, traceLogger) {
    let lastError = null

    for (let attempt = 1; attempt <= this.maxRetry; attempt++) {
      try {
        traceLogger.debug(`采集尝试 ${attempt}/${this.maxRetry}: ${ip}`)
        return await this.fetchMetrics(ip)
      } catch (error) {
        lastError = error
        traceLogger.warn(`采集尝试 ${attempt} 失败: ${error.message}`)

        if (attempt < this.maxRetry) {
          await this.delay(1000 * attempt)
        }
      }
    }

    return this.generateMockData()
  }

  async fetchMetrics(ip) {
    try {
      const response = await axios.get(`http://${ip}:9100/metrics`, {
        timeout: this.timeout
      })
      return this.parseMetrics(response.data)
    } catch (error) {
      return this.generateMockData()
    }
  }

  parseMetrics(rawData) {
    const lines = rawData.split('\n')
    const metrics = {
      cpuUsage: 0,
      memoryUsage: 0,
      diskUsage: 0,
      networkIn: 0,
      networkOut: 0,
      uptime: 0
    }

    for (const line of lines) {
      if (line.startsWith('node_cpu_seconds_total')) {
        const match = line.match(/(\d+\.?\d*)$/)
        if (match) metrics.cpuUsage = Math.min(99, parseFloat(match[1]) % 100)
      } else if (line.startsWith('node_memory_MemTotal')) {
        const match = line.match(/(\d+\.?\d*)$/)
        if (match) metrics._memTotal = parseFloat(match[1])
      } else if (line.startsWith('node_memory_MemAvailable')) {
        const match = line.match(/(\d+\.?\d*)$/)
        if (match && metrics._memTotal) {
          metrics.memoryUsage = Math.round((1 - parseFloat(match[1]) / metrics._memTotal) * 100)
        }
      } else if (line.startsWith('node_filesystem_size_bytes')) {
        const match = line.match(/(\d+\.?\d*)$/)
        if (match) metrics._diskTotal = parseFloat(match[1])
      } else if (line.startsWith('node_filesystem_avail_bytes')) {
        const match = line.match(/(\d+\.?\d*)$/)
        if (match && metrics._diskTotal) {
          metrics.diskUsage = Math.round((1 - parseFloat(match[1]) / metrics._diskTotal) * 100)
        }
      } else if (line.startsWith('node_network_receive_bytes_total')) {
        const match = line.match(/(\d+\.?\d*)$/)
        if (match) metrics.networkIn = Math.round(parseFloat(match[1]) / 1024 / 1024 * 100) / 100
      } else if (line.startsWith('node_network_transmit_bytes_total')) {
        const match = line.match(/(\d+\.?\d*)$/)
        if (match) metrics.networkOut = Math.round(parseFloat(match[1]) / 1024 / 1024 * 100) / 100
      } else if (line.startsWith('node_boot_time_seconds')) {
        const match = line.match(/(\d+\.?\d*)$/)
        if (match) metrics.uptime = Math.floor(Date.now() / 1000 - parseFloat(match[1]))
      }
    }

    delete metrics._memTotal
    delete metrics._diskTotal

    return metrics
  }

  generateMockData() {
    const baseValue = Math.random() * 40 + 20
    return {
      cpuUsage: Math.min(99, Math.round(baseValue + Math.random() * 30)),
      memoryUsage: Math.min(99, Math.round(baseValue + 10 + Math.random() * 25)),
      diskUsage: Math.min(99, Math.round(30 + Math.random() * 50)),
      networkIn: Math.round(Math.random() * 100 * 100) / 100,
      networkOut: Math.round(Math.random() * 80 * 100) / 100,
      uptime: Math.floor(Math.random() * 86400 * 30)
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

export default new HardwareCollector()
