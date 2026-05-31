import BaseRepository from './BaseRepository.js'
import { Room, Node } from '../models/index.js'
import { QueryTypes } from 'sequelize'

class RoomRepository extends BaseRepository {
  constructor() {
    super(Room)
  }

  async findByRegion(region) {
    return this.findAll({ region })
  }

  async findByStatus(status) {
    return this.findAll({ status })
  }

  async findAllWithNodeCount() {
    const sql = `
      SELECT r.*,
        COALESCE(ns.nodeCount, 0) AS nodeCount,
        COALESCE(ns.onlineCount, 0) AS onlineCount,
        COALESCE(ns.warningCount, 0) AS warningCount,
        COALESCE(ns.errorCount, 0) AS errorCount,
        COALESCE(ns.offlineCount, 0) AS offlineCount
      FROM room r
      LEFT JOIN (
        SELECT roomId,
          COUNT(*) AS nodeCount,
          SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) AS onlineCount,
          SUM(CASE WHEN status = 'warning' THEN 1 ELSE 0 END) AS warningCount,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errorCount,
          SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) AS offlineCount
        FROM node
        GROUP BY roomId
      ) ns ON ns.roomId = r.id
      ORDER BY r.createdAt ASC
    `
    return this.query(sql, {}, QueryTypes.SELECT)
  }

  async findByIdWithNodes(id) {
    return this.findById(id, {
      include: [{
        model: Node,
        as: 'nodes',
        include: [{
          model: Node,
          as: 'children'
        }]
      }]
    })
  }

  async getRoomStats() {
    const sql = `
      SELECT 
        r.id,
        r.name,
        r.status,
        COUNT(n.id) as nodeCount,
        SUM(CASE WHEN n.status = 'online' THEN 1 ELSE 0 END) as onlineCount,
        SUM(CASE WHEN n.status = 'warning' THEN 1 ELSE 0 END) as warningCount,
        SUM(CASE WHEN n.status = 'error' THEN 1 ELSE 0 END) as errorCount
      FROM room r
      LEFT JOIN node n ON r.id = n.roomId
      GROUP BY r.id, r.name, r.status
      HAVING COUNT(n.id) > 0
    `
    return this.query(sql, {}, QueryTypes.SELECT)
  }

  async getRoomsWithNodeStats() {
    const sql = `
      SELECT 
        r.id,
        r.name,
        r.region,
        r.status,
        r.location,
        r.description,
        r.createdAt,
        r.updatedAt,
        COALESCE(ns.nodeCount, 0) AS nodeCount,
        COALESCE(ns.onlineCount, 0) AS onlineCount,
        COALESCE(ns.warningCount, 0) AS warningCount,
        COALESCE(ns.errorCount, 0) AS errorCount,
        COALESCE(ns.offlineCount, 0) AS offlineCount
      FROM room r
      LEFT JOIN (
        SELECT roomId,
          COUNT(*) AS nodeCount,
          SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) AS onlineCount,
          SUM(CASE WHEN status = 'warning' THEN 1 ELSE 0 END) AS warningCount,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errorCount,
          SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) AS offlineCount
        FROM node
        GROUP BY roomId
      ) ns ON ns.roomId = r.id
      ORDER BY r.createdAt ASC
    `
    return this.query(sql, {}, QueryTypes.SELECT)
  }
}

export default new RoomRepository()
