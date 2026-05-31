const Queue = require('bull');
const config = require('../../config');
const logger = require('../common/logger');

class TaskQueue {
  constructor() {
    this.taskQueue = new Queue(config.task.taskQueueName, {
      redis: config.redis,
    });
    this.resultQueue = new Queue(config.task.resultQueueName, {
      redis: config.redis,
    });
    this._setupEventHandlers();
  }

  _setupEventHandlers() {
    this.taskQueue.on('error', (error) => {
      logger.error('Task queue error:', error);
    });

    this.taskQueue.on('stalled', (job) => {
      logger.warn(`Job ${job.id} has stalled`);
    });

    this.resultQueue.on('error', (error) => {
      logger.error('Result queue error:', error);
    });
  }

  async addTask(task, options = {}) {
    const jobOptions = {
      priority: task.priority || 5,
      timeout: config.task.timeout,
      attempts: 3,
      removeOnComplete: false,
      removeOnFail: false,
      ...options,
    };
    const job = await this.taskQueue.add(task, jobOptions);
    logger.info(`Task ${task.id} added to queue with job id ${job.id}`);
    return job;
  }

  async addResult(result, options = {}) {
    const job = await this.resultQueue.add(result, options);
    logger.info(`Result for task ${result.taskId} added to result queue`);
    return job;
  }

  processTasks(handler, concurrency = config.task.maxParallel) {
    return this.taskQueue.process(concurrency, async (job) => {
      logger.info(`Processing task ${job.data.id} (job: ${job.id})`);
      try {
        const result = await handler(job.data, job);
        return result;
      } catch (error) {
        logger.error(`Error processing task ${job.data.id}:`, error);
        throw error;
      }
    });
  }

  processResults(handler, concurrency = 5) {
    return this.resultQueue.process(concurrency, async (job) => {
      logger.info(`Processing result for task ${job.data.taskId}`);
      try {
        await handler(job.data, job);
      } catch (error) {
        logger.error(`Error processing result for task ${job.data.taskId}:`, error);
        throw error;
      }
    });
  }

  async getTaskJob(taskId) {
    const jobs = await this.taskQueue.getJobs(['waiting', 'active', 'completed', 'failed', 'delayed']);
    return jobs.find(job => job.data.id === taskId);
  }

  async getTaskStatus(taskId) {
    const job = await this.getTaskJob(taskId);
    if (!job) {
      return null;
    }
    return {
      taskId,
      jobId: job.id,
      state: await job.getState(),
      progress: job.progress() || 0,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      data: job.data,
      returnValue: job.returnvalue,
    };
  }

  async cancelTask(taskId) {
    const job = await this.getTaskJob(taskId);
    if (job) {
      await job.remove();
      logger.info(`Task ${taskId} cancelled`);
      return true;
    }
    return false;
  }

  async getQueueStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.taskQueue.getWaitingCount(),
      this.taskQueue.getActiveCount(),
      this.taskQueue.getCompletedCount(),
      this.taskQueue.getFailedCount(),
      this.taskQueue.getDelayedCount(),
    ]);

    return {
      taskQueue: {
        waiting,
        active,
        completed,
        failed,
        delayed,
      },
    };
  }

  async pause() {
    await this.taskQueue.pause();
    logger.info('Task queue paused');
  }

  async resume() {
    await this.taskQueue.resume();
    logger.info('Task queue resumed');
  }

  async close() {
    await this.taskQueue.close();
    await this.resultQueue.close();
    logger.info('Task queues closed');
  }
}

module.exports = TaskQueue;
