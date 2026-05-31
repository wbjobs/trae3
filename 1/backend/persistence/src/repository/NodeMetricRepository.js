import BaseRepository from './BaseRepository.js'
import { NodeMetric } from '../models/index.js'

class NodeMetricRepository extends BaseRepository {
  constructor() {
    super(NodeMetric)
  }

  async findByNodeId(nodeId, limit = 100) {
    return this.findAll({ nodeId }, {
      order: [['timestamp', 'DESC']],
      limit
    })
  }

  async findByNodeIdAndTimeRange(nodeId, startTime, endTime) {
    return this.findAll({
      nodeId,
      timestamp: {
        [this.Op.between]: [new Date(startTime), new Date(endTime)]
      }
    }, {
      order: [['timestamp', 'ASC']]
    })
  }

  async getLatestMetric(nodeId) {
    const result = await this.findAll({ nodeId }, {
      order: [['timestamp', 'DESC']],
      limit: 1
    })
    return result[0] || null
  }

  async getMetricTrend(nodeId, hours = 24) {
    const sql = `
      SELECT
        DATE_FORMAT(timestamp, '%Y-%m-%d %H:00:00') as timePoint,
        AVG(cpuUsage) as avgCpu,
        AVG(memoryUsage) as avgMemory,
        AVG(diskUsage) as avgDisk,
        AVG(networkIn) as avgNetworkIn,
        AVG(networkOut) as avgNetworkOut
      FROM node_metric
      WHERE nodeId = ? AND timestamp >= DATE_SUB(NOW(), INTERVAL ? HOUR)
      GROUP BY DATE_FORMAT(timestamp, '%Y-%m-%d %H:00:00')
      ORDER BY timePoint ASC
    `
    return this.query(sql, [nodeId, hours])
  }

  async batchCreate(metrics) {
    return this.bulkCreate(metrics)
  }
}

export default new NodeMetricRepository()
