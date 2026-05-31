class PriorityQueue {
  constructor(options = {}) {
    this.heap = [];
    this._counter = 0;
  }

  enqueue(item, priority = 0) {
    this.heap.push({
      item,
      priority,
      sequence: this._counter++,
    });
    this._bubbleUp(this.heap.length - 1);
  }

  dequeue() {
    if (this.heap.length === 0) return null;
    const top = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this._bubbleDown(0);
    }
    return top.item;
  }

  peek() {
    return this.heap.length > 0 ? this.heap[0].item : null;
  }

  size() {
    return this.heap.length;
  }

  isEmpty() {
    return this.heap.length === 0;
  }

  clear() {
    this.heap = [];
  }

  _bubbleUp(idx) {
    while (idx > 0) {
      const parent = Math.floor((idx - 1) / 2);
      if (this._compare(idx, parent) > 0) {
        [this.heap[idx], this.heap[parent]] = [this.heap[parent], this.heap[idx]];
        idx = parent;
      } else {
        break;
      }
    }
  }

  _bubbleDown(idx) {
    const len = this.heap.length;
    while (true) {
      let maxIdx = idx;
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;
      if (left < len && this._compare(left, maxIdx) > 0) maxIdx = left;
      if (right < len && this._compare(right, maxIdx) > 0) maxIdx = right;
      if (maxIdx !== idx) {
        [this.heap[idx], this.heap[maxIdx]] = [this.heap[maxIdx], this.heap[idx]];
        idx = maxIdx;
      } else {
        break;
      }
    }
  }

  _compare(a, b) {
    const nodeA = this.heap[a];
    const nodeB = this.heap[b];
    if (nodeA.priority !== nodeB.priority) {
      return nodeA.priority - nodeB.priority;
    }
    return nodeB.sequence - nodeA.sequence;
  }
}

class RequestScheduler {
  constructor(options = {}) {
    this.maxConcurrency = options.maxConcurrency || 10;
    this.maxQueueSize = options.maxQueueSize || 1000;
    this.overloadThreshold = options.overloadThreshold || 0.8;
    this.dynamicBatching = options.dynamicBatching !== false;

    this.priorityQueue = new PriorityQueue();
    this._activeCount = 0;
    this._processing = false;
    this._schedulerTimer = null;
    this._schedulerInterval = options.schedulerInterval || 50;

    this._stats = {
      totalEnqueued: 0,
      totalProcessed: 0,
      totalRejected: 0,
      totalEvicted: 0,
      completed: 0,
      totalBatches: 0,
      averageWaitTime: 0,
      peakQueueSize: 0,
      overloadEvents: 0,
    };

    this._processing = true;
    this._startScheduler();
  }

  enqueue(task, options = {}) {
    if (this.priorityQueue.size() >= this.maxQueueSize) {
      this._stats.totalRejected++;
      return false;
    }

    const priority = options.priority !== undefined ? options.priority : this._calculatePriority(task);
    const taskWithMeta = {
      ...task,
      _enqueuedAt: Date.now(),
      _priority: priority,
    };

    this.priorityQueue.enqueue(taskWithMeta, priority);
    this._stats.totalEnqueued++;
    this._stats.peakQueueSize = Math.max(this._stats.peakQueueSize, this.priorityQueue.size());

    this._checkOverload();

    if (!this._processing) {
      this._startScheduler();
    }

    return true;
  }

  _calculatePriority(task) {
    if (task.priority !== undefined) return task.priority;
    if (task.logLevel) {
      const levelMap = { fatal: 100, error: 80, warn: 50, info: 20, debug: 0 };
      return levelMap[task.logLevel] || 20;
    }
    if (task.type === 'error' || task.type === 'alert') return 80;
    if (task.type === 'log_batch') {
      const maxLevel = task.logs?.reduce((max, l) => {
        const level = l.level || 'info';
        const levelMap = { fatal: 100, error: 80, warn: 50, info: 20, debug: 0 };
        return Math.max(max, levelMap[level] || 20);
      }, 0) || 20;
      return maxLevel;
    }
    return 20;
  }

  _startScheduler() {
    if (this._schedulerTimer) return;
    this._schedulerTimer = setInterval(() => this._processQueue(), this._schedulerInterval);
  }

  _stopScheduler() {
    if (this._schedulerTimer) {
      clearInterval(this._schedulerTimer);
      this._schedulerTimer = null;
    }
  }

  async _processQueue() {
    if (this.priorityQueue.isEmpty()) return;
    if (this._activeCount >= this.maxConcurrency) return;

    const batchSize = this.dynamicBatching
      ? Math.min(this.maxConcurrency - this._activeCount, this.priorityQueue.size())
      : 1;

    const tasks = [];
    for (let i = 0; i < batchSize; i++) {
      const task = this.priorityQueue.dequeue();
      if (task) tasks.push(task);
    }

    if (tasks.length === 0) return;

    this._activeCount += tasks.length;

    const now = Date.now();
    tasks.forEach(task => {
      const waitTime = now - task._enqueuedAt;
      this._stats.averageWaitTime = (this._stats.averageWaitTime * this._stats.totalProcessed + waitTime) / (this._stats.totalProcessed + 1);
    });
    this._stats.totalProcessed += tasks.length;
    if (tasks.length > 1) this._stats.totalBatches++;

    const promises = tasks.map(task => this._executeTask(task));
    const results = await Promise.allSettled(promises);
    const completedCount = results.filter(r => r.status === 'fulfilled').length;
    this._stats.completed += completedCount;
    this._activeCount -= tasks.length;
  }

  async _executeTask(task) {
    try {
      if (task.handler) {
        return await task.handler(task.payload, task);
      }
    } catch (err) {
      if (task.onError) {
        task.onError(err, task);
      }
      throw err;
    }
  }

  _checkOverload() {
    const load = this.priorityQueue.size() / this.maxQueueSize;
    if (load >= this.overloadThreshold) {
      this._stats.overloadEvents++;
      if (load >= 0.9) {
        this._evictLowPriority();
      }
    }
  }

  _evictLowPriority() {
    const evictCount = Math.ceil(this.priorityQueue.size() * 0.1);
    const lowPriorityItems = [];
    const remainingItems = [];

    while (!this.priorityQueue.isEmpty()) {
      const item = this.priorityQueue.dequeue();
      if (item._priority < 20 && lowPriorityItems.length < evictCount) {
        lowPriorityItems.push(item);
      } else {
        remainingItems.push({ item, priority: item._priority });
      }
    }

    remainingItems.forEach(({ item, priority }) => {
      this.priorityQueue.enqueue(item, priority);
    });

    this._stats.totalEvicted += lowPriorityItems.length;
    return lowPriorityItems.length;
  }

  getStats() {
    return {
      ...this._stats,
      waiting: this.priorityQueue.size(),
      active: this._activeCount,
      completed: this._stats.completed,
      evicted: this._stats.totalEvicted,
      overloaded: this.priorityQueue.size() >= this.maxQueueSize * this.overloadThreshold,
      maxConcurrency: this.maxConcurrency,
      maxQueueSize: this.maxQueueSize,
      load: this.priorityQueue.size() / this.maxQueueSize,
    };
  }

  pause() {
    this._processing = false;
    this._stopScheduler();
  }

  resume() {
    this._processing = true;
    this._startScheduler();
  }

  shutdown() {
    this._stopScheduler();
    this.priorityQueue.clear();
    this._activeCount = 0;
    this._processing = false;
  }
}

module.exports = { PriorityQueue, RequestScheduler };
