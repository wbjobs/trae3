import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { nodeMonitorService } from './nodeMonitor';
import { taskService } from './taskScheduler';
import { Alert, Node, NodeMetrics, Task, DashboardStats, NodeStatus, TaskStatus } from '../../shared/types';

type SocketEventType =
  | 'node:metrics'
  | 'node:status'
  | 'task:progress'
  | 'task:status'
  | 'alert:new'
  | 'dashboard:update';

export class WebSocketService {
  private static instance: WebSocketService;
  private io: Server | null = null;
  private clients: Map<string, Socket> = new Map();
  private metricsPushTimer: NodeJS.Timeout | null = null;
  private taskProgressTimer: NodeJS.Timeout | null = null;
  private mockDataTimer: NodeJS.Timeout | null = null;
  private previousNodeStatuses: Map<string, NodeStatus> = new Map();
  private previousTaskStatuses: Map<string, TaskStatus> = new Map();

  private constructor() {}

  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  initialize(server: HttpServer): void {
    if (this.io) {
      console.warn('WebSocket service already initialized');
      return;
    }

    this.io = new Server(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    this.io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);
    });

    this.startMetricsPush();
    this.startTaskProgressPush();
    this.startMockDataUpdate();

    console.log('WebSocket service initialized');
  }

  broadcast(event: SocketEventType, data: any): void {
    if (this.io) {
      this.io.emit(event, data);
    }
  }

  sendToClient(clientId: string, event: SocketEventType, data: any): void {
    const socket = this.clients.get(clientId);
    if (socket) {
      socket.emit(event, data);
    }
  }

  handleConnection(socket: Socket): void {
    this.clients.set(socket.id, socket);
    console.log(`Client connected: ${socket.id}, total clients: ${this.clients.size}`);

    socket.on('disconnect', () => {
      this.handleDisconnection(socket);
    });

    socket.on('error', (error) => {
      console.error(`Socket error from ${socket.id}:`, error);
    });
  }

  handleDisconnection(socket: Socket): void {
    this.clients.delete(socket.id);
    console.log(`Client disconnected: ${socket.id}, total clients: ${this.clients.size}`);
  }

  startMetricsPush(): void {
    if (this.metricsPushTimer) {
      return;
    }

    this.metricsPushTimer = setInterval(() => {
      this.pushNodeMetrics().catch((error) => {
        console.error('Error pushing node metrics:', error);
      });
    }, 3000);

    console.log('Metrics push started (every 3 seconds)');
  }

  startTaskProgressPush(): void {
    if (this.taskProgressTimer) {
      return;
    }

    this.taskProgressTimer = setInterval(() => {
      this.pushTaskProgress().catch((error) => {
        console.error('Error pushing task progress:', error);
      });
    }, 2000);

    console.log('Task progress push started (every 2 seconds)');
  }

  pushAlert(alert: Alert): void {
    this.broadcast('alert:new', alert);
    console.log(`Alert pushed: ${alert.level} - ${alert.message}`);
  }

  private async pushNodeMetrics(): Promise<void> {
    const { items: nodes } = await nodeMonitorService.getNodeList();

    for (const node of nodes) {
      const metricsList = await nodeMonitorService.getNodeMetrics(node.id);
      const latestMetrics = metricsList[metricsList.length - 1] || this.generateMockNodeMetrics(node.id);

      const previousStatus = this.previousNodeStatuses.get(node.id);
      if (previousStatus !== undefined && previousStatus !== node.status) {
        this.broadcast('node:status', {
          nodeId: node.id,
          status: node.status,
          previousStatus,
          timestamp: new Date()
        });
      }
      this.previousNodeStatuses.set(node.id, node.status);

      this.broadcast('node:metrics', {
        nodeId: node.id,
        nodeName: node.name,
        metrics: latestMetrics,
        status: node.status,
        timestamp: new Date()
      });
    }

    await this.pushDashboardUpdate();
  }

  private async pushTaskProgress(): Promise<void> {
    const { items: tasks } = await taskService.getTaskList(1, 50);

    for (const task of tasks) {
      const previousStatus = this.previousTaskStatuses.get(task.id);
      if (previousStatus !== undefined && previousStatus !== task.status) {
        this.broadcast('task:status', {
          taskId: task.id,
          taskName: task.name,
          status: task.status,
          previousStatus,
          timestamp: new Date()
        });
      }
      this.previousTaskStatuses.set(task.id, task.status);

      this.broadcast('task:progress', {
        taskId: task.id,
        taskName: task.name,
        progress: task.progress,
        status: task.status,
        completedShards: task.completedShards,
        totalShards: task.totalShards,
        timestamp: new Date()
      });
    }
  }

  private async pushDashboardUpdate(): Promise<void> {
    const { items: nodes } = await nodeMonitorService.getNodeList();
    const taskStats = await taskService.getTaskStatistics();

    const onlineNodes = nodes.filter(n => n.status === NodeStatus.ONLINE || n.status === NodeStatus.BUSY).length;
    const avgCpuUsage = nodes.length > 0
      ? nodes.reduce((sum, n) => sum + n.cpuUsage, 0) / nodes.length
      : 0;
    const avgMemoryUsage = nodes.length > 0
      ? nodes.reduce((sum, n) => sum + n.memoryUsage, 0) / nodes.length
      : 0;

    const dashboardStats: DashboardStats = {
      totalNodes: nodes.length,
      onlineNodes,
      totalTasks: taskStats.total,
      runningTasks: taskStats.running,
      completedTasks: taskStats.completed,
      failedTasks: taskStats.failed,
      avgCpuUsage: Math.round(avgCpuUsage * 100) / 100,
      avgMemoryUsage: Math.round(avgMemoryUsage * 100) / 100,
      pendingTasks: taskStats.pending
    };

    this.broadcast('dashboard:update', dashboardStats);
  }

  private startMockDataUpdate(): void {
    if (this.mockDataTimer) {
      return;
    }

    this.mockDataTimer = setInterval(() => {
      this.updateMockData().catch((error) => {
        console.error('Error updating mock data:', error);
      });
    }, 2000);

    console.log('Mock data update started (every 2 seconds)');
  }

  private async updateMockData(): Promise<void> {
    const { items: nodes } = await nodeMonitorService.getNodeList();

    for (const node of nodes) {
      if (node.status !== NodeStatus.OFFLINE) {
        const mockMetrics = nodeMonitorService.generateMockHeartbeat(node.id);

        if (Math.random() < 0.05) {
          const newStatus = this.getRandomNodeStatus();
          if (newStatus !== node.status) {
            await nodeMonitorService.updateNodeStatus(node.id, newStatus);
          }
        }
      }
    }

    const newAlerts = await nodeMonitorService.generateAlerts();
    for (const alert of newAlerts) {
      this.pushAlert(alert);
    }
  }

  private generateMockNodeMetrics(nodeId: string): NodeMetrics {
    const mockMetrics = nodeMonitorService.generateMockHeartbeat(nodeId);
    return {
      nodeId,
      timestamp: new Date(),
      cpu: mockMetrics.cpu,
      memory: mockMetrics.memory,
      disk: mockMetrics.disk,
      network: mockMetrics.network,
      loadAverage: mockMetrics.loadAverage
    };
  }

  private getRandomNodeStatus(): NodeStatus {
    const statuses = [NodeStatus.ONLINE, NodeStatus.BUSY, NodeStatus.ERROR];
    const weights = [0.7, 0.25, 0.05];
    const random = Math.random();
    let cumulative = 0;

    for (let i = 0; i < statuses.length; i++) {
      cumulative += weights[i];
      if (random < cumulative) {
        return statuses[i];
      }
    }

    return NodeStatus.ONLINE;
  }

  stop(): void {
    if (this.metricsPushTimer) {
      clearInterval(this.metricsPushTimer);
      this.metricsPushTimer = null;
    }

    if (this.taskProgressTimer) {
      clearInterval(this.taskProgressTimer);
      this.taskProgressTimer = null;
    }

    if (this.mockDataTimer) {
      clearInterval(this.mockDataTimer);
      this.mockDataTimer = null;
    }

    for (const socket of Array.from(this.clients.values())) {
      socket.disconnect(true);
    }
    this.clients.clear();

    if (this.io) {
      this.io.close();
      this.io = null;
    }

    this.previousNodeStatuses.clear();
    this.previousTaskStatuses.clear();

    console.log('WebSocket service stopped');
  }
}

export const webSocketService = WebSocketService.getInstance();
