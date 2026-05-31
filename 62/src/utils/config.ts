import dotenv from 'dotenv';
import { GatewayConfig, RegionCluster, QueueConfig } from '../types';

dotenv.config();

function parseRegionClusters(): RegionCluster[] {
  const clustersStr = process.env.REGION_CLUSTERS;
  if (!clustersStr) {
    return [];
  }
  try {
    const parsed = JSON.parse(clustersStr);
    return parsed.map((cluster: Partial<RegionCluster>) => ({
      id: cluster.id || '',
      name: cluster.name || '',
      endpoint: cluster.endpoint || '',
      weight: cluster.weight || 100,
      status: 'online' as const,
      currentLoad: 0,
      maxLoad: 1000,
    }));
  } catch {
    return [];
  }
}

function parseQueueConfigs(): QueueConfig[] {
  const queueNames = process.env.QUEUE_NAMES?.split(',') || ['default'];
  return queueNames.map((name, index) => ({
    name: name.trim(),
    concurrency: 10,
    priority: index === 0 ? 1 : 0,
  }));
}

export const config: GatewayConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  logging: {
    dir: process.env.LOG_DIR || './logs',
    level: process.env.LOG_LEVEL || 'info',
  },
  clusters: parseRegionClusters(),
  queues: parseQueueConfigs(),
  maxRetryAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS || '3', 10),
  retryDelay: parseInt(process.env.RETRY_DELAY || '1000', 10),
};

export function getClusterById(id: string): RegionCluster | undefined {
  return config.clusters.find(c => c.id === id);
}

export function getOnlineClusters(): RegionCluster[] {
  return config.clusters.filter(c => c.status === 'online');
}
