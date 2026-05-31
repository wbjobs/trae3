const { baseDB } = require('../../config/database');

const COLLECTION = 'roles';

const Role = {
  async create(data, options = {}) {
    return baseDB.create(COLLECTION, data, options);
  },
  
  async bulkCreate(items, options = {}) {
    return baseDB.bulkCreate(COLLECTION, items, options);
  },
  
  async findAll(options = {}) {
    return baseDB.findAll(COLLECTION, options);
  },
  
  async findOne(options = {}) {
    return baseDB.findOne(COLLECTION, options);
  },
  
  async findByPk(id, options = {}) {
    return baseDB.findByPk(COLLECTION, id, options);
  },
  
  async findAndCountAll(options = {}) {
    return baseDB.findAndCountAll(COLLECTION, options);
  },
  
  async count(options = {}) {
    return baseDB.count(COLLECTION, options);
  },
  
  async update(data, options = {}) {
    return baseDB.update(COLLECTION, data, options);
  },
  
  async destroy(options = {}) {
    return baseDB.destroy(COLLECTION, options);
  }
};

Role.DANGER_LEVELS = ['剧毒', '高毒', '易燃', '易爆', '腐蚀', '其他'];

module.exports = Role;
