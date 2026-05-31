const { flowDB } = require('../../config/database');

const COLLECTION = 'operationLogs';

const OperationLog = {
  async create(data, options = {}) {
    return flowDB.create(COLLECTION, data, options);
  },
  
  async bulkCreate(items, options = {}) {
    return flowDB.bulkCreate(COLLECTION, items, options);
  },
  
  async findAll(options = {}) {
    return flowDB.findAll(COLLECTION, options);
  },
  
  async findOne(options = {}) {
    return flowDB.findOne(COLLECTION, options);
  },
  
  async findByPk(id, options = {}) {
    return flowDB.findByPk(COLLECTION, id, options);
  },
  
  async findAndCountAll(options = {}) {
    return flowDB.findAndCountAll(COLLECTION, options);
  },
  
  async count(options = {}) {
    return flowDB.count(COLLECTION, options);
  },
  
  async update(data, options = {}) {
    return flowDB.update(COLLECTION, data, options);
  },
  
  async destroy(options = {}) {
    return flowDB.destroy(COLLECTION, options);
  }
};

module.exports = OperationLog;
