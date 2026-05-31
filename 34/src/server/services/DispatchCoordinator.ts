import TaskScheduler from './TaskScheduler';
import NodeManager from './NodeManager';
import ComputeKernel from './ComputeKernel';
import ResultStorage from './ResultStorage';
import logger from '../utils/logger';
import config from '../config';

class DispatchCoordinator {
  private static instance: DispatchCoordinator;
  private isRunning: boolean = false;
  private dispatchInterval?: NodeJS.Timeout;

  private constructor() {}

  static getInstance(): DispatchCoordinator {
    if (!DispatchCoordinator.instance) {
      DispatchCoordinator.instance = new DispatchCoordinator();
    }
    return DispatchCoordinator.instance;
  }

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.dispatchInterval = setInterval(
      () => this.dispatchLoop(),
      config.scheduler.heartbeatInterval
    );

    logger.info('Dispatch coordinator started');
  }

  stop(): void {
    if (this.dispatchInterval) {
      clearInterval(this.dispatchInterval);
    }
    this.isRunning = false;
    logger.info('Dispatch coordinator stopped');
  }

  private async dispatchLoop(): Promise<void> {
    try {
      const availableNodes = await NodeManager.getAvailableNodes();
      if (availableNodes.length === 0) {
        return;
      }

      const pendingChunks = await TaskScheduler.getNextPendingChunks(availableNodes.length);
      if (pendingChunks.length === 0) {
        return;
      }

      logger.info(
        `Dispatching ${pendingChunks.length} chunks to ${availableNodes.length} available nodes`
      );

      for (let i = 0; i < Math.min(pendingChunks.length, availableNodes.length); i++) {
        const chunk = pendingChunks[i];
        const node = availableNodes[i];

        await this.dispatchChunkToNode(chunk.id, node.id);
      }
    } catch (error) {
      logger.error(`Dispatch loop error: ${(error as Error).message}`);
    }
  }

  async dispatchChunkToNode(chunkId: string, nodeId: string): Promise<boolean> {
    try {
      const chunk = await TaskScheduler.assignChunkToNode(chunkId, nodeId);
      if (!chunk) {
        logger.warn(`Failed to assign chunk ${chunkId} to node ${nodeId}`);
        return false;
      }

      const dispatched = await NodeManager.assignTaskToNode(nodeId, chunk);
      if (!dispatched) {
        logger.warn(`Failed to dispatch chunk ${chunkId} to node ${nodeId}`);
        return false;
      }

      logger.info(`Dispatched chunk ${chunkId} to node ${nodeId}`);
      return true;
    } catch (error) {
      logger.error(`Dispatch error: ${(error as Error).message}`);
      return false;
    }
  }

  async handleChunkProgress(data: {
    chunkId: string;
    progress: number;
    message?: string;
    nodeId: string;
  }): Promise<void> {
    try {
      await TaskScheduler.updateChunkProgress(data.chunkId, data.progress, data.message);
      NodeManager.broadcast('task:progress', data);
    } catch (error) {
      logger.error(`Progress update error: ${(error as Error).message}`);
    }
  }

  async handleChunkComplete(data: {
    chunkId: string;
    resultPath: string;
    nodeId: string;
    variables: string[];
    timesteps: number[];
    checksum?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const maxRetries = 3;
    let retryCount = 0;
    let lastError: Error | null = null;

    while (retryCount < maxRetries) {
      try {
        const taskId = this.extractTaskId(data.chunkId);
        if (!taskId) {
          throw new Error(`Cannot extract taskId from chunkId: ${data.chunkId}`);
        }

        const integrityCheck = await this.validateChunkResult(data);
        if (!integrityCheck.valid) {
          throw new Error(`Result integrity check failed: ${integrityCheck.error}`);
        }

        const result = await ResultStorage.storeResult(
          taskId,
          data.chunkId,
          data.nodeId,
          data.resultPath,
          data.variables,
          data.timesteps,
          {
            ...data.metadata,
            checksum: data.checksum,
            integrityVerified: true,
            validation: integrityCheck,
          }
        );

        const chunkUpdate = await this.updateChunkWithChecksum(data.chunkId, data.checksum);
        if (!chunkUpdate) {
          logger.warn(`Could not update chunk checksum for ${data.chunkId}`);
        }

        const completionResult = await TaskScheduler.completeChunk(data.chunkId, result.filePath);

        if (completionResult) {
          NodeManager.broadcast('task:chunk:complete', {
            chunkId: data.chunkId,
            taskId: completionResult.taskId,
            taskCompleted: completionResult.taskCompleted,
            result,
          });

          if (completionResult.taskCompleted) {
            const mergeResult = await this.safeMergeTaskResults(completionResult.taskId);
            if (!mergeResult.success) {
              logger.error(`Task ${completionResult.taskId} merge failed: ${mergeResult.error}`);
            }
            
            NodeManager.broadcast('task:complete', {
              taskId: completionResult.taskId,
              mergeSuccess: mergeResult.success,
            });
            logger.info(`Task ${completionResult.taskId} completed successfully`);
          }
        }

        await ComputeKernel.cleanupCase(data.resultPath);
        return;
      } catch (error) {
        lastError = error as Error;
        retryCount++;
        logger.error(`Chunk completion attempt ${retryCount}/${maxRetries} failed: ${lastError.message}`);
        
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
    }

    if (lastError) {
      logger.error(`Chunk completion failed after ${maxRetries} attempts: ${data.chunkId}`);
      await TaskScheduler.failChunk(data.chunkId, lastError.message);
      NodeManager.broadcast('task:error', {
        chunkId: data.chunkId,
        error: lastError.message,
        nodeId: data.nodeId,
      });
    }
  }

  private extractTaskId(chunkId: string): string | null {
    const parts = chunkId.split('_');
    if (parts.length >= 3 && parts[0] === 'chunk') {
      return parts.slice(1, -1).join('_');
    }
    
    const match = chunkId.match(/^chunk_(task_[a-f0-9-]+)_\d+$/);
    if (match) {
      return match[1];
    }
    
    return null;
  }

  private async validateChunkResult(data: {
    chunkId: string;
    resultPath: string;
    variables: string[];
    timesteps: number[];
  }): Promise<{ valid: boolean; error?: string }> {
    const fs = require('fs').promises;
    const path = require('path');

    try {
      await fs.access(data.resultPath);
    } catch {
      return { valid: false, error: 'Result path does not exist' };
    }

    if (data.variables.length === 0) {
      return { valid: false, error: 'No variables in result' };
    }

    if (data.timesteps.length === 0) {
      return { valid: false, error: 'No timesteps in result' };
    }

    const latestTimestep = Math.max(...data.timesteps);
    const timestepPath = path.join(data.resultPath, latestTimestep.toString());
    
    try {
      await fs.access(timestepPath);
    } catch {
      return { valid: false, error: `Latest timestep ${latestTimestep} directory not found` };
    }

    for (const variable of data.variables) {
      const varPath = path.join(timestepPath, variable);
      try {
        const stats = await fs.stat(varPath);
        if (stats.size === 0) {
          return { valid: false, error: `Variable ${variable} file is empty` };
        }
      } catch {
        return { valid: false, error: `Variable ${variable} file not found` };
      }
    }

    return { valid: true };
  }

  private async updateChunkWithChecksum(chunkId: string, checksum?: string): Promise<boolean> {
    if (!checksum) return false;

    try {
      const Task = require('../models/Task').default;
      const result = await Task.findOneAndUpdate(
        { 'chunks.id': chunkId },
        { $set: { 'chunks.$.checksum': checksum } },
        { new: true }
      );
      return !!result;
    } catch (error) {
      logger.error(`Failed to update chunk checksum: ${(error as Error).message}`);
      return false;
    }
  }

  private async safeMergeTaskResults(taskId: string): Promise<{ success: boolean; error?: string }> {
    const maxRetries = 2;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const resultPath = await ResultStorage.mergeTaskResults(taskId);
        
        const TaskResult = require('../models/TaskResult').default;
        const resultCount = await TaskResult.countDocuments({ taskId });
        const Task = require('../models/Task').default;
        const task = await Task.findOne({ id: taskId });
        
        if (task && resultCount !== task.totalChunks) {
          logger.warn(`Merge warning: result count (${resultCount}) != total chunks (${task.totalChunks})`);
        }

        return { success: true };
      } catch (error) {
        logger.error(`Merge attempt ${attempt + 1} failed: ${(error as Error).message}`);
        if (attempt === maxRetries - 1) {
          return { success: false, error: (error as Error).message };
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    return { success: false, error: 'Unknown merge error' };
  }

  async handleChunkError(data: {
    chunkId: string;
    error: string;
    nodeId: string;
  }): Promise<void> {
    try {
      await TaskScheduler.failChunk(data.chunkId, data.error);
      NodeManager.broadcast('task:error', {
        chunkId: data.chunkId,
        error: data.error,
        nodeId: data.nodeId,
      });
      logger.error(`Chunk ${data.chunkId} failed: ${data.error}`);
    } catch (error) {
      logger.error(`Chunk error handling error: ${(error as Error).message}`);
    }
  }

  async submitTask(taskData: {
    name: string;
    parameters: any;
    createdBy: string;
    description?: string;
    priority?: number;
    tags?: string[];
    numChunks?: number;
  }): Promise<any> {
    const estimatedDuration = ComputeKernel.getEstimatedDuration(taskData.parameters);

    const task = await TaskScheduler.createTask(
      taskData.name,
      taskData.parameters,
      taskData.createdBy,
      {
        description: taskData.description,
        priority: taskData.priority,
        tags: taskData.tags,
        estimatedDuration,
        numChunks: taskData.numChunks,
      }
    );

    await TaskScheduler.queueTask(task.id);

    NodeManager.broadcast('task:submitted', { task });

    logger.info(`Task ${task.id} submitted and queued`);

    setImmediate(() => this.dispatchLoop());

    return task;
  }

  async submitBatchTasks(tasksData: Array<{
    name: string;
    parameters: any;
    createdBy: string;
    description?: string;
    priority?: number;
    tags?: string[];
    numChunks?: number;
  }>): Promise<any[]> {
    const createdTasks: any[] = [];

    for (const taskData of tasksData) {
      const task = await this.submitTask(taskData);
      createdTasks.push(task);
    }

    logger.info(`Batch submitted ${createdTasks.length} tasks`);
    return createdTasks;
  }

  async cancelTask(taskId: string): Promise<void> {
    const task = await TaskScheduler.getTask(taskId);
    if (!task) return;

    const runningChunks = task.chunks.filter(
      (c) => c.status === 'running' || c.status === 'dispatched'
    );

    for (const chunk of runningChunks) {
      if (chunk.assignedNode) {
        await NodeManager.cancelTaskOnNode(chunk.assignedNode, chunk.id);
      }
    }

    await TaskScheduler.cancelTask(taskId);
    NodeManager.broadcast('task:cancelled', { taskId });

    logger.info(`Task ${taskId} cancelled`);
  }

  getStats(): Promise<{
    pendingTasks: number;
    runningTasks: number;
    completedTasks: number;
    failedTasks: number;
    onlineNodes: number;
    busyNodes: number;
  }> {
    return this.getSystemStats();
  }

  private async getSystemStats(): Promise<any> {
    const nodes = await NodeManager.getAllNodes();
    const onlineNodes = nodes.filter((n) => n.status !== 'offline').length;
    const busyNodes = nodes.filter((n) => n.status === 'busy').length;

    const { tasks: pendingTasks } = await TaskScheduler.getTasks({ status: 'pending' as any }, 1, 1);
    const { tasks: runningTasks } = await TaskScheduler.getTasks({ status: 'running' as any }, 1, 1);
    const { tasks: completedTasks } = await TaskScheduler.getTasks({ status: 'completed' as any }, 1, 1);
    const { tasks: failedTasks } = await TaskScheduler.getTasks({ status: 'failed' as any }, 1, 1);

    return {
      pendingTasks: pendingTasks.length,
      runningTasks: runningTasks.length,
      completedTasks: completedTasks.length,
      failedTasks: failedTasks.length,
      onlineNodes,
      busyNodes,
    };
  }
}

export default DispatchCoordinator.getInstance();
