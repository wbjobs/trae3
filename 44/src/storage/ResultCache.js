const Redis = require('ioredis');
const config = require('../../config');
const logger = require('../common/logger');

class ResultCache {
  constructor(options = {}) {
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      ...options,
    });
    this.ttl = options.ttl || 86400;
    this.prefix = options.prefix || 'geological:';
    this._setupEventHandlers();
  }

  _setupEventHandlers() {
    this.redis.on('error', (error) => {
      logger.error('Redis cache error:', error);
    });

    this.redis.on('connect', () => {
      logger.info('Redis cache connected');
    });
  }

  _getKey(key) {
    return `${this.prefix}${key}`;
  }

  async set(key, value, ttl = this.ttl) {
    try {
      const cacheKey = this._getKey(key);
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      await this.redis.setex(cacheKey, ttl, serialized);
      return true;
    } catch (error) {
      logger.warn(`Cache set failed for key ${key}:`, error.message);
      return false;
    }
  }

  async get(key) {
    try {
      const cacheKey = this._getKey(key);
      const value = await this.redis.get(cacheKey);
      if (!value) return null;
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (error) {
      logger.warn(`Cache get failed for key ${key}:`, error.message);
      return null;
    }
  }

  async delete(key) {
    try {
      const cacheKey = this._getKey(key);
      await this.redis.del(cacheKey);
      return true;
    } catch (error) {
      logger.warn(`Cache delete failed for key ${key}:`, error.message);
      return false;
    }
  }

  async exists(key) {
    try {
      const cacheKey = this._getKey(key);
      const result = await this.redis.exists(cacheKey);
      return result === 1;
    } catch (error) {
      logger.warn(`Cache exists check failed for key ${key}:`, error.message);
      return false;
    }
  }

  async setResult(taskId, result) {
    const key = `result:${taskId}`;
    return this.set(key, result);
  }

  async getResult(taskId) {
    const key = `result:${taskId}`;
    return this.get(key);
  }

  async deleteResult(taskId) {
    const key = `result:${taskId}`;
    return this.delete(key);
  }

  async setTaskStatus(taskId, status) {
    const key = `status:${taskId}`;
    return this.set(key, status, 3600);
  }

  async getTaskStatus(taskId) {
    const key = `status:${taskId}`;
    return this.get(key);
  }

  async setBatchStatus(batchId, status) {
    const key = `batch:${batchId}`;
    return this.set(key, status, 3600);
  }

  async getBatchStatus(batchId) {
    const key = `batch:${batchId}`;
    return this.get(key);
  }

  async incrementCounter(key, amount = 1) {
    try {
      const cacheKey = this._getKey(key);
      return await this.redis.incrby(cacheKey, amount);
    } catch (error) {
      logger.warn(`Cache increment failed for key ${key}:`, error.message);
      return null;
    }
  }

  async addToSet(setName, value) {
    try {
      const cacheKey = this._getKey(setName);
      return await this.redis.sadd(cacheKey, value);
    } catch (error) {
      logger.warn(`Cache addToSet failed for set ${setName}:`, error.message);
      return null;
    }
  }

  async removeFromSet(setName, value) {
    try {
      const cacheKey = this._getKey(setName);
      return await this.redis.srem(cacheKey, value);
    } catch (error) {
      logger.warn(`Cache removeFromSet failed for set ${setName}:`, error.message);
      return null;
    }
  }

  async getSetMembers(setName) {
    try {
      const cacheKey = this._getKey(setName);
      return await this.redis.smembers(cacheKey);
    } catch (error) {
      logger.warn(`Cache getSetMembers failed for set ${setName}:`, error.message);
      return [];
    }
  }

  async setWithPattern(pattern, data, ttl = this.ttl) {
    const pipeline = this.redis.pipeline();
    for (const [key, value] of Object.entries(data)) {
      const cacheKey = this._getKey(`${pattern}:${key}`);
      pipeline.setex(cacheKey, ttl, JSON.stringify(value));
    }
    try {
      await pipeline.exec();
      return true;
    } catch (error) {
      logger.warn(`Cache batch set failed:`, error.message);
      return false;
    }
  }

  async getWithPattern(pattern, keys) {
    const pipeline = this.redis.pipeline();
    for (const key of keys) {
      const cacheKey = this._getKey(`${pattern}:${key}`);
      pipeline.get(cacheKey);
    }
    try {
      const results = await pipeline.exec();
      return results.map(([err, result]) => {
        if (err) return null;
        try {
          return result ? JSON.parse(result) : null;
        } catch {
          return result;
        }
      });
    } catch (error) {
      logger.warn(`Cache batch get failed:`, error.message);
      return keys.map(() => null);
    }
  }

  async clearPattern(pattern) {
    try {
      const cachePattern = this._getKey(pattern);
      const keys = await this.redis.keys(cachePattern);
      if (keys.length > 0) {
        await this.redis.del(keys);
      }
      return keys.length;
    } catch (error) {
      logger.warn(`Cache clearPattern failed for pattern ${pattern}:`, error.message);
      return 0;
    }
  }

  async getStats() {
    try {
      const info = await this.redis.info();
      const lines = info.split('\r\n');
      const stats = {};
      for (const line of lines) {
        if (line && !line.startsWith('#')) {
          const [key, value] = line.split(':');
          if (key && value) {
            stats[key] = value;
          }
        }
      }
      return {
        connected: this.redis.status === 'ready',
        usedMemory: stats.used_memory_human,
        connectedClients: stats.connected_clients,
        totalCommands: stats.total_commands_processed,
        keyspaceHits: stats.keyspace_hits,
        keyspaceMisses: stats.keyspace_misses,
        hitRate: parseInt(stats.keyspace_hits || 0) + parseInt(stats.keyspace_misses || 0) > 0
          ? (parseInt(stats.keyspace_hits || 0) / (parseInt(stats.keyspace_hits || 0) + parseInt(stats.keyspace_misses || 0))).toFixed(2)
          : 'N/A',
      };
    } catch (error) {
      logger.warn('Cache stats retrieval failed:', error.message);
      return { connected: false };
    }
  }

  async close() {
    try {
      await this.redis.quit();
      logger.info('Redis cache connection closed');
    } catch (error) {
      logger.error('Error closing Redis cache:', error);
    }
  }
}

module.exports = ResultCache;
