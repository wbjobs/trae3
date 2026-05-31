import { LoadStats, RegionCluster } from '../../types';
import { config } from '../../utils/config';
import { getLogger } from '../logger';

const logger = getLogger('LoadStatsService');

interface RegionStatsData {
  messageCount: number;
  successCount: number;
  failureCount: number;
  totalLatency: number;
  latencySamples: number;
  currentQueueSize: number;
  lastUpdated: number;
}

interface HistoricalStats {
  timestamp: number;
  stats: LoadStats;
}

export class LoadStatsService {
  private regionStats: Map<string, RegionStatsData> = new Map();
  private history: Map<string, HistoricalStats[]> = new Map();
  private maxHistorySize: number = 1000;
  private statsInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeStats();
    this.startStatsAggregation();
  }

  private initializeStats(): void {
    config.clusters.forEach(cluster => {
      this.regionStats.set(cluster.id, {
        messageCount: 0,
        successCount: 0,
        failureCount: 0,
        totalLatency: 0,
        latencySamples: 0,
        currentQueueSize: 0,
        lastUpdated: Date.now(),
      });
      this.history.set(cluster.id, []);
    });
    logger.info('负载统计模块初始化完成', { regions: config.clusters.map(c => c.id) });
  }

  private startStatsAggregation(): void {
    this.statsInterval = setInterval(() => {
      this.aggregateStats();
    }, 60000);
  }

  recordMessage(regionId: string, success: boolean, latency: number): void {
    const stats = this.regionStats.get(regionId);
    if (!stats) {
      logger.warn('尝试记录未知区域的统计数据', { regionId });
      return;
    }

    stats.messageCount++;
    if (success) {
      stats.successCount++;
    } else {
      stats.failureCount++;
    }
    stats.totalLatency += latency;
    stats.latencySamples++;
    stats.lastUpdated = Date.now();

    logger.debug('记录消息处理统计', {
      regionId,
      success,
      latency,
      totalCount: stats.messageCount,
    });
  }

  updateQueueSize(regionId: string, size: number): void {
    const stats = this.regionStats.get(regionId);
    if (stats) {
      stats.currentQueueSize = size;
      stats.lastUpdated = Date.now();
    }
  }

  getRegionStats(regionId: string): LoadStats | null {
    const stats = this.regionStats.get(regionId);
    if (!stats) return null;

    return {
      regionId,
      timestamp: Date.now(),
      messageCount: stats.messageCount,
      successCount: stats.successCount,
      failureCount: stats.failureCount,
      averageLatency: stats.latencySamples > 0
        ? Math.round(stats.totalLatency / stats.latencySamples)
        : 0,
      currentQueueSize: stats.currentQueueSize,
    };
  }

  getAllRegionStats(): Map<string, LoadStats> {
    const result = new Map<string, LoadStats>();
    for (const regionId of this.regionStats.keys()) {
      const stats = this.getRegionStats(regionId);
      if (stats) {
        result.set(regionId, stats);
      }
    }
    return result;
  }

  getRegionLoad(regionId: string): number {
    const stats = this.regionStats.get(regionId);
    if (!stats) return 0;

    const loadFactor = stats.currentQueueSize / 100;
    const errorRate = stats.messageCount > 0
      ? stats.failureCount / stats.messageCount
      : 0;
    const latencyFactor = stats.latencySamples > 0
      ? (stats.totalLatency / stats.latencySamples) / 1000
      : 0;

    return Math.min(100, loadFactor * 30 + errorRate * 50 + latencyFactor * 20);
  }

  getLeastLoadedRegion(clusters: RegionCluster[]): RegionCluster | null {
    if (clusters.length === 0) return null;

    let minLoad = Infinity;
    let selectedCluster: RegionCluster | null = null;

    for (const cluster of clusters) {
      const load = this.getRegionLoad(cluster.id);
      const adjustedLoad = load / (cluster.weight / 100);

      if (adjustedLoad < minLoad) {
        minLoad = adjustedLoad;
        selectedCluster = cluster;
      }
    }

    return selectedCluster;
  }

  getSystemOverview(): {
    totalMessages: number;
    totalSuccess: number;
    totalFailures: number;
    overallSuccessRate: number;
    averageLatency: number;
    regionCount: number;
    timestamp: number;
  } {
    let totalMessages = 0;
    let totalSuccess = 0;
    let totalFailures = 0;
    let totalLatency = 0;
    let totalSamples = 0;

    for (const stats of this.regionStats.values()) {
      totalMessages += stats.messageCount;
      totalSuccess += stats.successCount;
      totalFailures += stats.failureCount;
      totalLatency += stats.totalLatency;
      totalSamples += stats.latencySamples;
    }

    return {
      totalMessages,
      totalSuccess,
      totalFailures,
      overallSuccessRate: totalMessages > 0
        ? Math.round((totalSuccess / totalMessages) * 10000) / 100
        : 100,
      averageLatency: totalSamples > 0
        ? Math.round(totalLatency / totalSamples)
        : 0,
      regionCount: this.regionStats.size,
      timestamp: Date.now(),
    };
  }

  private aggregateStats(): void {
    const timestamp = Date.now();

    for (const [regionId, stats] of this.regionStats.entries()) {
      const loadStats: LoadStats = {
        regionId,
        timestamp,
        messageCount: stats.messageCount,
        successCount: stats.successCount,
        failureCount: stats.failureCount,
        averageLatency: stats.latencySamples > 0
          ? Math.round(stats.totalLatency / stats.latencySamples)
          : 0,
        currentQueueSize: stats.currentQueueSize,
      };

      const regionHistory = this.history.get(regionId);
      if (regionHistory) {
        regionHistory.push({ timestamp, stats: loadStats });
        if (regionHistory.length > this.maxHistorySize) {
          regionHistory.shift();
        }
      }
    }

    logger.info('统计数据聚合完成', { timestamp });
  }

  getRegionHistory(regionId: string, limit: number = 100): LoadStats[] {
    const regionHistory = this.history.get(regionId);
    if (!regionHistory) return [];

    return regionHistory
      .slice(-limit)
      .map(h => h.stats);
  }

  resetRegionStats(regionId: string): boolean {
    const stats = this.regionStats.get(regionId);
    if (!stats) return false;

    stats.messageCount = 0;
    stats.successCount = 0;
    stats.failureCount = 0;
    stats.totalLatency = 0;
    stats.latencySamples = 0;
    stats.lastUpdated = Date.now();

    logger.info('区域统计数据已重置', { regionId });
    return true;
  }

  resetAllStats(): void {
    for (const regionId of this.regionStats.keys()) {
      this.resetRegionStats(regionId);
    }
    logger.info('所有区域统计数据已重置');
  }

  shutdown(): void {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
    logger.info('负载统计模块已关闭');
  }
}

export const loadStatsService = new LoadStatsService();
export default loadStatsService;
