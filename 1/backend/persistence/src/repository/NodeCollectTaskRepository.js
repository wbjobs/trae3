import BaseRepository from './BaseRepository.js'
import { NodeCollectTask, Node } from '../models/index.js'
import { QueryTypes } from 'sequelize'

class NodeCollectTaskRepository extends BaseRepository {
  constructor() {
    super(NodeCollectTask)
  }

  async findByNodeId(nodeId) {
    return this.findOne({ nodeId })
  }

  async findActiveTasks() {
    return this.findAll({ status: 'active' }, {
      include: [{ model: Node, as: 'node' }]
    })
  }

  async findDueTasks(currentTime) {
    return this.findAll({
      status: 'active',
      nextRun: { [this.Op.lte]: new Date(currentTime) }
    }, {
      include: [{ model: Node, as: 'node' }]
    })
  }

  async updateLastRun(id, lastRun, nextRun) {
    return this.update(id, { lastRun, nextRun })
  }

  async updateStatus(id, status) {
    return this.update(id, { status })
  }

  async updateInterval(id, interval) {
    return this.update(id, { interval })
  }

  async createForNode(nodeId, interval = 30000) {
    const nextRun = new Date(Date.now() + interval)
    return this.create({
      nodeId,
      interval,
      status: 'active',
      nextRun
    })
  }

  async getTaskStats() {
    const sql = `
      SELECT
        status,
        COUNT(*) as count
      FROM node_collect_task
      GROUP BY status
    `
    return this.query(sql)
  }

  /* 批量更新指定机房下所有节点的采集任务状态，单条 SQL 替代逐条更新 */
  async batchUpdateByRoomId(roomId, status) {
    const sql = `
      UPDATE node_collect_task
      SET status = :status, updatedAt = NOW()
      WHERE nodeId IN (
        SELECT id FROM node WHERE roomId = :roomId
      )
    `
    const result = await this.query(sql, { roomId, status }, QueryTypes.UPDATE)
    return result[1] || 0
  }

  /* 根据多个 nodeId 批量查询采集任务 */
  async batchFindByNodeIds(nodeIds) {
    if (!nodeIds || nodeIds.length === 0) return []
    const placeholders = nodeIds.map((_, i) => `:id${i}`).join(', ')
    const replacements = {}
    nodeIds.forEach((id, i) => { replacements[`id${i}`] = id })

    const sql = `
      SELECT nct.*
      FROM node_collect_task nct
      WHERE nct.nodeId IN (${placeholders})
    `
    return this.query(sql, replacements, QueryTypes.SELECT)
  }
}

export default new NodeCollectTaskRepository()
