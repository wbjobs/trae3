const { baseDB } = require('../../config/database');

const COLLECTION = 'permissions';

const Permission = {
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

module.exports = Permission;
