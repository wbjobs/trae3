import axios from 'axios'
import config from '../config/index.js'
import circuitBreaker from '../utils/circuitBreaker.js'

/* 根据操作类型动态调整超时时间 */
const TIMEOUT_MAP = {
  status: 3000,
  single: 8000,
  bulk: 20000
}

/* 简易 LRU 缓存（100 条，5 秒 TTL） */
class LRUCache {
  constructor(maxSize = 100, ttl = 5000) {
    this.maxSize = maxSize
    this.ttl = ttl
    this.cache = new Map()
  }

  get(key) {
    const entry = this.cache.get(key)
    if (!entry) return null
    if (Date.now() - entry.ts > this.ttl) {
      this.cache.delete(key)
      return null
    }
    /* 访问时移到末尾，维持 LRU 顺序 */
    this.cache.delete(key)
    this.cache.set(key, entry)
    return entry.value
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= this.maxSize) {
      /* 淘汰最久未使用的条目 */
      const oldest = this.cache.keys().next().value
      this.cache.delete(oldest)
    }
    this.cache.set(key, { value, ts: Date.now() })
  }
}

class CollectorService {
  constructor() {
    this.baseUrl = config.collectorUrl
    this.defaultTimeout = 5000
    this.serviceName = 'collector'
    /* 请求级 LRU 缓存，用于幂等接口结果复用 */
    this.statusCache = new LRUCache(100, 5000)
  }

  async requestWithFallback(method, url, data, traceLogger, fallbackValue, timeout) {
    if (!circuitBreaker.canRequest(this.serviceName)) {
      traceLogger.warn(`熔断器开启，跳过请求: ${url}`, {
        state: circuitBreaker.getStatus(this.serviceName)
      })
      return {
        success: false,
        code: 503,
        message: '采集服务当前不可用（熔断保护中）',
        data: fallbackValue
      }
    }

    try {
      const axiosConfig = {
        timeout: timeout || this.defaultTimeout,
        headers: { 'X-Trace-Id': traceLogger.traceId }
      }

      let response
      if (method === 'get') {
        response = await axios.get(url, axiosConfig)
      } else if (method === 'post') {
        response = await axios.post(url, data || {}, axiosConfig)
      } else if (method === 'delete') {
        response = await axios.delete(url, axiosConfig)
      }

      circuitBreaker.recordSuccess(this.serviceName)
      return {
        success: true,
        data: response.data.data
      }
    } catch (error) {
      circuitBreaker.recordFailure(this.serviceName)

      const isTimeout = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT'
      const isUnreachable = error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND'

      if (isTimeout) {
        traceLogger.warn(`采集服务请求超时: ${url}`, {
          code: error.code,
          timeout: timeout || this.defaultTimeout
        })
        return {
          success: false,
          code: 504,
          message: '采集服务响应超时，请稍后重试',
          data: fallbackValue
        }
      }

      if (isUnreachable) {
        traceLogger.error(`采集服务不可达: ${url}`, {
          code: error.code,
          message: error.message
        })
        return {
          success: false,
          code: 503,
          message: '采集服务不可达，请检查服务状态',
          data: fallbackValue
        }
      }

      traceLogger.error(`采集服务请求异常: ${url}`, {
        status: error.response?.status,
        message: error.message
      })
      return {
        success: false,
        code: error.response?.status || 500,
        message: error.response?.data?.message || '采集服务请求失败',
        data: fallbackValue
      }
    }
  }

  /* 5 秒内复用上次状态结果，避免频繁请求 */
  async getCachedStatus(traceLogger) {
    const cacheKey = 'collector:status'
    const cached = this.statusCache.get(cacheKey)
    if (cached) {
      traceLogger.debug('采集服务状态命中缓存')
      return cached
    }

    const result = await this.getStatus(traceLogger)
    if (result.success) {
      this.statusCache.set(cacheKey, result)
    }
    return result
  }

  async getStatus(traceLogger) {
    traceLogger.debug('获取采集服务状态')
    return this.requestWithFallback(
      'get',
      `${this.baseUrl}/api/collector/status`,
      null,
      traceLogger,
      { isRunning: false, taskCount: 0 },
      TIMEOUT_MAP.status
    )
  }

  async manualCollect(nodeId, traceLogger) {
    traceLogger.info('手动触发节点采集', { nodeId })
    return this.requestWithFallback(
      'post',
      `${this.baseUrl}/api/collector/collect/${nodeId}`,
      {},
      traceLogger,
      null,
      TIMEOUT_MAP.single
    )
  }

  async collectAll(traceLogger) {
    traceLogger.info('手动触发全部节点采集')
    return this.requestWithFallback(
      'post',
      `${this.baseUrl}/api/collector/collect/all`,
      {},
      traceLogger,
      null,
      TIMEOUT_MAP.bulk
    )
  }

  async startCollector(traceLogger) {
    traceLogger.info('启动采集服务')
    return this.requestWithFallback(
      'post',
      `${this.baseUrl}/api/collector/control/start`,
      {},
      traceLogger,
      null,
      TIMEOUT_MAP.single
    )
  }

  async stopCollector(traceLogger) {
    traceLogger.info('停止采集服务')
    return this.requestWithFallback(
      'post',
      `${this.baseUrl}/api/collector/control/stop`,
      {},
      traceLogger,
      null,
      TIMEOUT_MAP.single
    )
  }

  async addCollectTask(nodeId, interval, node, traceLogger) {
    traceLogger.info('添加采集任务', { nodeId, interval })
    return this.requestWithFallback(
      'post',
      `${this.baseUrl}/api/collector/task/${nodeId}`,
      { interval, node },
      traceLogger,
      null,
      TIMEOUT_MAP.single
    )
  }

  async removeCollectTask(nodeId, traceLogger) {
    traceLogger.info('删除采集任务', { nodeId })
    return this.requestWithFallback(
      'delete',
      `${this.baseUrl}/api/collector/task/${nodeId}`,
      null,
      traceLogger,
      null,
      TIMEOUT_MAP.single
    )
  }
}

export default new CollectorService()
