import BaseRepository from './BaseRepository.js'
import { Node, Room, NodeMetric, NodeCollectTask } from '../models/index.js'
import { QueryTypes } from 'sequelize'

class NodeRepository extends BaseRepository {
  constructor() {
    super(Node)
  }

  async findByRoomId(roomId) {
    const sql = `
      SELECT n.*,
        nm.id AS metric_id, nm.cpuUsage AS metric_cpuUsage,
        nm.memoryUsage AS metric_memoryUsage, nm.diskUsage AS metric_diskUsage,
        nm.networkIn AS metric_networkIn, nm.networkOut AS metric_networkOut,
        nm.timestamp AS metric_timestamp
      FROM node n
      LEFT JOIN node_metric nm ON nm.nodeId = n.id
        AND nm.timestamp = (
          SELECT MAX(nm2.timestamp) FROM node_metric nm2 WHERE nm2.nodeId = n.id
        )
      WHERE n.roomId = :roomId
      ORDER BY n.createdAt ASC
    `
    const rows = await this.query(sql, { roomId }, QueryTypes.SELECT)
    return rows.map(row => this._mergeLatestMetric(row))
  }

  _mergeLatestMetric(row) {
    const node = {}
    const metric = {}
    for (const [key, value] of Object.entries(row)) {
      if (key.startsWith('metric_')) {
        metric[key.replace('metric_', '')] = value
      } else {
        node[key] = value
      }
    }
    node.latestMetric = metric.metric_id ? metric : null
    return node
  }

  async batchFindByRoomIds(roomIds) {
    if (!roomIds || roomIds.length === 0) return []
    const placeholders = roomIds.map((_, i) => `:id${i}`).join(', ')
    const replacements = {}
    roomIds.forEach((id, i) => { replacements[`id${i}`] = id })

    const sql = `
      SELECT n.* FROM node n
      WHERE n.roomId IN (${placeholders})
      ORDER BY n.roomId, n.createdAt ASC
    `
    return this.query(sql, replacements, QueryTypes.SELECT)
  }

  async getNodesWithLatestMetrics(roomId) {
    const sql = `
      SELECT n.*,
        nm.cpuUsage AS metric_cpuUsage,
        nm.memoryUsage AS metric_memoryUsage,
        nm.diskUsage AS metric_diskUsage,
        nm.networkIn AS metric_networkIn,
        nm.networkOut AS metric_networkOut,
        nm.timestamp AS metric_timestamp
      FROM node n
      LEFT JOIN node_metric nm ON nm.nodeId = n.id
        AND nm.timestamp = (
          SELECT MAX(nm2.timestamp) FROM node_metric nm2 WHERE nm2.nodeId = n.id
        )
      WHERE n.roomId = :roomId
      ORDER BY n.createdAt ASC
    `
    const rows = await this.query(sql, { roomId }, QueryTypes.SELECT)
    return rows.map(row => this._mergeLatestMetric(row))
  }

  async findByStatus(status) {
    return this.findAll({ status })
  }

  async findByParentId(parentId) {
    return this.findAll({ parentId })
  }

  async findByIdWithDetails(id) {
    return this.findById(id, {
      include: [
        { model: Room, as: 'room' },
        { model: Node, as: 'parent' },
        { model: Node, as: 'children' },
        {
          model: NodeMetric,
          as: 'metrics',
          limit: 100,
          order: [['timestamp', 'DESC']]
        }
      ]
    })
  }

  async getTreeData() {
    const nodes = await this.findAll({}, {
      include: [
        { model: Room, as: 'room' },
        { model: Node, as: 'children' }
      ],
      order: [['createdAt', 'ASC']]
    })

    const nodeMap = new Map()
    const roots = []

    nodes.forEach(node => {
      nodeMap.set(node.id, { ...node.toJSON(), children: [] })
    })

    nodes.forEach(node => {
      const treeNode = nodeMap.get(node.id)
      if (node.parentId && nodeMap.has(node.parentId)) {
        nodeMap.get(node.parentId).children.push(treeNode)
      } else if (!node.parentId) {
        roots.push(treeNode)
      }
    })

    return roots
  }

  async updateMetrics(id, metrics) {
    const { cpuUsage, memoryUsage, diskUsage, uptime } = metrics
    return this.update(id, {
      cpuUsage,
      memoryUsage,
      diskUsage,
      uptime,
      updatedAt: new Date()
    })
  }

  async getNodeStats() {
    const sql = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online,
        SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as offline,
        SUM(CASE WHEN status = 'warning' THEN 1 ELSE 0 END) as warning,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error,
        AVG(cpuUsage) as avgCpu,
        AVG(memoryUsage) as avgMemory,
        AVG(diskUsage) as avgDisk
      FROM node
    `
    const result = await this.query(sql)
    return result[0]
  }

  async search(keyword, roomId, status) {
    const where = {}
    if (keyword) {
      where[this.Op.or] = [
        { name: { [this.Op.like]: `%${keyword}%` } },
        { ip: { [this.Op.like]: `%${keyword}%` } }
      ]
    }
    if (roomId) where.roomId = roomId
    if (status) where.status = status

    return this.findAll(where, {
      include: [{ model: Room, as: 'room' }],
      order: [['updatedAt', 'DESC']],
      limit: 200
    })
  }
}

export default new NodeRepository()
