const EventEmitter = require('events');
const async = require('async');
const serialManager = require('./serial');
const parser = require('./parser');
const logger = require('./logger');
const stateManager = require('./stateManager');
const platform = require('../platform');
const { taskPool, bufferPool } = require('./objectPool');
const cryptoManager = require('./crypto');

const TASK_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

const TASK_TYPES = {
  READ: 'read',
  WRITE: 'write',
  READ_ALL: 'read_all',
  WRITE_ALL: 'write_all',
  RESET: 'reset'
};

const BATCH_STRATEGY = {
  SEQUENTIAL: 'sequential',
  PARALLEL: 'parallel',
  SMART: 'smart'
};

class BatchTaskManager extends EventEmitter {
  constructor() {
    super();
    this.tasks = [];
    this.currentTaskIndex = 0;
    this.isRunning = false;
    this.isPaused = false;
    this.concurrency = 1;
    this.taskTimeout = 5000;
    this.retryCount = platform.getMaxRetries();
    this.queue = null;
    this.interruptedRecovery = null;
    this.batchStrategy = BATCH_STRATEGY.SMART;
    
    this.deviceCache = new Map();
    this.paramCache = new Map();
    this.cacheTTL = 30000;
    
    this.optimizedMode = true;
    this.enableEncryption = false;
    
    this.stats = {
      totalExecuted: 0,
      avgExecutionTime: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }

  setBatchStrategy(strategy) {
    if (Object.values(BATCH_STRATEGY).includes(strategy)) {
      this.batchStrategy = strategy;
      this._updateConcurrency();
      logger.info(`BatchTaskManager: Strategy set to ${strategy}`);
    }
  }

  _updateConcurrency() {
    switch (this.batchStrategy) {
      case BATCH_STRATEGY.SEQUENTIAL:
        this.concurrency = 1;
        break;
      case BATCH_STRATEGY.PARALLEL:
        this.concurrency = Math.min(8, Math.max(2, Math.ceil(this.tasks.length / 10)));
        break;
      case BATCH_STRATEGY.SMART:
        this.concurrency = this._calculateSmartConcurrency();
        break;
    }
    if (this.queue) {
      this.queue.concurrency = this.concurrency;
    }
  }

  _calculateSmartConcurrency() {
    const deviceCount = new Set(this.tasks.map(t => t.deviceId)).size;
    if (deviceCount <= 5) return 1;
    if (deviceCount <= 20) return 2;
    if (deviceCount <= 50) return 3;
    return Math.min(4, Math.ceil(deviceCount / 15));
  }

  enableEncryptionMode(enable) {
    this.enableEncryption = enable;
    logger.info(`BatchTaskManager: Encryption ${enable ? 'enabled' : 'disabled'}`);
  }

  createTask(type, deviceId, params = {}, options = {}) {
    const task = taskPool.acquire();
    
    task.id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    task.type = type;
    task.deviceId = deviceId;
    task.params = params;
    task.options = options;
    task.status = TASK_STATUS.PENDING;
    task.progress = 0;
    task.result = null;
    task.error = null;
    task.retryCount = 0;
    task.createdAt = Date.now();
    task.startedAt = null;
    task.completedAt = null;

    return task;
  }

  addTask(task) {
    this.tasks.push(task);
    this._schedulePersist();
    this.emit('task-added', task);
    return task;
  }

  addBatchTasks(type, deviceIds, params = {}, options = {}) {
    const tasks = deviceIds.map(deviceId => this.createTask(type, deviceId, params, options));
    this.tasks.push(...tasks);
    this._schedulePersist();
    this.emit('tasks-added', tasks);
    return tasks;
  }

  addReadTasks(deviceIds, paramKeys, options = {}) {
    const tasks = [];
    for (const deviceId of deviceIds) {
      for (const paramKey of paramKeys) {
        tasks.push(this.createTask(TASK_TYPES.READ, deviceId, { paramKey }, options));
      }
    }
    this.tasks.push(...tasks);
    this._schedulePersist();
    this.emit('tasks-added', tasks);
    return tasks;
  }

  addWriteTasks(deviceIds, params, options = {}) {
    const tasks = deviceIds.map(deviceId =>
      this.createTask(TASK_TYPES.WRITE, deviceId, params, options)
    );
    this.tasks.push(...tasks);
    this._schedulePersist();
    this.emit('tasks-added', tasks);
    return tasks;
  }

  _schedulePersist() {
    if (!this._persistTimer) {
      this._persistTimer = setTimeout(() => {
        this.persistTasks();
        this._persistTimer = null;
      }, 500);
    }
  }

  removeTask(taskId) {
    if (this.isRunning) {
      throw new Error('Cannot remove task while batch is running');
    }
    const index = this.tasks.findIndex(t => t.id === taskId);
    if (index !== -1) {
      const task = this.tasks.splice(index, 1)[0];
      taskPool.release(task);
      this._schedulePersist();
      this.emit('task-removed', task);
      return task;
    }
    return null;
  }

  clearTasks() {
    if (this.isRunning) {
      throw new Error('任务正在运行，无法清除');
    }
    
    this.tasks.forEach(task => taskPool.release(task));
    this.tasks = [];
    this.currentTaskIndex = 0;
    this.deviceCache.clear();
    this.paramCache.clear();
    this._schedulePersist();
    this.emit('tasks-cleared');
  }

  persistTasks() {
    try {
      const tasksData = this.tasks.map(t => ({
        id: t.id,
        type: t.type,
        deviceId: t.deviceId,
        params: t.params,
        options: t.options,
        status: t.status,
        progress: t.progress,
        result: t.result,
        error: t.error,
        retryCount: t.retryCount,
        createdAt: t.createdAt,
        startedAt: t.startedAt,
        completedAt: t.completedAt
      }));
      stateManager.setBatchTasks(tasksData);
    } catch (error) {
      logger.warn('BatchTaskManager: Failed to persist tasks', error);
    }
  }

  loadSavedTasks() {
    try {
      const saved = stateManager.getBatchTasks();
      if (saved && saved.length > 0) {
        this.tasks = saved.map(t => {
          const task = taskPool.acquire();
          Object.assign(task, t);
          if (task.status === TASK_STATUS.RUNNING) {
            task.status = TASK_STATUS.PENDING;
          }
          return task;
        });
        logger.info(`BatchTaskManager: Loaded ${this.tasks.length} saved tasks`);
        return this.tasks;
      }
    } catch (error) {
      logger.warn('BatchTaskManager: Failed to load saved tasks', error);
    }
    return [];
  }

  checkInterruptedTasks() {
    const interrupted = this.tasks.filter(t => 
      t.status === TASK_STATUS.RUNNING || 
      (t.status === TASK_STATUS.PENDING && this.isRunning)
    );
    
    if (interrupted.length > 0) {
      logger.warn(`BatchTaskManager: Found ${interrupted.length} interrupted tasks`);
      interrupted.forEach(t => {
        t.status = TASK_STATUS.PENDING;
        t.startedAt = null;
      });
      return true;
    }
    return false;
  }

  async startConfigurationRecovery() {
    const recovery = await stateManager.recoverConfiguration();
    if (recovery.recovered) {
      this.interruptedRecovery = recovery;
      logger.info(`BatchTaskManager: Configuration recovery ready - ${recovery.pendingDevices.length} pending devices`);
      this.emit('recovery-ready', recovery);
      return recovery;
    }
    return null;
  }

  resumeInterruptedConfiguration() {
    if (!this.interruptedRecovery) {
      throw new Error('No interrupted configuration to resume');
    }

    const recovery = this.interruptedRecovery;
    this.interruptedRecovery = null;

    logger.info(`BatchTaskManager: Resuming configuration for ${recovery.pendingDevices.length} devices`);
    
    const params = recovery.operationType.includes('write') ? 
      stateManager.getParamValues() : {};

    if (recovery.operationType === 'write_all') {
      this.addBatchTasks(TASK_TYPES.WRITE_ALL, recovery.pendingDevices, params);
    } else if (recovery.operationType === 'read_all') {
      this.addBatchTasks(TASK_TYPES.READ_ALL, recovery.pendingDevices);
    } else if (recovery.operationType === 'write') {
      this.addWriteTasks(recovery.pendingDevices, params);
    } else if (recovery.operationType === 'read') {
      const paramKeys = Object.keys(stateManager.getParamConfig());
      this.addReadTasks(recovery.pendingDevices, paramKeys);
    }

    stateManager.clearInterruptedConfiguration();
    return this.start();
  }

  _getCacheKey(deviceId, paramKey) {
    return `${deviceId}:${paramKey}`;
  }

  _getCachedParam(deviceId, paramKey) {
    const key = this._getCacheKey(deviceId, paramKey);
    const cached = this.paramCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      this.stats.cacheHits++;
      return cached.value;
    }
    this.stats.cacheMisses++;
    return null;
  }

  _setCachedParam(deviceId, paramKey, value) {
    const key = this._getCacheKey(deviceId, paramKey);
    this.paramCache.set(key, { value, timestamp: Date.now() });
  }

  async executeTask(task) {
    const startTime = Date.now();
    task.status = TASK_STATUS.RUNNING;
    task.startedAt = Date.now();
    this.emit('task-start', task);

    try {
      let result;
      
      if (this.optimizedMode && task.type === TASK_TYPES.READ) {
        const cached = this._getCachedParam(task.deviceId, task.params.paramKey);
        if (cached !== null) {
          result = { paramKey: task.params.paramKey, value: cached, cached: true };
        }
      }

      if (!result) {
        switch (task.type) {
          case TASK_TYPES.READ:
            result = await this.executeReadTask(task);
            break;
          case TASK_TYPES.WRITE:
            result = await this.executeWriteTask(task);
            break;
          case TASK_TYPES.READ_ALL:
            result = await this.executeReadAllTask(task);
            break;
          case TASK_TYPES.WRITE_ALL:
            result = await this.executeWriteAllTask(task);
            break;
          case TASK_TYPES.RESET:
            result = await this.executeResetTask(task);
            break;
          default:
            throw new Error(`未知任务类型: ${task.type}`);
        }
      }

      task.status = TASK_STATUS.COMPLETED;
      task.result = result;
      task.progress = 100;
      task.completedAt = Date.now();

      if (this.optimizedMode && task.type === TASK_TYPES.READ && result.value !== undefined) {
        this._setCachedParam(task.deviceId, task.params.paramKey, result.value);
      }

      stateManager.markDeviceConfigured(task.deviceId, true, result);

      const executionTime = Date.now() - startTime;
      this.stats.totalExecuted++;
      this.stats.avgExecutionTime = 
        (this.stats.avgExecutionTime * (this.stats.totalExecuted - 1) + executionTime) / this.stats.totalExecuted;

      logger.operation('TASK_COMPLETED', task.deviceId, {
        taskId: task.id,
        type: task.type,
        executionTime,
        result
      });

      this.emit('task-complete', task);
      return task;
    } catch (error) {
      task.retryCount++;
      if (task.retryCount < (task.options.retryCount || this.retryCount)) {
        logger.warn(`任务重试 ${task.id} (${task.retryCount}/${this.retryCount})`, {
          deviceId: task.deviceId,
          error: error.message
        });
        this.emit('task-retry', task, error.message);
        await new Promise(resolve => setTimeout(resolve, 100));
        return this.executeTask(task);
      }

      task.status = TASK_STATUS.FAILED;
      task.error = error.message;
      task.completedAt = Date.now();

      stateManager.markDeviceConfigured(task.deviceId, false, error.message);

      logger.error(`任务执行失败 ${task.id}`, error);
      this.emit('task-failed', task, error);
      return task;
    } finally {
      this._schedulePersist();
    }
  }

  async executeReadTask(task) {
    if (!serialManager.isOpen()) {
      throw new Error('串口未连接');
    }

    const { paramKey } = task.params;
    const command = parser.buildReadCommand(task.deviceId, paramKey);
    const response = await this.sendWithTimeout(command, task);
    const parsed = parser.parseReadResponse(response);

    if (!parsed.valid) {
      if (parsed.needsMoreData) {
        throw new Error(`响应数据不完整: ${parsed.error}`);
      }
      throw new Error(parsed.error || '读取失败');
    }

    return {
      paramKey: parsed.paramKey,
      value: parsed.value,
      name: parsed.name
    };
  }

  async executeWriteTask(task) {
    if (!serialManager.isOpen()) {
      throw new Error('串口未连接');
    }

    const { paramKey, value } = task.params;
    const command = parser.buildWriteCommand(task.deviceId, paramKey, value);
    const response = await this.sendWithTimeout(command, task);
    const parsed = parser.parseWriteResponse(response);

    if (!parsed.valid) {
      if (parsed.needsMoreData) {
        throw new Error(`响应数据不完整: ${parsed.error}`);
      }
      throw new Error(parsed.error || '写入失败');
    }

    if (!parsed.success) {
      throw new Error(parsed.message || '写入失败');
    }

    return {
      paramKey,
      value,
      success: true
    };
  }

  async executeReadAllTask(task) {
    if (!serialManager.isOpen()) {
      throw new Error('串口未连接');
    }

    const command = parser.buildReadAllCommand(task.deviceId);
    const response = await this.sendWithTimeout(command, task);
    const parsed = parser.parseReadAllResponse(response);

    if (!parsed.valid) {
      if (parsed.needsMoreData) {
        throw new Error(`响应数据不完整: ${parsed.error}`);
      }
      throw new Error(parsed.error || '读取全部参数失败');
    }

    if (this.optimizedMode && parsed.params) {
      Object.keys(parsed.params).forEach(key => {
        this._setCachedParam(task.deviceId, key, parsed.params[key]);
      });
    }

    return {
      params: parsed.params
    };
  }

  async executeWriteAllTask(task) {
    if (!serialManager.isOpen()) {
      throw new Error('串口未连接');
    }

    const { params } = task;
    const command = parser.buildWriteAllCommand(task.deviceId, params);
    const response = await this.sendWithTimeout(command, task);
    const parsed = parser.parseWriteResponse(response);

    if (!parsed.valid) {
      if (parsed.needsMoreData) {
        throw new Error(`响应数据不完整: ${parsed.error}`);
      }
      throw new Error(parsed.error || '写入失败');
    }

    if (!parsed.success) {
      throw new Error(parsed.message || '写入失败');
    }

    return {
      success: true,
      params
    };
  }

  async executeResetTask(task) {
    if (!serialManager.isOpen()) {
      throw new Error('串口未连接');
    }

    const command = parser.buildResetCommand(task.deviceId);
    await this.sendWithTimeout(command, task);
    return { success: true };
  }

  async sendWithTimeout(command, task) {
    const timeout = task.options.timeout || this.taskTimeout;
    return serialManager.sendAndReceive(command, timeout);
  }

  async start() {
    if (this.isRunning) {
      throw new Error('任务已在运行');
    }

    if (this.tasks.length === 0) {
      throw new Error('没有待执行的任务');
    }

    this._updateConcurrency();

    const pendingTasks = this.tasks.filter(t => t.status === TASK_STATUS.PENDING);
    const deviceIds = [...new Set(pendingTasks.map(t => t.deviceId))];
    const hasWriteTask = pendingTasks.some(t => 
      t.type === TASK_TYPES.WRITE || t.type === TASK_TYPES.WRITE_ALL
    );

    if (hasWriteTask) {
      const params = {};
      pendingTasks.forEach(t => {
        if (t.params) Object.assign(params, t.params);
      });
      stateManager.startConfiguration(
        hasWriteTask ? 'write_all' : 'read_all',
        deviceIds,
        params
      );
    }

    this.isRunning = true;
    this.isPaused = false;
    this.currentTaskIndex = this.tasks.filter(t => 
      t.status === TASK_STATUS.COMPLETED || t.status === TASK_STATUS.FAILED
    ).length;

    this.emit('batch-start', {
      total: this.tasks.length,
      pending: pendingTasks.length,
      concurrency: this.concurrency,
      strategy: this.batchStrategy
    });

    this.queue = async.queue(async (task, callback) => {
      if (!this.isRunning) {
        callback();
        return;
      }

      while (this.isPaused) {
        await new Promise(resolve => setTimeout(resolve, 50));
        if (!this.isRunning) {
          callback();
          return;
        }
      }

      try {
        await this.executeTask(task);
      } catch (error) {
        logger.error('BatchTaskManager: Unexpected task execution error', error);
      }

      this.currentTaskIndex++;
      this.emit('batch-progress', {
        current: this.currentTaskIndex,
        total: this.tasks.length,
        completed: this.tasks.filter(t => t.status === TASK_STATUS.COMPLETED).length,
        failed: this.tasks.filter(t => t.status === TASK_STATUS.FAILED).length,
        avgTime: this.stats.avgExecutionTime.toFixed(0) + 'ms'
      });

      callback();
    }, this.concurrency);

    pendingTasks.forEach(task => this.queue.push(task));

    return new Promise((resolve) => {
      this.queue.drain(() => {
        const wasInterrupted = !this.isRunning;
        this.isRunning = false;
        this.queue = null;
        
        const results = {
          total: this.tasks.length,
          completed: this.tasks.filter(t => t.status === TASK_STATUS.COMPLETED).length,
          failed: this.tasks.filter(t => t.status === TASK_STATUS.FAILED).length,
          cancelled: this.tasks.filter(t => t.status === TASK_STATUS.CANCELLED).length,
          interrupted: wasInterrupted,
          avgExecutionTime: this.stats.avgExecutionTime,
          cacheHits: this.stats.cacheHits,
          cacheMisses: this.stats.cacheMisses,
          tasks: this.tasks
        };

        if (!wasInterrupted) {
          stateManager.completeConfiguration();
        } else {
          stateManager.interruptConfiguration('user_stopped');
        }

        this.emit('batch-complete', results);
        this.persistTasks();
        resolve(results);
      });
    });
  }

  pause() {
    if (!this.isRunning) {
      throw new Error('任务未在运行');
    }
    this.isPaused = true;
    this.emit('batch-paused');
    logger.info('BatchTaskManager: Batch paused');
  }

  resume() {
    if (!this.isPaused) {
      throw new Error('任务未暂停');
    }
    this.isPaused = false;
    this.emit('batch-resumed');
    logger.info('BatchTaskManager: Batch resumed');
  }

  stop() {
    const wasRunning = this.isRunning;
    this.isRunning = false;
    this.isPaused = false;
    
    if (this.queue) {
      this.queue.kill();
      this.queue = null;
    }

    this.tasks.forEach(task => {
      if (task.status === TASK_STATUS.PENDING || task.status === TASK_STATUS.RUNNING) {
        task.status = TASK_STATUS.CANCELLED;
      }
    });

    if (wasRunning) {
      stateManager.interruptConfiguration('user_stopped');
    }

    this.persistTasks();
    this.emit('batch-stopped');
    logger.info('BatchTaskManager: Batch stopped');
  }

  getTasks() {
    return this.tasks.map(t => ({
      id: t.id,
      type: t.type,
      deviceId: t.deviceId,
      params: t.params,
      options: t.options,
      status: t.status,
      progress: t.progress,
      result: t.result,
      error: t.error,
      retryCount: t.retryCount,
      createdAt: t.createdAt,
      startedAt: t.startedAt,
      completedAt: t.completedAt
    }));
  }

  getTaskById(taskId) {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return null;
    return {
      id: task.id,
      type: task.type,
      deviceId: task.deviceId,
      params: task.params,
      options: task.options,
      status: task.status,
      progress: task.progress,
      result: task.result,
      error: task.error,
      retryCount: task.retryCount,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt
    };
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      total: this.tasks.length,
      currentIndex: this.currentTaskIndex,
      completed: this.tasks.filter(t => t.status === TASK_STATUS.COMPLETED).length,
      failed: this.tasks.filter(t => t.status === TASK_STATUS.FAILED).length,
      pending: this.tasks.filter(t => t.status === TASK_STATUS.PENDING).length,
      cancelled: this.tasks.filter(t => t.status === TASK_STATUS.CANCELLED).length,
      concurrency: this.concurrency,
      strategy: this.batchStrategy,
      hasRecovery: this.interruptedRecovery !== null,
      stats: { ...this.stats }
    };
  }

  setConcurrency(count) {
    if (count < 1) {
      throw new Error('并发数不能小于1');
    }
    this.concurrency = count;
    if (this.queue) {
      this.queue.concurrency = count;
    }
  }

  setTaskTimeout(timeout) {
    if (timeout < 1000) {
      throw new Error('任务超时时间不能小于1000ms');
    }
    this.taskTimeout = timeout;
  }

  setOptimizedMode(enabled) {
    this.optimizedMode = enabled;
    if (!enabled) {
      this.paramCache.clear();
    }
    logger.info(`BatchTaskManager: Optimized mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  exportResults() {
    return this.tasks.map(task => ({
      id: task.id,
      type: task.type,
      deviceId: task.deviceId,
      status: task.status,
      result: task.result,
      error: task.error,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt
    }));
  }

  getInterruptedRecovery() {
    return this.interruptedRecovery;
  }

  discardInterruptedRecovery() {
    if (this.interruptedRecovery) {
      stateManager.clearInterruptedConfiguration();
      this.interruptedRecovery = null;
      logger.info('BatchTaskManager: Interrupted recovery discarded');
    }
  }

  getPoolStats() {
    return {
      taskPool: taskPool.getStats(),
      bufferPool: bufferPool.getStats()
    };
  }

  resetStats() {
    this.stats = {
      totalExecuted: 0,
      avgExecutionTime: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }
}

module.exports = new BatchTaskManager();
module.exports.TASK_STATUS = TASK_STATUS;
module.exports.TASK_TYPES = TASK_TYPES;
module.exports.BATCH_STRATEGY = BATCH_STRATEGY;
