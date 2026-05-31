const { Logger } = require('./logger');

const logger = new Logger('ThrottleManager');

class SlidingWindowRateLimiter {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map();
  }

  isAllowed(key) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    let timestamps = this.requests.get(key) || [];
    timestamps = timestamps.filter(t => t > windowStart);
    
    if (timestamps.length >= this.maxRequests) {
      return false;
    }
    
    timestamps.push(now);
    this.requests.set(key, timestamps);
    
    if (timestamps.length % 10 === 0) {
      setImmediate(() => this.cleanup());
    }
    
    return true;
  }

  getRemaining(key) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const timestamps = (this.requests.get(key) || []).filter(t => t > windowStart);
    return Math.max(0, this.maxRequests - timestamps.length);
  }

  cleanup() {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    for (const [key, timestamps] of this.requests) {
      const filtered = timestamps.filter(t => t > windowStart);
      if (filtered.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, filtered);
      }
    }
  }

  reset(key) {
    this.requests.delete(key);
  }
}

class BatchAggregator {
  constructor(maxBatchSize, maxWaitMs, flushCallback) {
    this.maxBatchSize = maxBatchSize;
    this.maxWaitMs = maxWaitMs;
    this.flushCallback = flushCallback;
    this.batches = new Map();
    this.timers = new Map();
    this.totalProcessed = 0;
    this.totalBatches = 0;
  }

  add(key, item) {
    if (!this.batches.has(key)) {
      this.batches.set(key, []);
    }
    
    const batch = this.batches.get(key);
    batch.push(item);
    
    if (batch.length >= this.maxBatchSize) {
      this.flush(key);
    } else if (!this.timers.has(key)) {
      this.timers.set(key, setTimeout(() => this.flush(key), this.maxWaitMs));
    }
    
    return batch.length;
  }

  async flush(key) {
    const batch = this.batches.get(key);
    const timer = this.timers.get(key);
    
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
    
    if (!batch || batch.length === 0) {
      return 0;
    }
    
    this.batches.delete(key);
    
    try {
      await this.flushCallback(key, batch);
      this.totalProcessed += batch.length;
      this.totalBatches++;
      return batch.length;
    } catch (err) {
      logger.error(`Flush batch failed for ${key}:`, err.message);
      throw err;
    }
  }

  async flushAll() {
    const keys = Array.from(this.batches.keys());
    let total = 0;
    
    for (const key of keys) {
      total += await this.flush(key);
    }
    
    return total;
  }

  getStats() {
    const pending = Array.from(this.batches.values()).reduce((sum, b) => sum + b.length, 0);
    return {
      pending,
      totalProcessed: this.totalProcessed,
      totalBatches: this.totalBatches,
      activeBatches: this.batches.size,
      avgBatchSize: this.totalBatches > 0 ? Math.round(this.totalProcessed / this.totalBatches) : 0
    };
  }
}

class DataDeduplicator {
  constructor(ttlMs = 5000) {
    this.ttlMs = ttlMs;
    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  isDuplicate(key, data) {
    const dataHash = this.generateHash(data);
    const cacheKey = `${key}:${dataHash}`;
    const now = Date.now();
    
    const existing = this.cache.get(cacheKey);
    if (existing && (now - existing < this.ttlMs)) {
      this.hits++;
      return true;
    }
    
    this.cache.set(cacheKey, now);
    this.misses++;
    
    if (this.cache.size % 100 === 0) {
      setImmediate(() => this.cleanup());
    }
    
    return false;
  }

  generateHash(data) {
    if (typeof data === 'object') {
      return `${data.device_id}:${data.signal_strength}:${data.status}`;
    }
    return String(data);
  }

  cleanup() {
    const now = Date.now();
    for (const [key, timestamp] of this.cache) {
      if (now - timestamp >= this.ttlMs) {
        this.cache.delete(key);
      }
    }
  }

  getStats() {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? (this.hits / total * 100).toFixed(2) : '0.00',
      cacheSize: this.cache.size
    };
  }
}

class AdaptiveThrottler {
  constructor(options = {}) {
    this.baseRate = options.baseRate || 1000;
    this.maxRate = options.maxRate || 5000;
    this.minRate = options.minRate || 100;
    this.currentRate = this.baseRate;
    this.loadHistory = [];
    this.adjustmentInterval = options.adjustmentInterval || 10000;
    this.lastAdjustment = Date.now();
    this.logger = new Logger('AdaptiveThrottler');
  }

  recordLoad(load) {
    this.loadHistory.push({ time: Date.now(), load });
    
    if (this.loadHistory.length > 50) {
      this.loadHistory.shift();
    }
    
    this.maybeAdjust();
  }

  maybeAdjust() {
    const now = Date.now();
    if (now - this.lastAdjustment < this.adjustmentInterval) {
      return;
    }
    
    const recent = this.loadHistory.slice(-10);
    const avgLoad = recent.reduce((sum, r) => sum + r.load, 0) / recent.length;
    
    if (avgLoad > 0.8 && this.currentRate > this.minRate) {
      this.currentRate = Math.max(this.minRate, Math.round(this.currentRate * 0.8));
      this.logger.info(`Throttling rate reduced to ${this.currentRate} req/s (avg load: ${avgLoad.toFixed(2)})`);
    } else if (avgLoad < 0.5 && this.currentRate < this.maxRate) {
      this.currentRate = Math.min(this.maxRate, Math.round(this.currentRate * 1.2));
      this.logger.info(`Throttling rate increased to ${this.currentRate} req/s (avg load: ${avgLoad.toFixed(2)})`);
    }
    
    this.lastAdjustment = now;
  }

  getRate() {
    return this.currentRate;
  }

  getStats() {
    return {
      currentRate: this.currentRate,
      baseRate: this.baseRate,
      maxRate: this.maxRate,
      minRate: this.minRate,
      recentLoad: this.loadHistory.slice(-5)
    };
  }
}

class ThrottleManager {
  constructor(options = {}) {
    this.options = {
      maxRequestsPerWindow: options.maxRequestsPerWindow || 1000,
      windowMs: options.windowMs || 60000,
      maxBatchSize: options.maxBatchSize || 100,
      maxWaitMs: options.maxWaitMs || 500,
      dedupTtlMs: options.dedupTtlMs || 3000,
      perDeviceLimit: options.perDeviceLimit || 60,
      perDeviceWindowMs: options.perDeviceWindowMs || 1000
    };
    
    this.globalLimiter = new SlidingWindowRateLimiter(
      this.options.maxRequestsPerWindow,
      this.options.windowMs
    );
    
    this.deviceLimiters = new Map();
    this.deduplicator = new DataDeduplicator(this.options.dedupTtlMs);
    this.adaptiveThrottler = new AdaptiveThrottler();
    
    this.batchAggregator = new BatchAggregator(
      this.options.maxBatchSize,
      this.options.maxWaitMs,
      async (key, batch) => {
        if (this.options.batchHandler) {
          await this.options.batchHandler(key, batch);
        }
      }
    );
    
    this.rejectedCount = 0;
    this.acceptedCount = 0;
    
    this.logger = new Logger('ThrottleManager');
  }

  setBatchHandler(handler) {
    this.batchAggregator.flushCallback = handler;
  }

  checkDeviceLimit(deviceId) {
    if (!this.deviceLimiters.has(deviceId)) {
      this.deviceLimiters.set(
        deviceId,
        new SlidingWindowRateLimiter(this.options.perDeviceLimit, this.options.perDeviceWindowMs)
      );
    }
    
    const limiter = this.deviceLimiters.get(deviceId);
    return limiter.isAllowed(deviceId);
  }

  async processData(deviceId, data) {
    if (!data || !data.device_id) {
      return { allowed: false, reason: 'invalid_data' };
    }

    const isDup = this.deduplicator.isDuplicate(deviceId, data);
    if (isDup) {
      this.rejectedCount++;
      return { allowed: false, reason: 'duplicate' };
    }

    const globalAllowed = this.globalLimiter.isAllowed('global');
    if (!globalAllowed) {
      this.rejectedCount++;
      return { allowed: false, reason: 'global_limit_exceeded' };
    }

    const deviceAllowed = this.checkDeviceLimit(deviceId);
    if (!deviceAllowed) {
      this.rejectedCount++;
      return { allowed: false, reason: 'device_limit_exceeded' };
    }

    const batchSize = this.batchAggregator.add(deviceId, data);
    this.acceptedCount++;

    const load = this.getSystemLoad();
    this.adaptiveThrottler.recordLoad(load);

    return { 
      allowed: true, 
      batchSize,
      adaptiveRate: this.adaptiveThrottler.getRate()
    };
  }

  async processBatch(deviceId, dataList) {
    const results = [];
    
    for (const data of dataList) {
      const result = await this.processData(deviceId || data.device_id, data);
      results.push(result);
    }
    
    return results;
  }

  async flushAll() {
    return await this.batchAggregator.flushAll();
  }

  getSystemLoad() {
    const totalRequests = this.acceptedCount + this.rejectedCount;
    const rejectionRate = totalRequests > 0 ? this.rejectedCount / totalRequests : 0;
    const batchStats = this.batchAggregator.getStats();
    
    return Math.min(1, rejectionRate + (batchStats.pending / this.options.maxBatchSize / 10));
  }

  getStats() {
    const total = this.acceptedCount + this.rejectedCount;
    
    return {
      accepted: this.acceptedCount,
      rejected: this.rejectedCount,
      acceptanceRate: total > 0 ? ((this.acceptedCount / total) * 100).toFixed(2) : '100.00',
      globalLimiter: {
        maxRequests: this.globalLimiter.maxRequests,
        windowMs: this.globalLimiter.windowMs
      },
      deviceLimiters: {
        count: this.deviceLimiters.size,
        perDeviceLimit: this.options.perDeviceLimit,
        perDeviceWindowMs: this.options.perDeviceWindowMs
      },
      batchAggregator: this.batchAggregator.getStats(),
      deduplicator: this.deduplicator.getStats(),
      adaptiveThrottler: this.adaptiveThrottler.getStats()
    };
  }

  resetStats() {
    this.acceptedCount = 0;
    this.rejectedCount = 0;
    this.deduplicator.hits = 0;
    this.deduplicator.misses = 0;
    this.logger.info('Stats reset');
  }
}

module.exports = {
  SlidingWindowRateLimiter,
  BatchAggregator,
  DataDeduplicator,
  AdaptiveThrottler,
  ThrottleManager
};
