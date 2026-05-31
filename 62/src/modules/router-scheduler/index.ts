import { RegionCluster, Message } from '../../types';
import { getLogger } from '../logger';
import { loadStatsService } from '../load-stats';

const logger = getLogger('RouterScheduler');

export type SchedulingAlgorithm =
  | 'round-robin'
  | 'weighted-round-robin'
  | 'least-load'
  | 'least-response-time'
  | 'consistent-hashing'
  | 'random'
  | 'region-affinity';

interface ClusterMetrics {
  clusterId: string;
  totalRequests: number;
  totalLatency: number;
  errorCount: number;
  lastUsed: number;
  activeConnections: number;
}

interface ConsistentHashNode {
  hash: number;
  clusterId: string;
}

export interface SchedulingOptions {
  algorithm?: SchedulingAlgorithm;
  hashKey?: string;
  fallbackAlgorithm?: SchedulingAlgorithm;
}

export class RouterScheduler {
  private algorithm: SchedulingAlgorithm = 'least-load';
  private clusterMetrics: Map<string, ClusterMetrics> = new Map();
  private consistentHashRing: ConsistentHashNode[] = [];
  private weightedRoundRobinIndex: Map<string, number> = new Map();
  private currentRoundRobinIndex: number = 0;

  constructor(initialAlgorithm?: SchedulingAlgorithm) {
    if (initialAlgorithm) {
      this.algorithm = initialAlgorithm;
    }
    logger.info('路由调度器初始化完成', { algorithm: this.algorithm });
  }

  setAlgorithm(algorithm: SchedulingAlgorithm): void {
    this.algorithm = algorithm;
    logger.info('路由调度算法已更新', { algorithm });
  }

  getAlgorithm(): SchedulingAlgorithm {
    return this.algorithm;
  }

  registerCluster(cluster: RegionCluster): void {
    this.clusterMetrics.set(cluster.id, {
      clusterId: cluster.id,
      totalRequests: 0,
      totalLatency: 0,
      errorCount: 0,
      lastUsed: 0,
      activeConnections: 0,
    });
    this.buildConsistentHashRing();
    logger.info('集群已注册到调度器', { clusterId: cluster.id });
  }

  unregisterCluster(clusterId: string): void {
    this.clusterMetrics.delete(clusterId);
    this.buildConsistentHashRing();
    logger.info('集群已从调度器注销', { clusterId });
  }

  private buildConsistentHashRing(): void {
    this.consistentHashRing = [];
    const virtualNodes = 100;

    for (const clusterId of this.clusterMetrics.keys()) {
      for (let i = 0; i < virtualNodes; i++) {
        const hash = this.computeHash(`${clusterId}-${i}`);
        this.consistentHashRing.push({ hash, clusterId });
      }
    }

    this.consistentHashRing.sort((a, b) => a.hash - b.hash);
    logger.debug('一致性哈希环已重建', { nodeCount: this.consistentHashRing.length });
  }

  private computeHash(key: string): number {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  selectCluster(
    clusters: RegionCluster[],
    message: Message,
    options?: SchedulingOptions
  ): RegionCluster | null {
    if (clusters.length === 0) {
      logger.warn('没有可用的集群进行调度');
      return null;
    }

    if (message.targetRegion) {
      const targetCluster = clusters.find(c => c.id === message.targetRegion);
      if (targetCluster) {
        return targetCluster;
      }
    }

    const algorithm = options?.algorithm || this.algorithm;

    switch (algorithm) {
      case 'round-robin':
        return this.selectByRoundRobin(clusters);
      case 'weighted-round-robin':
        return this.selectByWeightedRoundRobin(clusters);
      case 'least-load':
        return this.selectByLeastLoad(clusters);
      case 'least-response-time':
        return this.selectByLeastResponseTime(clusters);
      case 'consistent-hashing':
        return this.selectByConsistentHashing(clusters, message, options?.hashKey);
      case 'random':
        return this.selectByRandom(clusters);
      case 'region-affinity':
        return this.selectByRegionAffinity(clusters, message);
      default:
        return this.selectByLeastLoad(clusters);
    }
  }

  private selectByRoundRobin(clusters: RegionCluster[]): RegionCluster {
    const index = this.currentRoundRobinIndex % clusters.length;
    this.currentRoundRobinIndex = (this.currentRoundRobinIndex + 1) % clusters.length;
    return clusters[index];
  }

  private selectByWeightedRoundRobin(clusters: RegionCluster[]): RegionCluster {
    const totalWeight = clusters.reduce((sum, c) => sum + c.weight, 0);
    let random = Math.random() * totalWeight;

    for (const cluster of clusters) {
      random -= cluster.weight;
      if (random <= 0) {
        return cluster;
      }
    }

    return clusters[clusters.length - 1];
  }

  private selectByLeastLoad(clusters: RegionCluster[]): RegionCluster | null {
    let minLoad = Infinity;
    let selectedCluster: RegionCluster | null = null;

    for (const cluster of clusters) {
      const load = loadStatsService.getRegionLoad(cluster.id);
      const metrics = this.clusterMetrics.get(cluster.id);
      const activeConnections = metrics?.activeConnections || 0;

      const compositeScore = load * 0.5 + (activeConnections / 10) * 0.3 + (100 - cluster.weight) * 0.2;

      if (compositeScore < minLoad) {
        minLoad = compositeScore;
        selectedCluster = cluster;
      }
    }

    return selectedCluster;
  }

  private selectByLeastResponseTime(clusters: RegionCluster[]): RegionCluster | null {
    let minAvgLatency = Infinity;
    let selectedCluster: RegionCluster | null = null;

    for (const cluster of clusters) {
      const metrics = this.clusterMetrics.get(cluster.id);
      const avgLatency = metrics && metrics.totalRequests > 0
        ? metrics.totalLatency / metrics.totalRequests
        : 0;

      if (avgLatency < minAvgLatency) {
        minAvgLatency = avgLatency;
        selectedCluster = cluster;
      }
    }

    return selectedCluster || clusters[0] || null;
  }

  private selectByConsistentHashing(
    clusters: RegionCluster[],
    message: Message,
    hashKey?: string
  ): RegionCluster | null {
    const key = hashKey || message.metadata.traceId || message.id;
    const hash = this.computeHash(key);

    for (const node of this.consistentHashRing) {
      if (node.hash >= hash) {
        const cluster = clusters.find(c => c.id === node.clusterId);
        if (cluster) {
          return cluster;
        }
      }
    }

    if (this.consistentHashRing.length > 0) {
      const firstNode = this.consistentHashRing[0];
      return clusters.find(c => c.id === firstNode.clusterId) || null;
    }

    return clusters[0] || null;
  }

  private selectByRandom(clusters: RegionCluster[]): RegionCluster {
    const index = Math.floor(Math.random() * clusters.length);
    return clusters[index];
  }

  private selectByRegionAffinity(clusters: RegionCluster[], message: Message): RegionCluster | null {
    const source = message.source.toLowerCase();

    for (const cluster of clusters) {
      if (source.includes(cluster.id) || cluster.id.includes(source)) {
        return cluster;
      }
    }

    return this.selectByLeastLoad(clusters);
  }

  recordRequest(clusterId: string, latency: number, success: boolean): void {
    let metrics = this.clusterMetrics.get(clusterId);

    if (!metrics) {
      metrics = {
        clusterId,
        totalRequests: 0,
        totalLatency: 0,
        errorCount: 0,
        lastUsed: 0,
        activeConnections: 0,
      };
      this.clusterMetrics.set(clusterId, metrics);
    }

    metrics.totalRequests++;
    metrics.totalLatency += latency;
    metrics.lastUsed = Date.now();

    if (!success) {
      metrics.errorCount++;
    }

    logger.debug('请求统计已记录', {
      clusterId,
      latency,
      success,
      totalRequests: metrics.totalRequests,
    });
  }

  incrementActiveConnections(clusterId: string): void {
    const metrics = this.clusterMetrics.get(clusterId);
    if (metrics) {
      metrics.activeConnections++;
    }
  }

  decrementActiveConnections(clusterId: string): void {
    const metrics = this.clusterMetrics.get(clusterId);
    if (metrics && metrics.activeConnections > 0) {
      metrics.activeConnections--;
    }
  }

  getClusterMetrics(clusterId: string): ClusterMetrics | null {
    return this.clusterMetrics.get(clusterId) || null;
  }

  getAllMetrics(): Map<string, ClusterMetrics> {
    return new Map(this.clusterMetrics);
  }

  resetMetrics(): void {
    for (const metrics of this.clusterMetrics.values()) {
      metrics.totalRequests = 0;
      metrics.totalLatency = 0;
      metrics.errorCount = 0;
      metrics.activeConnections = 0;
    }
    logger.info('调度器统计数据已重置');
  }
}

export const routerScheduler = new RouterScheduler();
export default routerScheduler;
