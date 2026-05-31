import {
  Task,
  TaskShard,
  Node,
  CalculationResult,
} from '../../shared/types';
import {
  generateMockNodes,
  generateMockTasks,
  generateMockTaskShards,
} from './mockData.js';
import { ConsistentHashRing, MigratedShard, LoadDistribution } from './consistentHash.js';

export interface ShardMigrationRecord {
  shardId: string;
  fromNode: string;
  toNode: string;
  migratedAt: Date;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

class DataSourceManager {
  private static instance: DataSourceManager;
  private mockData: {
    tasks: Task[];
    taskShards: TaskShard[];
    nodes: Node[];
    calculationResults: CalculationResult[];
  };
  private hashRing: ConsistentHashRing;
  private shardMigrationHistory: ShardMigrationRecord[] = [];

  private constructor() {
    this.hashRing = new ConsistentHashRing(100);
    this.mockData = {
      tasks: generateMockTasks(3),
      taskShards: [],
      nodes: generateMockNodes(3),
      calculationResults: [],
    };
    this.mockData.taskShards = generateMockTaskShards(this.mockData.tasks, this.mockData.nodes);
    this.initializeHashRing();
  }

  private initializeHashRing(): void {
    for (const node of this.mockData.nodes) {
      this.hashRing.addNode(node.id);
    }
  }

  static getInstance(): DataSourceManager {
    if (!DataSourceManager.instance) {
      DataSourceManager.instance = new DataSourceManager();
    }
    return DataSourceManager.instance;
  }

  isDatabaseAvailable(): boolean {
    return false;
  }

  getTasks(): Task[] {
    return this.mockData.tasks;
  }

  getTaskShards(): TaskShard[] {
    return this.mockData.taskShards;
  }

  getNodes(): Node[] {
    return this.mockData.nodes;
  }

  getResults(): CalculationResult[] {
    return this.mockData.calculationResults;
  }

  addTask(task: Task): void {
    this.mockData.tasks.unshift(task);
  }

  addTaskShard(shard: TaskShard): void {
    this.mockData.taskShards.push(shard);
  }

  addResult(result: CalculationResult): void {
    this.mockData.calculationResults.push(result);
  }

  updateTask(taskId: string, updates: Partial<Task>): void {
    const index = this.mockData.tasks.findIndex(t => t.id === taskId);
    if (index !== -1) {
      this.mockData.tasks[index] = { ...this.mockData.tasks[index], ...updates };
    }
  }

  updateTaskShard(shardId: string, updates: Partial<TaskShard>): void {
    const index = this.mockData.taskShards.findIndex(s => s.id === shardId);
    if (index !== -1) {
      this.mockData.taskShards[index] = { ...this.mockData.taskShards[index], ...updates };
    }
  }

  addNode(node: Node): void {
    this.mockData.nodes.push(node);
    this.hashRing.addNode(node.id);
  }

  removeNode(nodeId: string): void {
    const index = this.mockData.nodes.findIndex(n => n.id === nodeId);
    if (index !== -1) {
      this.mockData.nodes.splice(index, 1);
      this.hashRing.removeNode(nodeId);
    }
  }

  updateNode(nodeId: string, updates: Partial<Node>): void {
    const index = this.mockData.nodes.findIndex(n => n.id === nodeId);
    if (index !== -1) {
      this.mockData.nodes[index] = { ...this.mockData.nodes[index], ...updates };
    }
  }

  updateResult(resultId: string, updates: Partial<CalculationResult>): void {
    const index = this.mockData.calculationResults.findIndex(r => r.id === resultId);
    if (index !== -1) {
      this.mockData.calculationResults[index] = { ...this.mockData.calculationResults[index], ...updates };
    }
  }

  removeResult(resultId: string): void {
    const index = this.mockData.calculationResults.findIndex(r => r.id === resultId);
    if (index !== -1) {
      this.mockData.calculationResults.splice(index, 1);
    }
  }

  getTaskById(taskId: string): Task | undefined {
    return this.mockData.tasks.find(t => t.id === taskId);
  }

  getShardById(shardId: string): TaskShard | undefined {
    return this.mockData.taskShards.find(s => s.id === shardId);
  }

  getResultById(resultId: string): CalculationResult | undefined {
    return this.mockData.calculationResults.find(r => r.id === resultId);
  }

  getShardsByTaskId(taskId: string): TaskShard[] {
    return this.mockData.taskShards.filter(s => s.taskId === taskId);
  }

  getResultsByTaskId(taskId: string): CalculationResult[] {
    return this.mockData.calculationResults.filter(r => r.taskId === taskId);
  }

  getShardLocation(shardId: string): string | null {
    return this.hashRing.getShardLocation(shardId);
  }

  getShardReplicas(shardId: string, replicaCount: number = 3): string[] {
    return this.hashRing.getShardReplicas(shardId, replicaCount);
  }

  rebalanceShards(): MigratedShard[] {
    const currentNodes = this.mockData.nodes.map(n => n.id);
    const shardIds = this.mockData.taskShards.map(s => s.id);

    const tempRing = new ConsistentHashRing(100);
    for (const node of currentNodes) {
      tempRing.addNode(node);
    }

    const migrations: MigratedShard[] = [];

    for (const shard of this.mockData.taskShards) {
      const currentNodeId = shard.nodeId;
      const idealNodeId = tempRing.getShardLocation(shard.id);

      if (idealNodeId && currentNodeId !== idealNodeId) {
        migrations.push({
          shardId: shard.id,
          fromNode: currentNodeId || 'unknown',
          toNode: idealNodeId,
        });

        this.shardMigrationHistory.push({
          shardId: shard.id,
          fromNode: currentNodeId || 'unknown',
          toNode: idealNodeId,
          migratedAt: new Date(),
          status: 'pending',
        });
      }
    }

    return migrations;
  }

  executeMigration(shardId: string, toNodeId: string): boolean {
    const shard = this.mockData.taskShards.find(s => s.id === shardId);
    if (!shard) return false;

    const fromNodeId = shard.nodeId || 'unknown';
    this.updateTaskShard(shardId, { nodeId: toNodeId });

    const historyRecord = this.shardMigrationHistory.find(
      h => h.shardId === shardId && h.toNode === toNodeId && h.status === 'pending'
    );
    if (historyRecord) {
      historyRecord.status = 'completed';
    }

    console.log(`Shard ${shardId} migrated from ${fromNodeId} to ${toNodeId}`);
    return true;
  }

  getShardMigrationHistory(shardId?: string): ShardMigrationRecord[] {
    if (shardId) {
      return this.shardMigrationHistory.filter(h => h.shardId === shardId);
    }
    return [...this.shardMigrationHistory];
  }

  getLoadDistribution(): LoadDistribution[] {
    const shardIds = this.mockData.taskShards.map(s => s.id);
    return this.hashRing.getLoadDistribution(shardIds);
  }

  getHashRingNodes(): string[] {
    return this.hashRing.getNodes();
  }
}

export const dataSource = DataSourceManager.getInstance();
export default DataSourceManager;
