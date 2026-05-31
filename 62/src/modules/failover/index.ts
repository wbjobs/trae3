import { RegionCluster, Message } from '../../types';
import { getLogger } from '../logger';
import { messageForwarderService } from '../message-forwarder';
import { routerScheduler } from '../router-scheduler';
import { deadLetterService } from '../dead-letter';

const logger = getLogger('FailoverManager');

export type FailoverStrategy = 'immediate' | 'gradual' | 'conservative';

export interface FailoverConfig {
  strategy: FailoverStrategy;
  failureThreshold: number;
  successThreshold: number;
  detectionWindow: number;
  coolDownPeriod: number;
  autoRecover: boolean;
  maxParallelFailovers: number;
}

interface ClusterHealth {
  clusterId: string;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  failureTimestamps: number[];
  lastStateChange: number;
  isDegraded: boolean;
  isFailed: boolean;
  failoverCount: number;
}

interface PendingFailover {
  clusterId: string;
  startedAt: number;
  status: 'detecting' | 'failing' | 'recovering' | 'completed';
}

export class FailoverManager {
  private config: FailoverConfig = {
    strategy: 'gradual',
    failureThreshold: 3,
    successThreshold: 5,
    detectionWindow: 60000,
    coolDownPeriod: 300000,
    autoRecover: true,
    maxParallelFailovers: 2,
  };

  private clusterHealth: Map<string, ClusterHealth> = new Map();
  private pendingFailovers: Map<string, PendingFailover> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private onClusterFailed?: (clusterId: string) => void;
  private onClusterRecovered?: (clusterId: string) => void;

  constructor() {
    this.initializeClusterHealth();
    this.startHealthMonitoring();
    logger.info('故障自动切换管理器初始化完成', { strategy: this.config.strategy });
  }

  setConfig(config: Partial<FailoverConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('故障切换配置已更新', { config: this.config });
  }

  getConfig(): FailoverConfig {
    return { ...this.config };
  }

  setEventHandlers(handlers: {
    onClusterFailed?: (clusterId: string) => void;
    onClusterRecovered?: (clusterId: string) => void;
  }): void {
    this.onClusterFailed = handlers.onClusterFailed;
    this.onClusterRecovered = handlers.onClusterRecovered;
  }

  private initializeClusterHealth(): void {
    const clusters = messageForwarderService.getAllClusterStatuses();
    clusters.forEach((cluster) => {
      this.clusterHealth.set(cluster.id, {
        clusterId: cluster.id,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        failureTimestamps: [],
        lastStateChange: Date.now(),
        isDegraded: false,
        isFailed: false,
        failoverCount: 0,
      });
      routerScheduler.registerCluster(cluster);
    });
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 5000);
  }

  private performHealthCheck(): void {
    const clusters = messageForwarderService.getAllClusterStatuses();

    for (const cluster of clusters) {
      this.checkClusterHealth(cluster);
    }

    this.checkPendingRecoveries();
  }

  private checkClusterHealth(cluster: RegionCluster): void {
    const health = this.getOrCreateHealth(cluster.id);

    if (health.isFailed && !this.config.autoRecover) {
      return;
    }

    const now = Date.now();
    const windowStart = now - this.config.detectionWindow;

    health.failureTimestamps = health.failureTimestamps.filter((t) => t > windowStart);

    const recentFailures = health.failureTimestamps.length;
    const failureRate = recentFailures / Math.max(1, health.consecutiveSuccesses + recentFailures);

    if (!health.isFailed && recentFailures >= this.config.failureThreshold) {
      this.triggerFailover(cluster.id, `连续失败 ${recentFailures} 次`);
      return;
    }

    if (!health.isFailed && failureRate > 0.3) {
      this.markAsDegraded(cluster.id, `失败率 ${(failureRate * 100).toFixed(1)}%`);
      return;
    }

    if (health.isFailed && health.consecutiveSuccesses >= this.config.successThreshold) {
      this.recoverCluster(cluster.id);
    }
  }

  private getOrCreateHealth(clusterId: string): ClusterHealth {
    let health = this.clusterHealth.get(clusterId);
    if (!health) {
      health = {
        clusterId,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        failureTimestamps: [],
        lastStateChange: Date.now(),
        isDegraded: false,
        isFailed: false,
        failoverCount: 0,
      };
      this.clusterHealth.set(clusterId, health);
    }
    return health;
  }

  recordRequestResult(clusterId: string, success: boolean): void {
    const health = this.getOrCreateHealth(clusterId);

    if (success) {
      health.consecutiveSuccesses++;
      health.consecutiveFailures = 0;
    } else {
      health.consecutiveFailures++;
      health.consecutiveSuccesses = 0;
      health.failureTimestamps.push(Date.now());
    }
  }

  private triggerFailover(clusterId: string, reason: string): void {
    const health = this.getOrCreateHealth(clusterId);

    if (health.isFailed) return;

    const activeFailovers = Array.from(this.pendingFailovers.values()).filter(
      (p) => p.status === 'failing'
    ).length;
    if (activeFailovers >= this.config.maxParallelFailovers) {
      logger.warn('达到最大并行故障切换数，跳过', {
        clusterId,
        maxParallel: this.config.maxParallelFailovers,
      });
      return;
    }

    const now = Date.now();
    const timeSinceLastChange = now - health.lastStateChange;
    if (timeSinceLastChange < this.config.coolDownPeriod) {
      logger.warn('故障切换冷却期内，跳过', {
        clusterId,
        coolDownMs: this.config.coolDownPeriod,
        elapsedMs: timeSinceLastChange,
      });
      return;
    }

    health.isFailed = true;
    health.isDegraded = false;
    health.lastStateChange = now;
    health.failoverCount++;

    this.pendingFailovers.set(clusterId, {
      clusterId,
      startedAt: now,
      status: 'failing',
    });

    messageForwarderService.getClusterStatus(clusterId)!.status = 'offline';

    logger.error('区域集群故障切换已触发', {
      clusterId,
      reason,
      failoverCount: health.failoverCount,
    });

    if (this.onClusterFailed) {
      try {
        this.onClusterFailed(clusterId);
      } catch (error) {
        logger.error('故障切换事件处理器执行失败', error as Error);
      }
    }
  }

  private markAsDegraded(clusterId: string, reason: string): void {
    const health = this.getOrCreateHealth(clusterId);
    if (health.isDegraded || health.isFailed) return;

    health.isDegraded = true;
    health.lastStateChange = Date.now();

    const cluster = messageForwarderService.getClusterStatus(clusterId);
    if (cluster) {
      cluster.status = 'degraded';
    }

    logger.warn('区域集群已标记为降级', { clusterId, reason });
  }

  private recoverCluster(clusterId: string): void {
    const health = this.getOrCreateHealth(clusterId);
    if (!health.isFailed) return;

    health.isFailed = false;
    health.isDegraded = false;
    health.lastStateChange = Date.now();
    health.consecutiveFailures = 0;
    health.failureTimestamps = [];

    const pending = this.pendingFailovers.get(clusterId);
    if (pending) {
      pending.status = 'completed';
      setTimeout(() => this.pendingFailovers.delete(clusterId), 5000);
    }

    messageForwarderService.resetClusterStatus(clusterId);

    logger.info('区域集群已恢复', {
      clusterId,
      consecutiveSuccesses: health.consecutiveSuccesses,
    });

    if (this.onClusterRecovered) {
      try {
        this.onClusterRecovered(clusterId);
      } catch (error) {
        logger.error('集群恢复事件处理器执行失败', error as Error);
      }
    }
  }

  private checkPendingRecoveries(): void {
    const clusters = messageForwarderService.getAllClusterStatuses();

    for (const cluster of clusters) {
      if (cluster.status === 'offline') {
        this.attemptRecovery(cluster.id);
      }
    }
  }

  private async attemptRecovery(clusterId: string): Promise<void> {
    const health = this.getOrCreateHealth(clusterId);
    if (!health.isFailed) return;

    try {
      const testMessage = this.createTestMessage(clusterId);
      const result = await messageForwarderService.forwardMessage(testMessage, clusterId);

      if (result.success) {
        health.consecutiveSuccesses++;
        logger.debug('集群恢复测试成功', {
          clusterId,
          consecutiveSuccesses: health.consecutiveSuccesses,
        });
      } else {
        health.consecutiveFailures++;
        health.consecutiveSuccesses = 0;
      }
    } catch (error) {
      health.consecutiveFailures++;
      health.consecutiveSuccesses = 0;
      logger.debug('集群恢复测试失败', { clusterId, error: (error as Error).message });
    }
  }

  private createTestMessage(clusterId: string): Message {
    return {
      id: `health-check-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'event',
      priority: 'low',
      payload: { action: 'health-check', timestamp: Date.now() },
      targetRegion: clusterId,
      source: 'failover-manager',
      timestamp: Date.now(),
      metadata: {
        requestId: `health-check-${Date.now()}`,
        traceId: `health-check-${Date.now()}`,
        retryCount: 0,
      },
    };
  }

  async forceFailover(clusterId: string): Promise<boolean> {
    const cluster = messageForwarderService.getClusterStatus(clusterId);
    if (!cluster) {
      logger.warn('强制故障切换失败：集群不存在', { clusterId });
      return false;
    }

    this.triggerFailover(clusterId, '手动强制切换');
    return true;
  }

  async forceRecover(clusterId: string): Promise<boolean> {
    const health = this.getOrCreateHealth(clusterId);
    if (!health.isFailed) {
      logger.warn('强制恢复失败：集群未处于故障状态', { clusterId });
      return false;
    }

    health.consecutiveSuccesses = this.config.successThreshold;
    this.recoverCluster(clusterId);
    return true;
  }

  getClusterHealth(clusterId: string): ClusterHealth | null {
    return this.clusterHealth.get(clusterId) || null;
  }

  getAllHealthStatus(): {
    clusterId: string;
    status: 'healthy' | 'degraded' | 'failed';
    stats: {
      consecutiveFailures: number;
      consecutiveSuccesses: number;
      failoverCount: number;
      recentFailures: number;
    };
  }[] {
    return Array.from(this.clusterHealth.entries()).map(([clusterId, health]) => {
      const status = health.isFailed ? 'failed' : health.isDegraded ? 'degraded' : 'healthy';
      return {
        clusterId,
        status,
        stats: {
          consecutiveFailures: health.consecutiveFailures,
          consecutiveSuccesses: health.consecutiveSuccesses,
          failoverCount: health.failoverCount,
          recentFailures: health.failureTimestamps.length,
        },
      };
    });
  }

  getFailoverStats(): {
    totalFailovers: number;
    activeFailovers: number;
    failedClusters: number;
    degradedClusters: number;
    strategy: FailoverStrategy;
  } {
    let totalFailovers = 0;
    let failedClusters = 0;
    let degradedClusters = 0;

    for (const health of this.clusterHealth.values()) {
      totalFailovers += health.failoverCount;
      if (health.isFailed) failedClusters++;
      if (health.isDegraded) degradedClusters++;
    }

    const activeFailovers = Array.from(this.pendingFailovers.values()).filter(
      (p) => p.status === 'failing'
    ).length;

    return {
      totalFailovers,
      activeFailovers,
      failedClusters,
      degradedClusters,
      strategy: this.config.strategy,
    };
  }

  registerNewCluster(cluster: RegionCluster): void {
    if (!this.clusterHealth.has(cluster.id)) {
      this.clusterHealth.set(cluster.id, {
        clusterId: cluster.id,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        failureTimestamps: [],
        lastStateChange: Date.now(),
        isDegraded: false,
        isFailed: false,
        failoverCount: 0,
      });
      routerScheduler.registerCluster(cluster);
      logger.info('新集群已注册到故障管理器', { clusterId: cluster.id });
    }
  }

  unregisterCluster(clusterId: string): void {
    this.clusterHealth.delete(clusterId);
    this.pendingFailovers.delete(clusterId);
    routerScheduler.unregisterCluster(clusterId);
    logger.info('集群已从故障管理器注销', { clusterId });
  }

  shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    logger.info('故障自动切换管理器已关闭');
  }
}

export const failoverManager = new FailoverManager();
export default failoverManager;
