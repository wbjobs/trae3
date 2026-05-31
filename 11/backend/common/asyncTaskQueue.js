const { Logger } = require('./logger');

const logger = new Logger('AsyncTaskQueue');

class AsyncTaskQueue {
  constructor(options = {}) {
    this.concurrency = options.concurrency || 10;
    this.maxQueueSize = options.maxQueueSize || 10000;
    this.queue = [];
    this.activeCount = 0;
    this.totalProcessed = 0;
    this.totalFailed = 0;
    this.isPaused = false;
    this.drainCallbacks = [];
  }

  add(task, priority = 0) {
    if (this.queue.length >= this.maxQueueSize) {
      logger.warn('Task queue is full, rejecting new task');
      return false;
    }

    const taskEntry = {
      task,
      priority,
      timestamp: Date.now()
    };

    if (priority > 0) {
      const insertIndex = this.queue.findIndex(t => t.priority < priority);
      if (insertIndex === -1) {
        this.queue.push(taskEntry);
      } else {
        this.queue.splice(insertIndex, 0, taskEntry);
      }
    } else {
      this.queue.push(taskEntry);
    }

    setImmediate(() => this.process());
    return true;
  }

  async process() {
    if (this.isPaused || this.activeCount >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const taskEntry = this.queue.shift();
    this.activeCount++;

    try {
      await taskEntry.task();
      this.totalProcessed++;
    } catch (err) {
      this.totalFailed++;
      logger.error('Task execution failed:', err.message);
    } finally {
      this.activeCount--;

      if (this.queue.length > 0 && !this.isPaused) {
        setImmediate(() => this.process());
      }

      if (this.queue.length === 0 && this.activeCount === 0) {
        this.drainCallbacks.forEach(callback => {
          try {
            callback();
          } catch (err) {
            logger.error('Drain callback error:', err);
          }
        });
        this.drainCallbacks = [];
      }
    }
  }

  pause() {
    this.isPaused = true;
    logger.info('Task queue paused');
  }

  resume() {
    this.isPaused = false;
    logger.info('Task queue resumed');
    setImmediate(() => this.process());
  }

  clear() {
    const cleared = this.queue.length;
    this.queue = [];
    logger.info(`Task queue cleared, ${cleared} tasks removed`);
    return cleared;
  }

  onDrain(callback) {
    if (this.queue.length === 0 && this.activeCount === 0) {
      setImmediate(callback);
    } else {
      this.drainCallbacks.push(callback);
    }
  }

  waitForDrain(timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for queue drain'));
      }, timeoutMs);

      this.onDrain(() => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  getStats() {
    return {
      queued: this.queue.length,
      active: this.activeCount,
      processed: this.totalProcessed,
      failed: this.totalFailed,
      concurrency: this.concurrency,
      maxQueueSize: this.maxQueueSize,
      isPaused: this.isPaused,
      utilization: this.activeCount / this.concurrency
    };
  }
}

class BulkProcessor {
  constructor(options = {}) {
    this.batchSize = options.batchSize || 100;
    this.maxWaitMs = options.maxWaitMs || 500;
    this.processFn = options.processFn;
    this.items = [];
    this.timer = null;
    this.logger = new Logger('BulkProcessor');
  }

  add(item) {
    this.items.push(item);
    
    if (this.items.length >= this.batchSize) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.maxWaitMs);
    }
  }

  async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.items.length === 0) {
      return 0;
    }

    const batch = this.items;
    this.items = [];

    try {
      if (this.processFn) {
        await this.processFn(batch);
      }
      this.logger.debug(`Processed batch of ${batch.length} items`);
      return batch.length;
    } catch (err) {
      this.logger.error('Batch processing failed:', err.message);
      this.items = [...batch, ...this.items];
      throw err;
    }
  }

  async flushAll() {
    return await this.flush();
  }

  getStats() {
    return {
      pending: this.items.length,
      batchSize: this.batchSize,
      maxWaitMs: this.maxWaitMs
    };
  }
}

const defaultTaskQueue = new AsyncTaskQueue({
  concurrency: 20,
  maxQueueSize: 20000
});

module.exports = {
  AsyncTaskQueue,
  BulkProcessor,
  defaultTaskQueue
};
