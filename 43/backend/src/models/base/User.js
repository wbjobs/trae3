const { baseDB } = require('../../config/database');

const COLLECTION = 'users';

const User = {
  async create(data, options = {}) {
    return baseDB.create(COLLECTION, data, options);
  },
  
  async bulkCreate(items, options = {}) {
    return baseDB.bulkCreate(COLLECTION, items, options);
  },
  
  async findAll(options = {}) {
    const rows = await baseDB.findAll(COLLECTION, options);
    return rows.map(r => {
      const user = { ...r };
      user.toJSON = () => ({ ...r });
      return user;
    });
  },
  
  async findOne(options = {}) {
    const item = await baseDB.findOne(COLLECTION, options);
    if (!item) return null;
    const user = { ...item };
    user.toJSON = () => ({ ...item });
    return user;
  },
  
  async findByPk(id, options = {}) {
    const item = await baseDB.findByPk(COLLECTION, id, options);
    if (!item) return null;
    const user = { ...item };
    user.toJSON = () => ({ ...item });
    return user;
  },
  
  async findAndCountAll(options = {}) {
    const result = await baseDB.findAndCountAll(COLLECTION, options);
    return {
      count: result.count,
      rows: result.rows.map(r => {
        const user = { ...r };
        user.toJSON = () => ({ ...r });
        return user;
      })
    };
  },
  
  async count(options = {}) {
    return baseDB.count(COLLECTION, options);
  },
  
  async update(data, options = {}) {
    return baseDB.update(COLLECTION, data, options);
  },
  
  async destroy(options = {}) {
    return baseDB.destroy(COLLECTION, options);
  },
  
  belongsTo(model, options) {
    this._associations = this._associations || {};
    this._associations[options.as] = { model, ...options };
  },
  
  hasMany(model, options) {
    this._associations = this._associations || {};
    this._associations[options.as] = { model, ...options };
  }
};

module.exports = User;
