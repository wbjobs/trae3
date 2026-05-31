import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { Message, RouteStrategy, QueueJob, QueueConfig, RegionCluster } from '../../types';
import { config } from '../../utils/config';
import { getLogger } from '../logger';
import { messageForwarderService } from '../message-forwarder';
import { loadStatsService } from '../load-stats';

const logger = getLogger('QueueRouter');

export type RoutingStrategy = 'round-robin' | 'weighted' | 'least-load' | 'region-affinity';

export class QueueRouterService {
  private redisClient: Redis;
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private routingStrategy: RoutingStrategy = 'least-load';
  private roundRobinCounter: Map<string, number> = new Map();

  constructor() {
    this.redisClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
    });

    this.initializeQueues();
    logger.info('队列路由模块初始化完成', {
      queueCount: config.queues.length,
      strategy: this.routingStrategy,
    });
  }

  private initializeQueues(): void {
    config.queues.forEach(queueConfig => {
      const queue = new Queue(queueConfig.name, {
        connection: this.redisClient,
        defaultJobOptions: {
          attempts: config.maxRetryAttempts,
          backoff: {
            type: 'exponential',
            delay: config.retryDelay,
          },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      });

      const worker = new Worker(
        queueConfig.name,
        async (job) => {
          const message = job.data as Message;
          await this.processMessage(message);
        },
        {
          connection: this.redisClient,
          concurrency: queueConfig.concurrency,
        }
      );

      worker.on('completed', (job) => {
        logger.debug('任务处理完成', {
          jobId: job.id,
          queue: queueConfig.name,
        });
      });

      worker.on('failed', (job, err) => {
        logger.error('任务处理失败', err, job?.id);
      });

      this.queues.set(queueConfig.name, queue);
      this.workers.set(queueConfig.name, worker);
      this.roundRobinCounter.set(queueConfig.name, 0);
    });
  }

  private async processMessage(message: Message): Promise<void> {
    const targetRegion = this.selectTargetRegion(message);
    if (!targetRegion) {
      throw new Error('没有可用的区域集群');
    }

    const result = await messageForwarderService.forwardMessage(message, targetRegion);
    if (!result.success) {
      throw new Error(result.error || '消息转发失败');
    }
  }

  setRoutingStrategy(strategy: RoutingStrategy): void {
    this.routingStrategy = strategy;
    logger.info('路由策略已更新', { strategy });
  }

  getRoutingStrategy(): RoutingStrategy {
    return this.routingStrategy;
  }

  selectTargetRegion(message: Message): string | null {
    const onlineClusters = messageForwarderService.getOnlineClusters();
    if (onlineClusters.length === 0) {
      logger.warn('没有可用的在线区域集群');
      return null;
    }

    if (message.targetRegion) {
      const targetCluster = onlineClusters.find(c => c.id === message.targetRegion);
      if (targetCluster) {
        return targetCluster.id;
      }
      logger.warn('指定的目标区域不可用，将使用路由策略选择', {
        targetRegion: message.targetRegion,
      });
    }

    switch (this.routingStrategy) {
      case 'round-robin':
        return this.selectByRoundRobin(onlineClusters);
      case 'weighted':
        return this.selectByWeighted(onlineClusters);
      case 'least-load':
        return this.selectByLeastLoad(onlineClusters);
      case 'region-affinity':
        return this.selectByRegionAffinity(message, onlineClusters);
      default:
        return this.selectByLeastLoad(onlineClusters);
    }
  }

  private selectByRoundRobin(clusters: { id: string }[]): string {
    const counter = this.roundRobinCounter.get('global') || 0;
    const index = counter % clusters.length;
    this.roundRobinCounter.set('global', counter + 1);
    return clusters[index].id;
  }

  private selectByWeighted(clusters: { id: string; weight: number }[]): string {
    const totalWeight = clusters.reduce((sum, c) => sum + c.weight, 0);
    let random = Math.random() * totalWeight;

    for (const cluster of clusters) {
      random -= cluster.weight;
      if (random <= 0) {
        return cluster.id;
      }
    }

    return clusters[clusters.length - 1].id;
  }

  private selectByLeastLoad(clusters: { id: string }[]): string | null {
    const clusterIds = clusters.map(c => c.id);
    const allClusters = messageForwarderService.getAllClusterStatuses();
    const matchingClusters = allClusters.filter(c => clusterIds.includes(c.id));
    const leastLoaded = loadStatsService.getLeastLoadedRegion(matchingClusters);
    return leastLoaded ? leastLoaded.id : clusters[0]?.id || null;
  }

  private selectByRegionAffinity(
    message: Message,
    clusters: { id: string }[]
  ): string {
    const source = message.source.toLowerCase();
    for (const cluster of clusters) {
      if (source.includes(cluster.id) || cluster.id.includes(source)) {
        return cluster.id;
      }
    }
    return this.selectByLeastLoad(clusters) || clusters[0].id;
  }

  async enqueueMessage(message: Message, queueName?: string): Promise<QueueJob> {
    const targetQueue = queueName || this.getQueueForPriority(message.priority);
    const queue = this.queues.get(targetQueue);

    if (!queue) {
      throw new Error(`队列不存在: ${targetQueue}`);
    }

    const job = await queue.add(`message-${message.type}`, message, {
      priority: this.getJobPriority(message.priority),
      jobId: message.id,
    });

    logger.info('消息已入队', {
      messageId: message.id,
      queue: targetQueue,
      jobId: job.id,
      priority: message.priority,
    }, message.metadata.requestId, message.metadata.traceId);

    return {
      id: job.id as string,
      message,
      status: 'pending',
      attempts: 0,
      createdAt: Date.now(),
    };
  }

  private getQueueForPriority(priority: Message['priority']): string {
    const queues = config.queues;
    switch (priority) {
      case 'critical':
      case 'high':
        return queues.find(q => q.name === 'priority')?.name || queues[0]?.name || 'default';
      case 'normal':
        return queues.find(q => q.name === 'default')?.name || queues[0]?.name || 'default';
      case 'low':
        return queues.find(q => q.name === 'bulk')?.name || queues[queues.length - 1]?.name || 'default';
      default:
        return queues[0]?.name || 'default';
    }
  }

  private getJobPriority(priority: Message['priority']): number {
    switch (priority) {
      case 'critical':
        return 1;
      case 'high':
        return 2;
      case 'normal':
        return 5;
      case 'low':
        return 10;
      default:
        return 5;
    }
  }

  async getQueueStats(): Promise<Record<string, { waiting: number; active: number; completed: number; failed: number }>> {
    const stats: Record<string, { waiting: number; active: number; completed: number; failed: number }> = {};

    for (const [name, queue] of this.queues.entries()) {
      const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed');
      stats[name] = {
        waiting: counts.waiting || 0,
        active: counts.active || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
      };
    }

    return stats;
  }

  async pauseQueue(queueName: string): Promise<boolean> {
    const queue = this.queues.get(queueName);
    if (!queue) return false;
    await queue.pause();
    logger.info('队列已暂停', { queueName });
    return true;
  }

  async resumeQueue(queueName: string): Promise<boolean> {
    const queue = this.queues.get(queueName);
    if (!queue) return false;
    await queue.resume();
    logger.info('队列已恢复', { queueName });
    return true;
  }

  async clearQueue(queueName: string): Promise<boolean> {
    const queue = this.queues.get(queueName);
    if (!queue) return false;
    await queue.drain();
    logger.info('队列已清空', { queueName });
    return true;
  }

  getQueueConfigs(): QueueConfig[] {
    return config.queues;
  }

  async shutdown(): Promise<void> {
    for (const worker of this.workers.values()) {
      await worker.close();
    }
    for (const queue of this.queues.values()) {
      await queue.close();
    }
    await this.redisClient.quit();
    logger.info('队列路由模块已关闭');
  }
}

export const queueRouterService = new QueueRouterService();
export default queueRouterService;
