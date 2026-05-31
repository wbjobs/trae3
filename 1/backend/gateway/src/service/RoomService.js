import { RoomRepository, NodeRepository, NodeCollectTaskRepository } from 'persistence'

class RoomService {
  async getRoomList(query, traceLogger) {
    traceLogger.debug('获取机房列表', { query })

    try {
      const { page, pageSize, region, status } = query

      const where = {}
      if (region) where.region = region
      if (status) where.status = status

      /* 单条 SQL 获取所有机房及其节点统计，替代逐机房 N+1 查询 */
      const roomsWithStats = await RoomRepository.getRoomsWithNodeStats()

      /* 在内存中根据 where 条件过滤（统计 SQL 已含全量数据） */
      let filtered = roomsWithStats
      if (region) filtered = filtered.filter(r => r.region === region)
      if (status) filtered = filtered.filter(r => r.status === status)

      /* 排序：按创建时间倒序 */
      filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

      const total = filtered.length
      const offset = (page - 1) * pageSize
      const paged = filtered.slice(offset, offset + pageSize)

      return {
        list: paged,
        total,
        page,
        pageSize
      }
    } catch (error) {
      traceLogger.error('获取机房列表失败', { error: error.message })
      return {
        list: [],
        total: 0,
        page: query.page || 1,
        pageSize: query.pageSize || 20
      }
    }
  }

  async getRoomDetail(roomId, traceLogger) {
    traceLogger.debug('获取机房详情', { roomId })

    try {
      const room = await RoomRepository.findByIdWithNodes(roomId)

      if (!room) {
        return {
          success: false,
          code: 404,
          message: '机房不存在'
        }
      }

      return {
        success: true,
        data: room
      }
    } catch (error) {
      traceLogger.error('获取机房详情失败', { roomId, error: error.message })
      return {
        success: false,
        code: 500,
        message: '获取机房详情失败，请稍后重试'
      }
    }
  }

  async getRoomNodes(roomId, traceLogger) {
    traceLogger.debug('获取机房下的节点', { roomId })

    try {
      const nodes = await NodeRepository.findByRoomId(roomId)

      return {
        success: true,
        data: nodes || []
      }
    } catch (error) {
      traceLogger.error('获取机房节点失败', { roomId, error: error.message })
      return {
        success: true,
        data: []
      }
    }
  }

  async getRoomStats(traceLogger) {
    traceLogger.debug('获取机房统计')

    try {
      const stats = await RoomRepository.getRoomStats()

      return {
        success: true,
        data: stats || { total: 0, active: 0, maintenance: 0, offline: 0 }
      }
    } catch (error) {
      traceLogger.error('获取机房统计失败', { error: error.message })
      return {
        success: true,
        data: { total: 0, active: 0, maintenance: 0, offline: 0 }
      }
    }
  }

  async getRoomTree(traceLogger) {
    traceLogger.debug('获取机房树状结构')

    try {
      const rooms = await RoomRepository.findAllWithNodeCount()

      /* 批量获取所有机房的节点，替代逐机房 N+1 查询 */
      const roomIds = rooms.map(r => r.id)
      const allNodes = roomIds.length > 0
        ? await NodeRepository.batchFindByRoomIds(roomIds)
        : []

      /* 按 roomId 分组 */
      const nodesByRoom = new Map()
      for (const node of allNodes) {
        const list = nodesByRoom.get(node.roomId) || []
        list.push(node)
        nodesByRoom.set(node.roomId, list)
      }

      /* 为每个机房构建节点树 */
      const tree = rooms.map(room => {
        const roomNodes = nodesByRoom.get(room.id) || []

        const nodeMap = new Map()
        const roots = []

        roomNodes.forEach(node => {
          nodeMap.set(node.id, { ...node, children: [] })
        })

        roomNodes.forEach(node => {
          const treeNode = nodeMap.get(node.id)
          if (node.parentId && nodeMap.has(node.parentId)) {
            nodeMap.get(node.parentId).children.push(treeNode)
          } else if (!node.parentId) {
            roots.push(treeNode)
          }
        })

        return { ...room, children: roots }
      })

      return {
        success: true,
        data: tree
      }
    } catch (error) {
      traceLogger.error('获取机房树状结构失败', { error: error.message })
      return {
        success: true,
        data: []
      }
    }
  }

  async batchControlNodes(roomId, action, traceLogger) {
    traceLogger.info('批量控制机房节点', { roomId, action })

    try {
      /* 批量更新该机房下所有采集任务状态，替代逐节点 N+1 更新 */
      const affectedCount = await NodeCollectTaskRepository.batchUpdateByRoomId(
        roomId,
        action === 'start' ? 'active' : 'paused'
      )

      return {
        success: true,
        data: {
          total: affectedCount,
          success: affectedCount,
          failed: 0,
          results: []
        }
      }
    } catch (error) {
      traceLogger.error('批量控制节点失败', { roomId, action, error: error.message })
      return {
        success: false,
        code: 500,
        message: '批量控制操作失败，请稍后重试'
      }
    }
  }

  async getRegions(traceLogger) {
    traceLogger.debug('获取区域列表')

    const regions = [
      { code: 'north', name: '华北' },
      { code: 'south', name: '华南' },
      { code: 'east', name: '华东' },
      { code: 'west', name: '西部' },
      { code: 'central', name: '华中' }
    ]

    return {
      success: true,
      data: regions
    }
  }
}

export default new RoomService()
