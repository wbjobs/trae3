const { flowDB } = require('../../config/database');

const COLLECTION = 'applications';

const Application = {
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
  
  async sum(field, options = {}) {
    return flowDB.sum(COLLECTION, field, options);
  },
  
  async update(data, options = {}) {
    return flowDB.update(COLLECTION, data, options);
  },
  
  async destroy(options = {}) {
    return flowDB.destroy(COLLECTION, options);
  },
  
  hasMany(model, options) {
    this._associations = this._associations || {};
    this._associations[options.as] = { model, ...options };
  },
  
  belongsTo(model, options) {
    this._associations = this._associations || {};
    this._associations[options.as] = { model, ...options };
  },
  
  sequelize: {
    fn: (name, ...args) => ({ fn: name, args }),
    col: (name) => name
  }
};

module.exports = Application;
