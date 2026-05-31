const fs = require('fs');
const path = require('path');

class JSONFileDB {
  constructor(filePath, defaultData = {}) {
    this.filePath = filePath;
    this.defaultData = defaultData;
    this.data = { ...defaultData };
    this.transactionData = null;
    this.inTransaction = false;
    this.indexes = {};
    this.queryCache = new Map();
    this.cacheTTL = 60000;
    this.indexedFields = {
      applications: ['id', 'status', 'currentStep', 'applicantId', 'chemicalId', 'applyNo'],
      approvalRecords: ['id', 'applicationId', 'approvalStep', 'approverId'],
      traceLogs: ['id', 'applicationId', 'action', 'operatorId'],
      chemicals: ['id', 'chemicalName', 'casNo', 'dangerLevel', 'status'],
      users: ['id', 'username', 'roleId', 'department'],
      roles: ['id', 'roleCode'],
      permissions: ['id', 'permissionCode'],
      operationLogs: ['id', 'userId', 'action']
    };
  }

  async init() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(this.filePath)) {
      try {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        this.data = JSON.parse(content);
        for (const key of Object.keys(this.defaultData)) {
          if (!this.data[key]) {
            this.data[key] = [...this.defaultData[key]];
          }
        }
      } catch (e) {
        console.warn('数据库文件损坏，使用默认数据:', e.message);
        this.data = { ...this.defaultData };
        await this.save();
      }
    } else {
      this.data = { ...this.defaultData };
      await this.save();
    }
    
    this._buildAllIndexes();
    this._startCacheCleanup();
  }

  _buildAllIndexes() {
    for (const [collection, fields] of Object.entries(this.indexedFields)) {
      if (this.data[collection]) {
        this._buildIndex(collection, fields);
      }
    }
  }

  _buildIndex(collectionName, fields) {
    if (!this.indexes[collectionName]) {
      this.indexes[collectionName] = {};
    }
    
    for (const field of fields) {
      this.indexes[collectionName][field] = new Map();
      const collection = this.data[collectionName] || [];
      for (const item of collection) {
        const value = item[field];
        if (value !== undefined && value !== null) {
          const key = String(value);
          if (!this.indexes[collectionName][field].has(key)) {
            this.indexes[collectionName][field].set(key, []);
          }
          this.indexes[collectionName][field].get(key).push(item);
        }
      }
    }
  }

  _updateIndex(collectionName, item) {
    const fields = this.indexedFields[collectionName];
    if (!fields || !this.indexes[collectionName]) return;
    
    for (const field of fields) {
      const value = item[field];
      if (value !== undefined && value !== null) {
        const key = String(value);
        if (!this.indexes[collectionName][field].has(key)) {
          this.indexes[collectionName][field].set(key, []);
        }
        this.indexes[collectionName][field].get(key).push(item);
      }
    }
  }

  _removeFromIndex(collectionName, item) {
    const fields = this.indexedFields[collectionName];
    if (!fields || !this.indexes[collectionName]) return;
    
    for (const field of fields) {
      const value = item[field];
      if (value !== undefined && value !== null) {
        const key = String(value);
        const indexed = this.indexes[collectionName][field].get(key);
        if (indexed) {
          const idx = indexed.indexOf(item);
          if (idx > -1) indexed.splice(idx, 1);
          if (indexed.length === 0) {
            this.indexes[collectionName][field].delete(key);
          }
        }
      }
    }
  }

  _invalidateCache(collectionName) {
    for (const [key] of this.queryCache) {
      if (key.startsWith(`${collectionName}:`)) {
        this.queryCache.delete(key);
      }
    }
  }

  _getCacheKey(collectionName, options) {
    return `${collectionName}:${JSON.stringify(options)}`;
  }

  _getFromCache(collectionName, options) {
    const key = this._getCacheKey(collectionName, options);
    const cached = this.queryCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    if (cached) {
      this.queryCache.delete(key);
    }
    return null;
  }

  _setToCache(collectionName, options, data) {
    const key = this._getCacheKey(collectionName, options);
    this.queryCache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  _startCacheCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.queryCache) {
        if (now - value.timestamp > this.cacheTTL) {
          this.queryCache.delete(key);
        }
      }
    }, 60000);
  }

  async save() {
    const dataToSave = this.inTransaction ? this.transactionData : this.data;
    fs.writeFileSync(this.filePath, JSON.stringify(dataToSave, null, 2), 'utf-8');
  }

  async transaction(callback) {
    this.inTransaction = true;
    this.transactionData = JSON.parse(JSON.stringify(this.data));
    
    try {
      const result = await callback({
        getCollection: (name) => this.transactionData[name] || [],
        setCollection: (name, data) => { this.transactionData[name] = data; },
        commit: async () => {
          this.data = JSON.parse(JSON.stringify(this.transactionData));
          await this.save();
          this.inTransaction = false;
          this.transactionData = null;
        },
        rollback: () => {
          this.inTransaction = false;
          this.transactionData = null;
        }
      });
      if (this.inTransaction) {
        this.data = JSON.parse(JSON.stringify(this.transactionData));
        await this.save();
        this.inTransaction = false;
        this.transactionData = null;
      }
      return result;
    } catch (e) {
      this.inTransaction = false;
      this.transactionData = null;
      throw e;
    }
  }

  _matchOp(value, op, target) {
    switch (op) {
      case 'eq': return value === target;
      case 'ne': return value !== target;
      case 'gt': return value > target;
      case 'gte': return value >= target;
      case 'lt': return value < target;
      case 'lte': return value <= target;
      case 'like': 
        if (typeof value !== 'string' || typeof target !== 'string') return false;
        const pattern = target.replace(/%/g, '.*');
        return new RegExp(`^${pattern}$`, 'i').test(value);
      case 'in': return Array.isArray(target) && target.includes(value);
      case 'notIn': return Array.isArray(target) && !target.includes(value);
      default: return value === target;
    }
  }

  _canUseIndex(collectionName, where) {
    if (!where) return null;
    const collectionIndexedFields = this.indexedFields[collectionName] || [];
    for (const [key, condition] of Object.entries(where)) {
      if (collectionIndexedFields.includes(key) && 
          (typeof condition !== 'object' || 
           (Object.keys(condition).length === 1 && condition.eq !== undefined))) {
        return {
          field: key,
          value: typeof condition === 'object' ? condition.eq : condition
        };
      }
    }
    return null;
  }

  _quickFilter(collectionName, where, collection) {
    const indexInfo = this._canUseIndex(collectionName, where);
    if (!indexInfo || !this.indexes[collectionName] || !this.indexes[collectionName][indexInfo.field]) {
      return null;
    }
    
    const { field, value } = indexInfo;
    const key = String(value);
    const indexed = this.indexes[collectionName][field].get(key);
    if (!indexed) return [];
    
    const remainingWhere = { ...where };
    delete remainingWhere[field];
    
    if (Object.keys(remainingWhere).length === 0) {
      return [...indexed];
    }
    
    return indexed.filter(item => this._matchWhere(item, remainingWhere));
  }

  _matchWhere(item, where) {
    if (!where) return true;
    
    for (const [key, condition] of Object.entries(where)) {
      if (key === 'or' || key === 'and') {
        const conditions = condition;
        const results = conditions.map(w => this._matchWhere(item, w));
        if (key === 'or') {
          if (!results.some(r => r)) return false;
        } else {
          if (!results.every(r => r)) return false;
        }
      } else if (typeof condition === 'object' && condition !== null && !Array.isArray(condition)) {
        for (const [op, target] of Object.entries(condition)) {
          if (!this._matchOp(item[key], op, target)) return false;
        }
      } else {
        if (item[key] !== condition) return false;
      }
    }
    return true;
  }

  _getWorkingData(collectionName, tx) {
    if (tx) {
      return tx.getCollection(collectionName);
    }
    if (this.inTransaction && this.transactionData) {
      return this.transactionData[collectionName] || [];
    }
    return this.data[collectionName] || [];
  }

  _setWorkingData(collectionName, data, tx) {
    if (tx) {
      tx.setCollection(collectionName, data);
    } else if (this.inTransaction && this.transactionData) {
      this.transactionData[collectionName] = data;
    } else {
      this.data[collectionName] = data;
    }
  }

  async create(collectionName, data, options = {}) {
    const { transaction: tx } = options;
    const collection = this._getWorkingData(collectionName, tx);
    const newItem = { ...data };
    
    if (collection.length > 0) {
      const maxId = Math.max(...collection.map(i => i.id || 0));
      newItem.id = maxId + 1;
    } else {
      newItem.id = 1;
    }
    
    const now = new Date();
    newItem.createdAt = now;
    newItem.updatedAt = now;
    
    const newCollection = [...collection, newItem];
    this._setWorkingData(collectionName, newCollection, tx);
    
    if (!this.inTransaction && !tx) {
      await this.save();
      this._updateIndex(collectionName, newItem);
      this._invalidateCache(collectionName);
    }
    
    return { ...newItem, dataValues: newItem };
  }

  async bulkCreate(collectionName, items, options = {}) {
    const { transaction: tx } = options;
    const collection = this._getWorkingData(collectionName, tx);
    const now = new Date();
    let nextId = collection.length > 0 ? Math.max(...collection.map(i => i.id || 0)) + 1 : 1;
    
    const newItems = items.map(item => {
      const newItem = { ...item, id: nextId++, createdAt: now, updatedAt: now };
      return newItem;
    });
    
    const newCollection = [...collection, ...newItems];
    this._setWorkingData(collectionName, newCollection, tx);
    
    if (!this.inTransaction && !tx) {
      await this.save();
      for (const item of newItems) {
        this._updateIndex(collectionName, item);
      }
      this._invalidateCache(collectionName);
    }
    
    return newItems.map(item => ({ ...item, dataValues: item }));
  }

  async findAll(collectionName, options = {}) {
    const { where, order, limit, offset, attributes, transaction } = options;
    
    if (!transaction && !this.inTransaction) {
      const cached = this._getFromCache(collectionName, options);
      if (cached) {
        return cached;
      }
    }
    
    let collection = this._getWorkingData(collectionName, transaction);
    
    if (where) {
      const quickResult = this._quickFilter(collectionName, where, collection);
      if (quickResult !== null) {
        collection = quickResult;
      } else {
        collection = collection.filter(item => this._matchWhere(item, where));
      }
    }
    
    if (order) {
      const [sortField, sortDir = 'ASC'] = order[0];
      collection = [...collection].sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];
        if (sortField === 'fn') {
          const fn = order[0][1];
          if (fn && fn.fn === 'COUNT') return 0;
        }
        if (valA == null && valB == null) return 0;
        if (valA == null) return 1;
        if (valB == null) return -1;
        if (valA < valB) return sortDir === 'ASC' ? -1 : 1;
        if (valA > valB) return sortDir === 'ASC' ? 1 : -1;
        return 0;
      });
    }
    
    let result = collection;
    if (offset !== undefined) {
      result = result.slice(offset);
    }
    if (limit !== undefined) {
      result = result.slice(0, limit);
    }
    
    const wrappedResult = result.map(item => {
      const wrapped = { ...item, dataValues: { ...item } };
      if (attributes && attributes.exclude) {
        attributes.exclude.forEach(attr => {
          delete wrapped[attr];
          delete wrapped.dataValues[attr];
        });
      }
      return wrapped;
    });
    
    if (!transaction && !this.inTransaction) {
      this._setToCache(collectionName, options, wrappedResult);
    }
    
    return wrappedResult;
  }

  async findOne(collectionName, options = {}) {
    const { where, transaction } = options;
    
    if (!transaction && !this.inTransaction) {
      const cached = this._getFromCache(collectionName, { ...options, _type: 'findOne' });
      if (cached !== null) {
        return cached;
      }
    }
    
    let collection = this._getWorkingData(collectionName, transaction);
    
    if (where) {
      const quickResult = this._quickFilter(collectionName, where, collection);
      if (quickResult !== null) {
        collection = quickResult;
      }
    }
    
    const item = collection.find(item => this._matchWhere(item, where || {}));
    const result = item ? { ...item, dataValues: { ...item } } : null;
    
    if (!transaction && !this.inTransaction) {
      this._setToCache(collectionName, { ...options, _type: 'findOne' }, result);
    }
    
    return result;
  }

  async findByPk(collectionName, id, options = {}) {
    const { transaction } = options;
    
    if (!transaction && !this.inTransaction) {
      const cacheKey = { _type: 'findByPk', id };
      const cached = this._getFromCache(collectionName, cacheKey);
      if (cached !== null) {
        return cached;
      }
    }
    
    if (this.indexes[collectionName] && this.indexes[collectionName].id) {
      const indexed = this.indexes[collectionName].id.get(String(id));
      if (indexed && indexed.length > 0) {
        const result = { ...indexed[0], dataValues: { ...indexed[0] } };
        if (!transaction && !this.inTransaction) {
          this._setToCache(collectionName, { _type: 'findByPk', id }, result);
        }
        return result;
      }
    }
    
    const collection = this._getWorkingData(collectionName, transaction);
    const item = collection.find(item => item.id === id);
    const result = item ? { ...item, dataValues: { ...item } } : null;
    
    if (!transaction && !this.inTransaction) {
      this._setToCache(collectionName, { _type: 'findByPk', id }, result);
    }
    
    return result;
  }

  async findAndCountAll(collectionName, options = {}) {
    const { where, order, limit, offset, transaction } = options;
    
    if (!transaction && !this.inTransaction) {
      const cached = this._getFromCache(collectionName, { ...options, _type: 'findAndCountAll' });
      if (cached) {
        return cached;
      }
    }
    
    let collection = this._getWorkingData(collectionName, transaction);
    
    if (where) {
      const quickResult = this._quickFilter(collectionName, where, collection);
      if (quickResult !== null) {
        collection = quickResult;
      } else {
        collection = collection.filter(item => this._matchWhere(item, where));
      }
    }
    
    const count = collection.length;
    
    let rows = [...collection];
    if (order) {
      const [sortField, sortDir = 'ASC'] = order[0];
      rows.sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];
        if (valA == null && valB == null) return 0;
        if (valA == null) return 1;
        if (valB == null) return -1;
        if (valA < valB) return sortDir === 'ASC' ? -1 : 1;
        if (valA > valB) return sortDir === 'ASC' ? 1 : -1;
        return 0;
      });
    }
    
    if (offset !== undefined) {
      rows = rows.slice(offset);
    }
    if (limit !== undefined) {
      rows = rows.slice(0, limit);
    }
    
    const result = {
      count,
      rows: rows.map(item => ({ ...item, dataValues: { ...item } }))
    };
    
    if (!transaction && !this.inTransaction) {
      this._setToCache(collectionName, { ...options, _type: 'findAndCountAll' }, result);
    }
    
    return result;
  }

  async count(collectionName, options = {}) {
    const { where } = options;
    let collection = this._getWorkingData(collectionName, options.transaction);
    
    if (where) {
      collection = collection.filter(item => this._matchWhere(item, where));
    }
    
    return collection.length;
  }

  async sum(collectionName, field, options = {}) {
    const { where } = options;
    let collection = this._getWorkingData(collectionName, options.transaction);
    
    if (where) {
      collection = collection.filter(item => this._matchWhere(item, where));
    }
    
    return collection.reduce((sum, item) => sum + (Number(item[field]) || 0), 0);
  }

  async update(collectionName, data, options = {}) {
    const { where, transaction: tx } = options;
    const collection = this._getWorkingData(collectionName, tx);
    const now = new Date();
    
    const affectedItems = [];
    const newCollection = collection.map(item => {
      if (this._matchWhere(item, where || {})) {
        const newItem = { ...item, ...data, updatedAt: now };
        affectedItems.push({ old: item, new: newItem });
        return newItem;
      }
      return item;
    });
    
    this._setWorkingData(collectionName, newCollection, tx);
    
    if (!this.inTransaction && !tx) {
      await this.save();
      for (const { old, new: newItem } of affectedItems) {
        this._removeFromIndex(collectionName, old);
        this._updateIndex(collectionName, newItem);
      }
      this._invalidateCache(collectionName);
    }
    
    const affectedCount = affectedItems.length;
    
    return [affectedCount];
  }

  async destroy(collectionName, options = {}) {
    const { where, transaction: tx } = options;
    const collection = this._getWorkingData(collectionName, tx);
    
    const removedItems = collection.filter(item => this._matchWhere(item, where || {}));
    const newCollection = collection.filter(item => !this._matchWhere(item, where || {}));
    this._setWorkingData(collectionName, newCollection, tx);
    
    if (!this.inTransaction && !tx) {
      await this.save();
      for (const item of removedItems) {
        this._removeFromIndex(collectionName, item);
      }
      this._invalidateCache(collectionName);
    }
    
    return removedItems.length;
  }
}

module.exports = { JSONFileDB };
