const EventEmitter = require('events');
const PQueue = require('p-queue').default;
const FlashTask = require('./FlashTask');
const logger = require('../logger');
const fs = require('fs');
const path = require('path');

class TaskManager extends EventEmitter {
  constructor() {
    super();
    this.tasks = new Map();
    this.history = [];
    this.queue = null;
    this.concurrency = 4;
    this.isRunning = false;
    this.progressCallbacks = new Set();
    this.completeCallbacks = new Set();
    this.maxHistorySize = 1000;
    this.historyFile = path.join(process.cwd(), 'logs', 'tasks.json');
    this.checkpointDir = path.join(process.cwd(), 'logs', 'checkpoints');
    this.pausedTasks = new Map();
    this.autoResumeOnStartup = true;
    this.resumeBatchId = null;
    
    this.firmwareCache = new Map();
    this.firmwareCacheMaxSize = 10;
    this.firmwareCacheTtl = 30 * 60 * 1000;
    
    this.preconnectPool = new Map();
    this.maxPreconnect = 4;
    
    this.performanceMetrics = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageDuration: 0,
      throughput: 0,
      startTime: null
    };
  }

  createTask(config) {
    const task = new FlashTask(config);
    
    task.on('progress', (progress) => {
      this.emit('task:progress', progress);
      this.notifyProgress(progress);
    });

    task.on('complete', (result) => {
      this.addToHistory(result);
      this.notifyComplete(result);
      this.checkBatchComplete();
    });

    this.tasks.set(task.taskId, task);
    
    logger.info(`Task created: ${task.taskId} for device ${task.deviceId}`);
    this.emit('task:created', task.getProgressInfo());
    
    return task;
  }

  createBatchTasks(deviceConfigs) {
    const tasks = [];
    for (const config of deviceConfigs) {
      const task = this.createTask(config);
      tasks.push(task);
    }
    return tasks;
  }

  async startBatch(taskIds, concurrency = 4, resume = false, enableOptimizations = true) {
    if (this.isRunning) {
      throw new Error('Batch already running');
    }

    const validTaskIds = taskIds.filter(id => {
      const task = this.tasks.get(id);
      if (!task) {
        logger.warn(`Task ${id} not found, skipping`);
        return false;
      }
      if (task.status === 'running') {
        logger.warn(`Task ${id} is already running, skipping`);
        return false;
      }
      return true;
    });

    if (validTaskIds.length === 0) {
      throw new Error('No valid tasks to execute');
    }

    let optimizedConcurrency = concurrency;
    if (enableOptimizations) {
      optimizedConcurrency = this.optimizeConcurrency(validTaskIds.length);
      this.concurrency = optimizedConcurrency;
    } else {
      this.concurrency = concurrency;
    }

    this.queue = new PQueue({ concurrency: this.concurrency });
    this.isRunning = true;
    this.performanceMetrics.startTime = Date.now();

    if (enableOptimizations) {
      try {
        const firmwareCache = new Map();
        for (const taskId of validTaskIds) {
          const task = this.tasks.get(taskId);
          if (task && task.firmware) {
            this.cacheFirmware(task.firmware);
            firmwareCache.set(task.firmware.filePath, task.firmware);
          }
        }
        
        const portPaths = [...new Set(validTaskIds
          .map(id => this.tasks.get(id)?.portPath)
          .filter(Boolean))];
        
        if (portPaths.length > 0) {
          this.preconnectDevices(portPaths).catch(err => {
            logger.debug('Pre-connect error (non-critical):', err.message);
          });
        }
        
        logger.info(`Firmware cache prepared with ${firmwareCache.size} unique firmware files`);
      } catch (error) {
        logger.warn('Optimization preparation failed, proceeding without optimizations:', error.message);
      }
    }

    logger.info(`${resume ? 'Resuming' : 'Starting'} batch with ${validTaskIds.length} tasks, concurrency: ${this.concurrency}`);
    this.emit('batch:start', { taskCount: validTaskIds.length, concurrency: this.concurrency, resume, optimized: enableOptimizations });

    const promises = validTaskIds.map(taskId => {
      return this.queue.add(async () => {
        const task = this.tasks.get(taskId);
        if (!task) return null;
        
        if (task.firmware && task.firmware.checksum) {
          const cachedData = this.getCachedFirmwareData(task.firmware.checksum);
          if (cachedData) {
            task.firmware.data = cachedData;
            logger.debug(`Using cached firmware data for task ${taskId}`);
          }
        }
        
        const preconnected = this.getPreconnectedDevice(task.portPath);
        if (preconnected) {
          task.preconnectedDevice = preconnected;
        }
        
        const isResume = resume && task.canResume;
        const result = await task.execute(isResume);
        
        this.updatePerformanceMetrics(result);
        return result;
      });
    });

    try {
      const results = await Promise.allSettled(promises);
      
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value?.status === 'success').length;
      const failedCount = results.filter(r => r.status === 'rejected' || r.value?.status === 'failed').length;
      
      logger.info(`Batch completed: ${successCount} succeeded, ${failedCount} failed`);
      this.emit('batch:complete', {
        total: validTaskIds.length,
        success: successCount,
        failed: failedCount,
        results: results.map(r => r.status === 'fulfilled' ? r.value : { status: 'failed', error: r.reason?.message })
      });

      return results;
    } finally {
      this.isRunning = false;
      this.queue = null;
    }
  }

  cancelTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      logger.warn(`Cannot cancel: task ${taskId} not found`);
      return false;
    }

    if (task.status === 'pending') {
      task.cancel();
      logger.info(`Task ${taskId} cancelled`);
      return true;
    }

    if (task.status === 'running') {
      task.cancel();
      logger.info(`Task ${taskId} cancelled while running`);
      return true;
    }

    logger.warn(`Cannot cancel task ${taskId} with status: ${task.status}`);
    return false;
  }

  async cancelAll(saveCheckpoints = true) {
    logger.info('Cancelling all tasks...');
    
    for (const [taskId, task] of this.tasks) {
      if (task.status === 'pending' || task.status === 'running') {
        if (saveCheckpoints && task.checkpoint && task.checkpoint.step > 0 && task.checkpoint.step < 5) {
          task.canResume = true;
          task.status = 'paused';
          await task.saveCheckpoint();
          this.pausedTasks.set(taskId, task);
          logger.info(`Saved checkpoint for task ${taskId} at step ${task.checkpoint.step}`);
        } else {
          task.cancel();
        }
      }
    }

    if (this.queue) {
      this.queue.clear();
      this.queue.pause();
    }

    this.isRunning = false;
    this.emit('batch:cancelled', { savedCheckpoints: this.pausedTasks.size });
    logger.info(`All tasks cancelled, ${this.pausedTasks.size} checkpoints saved for resuming`);
  }

  getTask(taskId) {
    return this.tasks.get(taskId);
  }

  getTaskStatus(taskId) {
    const task = this.tasks.get(taskId);
    return task ? task.getProgressInfo() : null;
  }

  getAllTasks() {
    return Array.from(this.tasks.values()).map(t => t.getProgressInfo());
  }

  getTasksByStatus(status) {
    return this.getAllTasks().filter(t => t.status === status);
  }

  getBatchSummary() {
    const tasks = this.getAllTasks();
    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      running: tasks.filter(t => t.status === 'running').length,
      success: tasks.filter(t => t.status === 'success').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      cancelled: tasks.filter(t => t.status === 'cancelled').length,
      isRunning: this.isRunning,
      concurrency: this.concurrency
    };
  }

  addToHistory(taskResult) {
    const historyEntry = {
      ...taskResult,
      completedAt: new Date().toISOString()
    };

    this.history.unshift(historyEntry);

    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(0, this.maxHistorySize);
    }

    this.saveHistory();
  }

  saveHistory() {
    try {
      const dir = path.dirname(this.historyFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.historyFile, JSON.stringify(this.history, null, 2));
    } catch (error) {
      logger.error('Failed to save task history:', error);
    }
  }

  loadHistory() {
    try {
      if (fs.existsSync(this.historyFile)) {
        const data = fs.readFileSync(this.historyFile, 'utf8');
        this.history = JSON.parse(data);
        logger.info(`Loaded ${this.history.length} historical tasks`);
      }
    } catch (error) {
      logger.error('Failed to load task history:', error);
      this.history = [];
    }
  }

  async loadCheckpoints() {
    try {
      const checkpoints = await FlashTask.listCheckpoints(this.checkpointDir);
      logger.info(`Found ${checkpoints.length} checkpoint files`);

      for (const checkpointData of checkpoints) {
        if (checkpointData.canResume) {
          const task = FlashTask.createFromCheckpoint(checkpointData);
          this.pausedTasks.set(task.taskId, task);
          this.tasks.set(task.taskId, task);
          logger.info(`Loaded resumable task: ${task.taskId}, progress: ${task.progress}%`);
        }
      }

      this.emit('checkpoints:loaded', {
        count: this.pausedTasks.size,
        tasks: Array.from(this.pausedTasks.values()).map(t => t.getProgressInfo())
      });

      return this.pausedTasks.size;
    } catch (error) {
      logger.error('Failed to load checkpoints:', error);
      return 0;
    }
  }

  async autoResumeTasks(firmwareParser) {
    if (!this.autoResumeOnStartup || this.pausedTasks.size === 0) {
      return 0;
    }

    logger.info(`Auto-resuming ${this.pausedTasks.size} interrupted tasks...`);
    
    const taskIds = Array.from(this.pausedTasks.keys());
    
    for (const taskId of taskIds) {
      const task = this.pausedTasks.get(taskId);
      if (task && task.firmware && task.firmware.filePath) {
        try {
          if (!fs.existsSync(task.firmware.filePath)) {
            logger.warn(`Firmware file not found for task ${taskId}, cannot resume: ${task.firmware.filePath}`);
            await this.discardCheckpoint(taskId);
            continue;
          }

          if (firmwareParser) {
            const firmware = await firmwareParser.parse(task.firmware.filePath);
            if (firmware.checksum !== task.firmware.checksum) {
              logger.warn(`Firmware checksum mismatch for task ${taskId}, discarding checkpoint`);
              await this.discardCheckpoint(taskId);
              continue;
            }
            task.firmware = firmware;
          }
        } catch (error) {
          logger.warn(`Failed to validate firmware for task ${taskId}: ${error.message}`);
          await this.discardCheckpoint(taskId);
        }
      }
    }

    if (this.pausedTasks.size > 0) {
      const resumableTaskIds = Array.from(this.pausedTasks.keys());
      this.resumeBatchId = `batch-resume-${Date.now()}`;
      
      try {
        await this.startBatch(resumableTaskIds, this.concurrency, true);
        logger.info(`Auto-resumed ${resumableTaskIds.length} tasks`);
        return resumableTaskIds.length;
      } catch (error) {
        logger.error('Failed to auto-resume tasks:', error);
        return 0;
      }
    }

    return 0;
  }

  async resumeTask(taskId, firmwareParser) {
    const task = this.tasks.get(taskId) || this.pausedTasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (!task.canResume) {
      throw new Error(`Task ${taskId} cannot be resumed`);
    }

    if (task.firmware && task.firmware.filePath && firmwareParser) {
      try {
        const firmware = await firmwareParser.parse(task.firmware.filePath);
        if (firmware.checksum !== task.firmware.checksum) {
          throw new Error('Firmware checksum mismatch, file may have been modified');
        }
        task.firmware = firmware;
      } catch (error) {
        logger.error(`Failed to validate firmware for task ${taskId}: ${error.message}`);
        throw error;
      }
    }

    this.pausedTasks.delete(taskId);
    logger.info(`Resuming task ${taskId} from checkpoint at step ${task.checkpoint.step}`);
    
    return task.execute(true);
  }

  async resumeBatch(taskIds, concurrency = 4, firmwareParser) {
    const validTaskIds = taskIds.filter(id => {
      const task = this.tasks.get(id) || this.pausedTasks.get(id);
      return task && task.canResume;
    });

    if (validTaskIds.length === 0) {
      throw new Error('No resumable tasks found');
    }

    for (const taskId of validTaskIds) {
      const task = this.tasks.get(taskId) || this.pausedTasks.get(taskId);
      if (task.firmware && task.firmware.filePath && firmwareParser) {
        try {
          const firmware = await firmwareParser.parse(task.firmware.filePath);
          if (firmware.checksum === task.firmware.checksum) {
            task.firmware = firmware;
          }
        } catch (error) {
          logger.warn(`Failed to validate firmware for task ${taskId}: ${error.message}`);
        }
      }
      this.pausedTasks.delete(taskId);
    }

    logger.info(`Resuming batch with ${validTaskIds.length} tasks, concurrency: ${concurrency}`);
    return this.startBatch(validTaskIds, concurrency, true);
  }

  async discardCheckpoint(taskId) {
    const task = this.tasks.get(taskId) || this.pausedTasks.get(taskId);
    if (task) {
      await task.deleteCheckpoint();
      this.pausedTasks.delete(taskId);
      if (task.status === 'paused' || task.status === 'failed') {
        this.tasks.delete(taskId);
      }
      logger.info(`Checkpoint discarded for task ${taskId}`);
      this.emit('checkpoint:discarded', { taskId });
      return true;
    }
    return false;
  }

  async discardAllCheckpoints() {
    const taskIds = Array.from(this.pausedTasks.keys());
    for (const taskId of taskIds) {
      await this.discardCheckpoint(taskId);
    }
    logger.info(`Discarded ${taskIds.length} checkpoints`);
    return taskIds.length;
  }

  getResumableTasks() {
    return Array.from(this.pausedTasks.values()).map(t => t.getProgressInfo());
  }

  hasResumableTasks() {
    return this.pausedTasks.size > 0;
  }

  cacheFirmware(firmware) {
    if (!firmware || !firmware.checksum) return;
    
    const cacheKey = firmware.checksum;
    
    if (this.firmwareCache.size >= this.firmwareCacheMaxSize) {
      const oldestKey = this.firmwareCache.keys().next().value;
      this.firmwareCache.delete(oldestKey);
    }
    
    this.firmwareCache.set(cacheKey, {
      firmware: {
        ...firmware,
        data: undefined,
        segments: firmware.segments?.map(s => ({ ...s, data: undefined }))
      },
      rawData: firmware.data,
      cachedAt: Date.now()
    });
    
    logger.debug(`Firmware cached: ${firmware.fileName} (${firmware.checksum})`);
  }

  getCachedFirmware(checksum) {
    const cached = this.firmwareCache.get(checksum);
    if (!cached) return null;
    
    if (Date.now() - cached.cachedAt > this.firmwareCacheTtl) {
      this.firmwareCache.delete(checksum);
      return null;
    }
    
    return cached.firmware;
  }

  getCachedFirmwareData(checksum) {
    const cached = this.firmwareCache.get(checksum);
    return cached ? cached.rawData : null;
  }

  clearFirmwareCache() {
    this.firmwareCache.clear();
    logger.info('Firmware cache cleared');
  }

  async preconnectDevices(portPaths) {
    const devicesToConnect = portPaths.slice(0, this.maxPreconnect);
    
    logger.info(`Pre-connecting to ${devicesToConnect.length} devices...`);
    
    const promises = devicesToConnect.map(async (portPath) => {
      try {
        const connection = await serialManager.connect(portPath, {
          baudRate: 115200,
          maxRetries: 1
        });
        
        this.preconnectPool.set(connection.deviceId, {
          connection,
          createdAt: Date.now(),
          portPath
        });
        
        logger.debug(`Pre-connected to ${portPath}`);
        return connection.deviceId;
      } catch (error) {
        logger.debug(`Pre-connect failed for ${portPath}: ${error.message}`);
        return null;
      }
    });
    
    const results = await Promise.allSettled(promises);
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
    
    logger.info(`Pre-connected to ${successCount}/${devicesToConnect.length} devices`);
    return successCount;
  }

  getPreconnectedDevice(portPath) {
    for (const [deviceId, entry] of this.preconnectPool) {
      if (entry.portPath === portPath) {
        this.preconnectPool.delete(deviceId);
        logger.debug(`Reusing pre-connected device for ${portPath}`);
        return entry.connection;
      }
    }
    return null;
  }

  async clearPreconnectPool() {
    for (const [deviceId, entry] of this.preconnectPool) {
      try {
        await serialManager.disconnect(deviceId);
      } catch (error) {
        logger.debug(`Error disconnecting pre-connected device ${deviceId}: ${error.message}`);
      }
    }
    this.preconnectPool.clear();
    logger.info('Pre-connect pool cleared');
  }

  optimizeConcurrency(taskCount) {
    const cpuCount = require('os').cpus().length;
    const optimalConcurrency = Math.min(
      taskCount,
      Math.max(2, Math.floor(cpuCount * 1.5))
    );
    
    logger.info(`Optimized concurrency: ${optimalConcurrency} (CPU: ${cpuCount}, tasks: ${taskCount})`);
    return optimalConcurrency;
  }

  updatePerformanceMetrics(taskResult) {
    this.performanceMetrics.totalTasks++;
    
    if (taskResult.status === 'success') {
      this.performanceMetrics.completedTasks++;
    } else {
      this.performanceMetrics.failedTasks++;
    }
    
    const total = this.performanceMetrics.completedTasks + this.performanceMetrics.failedTasks;
    if (total > 0) {
      const currentAvg = this.performanceMetrics.averageDuration;
      const newDuration = taskResult.elapsed || 0;
      this.performanceMetrics.averageDuration = (currentAvg * (total - 1) + newDuration) / total;
    }
    
    if (this.performanceMetrics.startTime) {
      const elapsed = (Date.now() - this.performanceMetrics.startTime) / 1000 / 60;
      if (elapsed > 0) {
        this.performanceMetrics.throughput = total / elapsed;
      }
    }
  }

  getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      cacheHitRate: this.firmwareCache.size,
      preconnectedCount: this.preconnectPool.size,
      runningTasks: this.getTasksByStatus('running').length,
      pendingTasks: this.getTasksByStatus('pending').length
    };
  }

  estimateRemainingTime() {
    const pending = this.getTasksByStatus('pending').length + this.getTasksByStatus('running').length;
    if (pending === 0) return 0;
    
    const avgDuration = this.performanceMetrics.averageDuration || 30000;
    const effectiveConcurrency = this.isRunning ? this.concurrency : 1;
    
    return Math.ceil((pending / effectiveConcurrency) * (avgDuration / 1000));
  }

  getHistory(options = {}) {
    const { limit = 100, offset = 0, status, startDate, endDate } = options;
    let history = [...this.history];

    if (status) {
      history = history.filter(h => h.status === status);
    }

    if (startDate) {
      history = history.filter(h => new Date(h.completedAt) >= new Date(startDate));
    }

    if (endDate) {
      history = history.filter(h => new Date(h.completedAt) <= new Date(endDate));
    }

    return history.slice(offset, offset + limit);
  }

  clearHistory() {
    this.history = [];
    this.saveHistory();
    logger.info('Task history cleared');
  }

  clearCompletedTasks() {
    const completedIds = [];
    for (const [taskId, task] of this.tasks) {
      if (['success', 'failed', 'cancelled'].includes(task.status)) {
        completedIds.push(taskId);
      }
    }
    for (const id of completedIds) {
      this.tasks.delete(id);
    }
    logger.info(`Cleared ${completedIds.length} completed tasks`);
    return completedIds.length;
  }

  onProgress(callback) {
    this.progressCallbacks.add(callback);
  }

  offProgress(callback) {
    this.progressCallbacks.delete(callback);
  }

  onComplete(callback) {
    this.completeCallbacks.add(callback);
  }

  offComplete(callback) {
    this.completeCallbacks.delete(callback);
  }

  notifyProgress(progress) {
    for (const callback of this.progressCallbacks) {
      try {
        callback(progress);
      } catch (error) {
        logger.error('Error in progress callback:', error);
      }
    }
  }

  notifyComplete(result) {
    for (const callback of this.completeCallbacks) {
      try {
        callback(result);
      } catch (error) {
        logger.error('Error in complete callback:', error);
      }
    }
  }

  checkBatchComplete() {
    const remaining = this.getTasksByStatus('pending').length + this.getTasksByStatus('running').length;
    if (remaining === 0 && this.isRunning) {
      this.isRunning = false;
    }
  }

  exportTaskReport(taskId, exportPath) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const taskInfo = task.getProgressInfo();
    const logs = logger.getTaskLogs(taskId);

    let report = `Firmware Flash Task Report\n`;
    report += `============================\n\n`;
    report += `Task ID: ${taskInfo.taskId}\n`;
    report += `Device ID: ${taskInfo.deviceId}\n`;
    report += `Port: ${taskInfo.portPath}\n`;
    report += `Status: ${taskInfo.status.toUpperCase()}\n`;
    report += `Firmware: ${taskInfo.firmware.fileName} (v${taskInfo.firmware.version})\n`;
    report += `Size: ${taskInfo.firmware.size} bytes\n`;
    report += `Elapsed Time: ${this.formatDuration(taskInfo.elapsed)}\n`;
    report += `Progress: ${taskInfo.progress}%\n`;
    
    if (taskInfo.error) {
      report += `\nError: ${taskInfo.error}\n`;
    }

    report += `\nTask Logs:\n`;
    report += '-'.repeat(80) + '\n';
    
    for (const log of logs) {
      report += `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}\n`;
    }

    fs.writeFileSync(exportPath, report);
    logger.info(`Task report exported to ${exportPath}`);
    return exportPath;
  }

  formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

const taskManager = new TaskManager();
module.exports = taskManager;
