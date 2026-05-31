const { Logger } = require('./logger');

const logger = new Logger('QueryCache');

class LRUCache {
  constructor(maxSize = 1000, ttlMs = 60000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.cache = new Map();
    this.accessOrder = [];
    this.hits = 0;
    this.misses = 0;
  }

  _generateKey(query, params = []) {
    return `${query}:${JSON.stringify(params)}`;
  }

  get(query, params = []) {
    const key = this._generateKey(query, params);
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      return null;
    }
    
    const now = Date.now();
    if (now - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      this._removeFromAccessOrder(key);
      this.misses++;
      return null;
    }
    
    this.hits++;
    this._updateAccessOrder(key);
    
    return entry.value;
  }

  set(query, params = [], value) {
    const key = this._generateKey(query, params);
    
    if (this.cache.has(key)) {
      this._removeFromAccessOrder(key);
    }
    
    if (this.cache.size >= this.maxSize) {
      this._evictOldest();
    }
    
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
    
    this.accessOrder.unshift(key);
  }

  _updateAccessOrder(key) {
    this._removeFromAccessOrder(key);
    this.accessOrder.unshift(key);
  }

  _removeFromAccessOrder(key) {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  _evictOldest() {
    const oldestKey = this.accessOrder.pop();
    if (oldestKey) {
      this.cache.delete(oldestKey);
      logger.debug(`Evicted cache entry: ${oldestKey.substring(0, 50)}...`);
    }
  }

  invalidate(query, params = []) {
    const key = this._generateKey(query, params);
    this.cache.delete(key);
    this._removeFromAccessOrder(key);
  }

  invalidatePattern(pattern) {
    const regex = new RegExp(pattern);
    let count = 0;
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        this._removeFromAccessOrder(key);
        count++;
      }
    }
    
    if (count > 0) {
      logger.debug(`Invalidated ${count} cache entries matching pattern: ${pattern}`);
    }
    
    return count;
  }

  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.accessOrder = [];
    logger.info(`Cache cleared, ${size} entries removed`);
  }

  getStats() {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? (this.hits / total * 100).toFixed(2) : '0.00'
    };
  }

  resetStats() {
    this.hits = 0;
    this.misses = 0;
  }

  cleanupExpired() {
    const now = Date.now();
    let removed = 0;
    
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.ttlMs) {
        this.cache.delete(key);
        this._removeFromAccessOrder(key);
        removed++;
      }
    }
    
    if (removed > 0) {
      logger.debug(`Cleaned up ${removed} expired cache entries`);
    }
    
    return removed;
  }
}

class QueryOptimizer {
  constructor() {
    this.queryPatterns = new Map();
    this.slowQueryThreshold = 1000;
    this.suggestionCache = new Map();
  }

  analyzeQuery(query, params, executionTime, rowCount) {
    const fingerprint = this._getQueryFingerprint(query);
    
    if (!this.queryPatterns.has(fingerprint)) {
      this.queryPatterns.set(fingerprint, {
        fingerprint,
        sample: query.substring(0, 200),
        callCount: 0,
        totalTime: 0,
        minTime: Infinity,
        maxTime: 0,
        avgTime: 0,
        totalRows: 0
      });
    }
    
    const pattern = this.queryPatterns.get(fingerprint);
    pattern.callCount++;
    pattern.totalTime += executionTime;
    pattern.minTime = Math.min(pattern.minTime, executionTime);
    pattern.maxTime = Math.max(pattern.maxTime, executionTime);
    pattern.avgTime = pattern.totalTime / pattern.callCount;
    pattern.totalRows += rowCount;
    pattern.lastCalled = Date.now();
    
    if (executionTime > this.slowQueryThreshold) {
      logger.warn(`Slow query detected (${executionTime}ms): ${query.substring(0, 100)}...`);
      this._generateSuggestion(fingerprint, query, executionTime);
    }
    
    return pattern;
  }

  _getQueryFingerprint(query) {
    return query
      .replace(/\s+/g, ' ')
      .replace(/\d+/g, '?')
      .replace(/'[^']*'/g, '?')
      .trim()
      .toLowerCase();
  }

  _generateSuggestion(fingerprint, query, executionTime) {
    if (this.suggestionCache.has(fingerprint)) {
      return;
    }
    
    const suggestions = [];
    
    if (query.toLowerCase().includes('select *')) {
      suggestions.push('避免使用 SELECT *，只选择需要的列');
    }
    
    if (!query.toLowerCase().includes('limit') && !query.toLowerCase().includes('count(')) {
      suggestions.push('考虑添加 LIMIT 限制返回行数');
    }
    
    if (query.toLowerCase().includes('order by') && !query.toLowerCase().includes('limit')) {
      suggestions.push('ORDER BY 配合 LIMIT 可以提升性能');
    }
    
    if (executionTime > 5000) {
      suggestions.push('考虑为相关字段添加索引');
      suggestions.push('检查是否可以使用 TimescaleDB 时间分桶优化');
    }
    
    if (suggestions.length > 0) {
      this.suggestionCache.set(fingerprint, suggestions);
      logger.info(`Query optimization suggestions for slow query:`, suggestions);
    }
  }

  getSlowQueries(threshold = this.slowQueryThreshold) {
    const slow = [];
    for (const pattern of this.queryPatterns.values()) {
      if (pattern.avgTime > threshold) {
        slow.push(pattern);
      }
    }
    return slow.sort((a, b) => b.avgTime - a.avgTime);
  }

  getMostFrequentQueries(limit = 10) {
    return Array.from(this.queryPatterns.values())
      .sort((a, b) => b.callCount - a.callCount)
      .slice(0, limit);
  }

  getSuggestions(fingerprint = null) {
    if (fingerprint) {
      return this.suggestionCache.get(fingerprint) || null;
    }
    return Array.from(this.suggestionCache.entries());
  }

  getStats() {
    return {
      uniqueQueries: this.queryPatterns.size,
      totalCalls: Array.from(this.queryPatterns.values()).reduce((sum, p) => sum + p.callCount, 0),
      slowQueries: this.getSlowQueries().length,
      suggestions: this.suggestionCache.size
    };
  }
}

class DatabaseCache {
  constructor(options = {}) {
    this.queryCache = new LRUCache(
      options.maxCacheSize || 2000,
      options.cacheTtlMs || 30000
    );
    
    this.queryOptimizer = new QueryOptimizer();
    this.logger = new Logger('DatabaseCache');
    
    this.cleanupInterval = setInterval(() => {
      const removed = this.queryCache.cleanupExpired();
      if (removed > 0) {
        this.logger.debug(`Auto cleanup removed ${removed} expired entries`);
      }
    }, options.cleanupIntervalMs || 60000);
  }

  async cachedQuery(pool, query, params = [], options = {}) {
    const {
      useCache = true,
      invalidateCache = false,
      ttlMs
    } = options;

    if (invalidateCache) {
      this.queryCache.invalidate(query, params);
    }

    if (useCache && !invalidateCache) {
      const cached = this.queryCache.get(query, params);
      if (cached !== null) {
        return {
          rows: cached,
          fromCache: true,
          executionTime: 0
        };
      }
    }

    const startTime = Date.now();
    const result = await pool.query(query, params);
    const executionTime = Date.now() - startTime;

    this.queryOptimizer.analyzeQuery(query, params, executionTime, result.rows?.length || 0);

    if (useCache && result.rows && result.rows.length > 0 && result.rows.length <= 1000) {
      this.queryCache.set(query, params, result.rows);
    }

    return {
      rows: result.rows,
      fromCache: false,
      executionTime,
      rowCount: result.rows?.length || 0
    };
  }

  invalidatePattern(pattern) {
    return this.queryCache.invalidatePattern(pattern);
  }

  invalidateTable(tableName) {
    return this.invalidatePattern(`(FROM|JOIN|UPDATE|DELETE|INSERT INTO)\\s+${tableName}`);
  }

  getStats() {
    return {
      queryCache: this.queryCache.getStats(),
      queryOptimizer: this.queryOptimizer.getStats()
    };
  }

  getQueryStats() {
    return {
      slowQueries: this.queryOptimizer.getSlowQueries(),
      frequentQueries: this.queryOptimizer.getMostFrequentQueries(20)
    };
  }

  clearCache() {
    this.queryCache.clear();
  }

  close() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

module.exports = {
  LRUCache,
  QueryOptimizer,
  DatabaseCache
};
