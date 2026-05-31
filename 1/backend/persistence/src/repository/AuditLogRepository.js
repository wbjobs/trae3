import BaseRepository from './BaseRepository.js'
import { AuditLog, TraceSpan } from '../models/index.js'
import { v4 as uuidv4 } from 'uuid'

class AuditLogRepository extends BaseRepository {
  constructor() {
    super(AuditLog)
  }

  async createLog(data) {
    const traceId = data.traceId || uuidv4()
    return this.create({
      traceId,
      userId: data.userId,
      username: data.username,
      action: data.action,
      content: data.content || null,
      module: data.module,
      ip: data.ip,
      userAgent: data.userAgent || null,
      params: data.params || null,
      result: data.result || 'success',
      duration: data.duration || null,
      errorMessage: data.errorMessage || null,
      nodeId: data.nodeId || null,
      roomId: data.roomId || null
    })
  }

  async findByTraceId(traceId) {
    return this.findOne({ traceId }, {
      include: [{ model: TraceSpan, as: 'spans' }]
    })
  }

  async findByUserId(userId, page = 1, pageSize = 20) {
    return this.paginate({
      page,
      pageSize,
      where: { userId },
      options: { order: [['createdAt', 'DESC']] }
    })
  }

  async findByModule(module, page = 1, pageSize = 20) {
    return this.paginate({
      page,
      pageSize,
      where: { module },
      options: { order: [['createdAt', 'DESC']] }
    })
  }

  async findByNodeId(nodeId, page = 1, pageSize = 20) {
    return this.paginate({
      page,
      pageSize,
      where: { nodeId },
      options: { order: [['createdAt', 'DESC']] }
    })
  }

  async findByRoomId(roomId, page = 1, pageSize = 20) {
    return this.paginate({
      page,
      pageSize,
      where: { roomId },
      options: { order: [['createdAt', 'DESC']] }
    })
  }

  async search(query) {
    const {
      page = 1,
      pageSize = 20,
      keyword,
      action,
      module,
      username,
      result,
      startTime,
      endTime,
      nodeId,
      roomId
    } = query
    const where = {}

    if (keyword) {
      where[this.Op.or] = [
        { action: { [this.Op.like]: `%${keyword}%` } },
        { username: { [this.Op.like]: `%${keyword}%` } },
        { content: { [this.Op.like]: `%${keyword}%` } },
        { traceId: { [this.Op.like]: `%${keyword}%` } }
      ]
    }
    if (action) where.action = action
    if (module) where.module = module
    if (username) where.username = username
    if (result) where.result = result
    if (nodeId) where.nodeId = nodeId
    if (roomId) where.roomId = roomId
    if (startTime && endTime) {
      where.createdAt = {
        [this.Op.between]: [new Date(startTime), new Date(endTime)]
      }
    } else if (startTime) {
      where.createdAt = {
        [this.Op.gte]: new Date(startTime)
      }
    } else if (endTime) {
      where.createdAt = {
        [this.Op.lte]: new Date(endTime)
      }
    }

    return this.paginate({
      page,
      pageSize,
      where,
      options: { order: [['createdAt', 'DESC']] }
    })
  }

  async getStats(days = 7) {
    const sql = `
      SELECT
        DATE(createdAt) as date,
        module,
        result,
        COUNT(*) as count
      FROM audit_log
      WHERE createdAt >= DATE_SUB(NOW(), INTERVAL ? DAY)
      GROUP BY DATE(createdAt), module, result
      ORDER BY date DESC
    `
    return this.query(sql, [days])
  }

  async getTodayStats() {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const totalResult = await this.count({
      createdAt: { [this.Op.gte]: todayStart }
    })

    const successResult = await this.count({
      createdAt: { [this.Op.gte]: todayStart },
      result: 'success'
    })

    const failedResult = await this.count({
      createdAt: { [this.Op.gte]: todayStart },
      result: 'failed'
    })

    const traceResult = await this.model.sequelize.models.TraceSpan.count({
      where: {
        startTime: {
          [this.Op.gte]: todayStart.getTime()
        }
      }
    })

    return {
      todayTotal: totalResult,
      todaySuccess: successResult,
      todayFailed: failedResult,
      totalTraces: traceResult
    }
  }
}

export default new AuditLogRepository()
