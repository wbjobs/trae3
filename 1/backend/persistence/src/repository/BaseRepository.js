import { sequelize } from '../config/database.js'
import { Op, QueryTypes } from 'sequelize'

class BaseRepository {
  constructor(model) {
    this.model = model
    this.Op = Op
    this.QueryTypes = QueryTypes
    this.sequelize = sequelize
  }

  async create(data, options = {}) {
    return this.model.create(data, options)
  }

  async bulkCreate(data, options = {}) {
    return this.model.bulkCreate(data, options)
  }

  async findById(id, options = {}) {
    return this.model.findByPk(id, options)
  }

  async findOne(where, options = {}) {
    return this.model.findOne({ where, ...options })
  }

  async findAll(where = {}, options = {}) {
    return this.model.findAll({ where, ...options })
  }

  async findAndCountAll(where = {}, options = {}) {
    return this.model.findAndCountAll({ where, ...options })
  }

  async update(id, data, options = {}) {
    const [affectedCount] = await this.model.update(data, {
      where: { id },
      returning: true,
      ...options
    })
    return { affectedCount, data: await this.findById(id) }
  }

  async delete(id, options = {}) {
    return this.model.destroy({ where: { id }, ...options })
  }

  async count(where = {}) {
    return this.model.count({ where })
  }

  async exists(where = {}) {
    const count = await this.count(where)
    return count > 0
  }

  async paginate(query = {}) {
    const { page = 1, pageSize = 10, where = {}, options = {} } = query
    const offset = (page - 1) * pageSize
    return this.model.findAndCountAll({
      where,
      offset,
      limit: pageSize,
      ...options
    })
  }

  async transaction(callback) {
    return sequelize.transaction(callback)
  }

  async query(sql, replacements = {}, type = QueryTypes.SELECT) {
    return sequelize.query(sql, { replacements, type })
  }
}

export default BaseRepository
