import { v4 as uuidv4 } from 'uuid';
import {
  Task,
  TaskShard,
  Node,
  TaskStatus,
  NodeStatus,
  WriteStatus,
  CreateTaskRequest,
  CalculationParameters,
  CalculationResult,
  CheckpointData,
  PriorityChange,
} from '../../shared/types';
import { CalculationKernel } from './calculationKernel.js';
import { nodeMonitorService } from './nodeMonitor.js';
import { resultProcessor } from './resultProcessor.js';
import { dataSource } from './dataSource.js';

const SHARD_TIMEOUT = 30 * 60 * 1000;
const DISPATCH_INTERVAL = 5000;
const MAX_RETRIES = 3;
const MIN_SHARDS = 2;
const MAX_SHARDS = 16;

const PRIORITY_URGENT = 10;
const PRIORITY_HIGH_MIN = 7;
const PRIORITY_NORMAL_MIN = 4;
const PRIORITY_LOW_MAX = 3;
const DEFAULT_PRIORITY = 5;

class CheckpointManager {
  private checkpoints: Map<string, CheckpointData> = new Map();
  private lastSaveProgress: Map<string, number> = new Map();

  saveCheckpoint(shardId: string, checkpointData: CheckpointData): void {
    const lastProgress = this.lastSaveProgress.get(shardId) || 0;
    if (checkpointData.progress - lastProgress >= 10) {
      this.checkpoints.set(shardId, {
        ...checkpointData,
        timestamp: new Date(),
      });
      this.lastSaveProgress.set(shardId, Math.floor(checkpointData.progress / 10) * 10);
      dataSource.updateTaskShard(shardId, {
        lastCheckpoint: checkpointData,
        lastCheckpointAt: new Date(),
      });
    }
  }

  loadCheckpoint(shardId: string): CheckpointData | undefined {
    const shard = dataSource.getShardById(shardId);
    if (shard?.lastCheckpoint) {
      return shard.lastCheckpoint;
    }
    return this.checkpoints.get(shardId);
  }

  clearCheckpoint(shardId: string): void {
    this.checkpoints.delete(shardId);
    this.lastSaveProgress.delete(shardId);
    dataSource.updateTaskShard(shardId, {
      lastCheckpoint: undefined,
      lastCheckpointAt: undefined,
    });
  }
}

interface LoadHistoryEntry {
  timestamp: number;
  load: number;
  runningTasks: number;
}

interface PredictedPair {
  shard: TaskShard;
  node: Node;
  predictedCompletionTime: number;
  score: number;
}

class NodePredictor {
  private loadHistory: Map<string, LoadHistoryEntry[]> = new Map();
  private readonly EMA_ALPHA = 0.3;
  private readonly HISTORY_SIZE = 50;

  recordNodeLoad(nodeId: string, load: number, runningTasks: number): void {
    if (!this.loadHistory.has(nodeId)) {
      this.loadHistory.set(nodeId, []);
    }
    const history = this.loadHistory.get(nodeId)!;
    history.push({
      timestamp: Date.now(),
      load,
      runningTasks,
    });
    if (history.length > this.HISTORY_SIZE) {
      history.shift();
    }
  }

  predictLoad(nodeId: string, timeHorizonMs: number = 5 * 60 * 1000): number {
    const history = this.loadHistory.get(nodeId);
    if (!history || history.length < 2) {
      return 0.5;
    }

    let ema = history[0].load;
    for (let i = 1; i < history.length; i++) {
      ema = this.EMA_ALPHA * history[i].load + (1 - this.EMA_ALPHA) * ema;
    }

    const recentTrend = this.calculateTrend(history);
    const timeFactor = Math.min(timeHorizonMs / (5 * 60 * 1000), 2);
    const trendAdjustment = recentTrend * timeFactor * 0.2;

    return Math.max(0, Math.min(1, ema + trendAdjustment));
  }

  private calculateTrend(history: LoadHistoryEntry[]): number {
    if (history.length < 5) return 0;
    const recent = history.slice(-5);
    const firstHalf = recent.slice(0, 2).reduce((sum, h) => sum + h.load, 0) / 2;
    const secondHalf = recent.slice(-2).reduce((sum, h) => sum + h.load, 0) / 2;
    return secondHalf - firstHalf;
  }

  predictCompletionTime(node: Node, taskComplexity: number): number {
    const baseTime = node.performance.averageComputeTime || 300;
    const currentLoad = (node.cpuUsage + node.memoryUsage) / 200;
    const taskLoad = node.runningTasks / Math.max(node.maxConcurrentTasks, 1);
    const combinedLoad = (currentLoad * 0.4 + taskLoad * 0.6);
    const loadFactor = 1 + combinedLoad * 1.5;
    return baseTime * taskComplexity * loadFactor;
  }

  getTaskComplexity(parameters: CalculationParameters): number {
    const gridFactor = parameters.gridSize / 100;
    const timeStepsFactor = parameters.timeSteps / 100;
    const soil = parameters.soilProperties;
    const soilComplexity = (
      soil.youngModulus / 1e8 +
      soil.poissonRatio * 2 +
      soil.density / 2000 +
      soil.cohesion / 1e5 +
      soil.frictionAngle / 45
    ) / 5;
    const loadComplexity = parameters.loadConditions.length / 5;
    const complexity = gridFactor * gridFactor * timeStepsFactor * (1 + soilComplexity) * (1 + loadComplexity * 0.5);
    return Math.max(0.1, Math.min(10, complexity));
  }

  predictRemainingTime(shard: TaskShard, node: Node): number {
    const task = dataSource.getTaskById(shard.taskId);
    if (!task) return 0;
    const complexity = this.getTaskComplexity(task.parameters);
    const totalTime = this.predictCompletionTime(node, complexity);
    const remainingProgress = 100 - shard.progress;
    return totalTime * (remainingProgress / 100);
  }
}

export class TaskScheduler {
  private dispatchInterval: NodeJS.Timeout | null = null;
  private running: boolean = false;
  private checkpointManager: CheckpointManager;
  private nodePredictor: NodePredictor;

  constructor() {
    this.checkpointManager = new CheckpointManager();
    this.nodePredictor = new NodePredictor();
  }

  private calculateNodeComprehensiveScore(node: Node, shard: TaskShard): number {
    const cpuScore = 1 - node.cpuUsage / 100;
    const memoryScore = 1 - node.memoryUsage / 100;
    const realtimeLoadScore = (cpuScore * 0.5 + memoryScore * 0.5) * 0.25;

    const taskLoadScore = (1 - Math.min(node.runningTasks / node.maxConcurrentTasks, 1)) * 0.15;

    const { performanceScore, resultDeviationRate } = node.performance;
    const normalizedPerformance = performanceScore / 100;
    const deviationReciprocal = 1 / (1 + resultDeviationRate * 100);
    const performanceScoreFinal = (normalizedPerformance * 0.7 + deviationReciprocal * 0.3) * 0.25;

    const totalTasks = node.performance.completedTasks + node.performance.failedTasks;
    const completionRate = totalTasks > 0 ? node.performance.completedTasks / totalTasks : 0;
    const heartbeatAge = Date.now() - new Date(node.lastHeartbeat).getTime();
    const heartbeatFreshness = Math.max(0, 1 - heartbeatAge / 60000);
    const stabilityScore = (completionRate * 0.6 + heartbeatFreshness * 0.4) * 0.1;

    const predictedLoad = this.nodePredictor.predictLoad(node.id, 5 * 60 * 1000);
    const predictedLoadScore = (1 - predictedLoad) * 0.15;

    const task = dataSource.getTaskById(shard.taskId);
    let completionTimeScore = 0;
    if (task) {
      const complexity = this.nodePredictor.getTaskComplexity(task.parameters);
      const predictedTime = this.nodePredictor.predictCompletionTime(node, complexity);
      const normalizedTime = Math.max(0, 1 - predictedTime / 10000);
      completionTimeScore = normalizedTime * 0.1;
    }

    return realtimeLoadScore + taskLoadScore + performanceScoreFinal + stabilityScore + predictedLoadScore + completionTimeScore;
  }

  private calculateLoadVariance(nodes: Node[]): number {
    if (nodes.length === 0) return 0;

    const loads = nodes.map(n => n.runningTasks / n.maxConcurrentTasks);
    const mean = loads.reduce((sum, l) => sum + l, 0) / loads.length;
    const variance = loads.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) / loads.length;

    return variance;
  }

  private balanceLoad(): void {
    const availableNodes = dataSource.getNodes().filter(
      n => n.status === NodeStatus.ONLINE || n.status === NodeStatus.BUSY
    );

    const variance = this.calculateLoadVariance(availableNodes);
    if (variance < 0.1) return;

    const sortedByLoad = [...availableNodes].sort(
      (a, b) => (a.runningTasks / a.maxConcurrentTasks) - (b.runningTasks / b.maxConcurrentTasks)
    );

    const overloadedNodes = sortedByLoad.filter(n => n.runningTasks / n.maxConcurrentTasks > 0.7);
    const underloadedNodes = sortedByLoad.filter(n => n.runningTasks / n.maxConcurrentTasks < 0.3);

    for (const overloaded of overloadedNodes) {
      const runningShards = dataSource.getTaskShards().filter(
        s => s.nodeId === overloaded.id && s.status === TaskStatus.RUNNING && s.progress < 50
      );

      for (const shard of runningShards) {
        if (underloadedNodes.length === 0) break;

        const targetNode = underloadedNodes.reduce((best, current) => {
          const bestScore = this.calculateNodeComprehensiveScore(best, shard);
          const currentScore = this.calculateNodeComprehensiveScore(current, shard);
          return currentScore > bestScore ? current : best;
        });

        if (targetNode.runningTasks < targetNode.maxConcurrentTasks) {
          dataSource.updateTaskShard(shard.id, {
            nodeId: targetNode.id,
            status: TaskStatus.QUEUED,
          });

          dataSource.updateNode(overloaded.id, {
            runningTasks: Math.max(0, overloaded.runningTasks - 1),
          });

          dataSource.updateNode(targetNode.id, {
            runningTasks: targetNode.runningTasks + 1,
          });

          console.log(`Balanced shard ${shard.id} from ${overloaded.name} to ${targetNode.name}`);
          break;
        }
      }
    }
  }

  private predictiveDispatch(): void {
    const pendingShards = dataSource.getTaskShards().filter(
      s => s.status === TaskStatus.PENDING || s.status === TaskStatus.RECOVERING
    );
    const availableNodes = dataSource.getNodes().filter(node =>
      (node.status === NodeStatus.ONLINE || node.status === NodeStatus.BUSY) &&
      node.runningTasks < node.maxConcurrentTasks
    );

    if (pendingShards.length === 0 || availableNodes.length === 0) {
      return;
    }

    console.log(`[PredictiveDispatch] Starting predictive dispatch for ${pendingShards.length} shards`);

    const pendingPairs: PredictedPair[] = [];
    for (const shard of pendingShards) {
      const task = dataSource.getTaskById(shard.taskId);
      if (!task) continue;

      const complexity = this.nodePredictor.getTaskComplexity(task.parameters);

      for (const node of availableNodes) {
        const score = this.calculateNodeComprehensiveScore(node, shard);
        const completionTime = this.nodePredictor.predictCompletionTime(node, complexity);
        pendingPairs.push({
          shard,
          node,
          predictedCompletionTime: completionTime,
          score,
        });
      }
    }

    pendingPairs.sort((a, b) => {
      const priorityA = a.shard.priority;
      const priorityB = b.shard.priority;
      if (priorityA !== priorityB) {
        return priorityB - priorityA;
      }
      return a.predictedCompletionTime - b.predictedCompletionTime;
    });

    const assignedShards = new Set<string>();
    const usedNodeCapacity = new Map<string, number>();
    for (const node of availableNodes) {
      usedNodeCapacity.set(node.id, node.runningTasks);
    }

    let assignedCount = 0;
    for (const pair of pendingPairs) {
      if (assignedShards.has(pair.shard.id)) continue;

      const currentCapacity = usedNodeCapacity.get(pair.node.id) || 0;
      if (currentCapacity >= pair.node.maxConcurrentTasks) continue;

      dataSource.updateTaskShard(pair.shard.id, {
        nodeId: pair.node.id,
        status: TaskStatus.QUEUED,
      });

      dataSource.updateNode(pair.node.id, {
        runningTasks: currentCapacity + 1,
      });

      usedNodeCapacity.set(pair.node.id, currentCapacity + 1);
      assignedShards.add(pair.shard.id);
      assignedCount++;

      console.log(`[PredictiveDispatch] Shard ${pair.shard.id} (P${pair.shard.priority}) assigned to ${pair.node.name} with predicted time ${Math.round(pair.predictedCompletionTime)}ms`);

      this.simulateShardExecution(pair.shard, pair.node);
    }

    console.log(`[PredictiveDispatch] Assigned ${assignedCount} shards`);
  }

  private checkPreemption(): void {
    const runningShards = dataSource.getTaskShards().filter(
      s => s.status === TaskStatus.RUNNING
    );

    const pendingShards = dataSource.getTaskShards().filter(
      s => s.status === TaskStatus.PENDING && s.priority >= PRIORITY_HIGH_MIN
    );

    if (pendingShards.length === 0) return;

    const lowPriorityRunning = runningShards.filter(s => s.priority <= PRIORITY_LOW_MAX);
    if (lowPriorityRunning.length === 0) return;

    console.log(`[Preemption] Found ${pendingShards.length} high-priority pending shards, ${lowPriorityRunning.length} low-priority running shards`);

    lowPriorityRunning.sort((a, b) => a.priority - b.priority);
    pendingShards.sort((a, b) => b.priority - a.priority);

    const maxPreemptions = Math.min(lowPriorityRunning.length, pendingShards.length);

    for (let i = 0; i < maxPreemptions; i++) {
      const victimShard = lowPriorityRunning[i];
      const highPriorityShard = pendingShards[i];

      const node = dataSource.getNodes().find(n => n.id === victimShard.nodeId);
      if (!node) continue;

      console.log(`[Preemption] Preempting shard ${victimShard.id} (P${victimShard.priority}) on node ${node.name} for shard ${highPriorityShard.id} (P${highPriorityShard.priority})`);

      this.triggerPreemptionAlert(victimShard, highPriorityShard, node);

      dataSource.updateTaskShard(victimShard.id, {
        status: TaskStatus.PREEMPTED,
        nodeId: undefined,
      });

      dataSource.updateTaskShard(highPriorityShard.id, {
        nodeId: node.id,
        status: TaskStatus.QUEUED,
      });

      this.simulateShardExecution(highPriorityShard, node);
    }
  }

  private triggerPreemptionAlert(victimShard: TaskShard, highPriorityShard: TaskShard, node: Node): void {
    const victimTask = dataSource.getTaskById(victimShard.taskId);
    const highTask = dataSource.getTaskById(highPriorityShard.taskId);

    console.warn(`[ALERT] Preemption on node ${node.name}:
  Low priority shard: ${victimShard.id} (Task: ${victimTask?.name || 'Unknown'}, P${victimShard.priority})
  High priority shard: ${highPriorityShard.id} (Task: ${highTask?.name || 'Unknown'}, P${highPriorityShard.priority})
  Node load: CPU ${node.cpuUsage}%, Memory ${node.memoryUsage}%`);
  }

  async recoverInterruptedTasks(): Promise<void> {
    const interruptedShards = dataSource.getTaskShards().filter(
      s => s.status === TaskStatus.RUNNING || s.status === TaskStatus.QUEUED || s.status === TaskStatus.PREEMPTED
    );

    console.log(`Found ${interruptedShards.length} interrupted shards to recover`);

    for (const shard of interruptedShards) {
      const checkpoint = this.checkpointManager.loadCheckpoint(shard.id);

      if (checkpoint) {
        dataSource.updateTaskShard(shard.id, {
          status: TaskStatus.RECOVERING,
          progress: checkpoint.progress,
        });

        const task = dataSource.getTaskById(shard.taskId);
        if (task && task.status !== TaskStatus.RUNNING) {
          dataSource.updateTask(task.id, {
            status: TaskStatus.RUNNING,
            startedAt: task.startedAt || new Date(),
          });
        }

        console.log(`Shard ${shard.id} recovering from checkpoint at ${checkpoint.progress}%`);
      } else {
        const newRetryCount = (shard.retryCount || 0) + 1;

        if (newRetryCount <= MAX_RETRIES) {
          dataSource.updateTaskShard(shard.id, {
            status: TaskStatus.PENDING,
            retryCount: newRetryCount,
            progress: 0,
            startedAt: null,
            nodeId: undefined,
          });
          console.log(`Shard ${shard.id} reset to PENDING, retry ${newRetryCount}/${MAX_RETRIES}`);
        } else {
          dataSource.updateTaskShard(shard.id, {
            status: TaskStatus.FAILED,
            errorMessage: `Max retries (${MAX_RETRIES}) exceeded`,
            completedAt: new Date(),
          });
          console.log(`Shard ${shard.id} failed after ${MAX_RETRIES} retries`);
        }
      }

      if (shard.nodeId) {
        const node = dataSource.getNodes().find(n => n.id === shard.nodeId);
        if (node) {
          dataSource.updateNode(node.id, {
            runningTasks: Math.max(0, node.runningTasks - 1),
          });
        }
      }
    }
  }

  async createTask(request: CreateTaskRequest, userId: string): Promise<Task> {
    const taskId = uuidv4();
    const now = new Date();

    const shardCount = this.calculateShardCount(request.parameters);
    const priority = request.priority ?? DEFAULT_PRIORITY;

    const task: Task = {
      id: taskId,
      name: request.name,
      userId,
      modelFile: request.modelFile ? `uploads/${taskId}/model` : undefined,
      parameters: request.parameters,
      priority,
      status: TaskStatus.QUEUED,
      progress: 0,
      totalShards: shardCount,
      completedShards: 0,
      createdAt: now,
      startedAt: null,
      completedAt: null,
    };

    dataSource.addTask(task);

    const shards = await this.splitTask(task, request.parameters, priority);
    console.log(`Task ${taskId} created with ${shardCount} shards, priority ${priority}`);

    return task;
  }

  private calculateShardCount(parameters: CalculationParameters): number {
    const complexity = parameters.gridSize * parameters.timeSteps;
    const shardCount = Math.max(MIN_SHARDS, Math.min(MAX_SHARDS, Math.ceil(complexity / 1000)));
    return shardCount;
  }

  async splitTask(task: Task, parameters: CalculationParameters, priority: number): Promise<TaskShard[]> {
    const shards: TaskShard[] = [];
    const now = new Date();

    for (let i = 0; i < task.totalShards; i++) {
      const shard: TaskShard = {
        id: uuidv4(),
        taskId: task.id,
        shardIndex: i,
        priority,
        status: TaskStatus.PENDING,
        progress: 0,
        retryCount: 0,
        createdAt: now,
        startedAt: null,
        completedAt: null,
      };
      shards.push(shard);
      dataSource.addTaskShard(shard);
    }

    return shards;
  }

  async getAvailableNodes(): Promise<Node[]> {
    return dataSource.getNodes().filter(node =>
      (node.status === NodeStatus.ONLINE || node.status === NodeStatus.BUSY) &&
      node.runningTasks < node.maxConcurrentTasks
    );
  }

  async scheduleShard(shard: TaskShard): Promise<Node | null> {
    const availableNodes = await this.getAvailableNodes();
    if (availableNodes.length === 0) return null;

    const scoredNodes = availableNodes.map(node => ({
      node,
      score: this.calculateNodeComprehensiveScore(node, shard),
    }));

    scoredNodes.sort((a, b) => b.score - a.score);

    const topNodes = scoredNodes.slice(0, 3);
    if (topNodes.length === 0) return null;

    const selectedNode = topNodes[Math.floor(Math.random() * topNodes.length)].node;

    dataSource.updateTaskShard(shard.id, {
      nodeId: selectedNode.id,
      status: TaskStatus.QUEUED,
    });

    dataSource.updateNode(selectedNode.id, {
      runningTasks: selectedNode.runningTasks + 1,
    });

    return selectedNode;
  }

  async adjustTaskPriority(taskId: string, newPriority: number, changedBy: string, reason?: string): Promise<Task | null> {
    const task = dataSource.getTaskById(taskId);
    if (!task) return null;

    const oldPriority = task.priority;
    if (oldPriority === newPriority) {
      return task;
    }

    const priorityChange: PriorityChange = {
      oldPriority,
      newPriority,
      changedBy,
      changedAt: new Date(),
      reason,
    };

    const updatedHistory = [...(task.priorityHistory || []), priorityChange];

    dataSource.updateTask(taskId, {
      priority: newPriority,
      priorityHistory: updatedHistory,
    });

    const shards = dataSource.getShardsByTaskId(taskId);
    for (const shard of shards) {
      if (shard.status === TaskStatus.PENDING || shard.status === TaskStatus.QUEUED || shard.status === TaskStatus.PREEMPTED) {
        dataSource.updateTaskShard(shard.id, {
          priority: newPriority,
        });
      }
    }

    console.log(`[PriorityAdjust] Task ${taskId} priority changed from ${oldPriority} to ${newPriority} by ${changedBy}${reason ? `: ${reason}` : ''}`);

    return dataSource.getTaskById(taskId) || null;
  }

  async dispatchTasks(): Promise<void> {
    this.balanceLoad();
    this.checkPreemption();

    const nodes = dataSource.getNodes().filter(
      n => n.status === NodeStatus.ONLINE || n.status === NodeStatus.BUSY
    );
    for (const node of nodes) {
      const currentLoad = (node.cpuUsage + node.memoryUsage) / 200;
      this.nodePredictor.recordNodeLoad(node.id, currentLoad, node.runningTasks);
    }

    const pendingShards = dataSource.getTaskShards().filter(
      s => s.status === TaskStatus.PENDING || s.status === TaskStatus.RECOVERING
    );

    const queuedTasks = dataSource.getTasks().filter(
      t => t.status === TaskStatus.QUEUED
    );

    for (const task of queuedTasks) {
      if (task.startedAt === null) {
        dataSource.updateTask(task.id, {
          status: TaskStatus.RUNNING,
          startedAt: new Date(),
        });
      }
    }

    pendingShards.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    this.predictiveDispatch();
  }

  private async simulateShardExecution(shard: TaskShard, node: Node): Promise<void> {
    const task = dataSource.getTaskById(shard.taskId);
    if (!task) return;

    const checkpoint = this.checkpointManager.loadCheckpoint(shard.id);
    const isRecovering = shard.status === TaskStatus.RECOVERING || checkpoint !== undefined;

    dataSource.updateTaskShard(shard.id, {
      status: TaskStatus.RUNNING,
      startedAt: shard.startedAt || new Date(),
    });

    const kernel = new CalculationKernel(task.parameters);

    try {
      let currentStep = checkpoint?.currentStep || 0;
      let partialData = checkpoint ? {
        settlement: checkpoint.partialSettlement,
        stress: checkpoint.partialStress,
        displacement: checkpoint.partialDisplacement,
      } : null;

      const gridSize = task.parameters.gridSize;
      const timeSteps = task.parameters.timeSteps;

      const createCheckpoint = (progress: number, step: number) => {
        const currentShard = dataSource.getShardById(shard.id);
        if (currentShard?.status !== TaskStatus.RUNNING) return;

        const settlementData = partialData?.settlement || Array(gridSize).fill(null).map(() => Array(gridSize).fill(0));
        const stressData = partialData?.stress || Array(gridSize).fill(null).map(() => Array(gridSize).fill(0));
        const displacementData = partialData?.displacement || Array(gridSize).fill(null).map(() => Array(gridSize).fill(0));

        this.checkpointManager.saveCheckpoint(shard.id, {
          progress,
          partialSettlement: settlementData,
          partialStress: stressData,
          partialDisplacement: displacementData,
          currentStep: step,
          timestamp: new Date(),
        });
      };

      const result = await kernel.runCalculation(async (progress) => {
        const currentShard = dataSource.getShardById(shard.id);
        if (currentShard?.status !== TaskStatus.RUNNING) return;

        const adjustedProgress = isRecovering && checkpoint
          ? checkpoint.progress + (progress * (100 - checkpoint.progress) / 100)
          : progress;

        const estimatedStep = Math.floor(timeSteps * (adjustedProgress / 100));
        if (estimatedStep > currentStep) {
          currentStep = estimatedStep;
        }

        dataSource.updateTaskShard(shard.id, { progress: Math.floor(adjustedProgress) });
        this.updateTaskProgress(shard.taskId);

        createCheckpoint(adjustedProgress, currentStep);
      });

      let finalResult = result;
      if (partialData && checkpoint) {
        const mergeData = (base: number[][], partial: number[][]): number[][] => {
          return base.map((row, i) =>
            row.map((val, j) => val + (partial[i]?.[j] || 0) * 0.5)
          );
        };

        finalResult = {
          ...result,
          settlementData: mergeData(result.settlementData, partialData.settlement),
          stressData: mergeData(result.stressData, partialData.stress),
          displacementData: mergeData(result.displacementData, partialData.displacement),
        };
      }

      this.checkpointManager.clearCheckpoint(shard.id);

      const shardResult: CalculationResult = {
        id: uuidv4(),
        taskId: shard.taskId,
        shardId: shard.id,
        nodeId: node.id,
        settlementData: finalResult.settlementData,
        stressData: finalResult.stressData,
        displacementData: finalResult.displacementData,
        metadata: finalResult.metadata,
        checksum: result.checksum || this.calculateResultChecksum(finalResult),
        writeStatus: result.writeStatus || WriteStatus.PENDING,
        writeAttempts: result.writeAttempts || 1,
        createdAt: new Date(),
        verifiedAt: new Date(),
      };

      await this.completeShard(shard.id, shardResult);
    } catch (error) {
      await this.failShard(shard.id, (error as Error).message);
    }
  }

  private updateTaskProgress(taskId: string): void {
    const shards = dataSource.getShardsByTaskId(taskId);
    if (shards.length === 0) return;

    const totalProgress = shards.reduce((sum, s) => sum + s.progress, 0);
    const avgProgress = Math.floor(totalProgress / shards.length);
    const completedShards = shards.filter(
      s => s.status === TaskStatus.COMPLETED
    ).length;

    dataSource.updateTask(taskId, {
      progress: avgProgress,
      completedShards,
    });
  }

  async updateShardProgress(shardId: string, progress: number): Promise<void> {
    const shard = dataSource.getShardById(shardId);
    if (!shard) return;

    dataSource.updateTaskShard(shardId, { progress });
    this.updateTaskProgress(shard.taskId);
  }

  async completeShard(shardId: string, resultData: CalculationResult): Promise<void> {
    const shard = dataSource.getShardById(shardId);
    if (!shard) return;

    this.checkpointManager.clearCheckpoint(shardId);

    dataSource.updateTaskShard(shardId, {
      status: TaskStatus.COMPLETED,
      progress: 100,
      completedAt: new Date(),
    });

    await resultProcessor.saveResult(resultData);

    const node = dataSource.getNodes().find(n => n.id === shard.nodeId);
    if (node) {
      dataSource.updateNode(node.id, {
        runningTasks: Math.max(0, node.runningTasks - 1),
        totalTasks: node.totalTasks + 1,
      });

      const expectedComputeTime = node.performance.averageComputeTime || 300;
      const actualComputeTime = resultData.metadata.computeTime;
      const timeDeviation = Math.abs(actualComputeTime - expectedComputeTime) / expectedComputeTime;
      const resultDeviation = Math.min(timeDeviation * 0.5, node.performance.resultDeviationRate || 0.02);

      nodeMonitorService.updateNodePerformance(
        node.id,
        shardId,
        actualComputeTime,
        resultDeviation
      );
    }

    const shards = dataSource.getShardsByTaskId(shard.taskId);
    const allCompleted = shards.every(s => s.status === TaskStatus.COMPLETED);

    if (allCompleted) {
      dataSource.updateTask(shard.taskId, {
        status: TaskStatus.COMPLETED,
        progress: 100,
        completedAt: new Date(),
        completedShards: shards.length,
      });
      console.log(`Task ${shard.taskId} completed successfully`);
    } else {
      this.updateTaskProgress(shard.taskId);
    }
  }

  async failShard(shardId: string, errorMessage: string): Promise<void> {
    const shard = dataSource.getShardById(shardId);
    if (!shard) return;

    const newRetryCount = (shard.retryCount || 0) + 1;

    const node = dataSource.getNodes().find(n => n.id === shard.nodeId);
    if (node) {
      dataSource.updateNode(node.id, {
        runningTasks: Math.max(0, node.runningTasks - 1),
      });
    }

    if (newRetryCount <= MAX_RETRIES) {
      const checkpoint = this.checkpointManager.loadCheckpoint(shardId);

      dataSource.updateTaskShard(shardId, {
        status: checkpoint ? TaskStatus.RECOVERING : TaskStatus.PENDING,
        retryCount: newRetryCount,
        startedAt: null,
        nodeId: undefined,
        errorMessage: `${errorMessage} (retry ${newRetryCount}/${MAX_RETRIES})`,
      });

      console.log(`Shard ${shardId} retrying (${newRetryCount}/${MAX_RETRIES}): ${errorMessage}`);
    } else {
      this.checkpointManager.clearCheckpoint(shardId);

      dataSource.updateTaskShard(shardId, {
        status: TaskStatus.FAILED,
        completedAt: new Date(),
        errorMessage: `${errorMessage} (max retries exceeded)`,
      });

      const node = dataSource.getNodes().find(n => n.id === shard.nodeId);
      if (node) {
        nodeMonitorService.updateNodePerformance(
          node.id,
          shardId,
          0,
          0,
          true
        );
      }

      dataSource.updateTask(shard.taskId, {
        status: TaskStatus.FAILED,
        errorMessage: `Shard ${shard.shardIndex} failed: ${errorMessage}`,
        completedAt: new Date(),
      });

      console.error(`Shard ${shardId} failed after ${MAX_RETRIES} retries: ${errorMessage}`);
    }
  }

  async cancelTask(taskId: string): Promise<boolean> {
    const task = dataSource.getTaskById(taskId);
    if (!task) return false;

    if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.CANCELLED) {
      return false;
    }

    const shards = dataSource.getShardsByTaskId(taskId);
    for (const shard of shards) {
      if (shard.status === TaskStatus.RUNNING || shard.status === TaskStatus.QUEUED || shard.status === TaskStatus.RECOVERING || shard.status === TaskStatus.PREEMPTED) {
        this.checkpointManager.clearCheckpoint(shard.id);

        dataSource.updateTaskShard(shard.id, {
          status: TaskStatus.CANCELLED,
          completedAt: new Date(),
        });

        if (shard.nodeId) {
          const node = dataSource.getNodes().find(n => n.id === shard.nodeId);
          if (node) {
            dataSource.updateNode(node.id, {
              runningTasks: Math.max(0, node.runningTasks - 1),
            });
          }
        }
      }
    }

    dataSource.updateTask(taskId, {
      status: TaskStatus.CANCELLED,
      completedAt: new Date(),
    });

    console.log(`Task ${taskId} cancelled`);
    return true;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    console.log('Task scheduler starting...');
    await this.recoverInterruptedTasks();

    console.log('Task scheduler started');
    this.dispatchInterval = setInterval(() => {
      this.dispatchTasks();
    }, DISPATCH_INTERVAL);

    this.dispatchTasks();
  }

  stop(): void {
    this.running = false;
    if (this.dispatchInterval) {
      clearInterval(this.dispatchInterval);
      this.dispatchInterval = null;
    }
    console.log('Task scheduler stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  private calculateResultChecksum(result: { settlementData: number[][]; stressData: number[][]; displacementData: number[][] }): string {
    let hash = 5381;
    const allData = [...result.settlementData.flat(), ...result.stressData.flat(), ...result.displacementData.flat()];
    for (const val of allData) {
      hash = ((hash << 5) + hash + Math.floor(val * 1e6)) | 0;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
  }
}

export class TaskService {
  private scheduler: TaskScheduler;

  constructor() {
    this.scheduler = new TaskScheduler();
  }

  async createTask(request: CreateTaskRequest, userId: string): Promise<Task> {
    return this.scheduler.createTask(request, userId);
  }

  async getTaskById(taskId: string): Promise<Task | null> {
    return dataSource.getTaskById(taskId) || null;
  }

  async getTaskList(
    page: number = 1,
    pageSize: number = 10,
    filters?: { status?: string; userId?: string }
  ): Promise<{ total: number; items: Task[] }> {
    let tasks = dataSource.getTasks();

    if (filters?.status) {
      tasks = tasks.filter(t => t.status === filters.status);
    }
    if (filters?.userId) {
      tasks = tasks.filter(t => t.userId === filters.userId);
    }

    const start = (page - 1) * pageSize;
    const items = tasks.slice(start, start + pageSize);

    return {
      total: tasks.length,
      items,
    };
  }

  async getTaskShards(taskId: string): Promise<TaskShard[]> {
    return dataSource.getShardsByTaskId(taskId);
  }

  async getTaskResult(taskId: string): Promise<CalculationResult[]> {
    return dataSource.getResultsByTaskId(taskId);
  }

  async cancelTask(taskId: string, userId: string): Promise<boolean> {
    const task = dataSource.getTaskById(taskId);
    if (!task) return false;
    if (task.userId !== userId) return false;

    return this.scheduler.cancelTask(taskId);
  }

  async adjustTaskPriority(taskId: string, newPriority: number, userId: string, reason?: string): Promise<Task | null> {
    const task = dataSource.getTaskById(taskId);
    if (!task) return null;
    if (task.userId !== userId) return null;

    return this.scheduler.adjustTaskPriority(taskId, newPriority, userId, reason);
  }

  async getTaskStatistics(): Promise<any> {
    const tasks = dataSource.getTasks();
    const stats = {
      total: tasks.length,
      pending: tasks.filter(t => t.status === TaskStatus.PENDING).length,
      queued: tasks.filter(t => t.status === TaskStatus.QUEUED).length,
      running: tasks.filter(t => t.status === TaskStatus.RUNNING).length,
      recovering: tasks.filter(t => t.status === TaskStatus.RECOVERING).length,
      preempted: tasks.filter(t => t.status === TaskStatus.PREEMPTED).length,
      completed: tasks.filter(t => t.status === TaskStatus.COMPLETED).length,
      failed: tasks.filter(t => t.status === TaskStatus.FAILED).length,
      cancelled: tasks.filter(t => t.status === TaskStatus.CANCELLED).length,
    };
    return stats;
  }

  async startScheduler(): Promise<void> {
    await this.scheduler.start();
  }

  stopScheduler(): void {
    this.scheduler.stop();
  }

  isSchedulerRunning(): boolean {
    return this.scheduler.isRunning();
  }
}

export const taskService = new TaskService();
