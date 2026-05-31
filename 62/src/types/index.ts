export interface RegionCluster {
  id: string;
  name: string;
  endpoint: string;
  weight: number;
  status: 'online' | 'offline' | 'degraded';
  currentLoad: number;
  maxLoad: number;
}

export interface Message {
  id: string;
  type: 'command' | 'event' | 'notification';
  priority: 'low' | 'normal' | 'high' | 'critical';
  payload: Record<string, unknown>;
  targetRegion?: string;
  source: string;
  timestamp: number;
  metadata: MessageMetadata;
}

export interface MessageMetadata {
  requestId: string;
  traceId: string;
  userId?: string;
  clientIp?: string;
  userAgent?: string;
  retryCount: number;
}

export interface RouteStrategy {
  type: 'round-robin' | 'weighted' | 'least-load' | 'region-affinity';
}

export interface QueueConfig {
  name: string;
  concurrency: number;
  priority: number;
  rateLimit?: {
    max: number;
    window: number;
  };
}

export interface LoadStats {
  regionId: string;
  timestamp: number;
  messageCount: number;
  successCount: number;
  failureCount: number;
  averageLatency: number;
  currentQueueSize: number;
  cpuUsage?: number;
  memoryUsage?: number;
}

export interface LogEntry {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  module: string;
  requestId?: string;
  traceId?: string;
  data?: Record<string, unknown>;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  code: number;
  message: string;
  data?: T;
  requestId: string;
  timestamp: number;
}

export interface ForwardResult {
  success: boolean;
  regionId: string;
  messageId: string;
  latency: number;
  error?: string;
}

export interface QueueJob {
  id: string;
  message: Message;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'delayed';
  attempts: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  failedAt?: number;
  lastError?: string;
}

export interface GatewayConfig {
  port: number;
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  logging: {
    dir: string;
    level: string;
  };
  clusters: RegionCluster[];
  queues: QueueConfig[];
  maxRetryAttempts: number;
  retryDelay: number;
}
