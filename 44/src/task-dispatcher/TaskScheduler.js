const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');
const TaskQueue = require('./TaskQueue');
const TaskSplitter = require('./TaskSplitter');
const logger = require('../common/logger');
const { TaskNotFoundError, TaskTimeoutError } = require('../common/errors');
const { validateTask, validateBatchTask } = require('../common/validators');
const { SubTask, sequelize } = require('../storage/database');

class TaskScheduler extends EventEmitter {
  constructor(options = {}) {
    super();
    this.taskQueue = new TaskQueue();
    this.taskSplitter = new TaskSplitter(options.splitterOptions);
    this.tasks = new Map();
    this.subtaskMap = new Map();
    this.batchMap = new Map();
    this.resultStorage = options.resultStorage;
    this.nodeManager = options.nodeManager;
    this.maxRetries = options.maxRetries || 3;
    this.checkpointInterval = options.checkpointInterval || 30000;
    this.autoRecover = options.autoRecover !== false;
    this._setupQueueProcessors();

    if (this.autoRecover) {
      setTimeout(() => this._recoverInterruptedTasks(), 5000);
    }
  }

  _setupQueueProcessors() {
    this.taskQueue.processTasks(async (task, job) => {
      return this._executeTask(task, job);
    });

    this.taskQueue.processResults(async (result) => {
      await this._handleResult(result);
    });
  }

  async submitTask(taskData) {
    const validatedData = validateTask(taskData);
    const task = {
      id: uuidv4(),
      ...validatedData,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      progress: 0,
      subtasks: [],
      completedSubtasks: 0,
    };

    this.tasks.set(task.id, task);
    logger.info(`Task ${task.id} submitted: ${task.name}`);
    this.emit('task:submitted', task);

    await this._scheduleTask(task);
    return task;
  }

  async submitBatchTasks(batchData) {
    const validatedBatch = validateBatchTask(batchData);
    const batchId = uuidv4();
    const batch = {
      id: batchId,
      name: validatedBatch.batchName,
      priority: validatedBatch.priority,
      taskIds: [],
      status: 'processing',
      createdAt: Date.now(),
      completedCount: 0,
    };

    this.batchMap.set(batchId, batch);

    for (const taskData of validatedBatch.tasks) {
      const task = {
        ...taskData,
        priority: validatedBatch.priority,
      };
      const submittedTask = await this.submitTask(task);
      submittedTask.batchId = batchId;
      batch.taskIds.push(submittedTask.id);
    }

    logger.info(`Batch ${batchId} submitted with ${batch.taskIds.length} tasks`);
    this.emit('batch:submitted', batch);

    return batch;
  }

  async _scheduleTask(task) {
    const subtasks = this.taskSplitter.splitTask(task);

    task.subtasks = subtasks.map(st => st.id);
    task.totalSubtasks = subtasks.length;
    task.status = 'scheduled';
    task.updatedAt = Date.now();

    const subtaskRecords = [];
    for (const subtask of subtasks) {
      const subtaskInfo = {
        id: subtask.id,
        parentId: task.id,
        status: 'queued',
        createdAt: Date.now(),
      };
      this.subtaskMap.set(subtask.id, subtaskInfo);
      subtaskRecords.push({
        id: subtask.id,
        parentId: task.id,
        subtaskIndex: subtask.subtaskIndex || 0,
        totalSubtasks: subtask.totalSubtasks || 1,
        status: 'queued',
        inputData: subtask.inputData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await this.taskQueue.addTask(subtask);
    }

    try {
      if (subtaskRecords.length > 0) {
        await SubTask.bulkCreate(subtaskRecords, { ignoreDuplicates: true });
      }
    } catch (error) {
      logger.warn('Failed to persist subtasks to database:', error.message);
    }

    this.tasks.set(task.id, task);
    this.emit('task:scheduled', task);
    logger.info(`Task ${task.id} scheduled with ${subtasks.length} subtasks`);

    return task;
  }

  async _executeTask(task, job) {
    const startTime = Date.now();
    logger.info(`Executing task ${task.id} on worker`);

    let checkpoint = null;
    let retryCount = 0;
    try {
      const subtaskRecord = await SubTask.findByPk(task.id);
      if (subtaskRecord) {
        retryCount = subtaskRecord.retryCount || 0;
        if (subtaskRecord.status === 'running' && subtaskRecord.checkpointData) {
          logger.info(`Found checkpoint for task ${task.id}, resuming from ${subtaskRecord.checkpointData.progress || 0}%`);
          checkpoint = subtaskRecord.checkpointData;
        }
        await subtaskRecord.update({
          status: 'running',
          nodeId: null,
          startedAt: new Date(),
          retryCount,
        });
      }

      const node = this.nodeManager ? await this.nodeManager.selectNode(task) : null;

      if (this.subtaskMap.has(task.id)) {
        const subtaskInfo = this.subtaskMap.get(task.id);
        subtaskInfo.status = 'running';
        subtaskInfo.startedAt = startTime;
        subtaskInfo.nodeId = node ? node.id : null;
        this.subtaskMap.set(task.id, subtaskInfo);
      }

      if (this.nodeManager && node) {
        await this.nodeManager.assignTask(node.id, task.id);
        if (subtaskRecord) {
          await subtaskRecord.update({ nodeId: node.id });
        }
      }

      let lastCheckpointSave = Date.now();
      const progressCallbackWithCheckpoint = async (progress) => {
        job.progress(progress);
        if (this.subtaskMap.has(task.id)) {
          const subtaskInfo = this.subtaskMap.get(task.id);
          subtaskInfo.progress = progress;
          this.subtaskMap.set(task.id, subtaskInfo);
        }

        if (Date.now() - lastCheckpointSave > this.checkpointInterval && subtaskRecord) {
          try {
            const { computeKernel } = require('../compute-kernel');
            const cp = computeKernel.getCheckpoint(task.id);
            if (cp) {
              await subtaskRecord.update({
                checkpointData: cp,
                progress,
                updatedAt: new Date(),
              });
              lastCheckpointSave = Date.now();
              logger.debug(`Checkpoint saved for task ${task.id} at ${progress}%`);
            }
          } catch (cpError) {
            logger.warn(`Failed to save checkpoint for task ${task.id}:`, cpError.message);
          }
        }
      };

      const result = await this._runComputation(task, job, checkpoint);

      const executionTime = Date.now() - startTime;
      logger.info(`Task ${task.id} completed in ${executionTime}ms`);

      if (subtaskRecord) {
        await subtaskRecord.update({
          status: 'completed',
          resultData: result,
          progress: 100,
          checkpointData: null,
          completedAt: new Date(),
          updatedAt: new Date(),
        });
      }

      await this.taskQueue.addResult({
        ...result,
        taskId: task.id,
        parentId: task.parentId,
        subtaskIndex: task.subtaskIndex,
        totalSubtasks: task.totalSubtasks,
        success: true,
        executionTime,
        nodeId: node ? node.id : null,
      });

      if (this.subtaskMap.has(task.id)) {
        const subtaskInfo = this.subtaskMap.get(task.id);
        subtaskInfo.status = 'completed';
        subtaskInfo.completedAt = Date.now();
        this.subtaskMap.set(task.id, subtaskInfo);
      }

      if (this.nodeManager && node) {
        await this.nodeManager.completeTask(node.id, task.id, true, executionTime);
      }

      return result;
    } catch (error) {
      logger.error(`Task ${task.id} failed (retry ${retryCount}/${this.maxRetries}):`, error.message);

      const subtaskRecord = await SubTask.findByPk(task.id);
      if (subtaskRecord) {
        const { computeKernel } = require('../compute-kernel');
        const lastCheckpoint = computeKernel.getCheckpoint(task.id);
        await subtaskRecord.update({
          status: 'failed',
          error: error.message,
          checkpointData: lastCheckpoint,
          retryCount: retryCount + 1,
          updatedAt: new Date(),
        });
      }

      if (this.subtaskMap.has(task.id)) {
        const subtaskInfo = this.subtaskMap.get(task.id);
        subtaskInfo.status = 'failed';
        subtaskInfo.error = error.message;
        subtaskInfo.failedAt = Date.now();
        this.subtaskMap.set(task.id, subtaskInfo);
      }

      if (retryCount < this.maxRetries) {
        logger.info(`Retrying task ${task.id} (${retryCount + 1}/${this.maxRetries})...`);
        await this._retrySubtask(task.id);
        return null;
      }

      await this.taskQueue.addResult({
        taskId: task.id,
        parentId: task.parentId,
        success: false,
        error: error.message,
        stack: error.stack,
      });

      throw error;
    }
  }

  async _retrySubtask(subtaskId) {
    try {
      const subtaskRecord = await SubTask.findByPk(subtaskId);
      if (!subtaskRecord) return;

      const subtask = {
        id: subtaskRecord.id,
        parentId: subtaskRecord.parentId,
        subtaskIndex: subtaskRecord.subtaskIndex,
        totalSubtasks: subtaskRecord.totalSubtasks,
        inputData: subtaskRecord.inputData,
        isSubtask: true,
        name: `Retry - ${subtaskRecord.parentId}`,
        priority: 10,
      };

      if (this.subtaskMap.has(subtaskId)) {
        const subtaskInfo = this.subtaskMap.get(subtaskId);
        subtaskInfo.status = 'queued';
        this.subtaskMap.set(subtaskId, subtaskInfo);
      }

      await subtaskRecord.update({
        status: 'queued',
        updatedAt: new Date(),
      });

      await this.taskQueue.addTask(subtask);
      logger.info(`Task ${subtaskId} requeued for retry`);
    } catch (error) {
      logger.error(`Failed to retry subtask ${subtaskId}:`, error.message);
    }
  }

  async _recoverInterruptedTasks() {
    try {
      logger.info('Recovering interrupted tasks...');

      const interruptedSubtasks = await SubTask.findAll({
        where: {
          status: ['running', 'queued'],
        },
        order: [['updatedAt', 'ASC']],
      });

      logger.info(`Found ${interruptedSubtasks.length} interrupted subtasks`);

      for (const subtask of interruptedSubtasks) {
        try {
          const parentTask = this.tasks.get(subtask.parentId);
          if (!parentTask) {
            logger.warn(`Parent task ${subtask.parentId} not found for subtask ${subtask.id}, skipping`);
            continue;
          }

          if (subtask.status === 'running') {
            logger.info(`Recovering running subtask ${subtask.id} (progress: ${subtask.progress}%)`);
          }

          const retrySubtask = {
            id: subtask.id,
            parentId: subtask.parentId,
            subtaskIndex: subtask.subtaskIndex,
            totalSubtasks: subtask.totalSubtasks,
            inputData: subtask.inputData,
            isSubtask: true,
            name: `Recovered - ${subtask.parentId}`,
            priority: 10,
          };

          this.subtaskMap.set(subtask.id, {
            id: subtask.id,
            parentId: subtask.parentId,
            status: 'queued',
            progress: subtask.progress || 0,
            createdAt: subtask.createdAt?.getTime() || Date.now(),
          });

          await subtask.update({
            status: 'queued',
            updatedAt: new Date(),
          });

          await this.taskQueue.addTask(retrySubtask);
          logger.info(`Subtask ${subtask.id} recovered and requeued`);
        } catch (error) {
          logger.error(`Failed to recover subtask ${subtask.id}:`, error.message);
        }
      }

      logger.info('Task recovery completed');
    } catch (error) {
      logger.error('Failed to recover interrupted tasks:', error.message);
    }
  }

  async _runComputation(task, job, checkpoint = null) {
    const { computeKernel } = require('../compute-kernel');

    const inputDataWithTaskId = {
      ...task.inputData,
      taskId: task.id,
    };

    const updateProgress = (progress) => {
      job.progress(progress);
      if (this.subtaskMap.has(task.id)) {
        const subtaskInfo = this.subtaskMap.get(task.id);
        subtaskInfo.progress = progress;
        this.subtaskMap.set(task.id, subtaskInfo);
      }
    };

    const result = await computeKernel.interpolate(inputDataWithTaskId, updateProgress, checkpoint);

    return {
      ...result,
      grid: task.inputData.grid,
    };
  }

  async _handleResult(result) {
    if (!result.parentId) {
      if (this.resultStorage) {
        await this.resultStorage.storeResult(result);
      }
      this.emit('task:completed', result);
      return;
    }

    const parentTask = this.tasks.get(result.parentId);
    if (!parentTask) {
      logger.warn(`Parent task ${result.parentId} not found for result`);
      return;
    }

    parentTask.completedSubtasks = (parentTask.completedSubtasks || 0) + 1;
    parentTask.progress = Math.round((parentTask.completedSubtasks / parentTask.totalSubtasks) * 100);
    parentTask.updatedAt = Date.now();

    if (result.success) {
      if (!parentTask.subtaskResults) {
        parentTask.subtaskResults = [];
      }
      parentTask.subtaskResults.push(result);
    } else {
      parentTask.status = 'failed';
      parentTask.error = result.error;
      this.tasks.set(result.parentId, parentTask);
      this.emit('task:failed', parentTask);
      return;
    }

    if (parentTask.completedSubtasks >= parentTask.totalSubtasks) {
      try {
        const mergedResult = this.taskSplitter.mergeResults(
          parentTask.subtaskResults,
          parentTask
        );

        parentTask.status = 'completed';
        parentTask.completedAt = Date.now();
        this.tasks.set(result.parentId, parentTask);

        if (this.resultStorage) {
          await this.resultStorage.storeResult(mergedResult);
        }

        this.emit('task:completed', mergedResult);
        logger.info(`Parent task ${result.parentId} completed successfully`);

        await this._checkBatchCompletion(parentTask.batchId);
      } catch (error) {
        parentTask.status = 'failed';
        parentTask.error = `Merge failed: ${error.message}`;
        this.tasks.set(result.parentId, parentTask);
        this.emit('task:failed', parentTask);
      }
    } else {
      this.tasks.set(result.parentId, parentTask);
      this.emit('task:progress', parentTask);
    }
  }

  async _checkBatchCompletion(batchId) {
    if (!batchId) return;

    const batch = this.batchMap.get(batchId);
    if (!batch) return;

    batch.completedCount = (batch.completedCount || 0) + 1;

    if (batch.completedCount >= batch.taskIds.length) {
      batch.status = 'completed';
      batch.completedAt = Date.now();
      this.emit('batch:completed', batch);
      logger.info(`Batch ${batchId} completed`);
    }

    this.batchMap.set(batchId, batch);
  }

  async getTaskStatus(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }

    const queueStatus = await this.taskQueue.getTaskStatus(taskId);

    return {
      ...task,
      queueStatus,
    };
  }

  async getBatchStatus(batchId) {
    const batch = this.batchMap.get(batchId);
    if (!batch) {
      throw new TaskNotFoundError(batchId);
    }

    const taskStatuses = await Promise.all(
      batch.taskIds.map(id => this.getTaskStatus(id))
    );

    return {
      ...batch,
      tasks: taskStatuses,
    };
  }

  async cancelTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }

    for (const subtaskId of task.subtasks) {
      await this.taskQueue.cancelTask(subtaskId);
      if (this.subtaskMap.has(subtaskId)) {
        const subtask = this.subtaskMap.get(subtaskId);
        subtask.status = 'cancelled';
        this.subtaskMap.set(subtaskId, subtask);
      }
    }

    task.status = 'cancelled';
    task.updatedAt = Date.now();
    this.tasks.set(taskId, task);

    this.emit('task:cancelled', task);
    logger.info(`Task ${taskId} cancelled`);

    return task;
  }

  async getQueueStats() {
    const queueStats = await this.taskQueue.getQueueStats();
    return {
      ...queueStats,
      totalTasks: this.tasks.size,
      activeBatches: this.batchMap.size,
    };
  }

  async shutdown() {
    await this.taskQueue.close();
    logger.info('Task scheduler shutdown complete');
  }
}

module.exports = TaskScheduler;
