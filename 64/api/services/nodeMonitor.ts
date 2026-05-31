import { v4 as uuidv4 } from 'uuid';
import { Node, NodeStatus, NodeMetrics, Alert, NodePerformance, PerformanceTrendPoint, NodePerformanceResult } from '../../shared/types';
import { generateMockNodeMetrics, generateMockAlerts } from './mockData';
import { dataSource } from './dataSource.js';

export class NodeMonitorService {
  private mockMetrics: Map<string, NodeMetrics[]> = new Map();
  private mockAlerts: Alert[] = [];
  private performanceHistory: Map<string, PerformanceTrendPoint[]> = new Map();
  private readonly HEARTBEAT_TIMEOUT = 15000;
  private readonly MAX_COMPUTE_TIME = 2 * 60 * 60 * 1000;

  constructor() {
    this.initializeMockData();
  }

  private initializeMockData(): void {
    this.mockAlerts = generateMockAlerts(5);
    const nodes = dataSource.getNodes();
    nodes.forEach(node => {
      this.mockMetrics.set(node.id, generateMockNodeMetrics(node.id, 24));
      this.performanceHistory.set(node.id, this.generatePerformanceHistory(node.id, 24));
    });
  }

  private generatePerformanceHistory(nodeId: string, hours: number): PerformanceTrendPoint[] {
    const history: PerformanceTrendPoint[] = [];
    const now = Date.now();
    const points = hours;
    const node = dataSource.getNodes().find(n => n.id === nodeId);
    const baseScore = node?.performance.performanceScore || 80;
    const baseDeviation = node?.performance.resultDeviationRate || 0.02;

    for (let i = points; i >= 0; i--) {
      const timestamp = new Date(now - i * 60 * 60 * 1000);
      const wave = Math.sin(i * 0.2) * 5;
      const noise = (Math.random() - 0.5) * 3;
      
      history.push({
        timestamp,
        performanceScore: Math.max(0, Math.min(100, baseScore + wave + noise)),
        deviationRate: Math.max(0, baseDeviation + (Math.random() - 0.5) * 0.01),
        completedTasks: Math.floor(Math.random() * 10)
      });
    }
    return history;
  }

  private generateId(): string {
    return uuidv4();
  }

  async registerNode(nodeInfo: { name: string; ipAddress: string }): Promise<Node> {
    const now = new Date();
    const performance: NodePerformance = {
      completedTasks: 0,
      failedTasks: 0,
      averageComputeTime: 0,
      resultDeviationRate: 0,
      performanceScore: 0,
      lastTenResults: []
    };

    const node: Node = {
      id: this.generateId(),
      name: nodeInfo.name,
      ipAddress: nodeInfo.ipAddress,
      status: NodeStatus.ONLINE,
      cpuUsage: 0,
      memoryUsage: 0,
      diskUsage: 0,
      networkUsage: 0,
      runningTasks: 0,
      totalTasks: 0,
      maxConcurrentTasks: 4,
      lastHeartbeat: now,
      registeredAt: now,
      performance
    };

    dataSource.addNode(node);
    this.mockMetrics.set(node.id, []);
    this.performanceHistory.set(node.id, []);

    console.log(`Node registered: ${node.name} (${node.ipAddress})`);
    return node;
  }

  async unregisterNode(nodeId: string): Promise<boolean> {
    const index = dataSource.getNodes().findIndex(n => n.id === nodeId);
    if (index === -1) return false;

    dataSource.removeNode(nodeId);
    this.mockMetrics.delete(nodeId);
    this.performanceHistory.delete(nodeId);

    console.log(`Node unregistered: ${nodeId}`);
    return true;
  }

  async heartbeat(nodeId: string, metrics: Omit<NodeMetrics, 'nodeId' | 'timestamp'>): Promise<void> {
    const node = dataSource.getNodes().find(n => n.id === nodeId);
    if (!node) return;

    const now = new Date();

    const updates: Partial<Node> = {
      cpuUsage: metrics.cpu,
      memoryUsage: metrics.memory,
      diskUsage: metrics.disk,
      networkUsage: metrics.network,
      lastHeartbeat: now,
    };

    if (node.status === NodeStatus.OFFLINE || node.status === NodeStatus.ERROR) {
      updates.status = NodeStatus.ONLINE;
    }

    dataSource.updateNode(nodeId, updates);

    const nodeMetric: NodeMetrics = {
      nodeId,
      timestamp: now,
      cpu: metrics.cpu,
      memory: metrics.memory,
      disk: metrics.disk,
      network: metrics.network,
      loadAverage: metrics.loadAverage,
    };

    const existingMetrics = this.mockMetrics.get(nodeId) || [];
    existingMetrics.push(nodeMetric);
    if (existingMetrics.length > 288) {
      existingMetrics.shift();
    }
    this.mockMetrics.set(nodeId, existingMetrics);
  }

  async updateNodePerformance(nodeId: string, shardId: string, computeTime: number, resultDeviation: number, isFailure: boolean = false): Promise<void> {
    const node = dataSource.getNodes().find(n => n.id === nodeId);
    if (!node) return;

    const perf = { ...node.performance };
    let totalTasks = node.totalTasks;

    if (isFailure) {
      perf.failedTasks++;
      totalTasks++;
      dataSource.updateNode(nodeId, { performance: perf, totalTasks });
      return;
    }
    perf.completedTasks++;
    totalTasks++;

    const result: NodePerformanceResult = {
      shardId,
      computeTime,
      deviation: resultDeviation
    };

    perf.lastTenResults = [...perf.lastTenResults, result];
    if (perf.lastTenResults.length > 10) {
      perf.lastTenResults.shift();
    }

    const recentResults = perf.lastTenResults.slice(-10);
    const olderCount = Math.max(0, perf.completedTasks - 10);
    
    let weightedComputeTimeSum = 0;
    let weightedDeviationSum = 0;
    let weightSum = 0;

    recentResults.forEach((r, index) => {
      const age = recentResults.length - 1 - index;
      const weight = age < 10 ? 0.7 * (1 - age * 0.05) : 0.3;
      weightedComputeTimeSum += r.computeTime * weight;
      weightedDeviationSum += r.deviation * weight;
      weightSum += weight;
    });

    if (olderCount > 0 && perf.averageComputeTime > 0) {
      const oldWeight = 0.3 * Math.min(1, olderCount / 10);
      weightedComputeTimeSum += perf.averageComputeTime * oldWeight;
      weightedDeviationSum += perf.resultDeviationRate * oldWeight;
      weightSum += oldWeight;
    }

    if (weightSum > 0) {
      perf.averageComputeTime = weightedComputeTimeSum / weightSum;
      perf.resultDeviationRate = weightedDeviationSum / weightSum;
    } else {
      perf.averageComputeTime = computeTime;
      perf.resultDeviationRate = resultDeviation;
    }

    const completionRate = perf.completedTasks / Math.max(1, perf.completedTasks + perf.failedTasks);
    const normalizedComputeTime = Math.max(0, 1 - perf.averageComputeTime / 3600);
    const normalizedDeviation = Math.max(0, 1 - perf.resultDeviationRate / 0.1);

    perf.performanceScore = Math.round(
      completionRate * 40 +
      normalizedComputeTime * 30 +
      normalizedDeviation * 30
    );
    perf.performanceScore = Math.max(0, Math.min(100, perf.performanceScore));

    dataSource.updateNode(nodeId, { performance: perf, totalTasks });

    const history = this.performanceHistory.get(nodeId) || [];
    const now = new Date();
    const lastPoint = history[history.length - 1];
    
    if (!lastPoint || now.getTime() - lastPoint.timestamp.getTime() >= 60 * 60 * 1000) {
      history.push({
        timestamp: now,
        performanceScore: perf.performanceScore,
        deviationRate: perf.resultDeviationRate,
        completedTasks: 1
      });
    } else {
      lastPoint.completedTasks++;
      lastPoint.performanceScore = perf.performanceScore;
      lastPoint.deviationRate = perf.resultDeviationRate;
    }

    if (history.length > 720) {
      history.shift();
    }
    this.performanceHistory.set(nodeId, history);
  }

  async getNodePerformanceTrend(nodeId: string, hours: number = 24): Promise<PerformanceTrendPoint[]> {
    const history = this.performanceHistory.get(nodeId) || [];
    const cutoffTime = Date.now() - hours * 60 * 60 * 1000;
    
    return history.filter(p => new Date(p.timestamp).getTime() >= cutoffTime);
  }

  async isolateNode(nodeId: string, reason: string): Promise<boolean> {
    const node = dataSource.getNodes().find(n => n.id === nodeId);
    if (!node) return false;

    const perf = { ...node.performance };
    perf.isolationReason = reason;
    perf.isolatedAt = new Date();
    dataSource.updateNode(nodeId, { status: NodeStatus.ERROR, performance: perf });

    const alert: Alert = {
      id: this.generateId(),
      type: 'node',
      level: 'critical',
      message: `节点 ${node.name} (${node.ipAddress}) 已被隔离: ${reason}`,
      timestamp: new Date(),
      resolved: false,
    };
    this.mockAlerts = [alert, ...this.mockAlerts].slice(0, 50);

    console.warn(`Node ${node.name} isolated: ${reason}`);
    return true;
  }

  async recoverIsolatedNode(nodeId: string): Promise<boolean> {
    const node = dataSource.getNodes().find(n => n.id === nodeId);
    if (!node || node.status !== NodeStatus.ERROR) return false;

    const oldPerf = node.performance;
    const newPerf = {
      completedTasks: Math.floor(oldPerf.completedTasks * 0.3),
      failedTasks: Math.floor(oldPerf.failedTasks * 0.3),
      averageComputeTime: oldPerf.averageComputeTime,
      resultDeviationRate: oldPerf.resultDeviationRate,
      performanceScore: Math.max(50, oldPerf.performanceScore),
      lastTenResults: oldPerf.lastTenResults.slice(-5)
    };
    dataSource.updateNode(nodeId, { status: NodeStatus.ONLINE, performance: newPerf });

    const alert: Alert = {
      id: this.generateId(),
      type: 'node',
      level: 'info',
      message: `节点 ${node.name} (${node.ipAddress}) 已从隔离状态恢复`,
      timestamp: new Date(),
      resolved: false,
    };
    this.mockAlerts = [alert, ...this.mockAlerts].slice(0, 50);

    console.log(`Node ${node.name} recovered from isolation`);
    return true;
  }

  async checkNodeHealth(): Promise<void> {
    const now = Date.now();
    const newAlerts: Alert[] = [];

    for (const node of dataSource.getNodes()) {
      const lastHeartbeat = new Date(node.lastHeartbeat).getTime();
      const timeSinceHeartbeat = now - lastHeartbeat;

      if (timeSinceHeartbeat > this.HEARTBEAT_TIMEOUT) {
        if (node.status !== NodeStatus.OFFLINE) {
          dataSource.updateNode(node.id, { status: NodeStatus.OFFLINE });

          newAlerts.push({
            id: this.generateId(),
            type: 'node',
            level: 'critical',
            message: `节点 ${node.name} (${node.ipAddress}) 已离线`,
            timestamp: new Date(),
            resolved: false,
          });

          console.warn(`Node ${node.name} is offline`);
        }
      }

      if (node.status !== NodeStatus.OFFLINE) {
        if (node.cpuUsage > 90) {
          newAlerts.push({
            id: this.generateId(),
            type: 'node',
            level: 'warning',
            message: `节点 ${node.name} CPU使用率过高: ${node.cpuUsage.toFixed(1)}%`,
            timestamp: new Date(),
            resolved: false,
          });
        }
        if (node.memoryUsage > 90) {
          newAlerts.push({
            id: this.generateId(),
            type: 'node',
            level: 'warning',
            message: `节点 ${node.name} 内存使用率过高: ${node.memoryUsage.toFixed(1)}%`,
            timestamp: new Date(),
            resolved: false,
          });
        }
        if (node.diskUsage > 90) {
          newAlerts.push({
            id: this.generateId(),
            type: 'node',
            level: 'warning',
            message: `节点 ${node.name} 磁盘使用率过高: ${node.diskUsage.toFixed(1)}%`,
            timestamp: new Date(),
            resolved: false,
          });
        }

        const recentResults = node.performance.lastTenResults.slice(-3);
        if (recentResults.length >= 3) {
          const highDeviationCount = recentResults.filter(r => r.deviation > 0.05).length;
          if (highDeviationCount >= 3) {
            newAlerts.push({
              id: this.generateId(),
              type: 'node',
              level: 'warning',
              message: `节点 ${node.name} 最近3个任务结果偏差率超过5%，请检查计算质量`,
              timestamp: new Date(),
              resolved: false,
            });
          }
        }

        const metrics = this.mockMetrics.get(node.id) || [];
        if (metrics.length >= 2) {
          const recentMetrics = metrics.slice(-12);
          const avgCpu = recentMetrics.reduce((sum, m) => sum + m.cpu, 0) / recentMetrics.length;
          const avgMemory = recentMetrics.reduce((sum, m) => sum + m.memory, 0) / recentMetrics.length;
          
          const cpuTrend = recentMetrics.length >= 6 
            ? recentMetrics.slice(-6).reduce((sum, m) => sum + m.cpu, 0) / 6 - recentMetrics.slice(0, 6).reduce((sum, m) => sum + m.cpu, 0) / 6
            : 0;
          
          const memoryTrend = recentMetrics.length >= 6
            ? recentMetrics.slice(-6).reduce((sum, m) => sum + m.memory, 0) / 6 - recentMetrics.slice(0, 6).reduce((sum, m) => sum + m.memory, 0) / 6
            : 0;

          const predictedCpu = avgCpu + cpuTrend * 12;
          const predictedMemory = avgMemory + memoryTrend * 12;

          if (predictedCpu > 95) {
            newAlerts.push({
              id: this.generateId(),
              type: 'node',
              level: 'warning',
              message: `节点 ${node.name} CPU使用率趋势预测未来1小时可能超限，当前趋势: ${cpuTrend.toFixed(1)}%/5min`,
              timestamp: new Date(),
              resolved: false,
            });
          }
          if (predictedMemory > 95) {
            newAlerts.push({
              id: this.generateId(),
              type: 'node',
              level: 'warning',
              message: `节点 ${node.name} 内存使用率趋势预测未来1小时可能超限，当前趋势: ${memoryTrend.toFixed(1)}%/5min`,
              timestamp: new Date(),
              resolved: false,
            });
          }
        }
      }
    }

    if (newAlerts.length > 0) {
      this.mockAlerts = [...newAlerts, ...this.mockAlerts].slice(0, 50);
    }
  }

  async getNodeList(page: number = 1, pageSize: number = 10, filters?: { status?: string }): Promise<{ total: number; items: Node[] }> {
    let nodes = [...dataSource.getNodes()];

    if (filters?.status) {
      nodes = nodes.filter(n => n.status === filters.status);
    }

    const start = (page - 1) * pageSize;
    const items = nodes.slice(start, start + pageSize);

    return {
      total: nodes.length,
      items,
    };
  }

  async getNodeById(nodeId: string): Promise<Node | null> {
    return dataSource.getNodes().find(n => n.id === nodeId) || null;
  }

  async getNodeMetrics(nodeId: string, startTime?: Date, endTime?: Date): Promise<NodeMetrics[]> {
    let metrics = this.mockMetrics.get(nodeId) || [];

    if (startTime) {
      metrics = metrics.filter(m => new Date(m.timestamp) >= startTime);
    }
    if (endTime) {
      metrics = metrics.filter(m => new Date(m.timestamp) <= endTime);
    }

    return metrics;
  }

  async updateNodeStatus(nodeId: string, status: NodeStatus): Promise<void> {
    const node = dataSource.getNodes().find(n => n.id === nodeId);
    if (!node) return;

    dataSource.updateNode(nodeId, { status });
  }

  async generateAlerts(): Promise<Alert[]> {
    await this.checkNodeHealth();
    return this.mockAlerts;
  }

  async getAlerts(page: number = 1, pageSize: number = 20, filters?: { resolved?: boolean }): Promise<{ total: number; items: Alert[] }> {
    let alerts = [...this.mockAlerts];

    if (filters?.resolved !== undefined) {
      alerts = alerts.filter(a => a.resolved === filters.resolved);
    }

    const start = (page - 1) * pageSize;
    const items = alerts.slice(start, start + pageSize);

    return {
      total: alerts.length,
      items,
    };
  }

  async resolveAlert(alertId: string): Promise<boolean> {
    const alert = this.mockAlerts.find(a => a.id === alertId);
    if (!alert) return false;

    alert.resolved = true;
    return true;
  }

  generateMockHeartbeat(nodeId: string): Omit<NodeMetrics, 'nodeId' | 'timestamp'> {
    const node = dataSource.getNodes().find(n => n.id === nodeId);
    if (!node || node.status === NodeStatus.OFFLINE) {
      return {
        cpu: 0,
        memory: 0,
        disk: 0,
        network: 0,
        loadAverage: [0, 0, 0],
      };
    }

    const baseCpu = 20 + Math.random() * 40;
    const baseMemory = 30 + Math.random() * 30;

    const metrics = {
      cpu: Math.max(5, Math.min(95, baseCpu + (Math.random() - 0.5) * 20)),
      memory: Math.max(10, Math.min(95, baseMemory + (Math.random() - 0.5) * 15)),
      disk: node.diskUsage + (Math.random() - 0.5) * 2,
      network: Math.random() * 50,
      loadAverage: [Math.random() * 2, Math.random() * 1.5, Math.random() * 1],
    };

    this.heartbeat(nodeId, metrics);
    return metrics;
  }

  getNodes(): Node[] {
    return dataSource.getNodes();
  }

  updateNode(nodeId: string, updates: Partial<Node>): void {
    dataSource.updateNode(nodeId, updates);
  }
}

export const nodeMonitorService = new NodeMonitorService();
