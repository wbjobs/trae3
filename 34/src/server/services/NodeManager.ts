import { v4 as uuidv4 } from 'uuid';
import { Server as SocketIOServer, Socket } from 'socket.io';
import ComputeNode from '../models/ComputeNode';
import Task from '../models/Task';
import { NodeStatus, ComputeNode as IComputeNode, TaskStatus } from '../types';
import logger from '../utils/logger';
import config from '../config';

class NodeManager {
  private static instance: NodeManager;
  private io?: SocketIOServer;
  private nodeSockets: Map<string, Socket> = new Map();
  private readonly MAX_RETRY_ATTEMPTS = 3;

  private constructor() {}

  static getInstance(): NodeManager {
    if (!NodeManager.instance) {
      NodeManager.instance = new NodeManager();
    }
    return NodeManager.instance;
  }

  initialize(io: SocketIOServer): void {
    this.io = io;
    this.setupSocketHandlers();
    this.startNodeMonitoring();
  }

  private setupSocketHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      logger.info(`New socket connection: ${socket.id}`);

      socket.on('node:register', async (nodeInfo) => {
        try {
          const node = await this.registerNode(nodeInfo, socket.id);
          this.nodeSockets.set(node.id, socket);
          socket.emit('node:registered', { nodeId: node.id });
          logger.info(`Node registered: ${node.name} (${node.id})`);
        } catch (error) {
          socket.emit('node:error', { message: (error as Error).message });
        }
      });

      socket.on('node:heartbeat', async (data) => {
        await this.updateNodeHeartbeat(data.nodeId, data.stats);
      });

      socket.on('task:progress', async (data) => {
        this.io?.emit('task:progress', data);
      });

      socket.on('task:complete', async (data) => {
        this.io?.emit('task:complete', data);
      });

      socket.on('task:error', async (data) => {
        this.io?.emit('task:error', data);
      });

      socket.on('disconnect', async () => {
        const nodeEntry = Array.from(this.nodeSockets.entries()).find(
          ([, s]) => s.id === socket.id
        );
        if (nodeEntry) {
          const [nodeId] = nodeEntry;
          this.nodeSockets.delete(nodeId);
          await this.handleNodeOffline(nodeId);
          logger.info(`Node disconnected: ${nodeId}`);
        }
      });
    });
  }

  private startNodeMonitoring(): void {
    setInterval(async () => {
      const timeoutThreshold = new Date(
        Date.now() - config.scheduler.nodeTimeout
      );

      const offlineNodes = await ComputeNode.find({
        lastHeartbeat: { $lt: timeoutThreshold },
        status: { $in: [NodeStatus.ONLINE, NodeStatus.IDLE, NodeStatus.BUSY] },
      });

      for (const node of offlineNodes) {
        await this.handleNodeOffline(node.id);
        logger.warn(`Node ${node.name} marked as offline due to timeout`);
      }

      await this.recoverStuckChunks();
    }, config.scheduler.heartbeatInterval);
  }

  private async handleNodeOffline(nodeId: string): Promise<void> {
    await ComputeNode.findOneAndUpdate(
      { id: nodeId },
      { status: NodeStatus.OFFLINE, currentTask: undefined }
    );

    const tasks = await Task.find({
      'chunks.assignedNode': nodeId,
      'chunks.status': { $in: [TaskStatus.DISPATCHED, TaskStatus.RUNNING] },
    });

    for (const task of tasks) {
      for (const chunk of task.chunks) {
        if (chunk.assignedNode === nodeId && 
            (chunk.status === TaskStatus.DISPATCHED || chunk.status === TaskStatus.RUNNING)) {
          await this.recoverChunk(chunk.id, task.id);
        }
      }
    }

    this.io?.emit('node:offline', { nodeId });
  }

  private async recoverChunk(chunkId: string, taskId: string): Promise<void> {
    const task = await Task.findOne({ id: taskId });
    if (!task) return;

    const chunk = task.chunks.find(c => c.id === chunkId);
    if (!chunk) return;

    const retryCount = chunk.retryCount || 0;
    
    if (retryCount >= this.MAX_RETRY_ATTEMPTS) {
      chunk.status = TaskStatus.FAILED;
      chunk.error = `Max retry attempts (${this.MAX_RETRY_ATTEMPTS}) exceeded after node failure`;
      chunk.endTime = new Date();
      
      const hasFailedChunks = task.chunks.some(c => c.status === TaskStatus.FAILED);
      if (hasFailedChunks) {
        task.status = TaskStatus.FAILED;
        task.error = `Chunk ${chunkId} failed after max retries`;
        task.completedAt = new Date();
      }
      
      logger.error(`Chunk ${chunkId} marked as failed after max retries`);
    } else {
      chunk.status = TaskStatus.QUEUED;
      chunk.assignedNode = undefined;
      chunk.startTime = undefined;
      chunk.retryCount = retryCount + 1;
      chunk.error = `Recovered from node failure (retry ${retryCount + 1}/${this.MAX_RETRY_ATTEMPTS})`;
      
      logger.info(`Chunk ${chunkId} recovered and re-queued (retry ${retryCount + 1}/${this.MAX_RETRY_ATTEMPTS})`);
    }

    await task.save();
    this.io?.emit('task:chunk:recovered', { chunkId, taskId, status: chunk.status });
  }

  private async recoverStuckChunks(): Promise<void> {
    const stuckThreshold = new Date(Date.now() - config.scheduler.chunkTimeout);
    
    const tasks = await Task.find({
      status: { $in: [TaskStatus.RUNNING, TaskStatus.QUEUED] },
    });

    for (const task of tasks) {
      for (const chunk of task.chunks) {
        if ((chunk.status === TaskStatus.DISPATCHED || chunk.status === TaskStatus.RUNNING) &&
            chunk.startTime && chunk.startTime < stuckThreshold) {
          logger.warn(`Detected stuck chunk ${chunk.id}, recovering...`);
          await this.recoverChunk(chunk.id, task.id);
        }
      }
    }
  }

  async registerNode(
    nodeInfo: {
      name: string;
      hostname: string;
      port: number;
      cpuCores: number;
      memoryGB: number;
      gpuCount?: number;
      capabilities?: string[];
    },
    socketId: string
  ): Promise<IComputeNode> {
    const nodeId = `node_${uuidv4()}`;

    const node = new ComputeNode({
      id: nodeId,
      name: nodeInfo.name,
      hostname: nodeInfo.hostname,
      port: nodeInfo.port,
      status: NodeStatus.IDLE,
      cpuCores: nodeInfo.cpuCores,
      memoryGB: nodeInfo.memoryGB,
      gpuCount: nodeInfo.gpuCount || 0,
      currentLoad: 0,
      memoryUsage: 0,
      capabilities: nodeInfo.capabilities || ['cfd'],
      lastHeartbeat: new Date(),
    });

    await node.save();
    return node.toObject() as IComputeNode;
  }

  async updateNodeHeartbeat(
    nodeId: string,
    stats: {
      currentLoad: number;
      memoryUsage: number;
      currentTask?: string;
    }
  ): Promise<void> {
    const node = await ComputeNode.findOne({ id: nodeId });
    if (!node) return;

    node.lastHeartbeat = new Date();
    node.currentLoad = stats.currentLoad;
    node.memoryUsage = stats.memoryUsage;

    if (stats.currentTask) {
      node.currentTask = stats.currentTask;
      node.status = NodeStatus.BUSY;
    } else {
      node.currentTask = undefined;
      node.status = NodeStatus.IDLE;
    }

    await node.save();
  }

  async updateNodeStatus(nodeId: string, status: NodeStatus): Promise<void> {
    await ComputeNode.findOneAndUpdate({ id: nodeId }, { status });
  }

  async getAvailableNodes(): Promise<IComputeNode[]> {
    const nodes = await ComputeNode.find({
      status: NodeStatus.IDLE,
      currentLoad: { $lt: 80 },
    }).sort({ cpuCores: -1, memoryGB: -1 });

    return nodes.map((n) => n.toObject() as IComputeNode);
  }

  async getNode(nodeId: string): Promise<IComputeNode | null> {
    const node = await ComputeNode.findOne({ id: nodeId });
    return node ? (node.toObject() as IComputeNode) : null;
  }

  async getAllNodes(): Promise<IComputeNode[]> {
    const nodes = await ComputeNode.find().sort({ registeredAt: -1 });
    return nodes.map((n) => n.toObject() as IComputeNode);
  }

  async assignTaskToNode(nodeId: string, chunk: any): Promise<boolean> {
    const socket = this.nodeSockets.get(nodeId);
    if (!socket) {
      logger.warn(`Node ${nodeId} has no active socket connection`);
      return false;
    }

    socket.emit('task:assign', chunk);
    return true;
  }

  async cancelTaskOnNode(nodeId: string, taskId: string): Promise<boolean> {
    const socket = this.nodeSockets.get(nodeId);
    if (!socket) return false;

    socket.emit('task:cancel', { taskId });
    return true;
  }

  async removeNode(nodeId: string): Promise<void> {
    const socket = this.nodeSockets.get(nodeId);
    if (socket) {
      socket.disconnect(true);
      this.nodeSockets.delete(nodeId);
    }
    await ComputeNode.findOneAndDelete({ id: nodeId });
    logger.info(`Node ${nodeId} removed`);
  }

  getConnectedNodeCount(): number {
    return this.nodeSockets.size;
  }

  broadcast(message: string, data: any): void {
    this.io?.emit(message, data);
  }
}

export default NodeManager.getInstance();
