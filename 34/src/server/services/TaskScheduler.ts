import { v4 as uuidv4 } from 'uuid';
import Task from '../models/Task';
import { TaskStatus, CFDParameters, TaskChunk, ComputeTask } from '../types';
import logger from '../utils/logger';

interface NodeCapability {
  id: string;
  cpuCores: number;
  memoryGB: number;
  currentLoad: number;
  gpuCount: number;
  capabilities: string[];
}

class TaskScheduler {
  private static instance: TaskScheduler;

  private constructor() {}

  static getInstance(): TaskScheduler {
    if (!TaskScheduler.instance) {
      TaskScheduler.instance = new TaskScheduler();
    }
    return TaskScheduler.instance;
  }

  async createTask(
    name: string,
    parameters: CFDParameters,
    createdBy: string,
    options?: {
      description?: string;
      priority?: number;
      tags?: string[];
      estimatedDuration?: number;
      numChunks?: number;
      shardingStrategy?: 'uniform' | 'weighted' | 'adaptive';
    }
  ): Promise<ComputeTask> {
    const taskId = `task_${uuidv4()}`;
    const strategy = options?.shardingStrategy || 'adaptive';
    const numChunks = this.determineOptimalChunkCount(parameters, options?.numChunks, strategy);

    const chunks = strategy === 'uniform'
      ? this.splitDomainUniform(parameters, numChunks, taskId)
      : this.splitDomainAdaptive(parameters, numChunks, taskId);

    const task = new Task({
      id: taskId,
      name,
      description: options?.description,
      parameters,
      status: TaskStatus.PENDING,
      priority: options?.priority || 5,
      chunks,
      totalChunks: numChunks,
      completedChunks: 0,
      createdBy,
      tags: options?.tags || [],
      estimatedDuration: options?.estimatedDuration,
    });

    await task.save();
    logger.info(`Created task ${taskId} with ${numChunks} chunks (strategy: ${strategy})`);
    return task.toObject() as ComputeTask;
  }

  private determineOptimalChunkCount(
    parameters: CFDParameters,
    requestedChunks: number | undefined,
    strategy: string
  ): number {
    if (requestedChunks) return requestedChunks;

    const totalCells = parameters.mesh.xCells * parameters.mesh.yCells * parameters.mesh.zCells;
    const minCellsPerChunk = 5000;
    const maxCellsPerChunk = 500000;

    const idealFromCells = Math.max(1, Math.min(
      Math.floor(totalCells / minCellsPerChunk),
      Math.floor(totalCells / maxCellsPerChunk) || 1
    ));

    const phaseMultiplier = parameters.phases.length > 1 ? 1.5 : 1.0;
    const turbulenceMultiplier = parameters.simulation.turbulenceModel === 'LES' ? 2.0 : 1.0;

    const adjustedIdeal = Math.ceil(idealFromCells * phaseMultiplier * turbulenceMultiplier);

    return Math.max(2, Math.min(adjustedIdeal, 64));
  }

  private splitDomainUniform(
    parameters: CFDParameters,
    numChunks: number,
    taskId: string
  ): TaskChunk[] {
    const chunks: TaskChunk[] = [];
    const { xMin, xMax, yMin, yMax, zMin, zMax } = parameters.domain;

    const xChunks = Math.ceil(Math.sqrt(numChunks));
    const yChunks = Math.ceil(numChunks / xChunks);

    const xStep = (xMax - xMin) / xChunks;
    const yStep = (yMax - yMin) / yChunks;

    let chunkIndex = 0;

    for (let i = 0; i < xChunks && chunkIndex < numChunks; i++) {
      for (let j = 0; j < yChunks && chunkIndex < numChunks; j++) {
        const subXMin = xMin + i * xStep;
        const subXMax = i === xChunks - 1 ? xMax : xMin + (i + 1) * xStep;
        const subYMin = yMin + j * yStep;
        const subYMax = j === yChunks - 1 ? yMax : yMin + (j + 1) * yStep;

        const cellCount = this.estimateSubDomainCells(parameters, subXMin, subXMax, subYMin, subYMax);

        const chunk: TaskChunk = {
          id: `chunk_${taskId}_${chunkIndex}`,
          taskId,
          chunkIndex,
          totalChunks: numChunks,
          subDomain: { xMin: subXMin, xMax: subXMax, yMin: subYMin, yMax: subYMax, zMin, zMax },
          parameters: {
            ...parameters,
            domain: { xMin: subXMin, xMax: subXMax, yMin: subYMin, yMax: subYMax, zMin, zMax },
          },
          status: TaskStatus.PENDING,
          estimatedCellCount: cellCount,
          weight: 1.0,
        };
        chunks.push(chunk);
        chunkIndex++;
      }
    }

    return chunks;
  }

  private splitDomainAdaptive(
    parameters: CFDParameters,
    numChunks: number,
    taskId: string
  ): TaskChunk[] {
    const chunks: TaskChunk[] = [];
    const { xMin, xMax, yMin, yMax, zMin, zMax } = parameters.domain;
    const totalCells = parameters.mesh.xCells * parameters.mesh.yCells * parameters.mesh.zCells;
    const totalVolume = (xMax - xMin) * (yMax - yMin) * (zMax - zMin);
    const cellsPerUnitVolume = totalCells / totalVolume;

    const subDomains = this.recursiveBisection(
      { xMin, xMax, yMin, yMax, zMin, zMax },
      numChunks,
      cellsPerUnitVolume,
      parameters
    );

    for (let i = 0; i < subDomains.length; i++) {
      const sub = subDomains[i];
      const cellCount = this.estimateSubDomainCells(parameters, sub.xMin, sub.xMax, sub.yMin, sub.yMax);
      const weight = cellCount / (totalCells / numChunks);

      const chunk: TaskChunk = {
        id: `chunk_${taskId}_${i}`,
        taskId,
        chunkIndex: i,
        totalChunks: numChunks,
        subDomain: sub,
        parameters: {
          ...parameters,
          domain: sub,
        },
        status: TaskStatus.PENDING,
        estimatedCellCount: cellCount,
        weight: Math.round(weight * 1000) / 1000,
      };
      chunks.push(chunk);
    }

    return chunks;
  }

  private recursiveBisection(
    domain: { xMin: number; xMax: number; yMin: number; yMax: number; zMin: number; zMax: number },
    numChunks: number,
    cellsPerUnitVolume: number,
    parameters: CFDParameters
  ): Array<{ xMin: number; xMax: number; yMin: number; yMax: number; zMin: number; zMax: number }> {
    if (numChunks <= 1) {
      return [domain];
    }

    const xLen = domain.xMax - domain.xMin;
    const yLen = domain.yMax - domain.yMin;
    const zLen = domain.zMax - domain.zMin;

    let splitAxis: 'x' | 'y' | 'z';
    if (xLen >= yLen && xLen >= zLen) {
      splitAxis = 'x';
    } else if (yLen >= xLen && yLen >= zLen) {
      splitAxis = 'y';
    } else {
      splitAxis = 'z';
    }

    const n1 = Math.ceil(numChunks / 2);
    const n2 = numChunks - n1;
    const ratio = n1 / numChunks;

    let domain1: typeof domain;
    let domain2: typeof domain;

    switch (splitAxis) {
      case 'x': {
        const splitPoint = domain.xMin + xLen * ratio;
        domain1 = { ...domain, xMax: splitPoint };
        domain2 = { ...domain, xMin: splitPoint };
        break;
      }
      case 'y': {
        const splitPoint = domain.yMin + yLen * ratio;
        domain1 = { ...domain, yMax: splitPoint };
        domain2 = { ...domain, yMin: splitPoint };
        break;
      }
      case 'z': {
        const splitPoint = domain.zMin + zLen * ratio;
        domain1 = { ...domain, zMax: splitPoint };
        domain2 = { ...domain, zMin: splitPoint };
        break;
      }
    }

    return [
      ...this.recursiveBisection(domain1, n1, cellsPerUnitVolume, parameters),
      ...this.recursiveBisection(domain2, n2, cellsPerUnitVolume, parameters),
    ];
  }

  private estimateSubDomainCells(
    parameters: CFDParameters,
    xMin: number, xMax: number,
    yMin: number, yMax: number
  ): number {
    const totalXLen = parameters.domain.xMax - parameters.domain.xMin;
    const totalYLen = parameters.domain.yMax - parameters.domain.yMin;
    const subXLen = xMax - xMin;
    const subYLen = yMax - yMin;

    const xRatio = subXLen / totalXLen;
    const yRatio = subYLen / totalYLen;

    return Math.ceil(parameters.mesh.xCells * xRatio * parameters.mesh.yCells * yRatio * parameters.mesh.zCells);
  }

  assignChunksToNodesWeighted(
    chunks: TaskChunk[],
    nodes: NodeCapability[]
  ): Array<{ chunkId: string; nodeId: string }> {
    const assignments: Array<{ chunkId: string; nodeId: string }> = [];

    const sortedChunks = [...chunks].sort((a, b) => (b.weight || 1) - (a.weight || 1));

    const nodeCapacities = nodes.map(n => ({
      ...n,
      availableCapacity: this.calculateNodeCapacity(n),
      assignedWeight: 0,
      assignedChunks: 0,
    }));

    for (const chunk of sortedChunks) {
      const chunkWeight = chunk.weight || 1;

      const bestNode = nodeCapacities
        .filter(n => n.availableCapacity > 0)
        .sort((a, b) => {
          const loadA = a.assignedWeight / a.availableCapacity;
          const loadB = b.assignedWeight / b.availableCapacity;
          return loadA - loadB;
        })[0];

      if (bestNode) {
        assignments.push({ chunkId: chunk.id, nodeId: bestNode.id });
        bestNode.assignedWeight += chunkWeight;
        bestNode.assignedChunks++;
        bestNode.availableCapacity -= chunkWeight * 0.1;
      }
    }

    return assignments;
  }

  private calculateNodeCapacity(node: NodeCapability): number {
    const cpuScore = node.cpuCores * 10;
    const memScore = node.memoryGB * 2;
    const loadPenalty = node.currentLoad / 100;
    const gpuBonus = node.gpuCount > 0 ? 20 : 0;

    return Math.max(1, (cpuScore + memScore + gpuBonus) * (1 - loadPenalty));
  }

  async queueTask(taskId: string): Promise<void> {
    await Task.findOneAndUpdate(
      { id: taskId },
      {
        status: TaskStatus.QUEUED,
        'chunks.$[].status': TaskStatus.QUEUED,
        startedAt: new Date(),
      }
    );
    logger.info(`Queued task ${taskId}`);
  }

  async getNextPendingChunks(limit: number = 5): Promise<TaskChunk[]> {
    const tasks = await Task.find(
      {
        status: TaskStatus.QUEUED,
        'chunks.status': TaskStatus.QUEUED,
      },
      { 'chunks.$': 1, id: 1, priority: 1 }
    )
      .sort({ priority: -1, createdAt: 1 })
      .limit(limit);

    const chunks: TaskChunk[] = [];
    for (const task of tasks) {
      const pendingChunks = task.chunks.filter(
        (c: any) => c.status === TaskStatus.QUEUED
      );
      const sortedByWeight = pendingChunks.sort((a: any, b: any) => (b.weight || 1) - (a.weight || 1));
      chunks.push(...sortedByWeight.slice(0, limit - chunks.length));
      if (chunks.length >= limit) break;
    }

    return chunks;
  }

  async assignChunkToNode(
    chunkId: string,
    nodeId: string
  ): Promise<TaskChunk | null> {
    const result = await Task.findOneAndUpdate(
      { 'chunks.id': chunkId, 'chunks.status': TaskStatus.QUEUED },
      {
        $set: {
          'chunks.$.status': TaskStatus.DISPATCHED,
          'chunks.$.assignedNode': nodeId,
          'chunks.$.startTime': new Date(),
        },
      },
      { new: true }
    );

    if (!result) return null;

    const chunk = result.chunks.find((c: any) => c.id === chunkId);
    if (chunk) {
      await Task.findOneAndUpdate(
        { id: chunk.taskId, status: { $in: [TaskStatus.PENDING, TaskStatus.QUEUED] } },
        { status: TaskStatus.RUNNING }
      );
    }

    logger.info(`Assigned chunk ${chunkId} to node ${nodeId}`);
    return chunk || null;
  }

  async updateChunkProgress(
    chunkId: string,
    progress: number,
    message?: string
  ): Promise<void> {
    await Task.findOneAndUpdate(
      { 'chunks.id': chunkId },
      {
        $set: {
          'chunks.$.status': TaskStatus.RUNNING,
        },
      }
    );
  }

  async completeChunk(
    chunkId: string,
    resultPath: string
  ): Promise<{ taskCompleted: boolean; taskId: string } | null> {
    const task = await Task.findOne({ 'chunks.id': chunkId });
    if (!task) return null;

    const chunk = task.chunks.find((c: any) => c.id === chunkId);
    if (!chunk) return null;

    chunk.status = TaskStatus.COMPLETED;
    chunk.endTime = new Date();
    chunk.resultPath = resultPath;

    task.completedChunks = task.chunks.filter(
      (c: any) => c.status === TaskStatus.COMPLETED
    ).length;

    const allCompleted = task.completedChunks === task.totalChunks;
    if (allCompleted) {
      task.status = TaskStatus.COMPLETED;
      task.completedAt = new Date();
      if (task.startedAt) {
        task.actualDuration =
          (task.completedAt.getTime() - task.startedAt.getTime()) / 1000;
      }
    }

    await task.save();
    logger.info(
      `Completed chunk ${chunkId} for task ${task.id}. Progress: ${task.completedChunks}/${task.totalChunks}`
    );

    return { taskCompleted: allCompleted, taskId: task.id };
  }

  async failChunk(chunkId: string, error: string): Promise<void> {
    const task = await Task.findOne({ 'chunks.id': chunkId });
    if (!task) return;

    const chunk = task.chunks.find((c: any) => c.id === chunkId);
    if (!chunk) return;

    chunk.status = TaskStatus.FAILED;
    chunk.endTime = new Date();
    chunk.error = error;

    const hasFailedChunks = task.chunks.some((c: any) => c.status === TaskStatus.FAILED);
    if (hasFailedChunks) {
      task.status = TaskStatus.FAILED;
      task.error = `Chunk ${chunkId} failed: ${error}`;
      task.completedAt = new Date();
    }

    await task.save();
    logger.error(`Chunk ${chunkId} failed: ${error}`);
  }

  async pauseTask(taskId: string): Promise<void> {
    await Task.findOneAndUpdate(
      { id: taskId },
      { status: TaskStatus.PAUSED }
    );
    logger.info(`Paused task ${taskId}`);
  }

  async resumeTask(taskId: string): Promise<void> {
    const task = await Task.findOne({ id: taskId });
    if (!task) return;

    const hasRunningChunks = task.chunks.some(
      (c: any) => c.status === TaskStatus.DISPATCHED || c.status === TaskStatus.RUNNING
    );

    if (hasRunningChunks) {
      task.status = TaskStatus.RUNNING;
    } else {
      const hasQueuedChunks = task.chunks.some((c: any) => c.status === TaskStatus.QUEUED);
      task.status = hasQueuedChunks ? TaskStatus.QUEUED : TaskStatus.RUNNING;
    }

    await task.save();
    logger.info(`Resumed task ${taskId}`);
  }

  async cancelTask(taskId: string): Promise<void> {
    await Task.findOneAndUpdate(
      { id: taskId },
      {
        status: TaskStatus.CANCELLED,
        'chunks.$[elem].status': TaskStatus.CANCELLED,
      },
      {
        arrayFilters: [{ 'elem.status': { $in: [TaskStatus.QUEUED, TaskStatus.PENDING] } }],
      }
    );
    logger.info(`Cancelled task ${taskId}`);
  }

  async saveChunkCheckpoint(
    chunkId: string,
    checkpointTime: number,
    checkpointPath: string
  ): Promise<void> {
    await Task.findOneAndUpdate(
      { 'chunks.id': chunkId },
      {
        $set: {
          'chunks.$.checkpointTime': checkpointTime,
          'chunks.$.checkpointPath': checkpointPath,
        },
      }
    );
    logger.info(`Saved checkpoint for chunk ${chunkId} at time ${checkpointTime}`);
  }

  async getTask(taskId: string): Promise<ComputeTask | null> {
    const task = await Task.findOne({ id: taskId });
    return task ? (task.toObject() as ComputeTask) : null;
  }

  async getTasks(
    filter: Partial<{ status: TaskStatus; createdBy: string; tags: string[] }>,
    page: number = 1,
    limit: number = 20
  ): Promise<{ tasks: ComputeTask[]; total: number }> {
    const query: any = {};
    if (filter.status) query.status = filter.status;
    if (filter.createdBy) query.createdBy = filter.createdBy;
    if (filter.tags) query.tags = { $all: filter.tags };

    const [tasks, total] = await Promise.all([
      Task.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Task.countDocuments(query),
    ]);

    return { tasks: tasks as ComputeTask[], total };
  }

  async getTaskChunks(taskId: string): Promise<TaskChunk[]> {
    const task = await Task.findOne({ id: taskId });
    return task ? task.chunks : [];
  }

  async batchCreateTasks(
    tasks: Array<{
      name: string;
      parameters: CFDParameters;
      createdBy: string;
      description?: string;
      priority?: number;
      tags?: string[];
    }>
  ): Promise<ComputeTask[]> {
    const createdTasks: ComputeTask[] = [];

    for (const taskData of tasks) {
      const task = await this.createTask(
        taskData.name,
        taskData.parameters,
        taskData.createdBy,
        {
          description: taskData.description,
          priority: taskData.priority,
          tags: taskData.tags,
        }
      );
      createdTasks.push(task);
    }

    logger.info(`Batch created ${createdTasks.length} tasks`);
    return createdTasks;
  }
}

export default TaskScheduler.getInstance();
