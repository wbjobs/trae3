import {
  NodeRepository,
  NodeMetricRepository,
  RoomRepository,
  NodeCollectTaskRepository
} from 'persistence'

class NodeService {
  async getNodeList(query, traceLogger) {
    traceLogger.debug('获取节点列表', { query })

    try {
      const { page, pageSize, keyword, status, roomId } = query

      const where = {}
      const options = {
        include: [{ association: 'room' }],
        order: [['updatedAt', 'DESC']],
        raw: true
      }

      if (keyword) {
        where[NodeRepository.Op.or] = [
          { name: { [NodeRepository.Op.like]: `%${keyword}%` } },
          { ip: { [NodeRepository.Op.like]: `%${keyword}%` } }
        ]
      }
      if (status) where.status = status
      if (roomId) where.roomId = roomId

      /* raw: true 减少 ORM 实例化开销 */
      const result = await NodeRepository.paginate({
        page,
        pageSize,
        where,
        options
      })

      return {
        list: result.rows,
        total: result.count,
        page,
        pageSize
      }
    } catch (error) {
      traceLogger.error('获取节点列表失败', { error: error.message })
      return {
        list: [],
        total: 0,
        page: query.page || 1,
        pageSize: query.pageSize || 20
      }
    }
  }

  async getNodeDetail(nodeId, traceLogger) {
    traceLogger.debug('获取节点详情', { nodeId })

    try {
      const node = await NodeRepository.findByIdWithDetails(nodeId)

      if (!node) {
        return {
          success: false,
          code: 404,
          message: '节点不存在'
        }
      }

      return {
        success: true,
        data: node
      }
    } catch (error) {
      traceLogger.error('获取节点详情失败', { nodeId, error: error.message })
      return {
        success: false,
        code: 500,
        message: '获取节点详情失败，请稍后重试'
      }
    }
  }

  async getNodeTree(traceLogger) {
    traceLogger.debug('获取节点树状数据')

    try {
      const tree = await NodeRepository.getTreeData()

      return {
        success: true,
        data: tree || []
      }
    } catch (error) {
      traceLogger.error('获取节点树状数据失败', { error: error.message })
      return {
        success: true,
        data: []
      }
    }
  }

  async getNodeMetrics(query, traceLogger) {
    traceLogger.debug('获取节点指标数据', { query })

    try {
      const { nodeId, hours = 24 } = query

      const metrics = await NodeMetricRepository.getMetricTrend(nodeId, hours)

      /* 缓存友好提示：客户端可据此设置缓存策略 */
      const dataRange = `last-${hours}h`

      return {
        success: true,
        data: metrics || { list: [] },
        headers: { 'X-Data-Range': dataRange }
      }
    } catch (error) {
      traceLogger.error('获取节点指标数据失败', { error: error.message })
      return {
        success: true,
        data: { list: [] }
      }
    }
  }

  async getNodeStats(traceLogger) {
    traceLogger.debug('获取节点统计数据')

    try {
      /* 并行查询节点统计和机房统计，替代串行 await */
      const [stats, roomStats] = await Promise.all([
        NodeRepository.getNodeStats(),
        RoomRepository.getRoomStats()
      ])

      return {
        success: true,
        data: {
          overview: stats || { total: 0, online: 0, warning: 0, error: 0, offline: 0 },
          rooms: roomStats || []
        }
      }
    } catch (error) {
      traceLogger.error('获取节点统计数据失败', { error: error.message })
      return {
        success: true,
        data: {
          overview: { total: 0, online: 0, warning: 0, error: 0, offline: 0 },
          rooms: []
        }
      }
    }
  }

  async searchNodes(keyword, roomId, status, traceLogger) {
    traceLogger.debug('搜索节点', { keyword, roomId, status })

    try {
      const nodes = await NodeRepository.search(keyword, roomId, status)

      return {
        success: true,
        data: nodes || []
      }
    } catch (error) {
      traceLogger.error('搜索节点失败', { error: error.message })
      return {
        success: true,
        data: []
      }
    }
  }

  async controlNode(nodeId, action, traceLogger) {
    traceLogger.info('控制节点', { nodeId, action })

    try {
      const node = await NodeRepository.findById(nodeId)
      if (!node) {
        return {
          success: false,
          code: 404,
          message: '节点不存在'
        }
      }

      const task = await NodeCollectTaskRepository.findByNodeId(nodeId)

      if (action === 'start') {
        if (task) {
          await NodeCollectTaskRepository.updateStatus(task.id, 'active')
        }
      } else if (action === 'stop') {
        if (task) {
          await NodeCollectTaskRepository.updateStatus(task.id, 'paused')
        }
      } else if (action === 'restart') {
        if (task) {
          await NodeCollectTaskRepository.updateStatus(task.id, 'paused')
          await new Promise(resolve => setTimeout(resolve, 500))
          await NodeCollectTaskRepository.updateStatus(task.id, 'active')
        }
      } else {
        return {
          success: false,
          code: 400,
          message: '无效的操作类型'
        }
      }

      return {
        success: true,
        message: `节点${action === 'start' ? '启动' : action === 'stop' ? '停止' : '重启'}成功`
      }
    } catch (error) {
      traceLogger.error('控制节点失败', { nodeId, action, error: error.message })
      return {
        success: false,
        code: 500,
        message: '节点控制操作失败，请稍后重试'
      }
    }
  }

  async getNodeLatestMetric(nodeId, traceLogger) {
    traceLogger.debug('获取节点最新指标', { nodeId })

    try {
      const metric = await NodeMetricRepository.getLatestMetric(nodeId)

      return {
        success: true,
        data: metric || null
      }
    } catch (error) {
      traceLogger.error('获取节点最新指标失败', { nodeId, error: error.message })
      return {
        success: true,
        data: null
      }
    }
  }
}

export default new NodeService()
