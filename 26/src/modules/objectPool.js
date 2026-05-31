const logger = require('./logger');

class ObjectPool {
  constructor(createFn, resetFn, options = {}) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.minSize = options.minSize || 0;
    this.maxSize = options.maxSize || 50;
    this.pool = [];
    this.createdCount = 0;
    this.borrowedCount = 0;
    this.enableGC = options.enableGC !== false;
    this.gcInterval = options.gcInterval || 30000;
    this.lastGCTime = Date.now();

    this._initialize();
    this._startGCSchedule();
  }

  _initialize() {
    for (let i = 0; i < this.minSize; i++) {
      this.pool.push(this._createObject());
    }
    logger.debug(`ObjectPool: Initialized with ${this.minSize} objects`);
  }

  _createObject() {
    this.createdCount++;
    return this.createFn();
  }

  _startGCSchedule() {
    if (!this.enableGC) return;

    setInterval(() => {
      this._gc();
    }, this.gcInterval);
  }

  _gc() {
    const now = Date.now();
    if (now - this.lastGCTime < this.gcInterval) return;
    this.lastGCTime = now;

    const excessCount = Math.max(0, this.pool.length - this.minSize);
    if (excessCount > 0) {
      const removed = this.pool.splice(this.minSize, excessCount);
      logger.debug(`ObjectPool: GC removed ${removed.length} excess objects`);
    }

    if (global.gc) {
      global.gc();
    }
  }

  acquire() {
    this.borrowedCount++;
    
    if (this.pool.length > 0) {
      return this.pool.pop();
    }

    if (this.createdCount < this.maxSize) {
      return this._createObject();
    }

    logger.warn('ObjectPool: Max size reached, creating new object temporarily');
    return this._createObject();
  }

  release(obj) {
    if (!obj) return;

    this.borrowedCount = Math.max(0, this.borrowedCount - 1);

    if (this.resetFn) {
      try {
        this.resetFn(obj);
      } catch (error) {
        logger.warn('ObjectPool: Reset function error, discarding object', error);
        return;
      }
    }

    if (this.pool.length < this.maxSize) {
      this.pool.push(obj);
    }
  }

  releaseMany(objs) {
    objs.forEach(obj => this.release(obj));
  }

  clear() {
    this.pool = [];
    this.createdCount = 0;
    this.borrowedCount = 0;
    logger.info('ObjectPool: Cleared all objects');
  }

  resize(newMinSize, newMaxSize) {
    this.minSize = Math.max(0, newMinSize);
    this.maxSize = Math.max(this.minSize, newMaxSize);

    while (this.pool.length > this.maxSize) {
      this.pool.pop();
    }

    while (this.pool.length < this.minSize) {
      this.pool.push(this._createObject());
    }

    logger.info(`ObjectPool: Resized to min=${this.minSize}, max=${this.maxSize}`);
  }

  getStats() {
    return {
      totalCreated: this.createdCount,
      inPool: this.pool.length,
      borrowed: this.borrowedCount,
      minSize: this.minSize,
      maxSize: this.maxSize,
      utilization: this.createdCount > 0 ? (this.borrowedCount / this.createdCount * 100).toFixed(1) + '%' : '0%'
    };
  }
}

class BufferPool {
  constructor(options = {}) {
    this.defaultSize = options.defaultSize || 256;
    this.maxSize = options.maxSize || 4096;
    this.pools = new Map();
    this.enableGC = options.enableGC !== false;
    this.gcInterval = options.gcInterval || 60000;

    this._startGCSchedule();
  }

  _getPool(size) {
    const alignedSize = this._alignSize(size);
    
    if (!this.pools.has(alignedSize)) {
      const pool = [];
      pool.lastUsed = Date.now();
      this.pools.set(alignedSize, pool);
    }
    
    return this.pools.get(alignedSize);
  }

  _alignSize(size) {
    if (size <= 64) return 64;
    if (size <= 128) return 128;
    if (size <= 256) return 256;
    if (size <= 512) return 512;
    if (size <= 1024) return 1024;
    if (size <= 2048) return 2048;
    return 4096;
  }

  _startGCSchedule() {
    if (!this.enableGC) return;

    setInterval(() => {
      this._gc();
    }, this.gcInterval);
  }

  _gc() {
    const now = Date.now();
    const timeout = this.gcInterval * 2;

    for (const [size, pool] of this.pools.entries()) {
      if (now - pool.lastUsed > timeout && pool.length > 0) {
        const removed = pool.splice(0, Math.floor(pool.length / 2));
        logger.debug(`BufferPool: GC removed ${removed.length} buffers of size ${size}`);
        pool.lastUsed = now;
      }
    }

    if (global.gc) {
      global.gc();
    }
  }

  allocate(size = this.defaultSize) {
    const pool = this._getPool(size);
    pool.lastUsed = Date.now();

    if (pool.length > 0) {
      return pool.pop();
    }

    const alignedSize = this._alignSize(size);
    return Buffer.alloc(alignedSize);
  }

  free(buffer) {
    if (!Buffer.isBuffer(buffer)) return;

    const pool = this._getPool(buffer.length);
    pool.lastUsed = Date.now();

    buffer.fill(0);
    
    if (pool.length < 20) {
      pool.push(buffer);
    }
  }

  freeMany(buffers) {
    buffers.forEach(buf => this.free(buf));
  }

  clear() {
    this.pools.clear();
    logger.info('BufferPool: Cleared all buffers');
  }

  getStats() {
    const stats = {
      totalPools: this.pools.size,
      totalBuffers: 0,
      totalMemory: 0,
      pools: {}
    };

    for (const [size, pool] of this.pools.entries()) {
      stats.pools[size] = pool.length;
      stats.totalBuffers += pool.length;
      stats.totalMemory += pool.length * size;
    }

    stats.totalMemoryMB = (stats.totalMemory / 1024 / 1024).toFixed(2) + ' MB';
    return stats;
  }
}

const bufferPool = new BufferPool({
  defaultSize: 256,
  maxSize: 4096,
  enableGC: true,
  gcInterval: 60000
});

const taskPool = new ObjectPool(
  () => ({
    id: null,
    type: null,
    deviceId: null,
    params: null,
    options: {},
    status: 'pending',
    progress: 0,
    result: null,
    error: null,
    retryCount: 0,
    createdAt: 0,
    startedAt: null,
    completedAt: null
  }),
  (task) => {
    task.id = null;
    task.type = null;
    task.deviceId = null;
    task.params = null;
    task.options = {};
    task.status = 'pending';
    task.progress = 0;
    task.result = null;
    task.error = null;
    task.retryCount = 0;
    task.createdAt = 0;
    task.startedAt = null;
    task.completedAt = null;
  },
  {
    minSize: 10,
    maxSize: 200,
    enableGC: true,
    gcInterval: 30000
  }
);

module.exports = {
  ObjectPool,
  BufferPool,
  bufferPool,
  taskPool
};
