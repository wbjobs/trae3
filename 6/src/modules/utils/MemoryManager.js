const logger = require('../logger');

class BufferPool {
  constructor(poolSize = 10, chunkSize = 4096) {
    this.pool = [];
    this.poolSize = poolSize;
    this.chunkSize = chunkSize;
    this.hitCount = 0;
    this.missCount = 0;
  }

  acquire(size) {
    if (size <= this.chunkSize && this.pool.length > 0) {
      this.hitCount++;
      return this.pool.pop();
    }
    this.missCount++;
    return Buffer.allocUnsafe(Math.max(size, this.chunkSize));
  }

  release(buffer) {
    if (this.pool.length < this.poolSize && buffer.length === this.chunkSize) {
      buffer.fill(0);
      this.pool.push(buffer);
    }
  }

  clear() {
    this.pool = [];
  }

  getStats() {
    return {
      poolSize: this.pool.length,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: this.hitCount + this.missCount > 0 
        ? (this.hitCount / (this.hitCount + this.missCount)).toFixed(2)
        : 0
    };
  }
}

class ChunkedBufferReader {
  constructor(filePath, chunkSize = 64 * 1024) {
    this.filePath = filePath;
    this.chunkSize = chunkSize;
    this.fd = null;
    this.position = 0;
    this.fileSize = 0;
  }

  async open() {
    const fs = require('fs').promises;
    const handle = await fs.open(this.filePath, 'r');
    this.fd = handle.fd;
    const stats = await fs.stat(this.filePath);
    this.fileSize = stats.size;
    return this;
  }

  async readNextChunk() {
    if (!this.fd) await this.open();
    
    const fs = require('fs').promises;
    const buffer = Buffer.alloc(this.chunkSize);
    const { bytesRead } = await fs.read(this.fd, buffer, 0, this.chunkSize, this.position);
    
    this.position += bytesRead;
    
    if (bytesRead === 0) {
      return null;
    }
    
    return bytesRead < this.chunkSize ? buffer.slice(0, bytesRead) : buffer;
  }

  async *[Symbol.asyncIterator]() {
    let chunk;
    while ((chunk = await this.readNextChunk()) !== null) {
      yield chunk;
    }
    await this.close();
  }

  async close() {
    if (this.fd) {
      const fs = require('fs').promises;
      await fs.close(this.fd);
      this.fd = null;
    }
  }

  get progress() {
    return this.fileSize > 0 ? (this.position / this.fileSize) * 100 : 0;
  }
}

class MemoryManager {
  constructor() {
    this.bufferPool = new BufferPool(20, 4096);
    this.memoryLimit = 512 * 1024 * 1024;
    this.gcThreshold = 0.7;
    this.memoryHistory = [];
    this.gcCount = 0;
    this.lastGcTime = 0;
    this.gcMinInterval = 5000;
    this.monitorInterval = null;
  }

  startMonitoring(interval = 10000) {
    if (this.monitorInterval) return;
    
    this.monitorInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, interval);
    
    logger.info('Memory monitoring started');
  }

  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    logger.info('Memory monitoring stopped');
  }

  checkMemoryUsage() {
    const usage = process.memoryUsage();
    const usedPercent = usage.heapUsed / usage.heapTotal;
    
    this.memoryHistory.push({
      time: Date.now(),
      ...usage,
      usedPercent
    });
    
    if (this.memoryHistory.length > 60) {
      this.memoryHistory.shift();
    }
    
    if (usedPercent > this.gcThreshold && this.canPerformGc()) {
      this.performGc();
    }
    
    if (usage.rss > this.memoryLimit) {
      logger.warn(`Memory limit exceeded: ${this.formatBytes(usage.rss)} / ${this.formatBytes(this.memoryLimit)}`);
      this.performDeepCleanup();
    }
  }

  canPerformGc() {
    return Date.now() - this.lastGcTime >= this.gcMinInterval;
  }

  performGc() {
    if (global.gc) {
      global.gc();
      this.gcCount++;
      this.lastGcTime = Date.now();
      logger.debug(`Garbage collection performed (total: ${this.gcCount})`);
      return true;
    }
    return false;
  }

  performDeepCleanup() {
    logger.info('Performing deep memory cleanup...');
    
    this.bufferPool.clear();
    
    if (global.gc) {
      global.gc();
      if (global.gc) global.gc();
    }
    
    const usage = process.memoryUsage();
    logger.info(`Memory after cleanup: ${this.formatBytes(usage.rss)}`);
  }

  acquireBuffer(size) {
    return this.bufferPool.acquire(size);
  }

  releaseBuffer(buffer) {
    this.bufferPool.release(buffer);
  }

  createChunkedReader(filePath, chunkSize) {
    return new ChunkedBufferReader(filePath, chunkSize);
  }

  optimizeFirmwareData(firmware) {
    if (!firmware || !firmware.data) return firmware;
    
    const originalSize = firmware.data.length;
    
    if (firmware.segments && firmware.segments.length > 0) {
      firmware.data = null;
    }
    
    if (firmware.segments) {
      firmware.segments = firmware.segments.map(segment => ({
        ...segment,
        data: segment.data ? `[Buffer: ${segment.data.length} bytes]` : undefined
      }));
    }
    
    logger.debug(`Firmware data optimized: ${this.formatBytes(originalSize)} → metadata only`);
    
    return firmware;
  }

  getMemoryStats() {
    const usage = process.memoryUsage();
    
    return {
      rss: this.formatBytes(usage.rss),
      heapTotal: this.formatBytes(usage.heapTotal),
      heapUsed: this.formatBytes(usage.heapUsed),
      external: this.formatBytes(usage.external),
      heapUsedPercent: ((usage.heapUsed / usage.heapTotal) * 100).toFixed(1) + '%',
      gcCount: this.gcCount,
      bufferPool: this.bufferPool.getStats(),
      historyLength: this.memoryHistory.length
    };
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getMemoryTrend() {
    if (this.memoryHistory.length < 2) return 'stable';
    
    const recent = this.memoryHistory.slice(-10);
    const avg = recent.reduce((sum, h) => sum + h.usedPercent, 0) / recent.length;
    const first = this.memoryHistory[0].usedPercent;
    const last = this.memoryHistory[this.memoryHistory.length - 1].usedPercent;
    
    if (last - first > 0.1) return 'increasing';
    if (first - last > 0.1) return 'decreasing';
    return 'stable';
  }
}

const memoryManager = new MemoryManager();
module.exports = memoryManager;
module.exports.BufferPool = BufferPool;
module.exports.ChunkedBufferReader = ChunkedBufferReader;
