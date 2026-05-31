const { Op, Transaction } = require('sequelize');
const { Task, TaskResult, Batch, ComputeNode, sequelize } = require('./database');
const ResultCache = require('./ResultCache');
const { ResultValidator } = require('./ResultValidator');
const { PartitionManager } = require('./PartitionManager');
const logger = require('../common/logger');
const { TaskNotFoundError, StorageError } = require('../common/errors');

class ResultStorage {
  constructor(options = {}) {
    this.cache = options.cache || new ResultCache(options.cacheOptions);
    this.useCache = options.useCache !== false;
    this.useDatabase = options.useDatabase !== false;
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this._pendingWrites = new Map();
    this.validator = options.validator || new ResultValidator(options.validatorOptions);
    this.partitionManager = options.partitionManager || new PartitionManager(options.partitionOptions);
    this.autoValidate = options.autoValidate !== false;
    this.autoMarkAnomalies = options.autoMarkAnomalies || false;
  }

  async _retryOperation(operation, taskId) {
    let lastError;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        logger.warn(`Database operation failed (attempt ${attempt}/${this.maxRetries}) for task ${taskId}:`, error.message);
        if (attempt < this.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
        }
      }
    }
    throw lastError;
  }

  async storeResult(result) {
    const { taskId, success, data, grid, parameterName, geologicalLayer, metadata } = result;

    let enrichedResult = result;
    if (this.autoValidate && success && data) {
      try {
        const validation = this.validator.validate(result);
        if (!validation.valid) {
          logger.warn(`Result validation failed for task ${taskId}: ${validation.issues.length} issues found`);
        }
        enrichedResult = {
          ...result,
          validation: {
            valid: validation.valid,
            score: validation.score,
            qualityGrade: validation.summary.qualityGrade,
            issueCount: validation.issues.length,
            warningCount: validation.warnings.length,
          },
        };
      } catch (error) {
        logger.debug(`Validation skipped for task ${taskId}: ${error.message}`);
      }
    }

    if (this.autoMarkAnomalies && success && data) {
      try {
        enrichedResult = this.validator.markAnomalies(enrichedResult);
        if (enrichedResult.data.anomalyStats) {
          logger.info(`Anomaly detection for task ${taskId}: ${enrichedResult.data.anomalyStats.totalAnomalies} anomalies found`);
        }
      } catch (error) {
        logger.debug(`Anomaly marking skipped for task ${taskId}: ${error.message}`);
      }
    }

    const finalData = enrichedResult.data;
    const finalMetadata = enrichedResult.metadata || metadata;

    try {
      if (this.useDatabase) {
        await this._retryOperation(async () => {
          const transaction = await sequelize.transaction({
            isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
          });

          try {
            await TaskResult.create({
              taskId,
              parameterName,
              geologicalLayer,
              grid,
              values: finalData.values,
              variance: finalData.variance,
              stats: finalData.stats,
              success,
              error: enrichedResult.error,
              executionTime: enrichedResult.executionTime,
              nodeId: enrichedResult.nodeId,
              metadata: {
                ...finalMetadata,
                validation: enrichedResult.validation,
                anomalyStats: finalData.anomalyStats,
              },
            }, { transaction });

            const [updateCount] = await Task.update(
              {
                status: success ? 'completed' : 'failed',
                progress: success ? 100 : Task.rawAttributes.progress.defaultValue,
                completedAt: success ? new Date() : null,
                error: enrichedResult.error,
                updatedAt: new Date(),
              },
              { where: { id: taskId }, transaction }
            );

            if (updateCount === 0) {
              logger.warn(`Task ${taskId} not found in database, creating new record`);
              await Task.findOrCreate({
                where: { id: taskId },
                defaults: {
                  id: taskId,
                  name: `Task-${taskId}`,
                  status: success ? 'completed' : 'failed',
                  progress: success ? 100 : 0,
                  parameterName,
                  geologicalLayer,
                  algorithm: finalData.stats?.algorithm || 'unknown',
                  inputData: {},
                  completedAt: success ? new Date() : null,
                  error: enrichedResult.error,
                },
                transaction,
              });
            }

            await transaction.commit();
            logger.debug(`Transaction committed for task ${taskId}`);
          } catch (error) {
            await transaction.rollback();
            logger.error(`Transaction rolled back for task ${taskId}:`, error.message);
            throw error;
          }
        }, taskId);
      }

      if (this.useCache) {
        try {
          await this._retryOperation(async () => {
            await this.cache.setResult(taskId, enrichedResult);
          }, taskId);
        } catch (cacheError) {
          logger.warn(`Cache write failed for task ${taskId}, continuing with database only:`, cacheError.message);
        }
      }

      this._pendingWrites.delete(taskId);
      logger.info(`Result stored for task ${taskId}, success: ${success}`);
      return true;
    } catch (error) {
      logger.error(`Failed to store result for task ${taskId} after ${this.maxRetries} attempts:`, error);
      this._pendingWrites.set(taskId, {
        result: enrichedResult,
        error: error.message,
        failedAt: Date.now(),
        retryCount: this.maxRetries,
      });
      throw new StorageError(`Failed to store result: ${error.message}`, 'STORE_FAILED', { taskId, attempts: this.maxRetries });
    }
  }

  async storeResultsBatch(results) {
    if (!results || results.length === 0) return [];

    const resultsWithStatus = [];
    const chunks = [];
    const chunkSize = 50;

    for (let i = 0; i < results.length; i += chunkSize) {
      chunks.push(results.slice(i, i + chunkSize));
    }

    for (const chunk of chunks) {
      try {
        await this._retryOperation(async () => {
          const transaction = await sequelize.transaction();

          try {
            for (const result of chunk) {
              const { taskId, success, data, grid, parameterName, geologicalLayer, metadata } = result;

              await TaskResult.create({
                taskId,
                parameterName,
                geologicalLayer,
                grid,
                values: data.values,
                variance: data.variance,
                stats: data.stats,
                success,
                error: result.error,
                executionTime: result.executionTime,
                nodeId: result.nodeId,
                metadata,
              }, { transaction });

              await Task.update(
                {
                  status: success ? 'completed' : 'failed',
                  progress: success ? 100 : Task.rawAttributes.progress.defaultValue,
                  completedAt: success ? new Date() : null,
                  error: result.error,
                  updatedAt: new Date(),
                },
                { where: { id: taskId }, transaction }
              );

              if (this.useCache) {
                await this.cache.setResult(taskId, result);
              }

              resultsWithStatus.push({ taskId, success: true });
            }

            await transaction.commit();
          } catch (error) {
            await transaction.rollback();
            throw error;
          }
        }, `batch-${chunk.length}`);
      } catch (error) {
        for (const result of chunk) {
          resultsWithStatus.push({ taskId: result.taskId, success: false, error: error.message });
        }
        logger.error(`Batch store failed for chunk of ${chunk.length} results:`, error.message);
      }
    }

    return resultsWithStatus;
  }

  async retryFailedWrites() {
    const failedTasks = Array.from(this._pendingWrites.keys());
    const results = [];

    logger.info(`Retrying ${failedTasks.length} failed writes...`);

    for (const taskId of failedTasks) {
      const pending = this._pendingWrites.get(taskId);
      try {
        await this.storeResult(pending.result);
        results.push({ taskId, success: true });
      } catch (error) {
        results.push({ taskId, success: false, error: error.message });
      }
    }

    return results;
  }

  getPendingWrites() {
    return Array.from(this._pendingWrites.values());
  }

  async getResult(taskId, useCache = true) {
    if (this.useCache && useCache) {
      const cached = await this.cache.getResult(taskId);
      if (cached) {
        logger.debug(`Cache hit for result ${taskId}`);
        return cached;
      }
    }

    if (this.useDatabase) {
      const result = await TaskResult.findOne({
        where: { taskId },
        order: [['createdAt', 'DESC']],
      });

      if (result) {
        const formatted = this._formatResult(result);
        if (this.useCache) {
          await this.cache.setResult(taskId, formatted);
        }
        return formatted;
      }
    }

    return null;
  }

  async getResultsByTaskIds(taskIds) {
    if (!taskIds || taskIds.length === 0) return [];

    const cachedResults = this.useCache
      ? await this.cache.getWithPattern('result', taskIds)
      : taskIds.map(() => null);

    const missingIds = taskIds.filter((_, i) => cachedResults[i] === null);

    if (missingIds.length > 0 && this.useDatabase) {
      const dbResults = await TaskResult.findAll({
        where: { taskId: { [Op.in]: missingIds } },
        order: [['createdAt', 'DESC']],
      });

      const formattedDbResults = dbResults.map(r => this._formatResult(r));
      const resultMap = new Map(formattedDbResults.map(r => [r.taskId, r]));

      if (this.useCache && formattedDbResults.length > 0) {
        const cacheData = {};
        for (const r of formattedDbResults) {
          cacheData[r.taskId] = r;
        }
        await this.cache.setWithPattern('result', cacheData);
      }

      return taskIds.map((id, i) => cachedResults[i] || resultMap.get(id) || null);
    }

    return cachedResults;
  }

  async getTask(taskId) {
    if (this.useCache) {
      const cached = await this.cache.getTaskStatus(taskId);
      if (cached) {
        return cached;
      }
    }

    if (this.useDatabase) {
      const task = await Task.findByPk(taskId);
      if (task) {
        const formatted = this._formatTask(task);
        if (this.useCache) {
          await this.cache.setTaskStatus(taskId, formatted);
        }
        return formatted;
      }
    }

    throw new TaskNotFoundError(taskId);
  }

  async getTasks(options = {}) {
    const {
      status,
      parameterName,
      geologicalLayer,
      batchId,
      startDate,
      endDate,
      page = 1,
      pageSize = 20,
    } = options;

    const where = {};
    if (status) where.status = status;
    if (parameterName) where.parameterName = parameterName;
    if (geologicalLayer) where.geologicalLayer = geologicalLayer;
    if (batchId) where.batchId = batchId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate);
      if (endDate) where.createdAt[Op.lte] = new Date(endDate);
    }

    if (this.useDatabase) {
      const { count, rows } = await Task.findAndCountAll({
        where,
        order: [['createdAt', 'DESC']],
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });

      return {
        total: count,
        page,
        pageSize,
        totalPages: Math.ceil(count / pageSize),
        data: rows.map(t => this._formatTask(t)),
      };
    }

    return { total: 0, page, pageSize, totalPages: 0, data: [] };
  }

  async createTask(taskData) {
    if (this.useDatabase) {
      const task = await Task.create({
        id: taskData.id,
        batchId: taskData.batchId,
        name: taskData.name,
        description: taskData.description,
        priority: taskData.priority,
        status: taskData.status || 'pending',
        parameterName: taskData.inputData.parameterName,
        geologicalLayer: taskData.inputData.geologicalLayer,
        algorithm: taskData.inputData.params.algorithm,
        inputData: taskData.inputData,
        metadata: taskData.metadata,
        callbackUrl: taskData.callbackUrl,
        totalSubtasks: taskData.totalSubtasks || 0,
      });
      return this._formatTask(task);
    }
    return taskData;
  }

  async updateTask(taskId, updates) {
    if (this.useDatabase) {
      const [count] = await Task.update(updates, { where: { id: taskId } });
      if (count > 0 && this.useCache) {
        await this.cache.delete(`status:${taskId}`);
      }
      return count > 0;
    }
    return true;
  }

  async createBatch(batchData) {
    if (this.useDatabase) {
      const batch = await Batch.create({
        id: batchData.id,
        name: batchData.name,
        priority: batchData.priority,
        status: batchData.status || 'processing',
        taskCount: batchData.taskIds?.length || 0,
        metadata: batchData.metadata,
      });
      return this._formatBatch(batch);
    }
    return batchData;
  }

  async getBatch(batchId) {
    if (this.useCache) {
      const cached = await this.cache.getBatchStatus(batchId);
      if (cached) {
        return cached;
      }
    }

    if (this.useDatabase) {
      const batch = await Batch.findByPk(batchId, {
        include: [{ model: Task, as: 'Tasks', attributes: ['id', 'status'] }],
      });
      if (batch) {
        const formatted = this._formatBatch(batch);
        if (this.useCache) {
          await this.cache.setBatchStatus(batchId, formatted);
        }
        return formatted;
      }
    }

    throw new TaskNotFoundError(batchId);
  }

  async updateBatch(batchId, updates) {
    if (this.useDatabase) {
      const [count] = await Batch.update(updates, { where: { id: batchId } });
      if (count > 0 && this.useCache) {
        await this.cache.delete(`batch:${batchId}`);
      }
      return count > 0;
    }
    return true;
  }

  async queryResults(options = {}) {
    const {
      parameterName,
      geologicalLayer,
      startDate,
      endDate,
      success,
      page = 1,
      pageSize = 10,
      includeValues = true,
    } = options;

    const where = {};
    if (parameterName) where.parameterName = parameterName;
    if (geologicalLayer) where.geologicalLayer = geologicalLayer;
    if (success !== undefined) where.success = success;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate);
      if (endDate) where.createdAt[Op.lte] = new Date(endDate);
    }

    if (this.useDatabase) {
      const attributes = includeValues
        ? undefined
        : { exclude: ['values', 'variance'] };

      const { count, rows } = await TaskResult.findAndCountAll({
        where,
        attributes,
        order: [['createdAt', 'DESC']],
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });

      return {
        total: count,
        page,
        pageSize,
        totalPages: Math.ceil(count / pageSize),
        data: rows.map(r => this._formatResult(r)),
      };
    }

    return { total: 0, page, pageSize, totalPages: 0, data: [] };
  }

  async getStatistics(options = {}) {
    const { startDate, endDate, parameterName, geologicalLayer } = options;

    if (!this.useDatabase) {
      return { totalResults: 0, successRate: 0, avgComputationTime: 0 };
    }

    const where = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate);
      if (endDate) where.createdAt[Op.lte] = new Date(endDate);
    }
    if (parameterName) where.parameterName = parameterName;
    if (geologicalLayer) where.geologicalLayer = geologicalLayer;

    const totalResults = await TaskResult.count({ where });
    const successResults = await TaskResult.count({ where: { ...where, success: true } });

    const avgTimeResult = await TaskResult.findOne({
      where,
      attributes: [[Task.sequelize.fn('AVG', Task.sequelize.col('executionTime')), 'avgTime']],
      raw: true,
    });

    return {
      totalResults,
      successResults,
      failedResults: totalResults - successResults,
      successRate: totalResults > 0 ? (successResults / totalResults).toFixed(4) : 0,
      avgComputationTime: avgTimeResult?.avgTime || 0,
    };
  }

  async storeNode(nodeData) {
    if (this.useDatabase) {
      try {
        const [node, created] = await ComputeNode.upsert({
          id: nodeData.id,
          name: nodeData.name,
          type: nodeData.type,
          host: nodeData.host,
          port: nodeData.port,
          capacity: nodeData.capacity,
          supportedAlgorithms: nodeData.supportedAlgorithms,
          status: nodeData.status || 'online',
          lastHeartbeat: new Date(),
        });
        logger.info(`Node ${nodeData.id} ${created ? 'registered' : 'updated'} in database`);
        return node;
      } catch (error) {
        logger.error('Failed to store node:', error);
      }
    }
    return nodeData;
  }

  async updateNodeHeartbeat(nodeId, metrics = {}) {
    if (this.useDatabase) {
      await ComputeNode.update(
        {
          ...metrics,
          lastHeartbeat: new Date(),
        },
        { where: { id: nodeId } }
      );
    }
  }

  async getNodeStats() {
    if (!this.useDatabase) return {};

    const total = await ComputeNode.count();
    const online = await ComputeNode.count({ where: { status: 'online' } });

    const nodeResults = await ComputeNode.findAll({
      attributes: ['id', 'name', 'status', 'type', 'currentLoad', 'cpuUsage', 'memoryUsage', 'totalTasksCompleted', 'totalTasksFailed', 'totalCpuTime'],
      order: [['totalTasksCompleted', 'DESC']],
    });

    return {
      totalNodes: total,
      onlineNodes: online,
      offlineNodes: total - online,
      nodes: nodeResults.map(n => n.toJSON()),
    };
  }

  _formatResult(result) {
    return {
      id: result.id,
      taskId: result.taskId,
      parameterName: result.parameterName,
      geologicalLayer: result.geologicalLayer,
      grid: result.grid,
      data: {
        values: result.values,
        variance: result.variance,
        stats: result.stats,
      },
      success: result.success,
      error: result.error,
      executionTime: result.executionTime,
      nodeId: result.nodeId,
      metadata: result.metadata,
      createdAt: result.createdAt,
    };
  }

  _formatTask(task) {
    return {
      id: task.id,
      batchId: task.batchId,
      name: task.name,
      description: task.description,
      priority: task.priority,
      status: task.status,
      progress: task.progress,
      parameterName: task.parameterName,
      geologicalLayer: task.geologicalLayer,
      algorithm: task.algorithm,
      metadata: task.metadata,
      callbackUrl: task.callbackUrl,
      error: task.error,
      totalSubtasks: task.totalSubtasks,
      completedSubtasks: task.completedSubtasks,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      completedAt: task.completedAt,
    };
  }

  _formatBatch(batch) {
    return {
      id: batch.id,
      name: batch.name,
      priority: batch.priority,
      status: batch.status,
      taskCount: batch.taskCount,
      completedCount: batch.completedCount,
      failedCount: batch.failedCount,
      metadata: batch.metadata,
      createdAt: batch.createdAt,
      completedAt: batch.completedAt,
      tasks: batch.Tasks ? batch.Tasks.map(t => ({ id: t.id, status: t.status })) : undefined,
    };
  }

  async close() {
    if (this.cache) {
      await this.cache.close();
    }
    logger.info('Result storage closed');
  }

  validateResult(result, inputData = null) {
    return this.validator.validate(result, inputData);
  }

  markResultAnomalies(result) {
    return this.validator.markAnomalies(result);
  }

  getPartitionRoute(options = {}) {
    return this.partitionManager.routeQuery(options);
  }

  async getPartitionStats() {
    return this.partitionManager.getPartitionStats();
  }

  async maintainPartitions() {
    return this.partitionManager.maintain();
  }
}

const resultStorage = new ResultStorage();

module.exports = {
  ResultStorage,
  resultStorage,
};
