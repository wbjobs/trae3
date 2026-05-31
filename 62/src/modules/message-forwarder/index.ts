import axios, { AxiosInstance } from 'axios';
import { Message, RegionCluster, ForwardResult } from '../../types';
import { config } from '../../utils/config';
import { getLogger } from '../logger';
import { loadStatsService } from '../load-stats';

const logger = getLogger('MessageForwarder');

interface ClusterClient {
  cluster: RegionCluster;
  axios: AxiosInstance;
  lastHealthCheck: number;
  consecutiveFailures: number;
  rateLimitRemaining: number;
  rateLimitReset: number;
}

const MAX_PAYLOAD_SIZE = 10 * 1024 * 1024;

export class MessageForwarderService {
  private clusterClients: Map<string, ClusterClient> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private circuitBreakerThreshold: number = 5;
  private healthCheckIntervalMs: number = 30000;

  constructor() {
    this.initializeClusterClients();
    this.startHealthChecks();
    logger.info('消息转发模块初始化完成', { clusterCount: config.clusters.length });
  }

  private initializeClusterClients(): void {
    config.clusters.forEach(cluster => {
      const client = axios.create({
        baseURL: cluster.endpoint,
        timeout: 30000,
        maxContentLength: MAX_PAYLOAD_SIZE,
        maxBodyLength: MAX_PAYLOAD_SIZE,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'User-Agent': 'MultiRegionGateway/1.0',
          'Accept-Encoding': 'gzip, deflate',
        },
        responseType: 'json',
        transitional: {
          silentJSONParsing: false,
          forcedJSONParsing: true,
          clarifyTimeoutError: true,
        },
      });

      client.interceptors.request.use((config) => {
        const data = config.data;
        if (data) {
          const jsonData = JSON.stringify(data);
          config.data = jsonData;
          config.headers['Content-Length'] = Buffer.byteLength(jsonData, 'utf8');
        }
        return config;
      });

      client.interceptors.response.use(
        (response) => {
          const remaining = response.headers['x-ratelimit-remaining'];
          const reset = response.headers['x-ratelimit-reset'];
          if (remaining !== undefined) {
            const clusterId = new URL(response.config.baseURL || '').hostname;
            const client = this.clusterClients.get(clusterId);
            if (client) {
              client.rateLimitRemaining = parseInt(remaining, 10);
              client.rateLimitReset = reset ? parseInt(reset, 10) * 1000 : Date.now() + 60000;
            }
          }
          return response;
        },
        (error) => {
          if (error.response?.status === 429) {
            const retryAfter = error.response.headers['retry-after'] || 60;
            logger.warn('触发区域集群限流', {
              retryAfter: parseInt(retryAfter, 10),
              clusterId: error.config.baseURL,
            });
          }
          return Promise.reject(error);
        }
      );

      this.clusterClients.set(cluster.id, {
        cluster,
        axios: client,
        lastHealthCheck: Date.now(),
        consecutiveFailures: 0,
        rateLimitRemaining: 1000,
        rateLimitReset: Date.now() + 60000,
      });
    });
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.healthCheckIntervalMs);
  }

  private async performHealthChecks(): Promise<void> {
    for (const [clusterId, client] of this.clusterClients.entries()) {
      try {
        const response = await client.axios.get('/health', { timeout: 5000 });
        if (response.status === 200) {
          client.consecutiveFailures = 0;
          client.lastHealthCheck = Date.now();
          client.cluster.status = 'online';
          logger.debug('区域集群健康检查通过', { clusterId });
        }
      } catch (error) {
        client.consecutiveFailures++;
        logger.warn('区域集群健康检查失败', {
          clusterId,
          failures: client.consecutiveFailures,
        });

        if (client.consecutiveFailures >= this.circuitBreakerThreshold) {
          client.cluster.status = 'offline';
          logger.error('区域集群已被标记为离线', undefined, undefined, undefined);
          logger.error('区域集群已被标记为离线', new Error(`Cluster ${clusterId} marked offline after ${this.circuitBreakerThreshold} failures`));
        } else if (client.consecutiveFailures >= 2) {
          client.cluster.status = 'degraded';
        }
      }
    }
  }

  async forwardMessage(message: Message, targetRegionId: string): Promise<ForwardResult> {
    const startTime = Date.now();
    const client = this.clusterClients.get(targetRegionId);

    if (!client) {
      const error = `未找到区域集群: ${targetRegionId}`;
      logger.error(error, undefined, message.metadata.requestId, message.metadata.traceId);
      return {
        success: false,
        regionId: targetRegionId,
        messageId: message.id,
        latency: Date.now() - startTime,
        error,
      };
    }

    if (client.cluster.status === 'offline') {
      const error = `区域集群离线: ${targetRegionId}`;
      logger.warn(error, undefined, message.metadata.requestId, message.metadata.traceId);
      return {
        success: false,
        regionId: targetRegionId,
        messageId: message.id,
        latency: Date.now() - startTime,
        error,
      };
    }

    const payloadSize = Buffer.byteLength(JSON.stringify(message.payload), 'utf8');
    if (payloadSize > MAX_PAYLOAD_SIZE) {
      const error = `消息负载过大: ${payloadSize} bytes, 最大允许: ${MAX_PAYLOAD_SIZE} bytes`;
      logger.error(error, undefined, message.metadata.requestId, message.metadata.traceId);
      return {
        success: false,
        regionId: targetRegionId,
        messageId: message.id,
        latency: Date.now() - startTime,
        error,
      };
    }

    const now = Date.now();
    if (client.rateLimitReset > now && client.rateLimitRemaining <= 0) {
      const waitTime = Math.ceil((client.rateLimitReset - now) / 1000);
      const error = `区域集群限流，请等待 ${waitTime} 秒后重试`;
      logger.warn(error, undefined, message.metadata.requestId, message.metadata.traceId);
      return {
        success: false,
        regionId: targetRegionId,
        messageId: message.id,
        latency: Date.now() - startTime,
        error: `RATE_LIMITED: ${error}`,
      };
    }

    try {
      const requestBody = {
        messageId: message.id,
        type: message.type,
        priority: message.priority,
        payload: message.payload,
        source: message.source,
        timestamp: message.timestamp,
        metadata: message.metadata,
      };

      logger.debug('转发消息到区域集群', {
        messageId: message.id,
        targetRegionId,
        payloadSize,
      }, message.metadata.requestId, message.metadata.traceId);

      const response = await client.axios.post('/api/message', requestBody, {
        headers: {
          'X-Request-Id': message.metadata.requestId,
          'X-Trace-Id': message.metadata.traceId,
        },
        validateStatus: (status) => status >= 200 && status < 500,
      });

      const latency = Date.now() - startTime;
      const success = response.status >= 200 && response.status < 300;

      loadStatsService.recordMessage(targetRegionId, success, latency);

      if (success) {
        client.consecutiveFailures = Math.max(0, client.consecutiveFailures - 1);
        logger.info('消息转发成功', {
          messageId: message.id,
          targetRegionId,
          latency,
          status: response.status,
        }, message.metadata.requestId, message.metadata.traceId);
      } else if (response.status === 429) {
        const retryAfter = parseInt(response.headers['retry-after'] || '60', 10);
        client.rateLimitRemaining = 0;
        client.rateLimitReset = Date.now() + retryAfter * 1000;
        logger.warn('区域集群返回429限流', {
          targetRegionId,
          retryAfter,
        }, message.metadata.requestId, message.metadata.traceId);
      } else {
        logger.warn('消息转发返回非成功状态', {
          messageId: message.id,
          targetRegionId,
          status: response.status,
        }, message.metadata.requestId, message.metadata.traceId);
      }

      return {
        success,
        regionId: targetRegionId,
        messageId: message.id,
        latency,
        error: success ? undefined : `HTTP ${response.status}: ${response.statusText}`,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : '未知错误';

      client.consecutiveFailures++;
      loadStatsService.recordMessage(targetRegionId, false, latency);

      logger.error('消息转发失败', error as Error, message.metadata.requestId, message.metadata.traceId);

      if (client.consecutiveFailures >= this.circuitBreakerThreshold) {
        client.cluster.status = 'offline';
        logger.error('区域集群因连续失败被标记为离线', new Error(`Cluster ${targetRegionId} marked offline after consecutive failures`), message.metadata.requestId, message.metadata.traceId);
      }

      return {
        success: false,
        regionId: targetRegionId,
        messageId: message.id,
        latency,
        error: errorMessage,
      };
    }
  }

  async forwardMessageWithFallback(message: Message, primaryRegionId: string): Promise<ForwardResult> {
    let result = await this.forwardMessage(message, primaryRegionId);

    if (!result.success) {
      const onlineClusters = this.getOnlineClusters().filter(c => c.id !== primaryRegionId);

      for (const cluster of onlineClusters) {
        logger.info('尝试使用备用区域转发消息', {
          messageId: message.id,
          fallbackRegion: cluster.id,
        }, message.metadata.requestId, message.metadata.traceId);

        result = await this.forwardMessage(message, cluster.id);
        if (result.success) {
          break;
        }
      }
    }

    return result;
  }

  async batchForwardMessages(messages: Message[], regionId: string): Promise<ForwardResult[]> {
    const results: ForwardResult[] = [];

    for (const message of messages) {
      const result = await this.forwardMessage(message, regionId);
      results.push(result);
    }

    return results;
  }

  getClusterStatus(clusterId: string): RegionCluster | null {
    const client = this.clusterClients.get(clusterId);
    return client ? { ...client.cluster } : null;
  }

  getAllClusterStatuses(): RegionCluster[] {
    return Array.from(this.clusterClients.values()).map(client => ({
      ...client.cluster,
    }));
  }

  getOnlineClusters(): RegionCluster[] {
    return Array.from(this.clusterClients.values())
      .filter(client => client.cluster.status === 'online')
      .map(client => ({ ...client.cluster }));
  }

  resetClusterStatus(clusterId: string): boolean {
    const client = this.clusterClients.get(clusterId);
    if (!client) return false;

    client.cluster.status = 'online';
    client.consecutiveFailures = 0;
    client.lastHealthCheck = Date.now();

    logger.info('区域集群状态已重置', { clusterId });
    return true;
  }

  addCluster(cluster: RegionCluster): boolean {
    if (this.clusterClients.has(cluster.id)) {
      logger.warn('区域集群已存在', { clusterId: cluster.id });
      return false;
    }

    const client = axios.create({
      baseURL: cluster.endpoint,
      timeout: 30000,
      maxContentLength: MAX_PAYLOAD_SIZE,
      maxBodyLength: MAX_PAYLOAD_SIZE,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': 'MultiRegionGateway/1.0',
        'Accept-Encoding': 'gzip, deflate',
      },
      responseType: 'json',
    });

    this.clusterClients.set(cluster.id, {
      cluster,
      axios: client,
      lastHealthCheck: Date.now(),
      consecutiveFailures: 0,
      rateLimitRemaining: 1000,
      rateLimitReset: Date.now() + 60000,
    });

    logger.info('区域集群已添加', { clusterId: cluster.id, clusterName: cluster.name });
    return true;
  }

  updateCluster(clusterId: string, updates: Partial<RegionCluster>): boolean {
    const existingClient = this.clusterClients.get(clusterId);
    if (!existingClient) {
      logger.warn('区域集群不存在', { clusterId });
      return false;
    }

    const updatedCluster = { ...existingClient.cluster, ...updates };

    if (updates.endpoint && updates.endpoint !== existingClient.cluster.endpoint) {
      const newClient = axios.create({
        baseURL: updates.endpoint,
        timeout: 30000,
        maxContentLength: MAX_PAYLOAD_SIZE,
        maxBodyLength: MAX_PAYLOAD_SIZE,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'User-Agent': 'MultiRegionGateway/1.0',
        },
        responseType: 'json',
      });
      existingClient.axios = newClient;
    }

    existingClient.cluster = updatedCluster;
    logger.info('区域集群已更新', { clusterId });
    return true;
  }

  removeCluster(clusterId: string): boolean {
    const client = this.clusterClients.get(clusterId);
    if (!client) {
      logger.warn('区域集群不存在', { clusterId });
      return false;
    }

    this.clusterClients.delete(clusterId);
    logger.info('区域集群已移除', { clusterId });
    return true;
  }

  reloadClusters(newClusters: RegionCluster[]): number {
    const newClusterIds = new Set(newClusters.map(c => c.id));

    for (const existingId of this.clusterClients.keys()) {
      if (!newClusterIds.has(existingId)) {
        this.clusterClients.delete(existingId);
        logger.info('移除不存在的区域集群', { clusterId: existingId });
      }
    }

    let addedCount = 0;
    for (const cluster of newClusters) {
      if (this.clusterClients.has(cluster.id)) {
        this.updateCluster(cluster.id, cluster);
      } else {
        this.addCluster(cluster);
        addedCount++;
      }
    }

    logger.info('路由表已重新加载', { totalClusters: this.clusterClients.size, addedCount });
    return this.clusterClients.size;
  }

  shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    logger.info('消息转发模块已关闭');
  }
}

export const messageForwarderService = new MessageForwarderService();
export default messageForwarderService;
