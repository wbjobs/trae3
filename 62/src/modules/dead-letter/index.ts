import { Message, ForwardResult } from '../../types';
import { getLogger } from '../logger';
import { config } from '../../utils/config';

const logger = getLogger('DeadLetterHandler');

export type DeadLetterReason =
  | 'max_retries_exceeded'
  | 'region_offline'
  | 'rate_limited'
  | 'payload_too_large'
  | 'invalid_message'
  | 'timeout'
  | 'unknown_error';

export interface DeadLetterMessage {
  id: string;
  message: Message;
  reason: DeadLetterReason;
  errorMessage?: string;
  failedRegion?: string;
  failedAttempts: number;
  firstFailedAt: number;
  lastFailedAt: number;
  retryHistory: Array<{
    region: string;
    timestamp: number;
    error: string;
  }>;
  status: 'dead' | 'retrying' | 'reprocessed';
  reprocessedAt?: number;
  reprocessedRegion?: string;
}

export interface RetryPolicy {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
}

export class DeadLetterService {
  private deadLetterQueue: Map<string, DeadLetterMessage> = new Map();
  private retryPolicy: RetryPolicy = {
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true,
  };
  private retryInterval: NodeJS.Timeout | null = null;
  private maxDeadLetters: number = 10000;
  private retentionPeriod: number = 7 * 24 * 60 * 60 * 1000;

  constructor() {
    this.startRetryProcess();
    this.startCleanupProcess();
    logger.info('死信处理服务初始化完成');
  }

  setRetryPolicy(policy: Partial<RetryPolicy>): void {
    this.retryPolicy = { ...this.retryPolicy, ...policy };
    logger.info('重试策略已更新', { policy: this.retryPolicy });
  }

  getRetryPolicy(): RetryPolicy {
    return { ...this.retryPolicy };
  }

  private startRetryProcess(): void {
    this.retryInterval = setInterval(() => {
      this.processRetryQueue();
    }, 5000);
  }

  private startCleanupProcess(): void {
    setInterval(() => {
      this.cleanupExpiredDeadLetters();
    }, 60 * 60 * 1000);
  }

  async addToDeadLetterQueue(
    message: Message,
    reason: DeadLetterReason,
    errorMessage?: string,
    failedRegion?: string
  ): Promise<DeadLetterMessage> {
    const existing = this.deadLetterQueue.get(message.id);

    if (existing) {
      existing.failedAttempts++;
      existing.lastFailedAt = Date.now();
      existing.reason = reason;
      existing.errorMessage = errorMessage;
      if (failedRegion) {
        existing.failedRegion = failedRegion;
      }
      if (failedRegion && errorMessage) {
        existing.retryHistory.push({
          region: failedRegion,
          timestamp: Date.now(),
          error: errorMessage,
        });
      }

      logger.warn('消息失败重试记录已更新', {
        messageId: message.id,
        reason,
        attempts: existing.failedAttempts,
      });

      return existing;
    }

    const deadLetter: DeadLetterMessage = {
      id: message.id,
      message,
      reason,
      errorMessage,
      failedRegion,
      failedAttempts: 1,
      firstFailedAt: Date.now(),
      lastFailedAt: Date.now(),
      retryHistory: failedRegion && errorMessage
        ? [{ region: failedRegion, timestamp: Date.now(), error: errorMessage }]
        : [],
      status: 'dead',
    };

    this.deadLetterQueue.set(message.id, deadLetter);
    this.enforceSizeLimit();

    logger.error('消息已加入死信队列', {
      messageId: message.id,
      reason,
      failedRegion,
      errorMessage,
    }, message.metadata.requestId, message.metadata.traceId);

    return deadLetter;
  }

  private calculateDelay(attempt: number): number {
    const baseDelay = this.retryPolicy.initialDelay;
    const multiplier = Math.pow(this.retryPolicy.backoffMultiplier, attempt - 1);
    let delay = Math.min(baseDelay * multiplier, this.retryPolicy.maxDelay);

    if (this.retryPolicy.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return Math.round(delay);
  }

  private async processRetryQueue(): Promise<void> {
    const now = Date.now();
    const toRetry: DeadLetterMessage[] = [];

    for (const dlm of this.deadLetterQueue.values()) {
      if (dlm.status !== 'dead') continue;
      if (dlm.failedAttempts >= this.retryPolicy.maxAttempts) continue;

      const delay = this.calculateDelay(dlm.failedAttempts);
      if (now - dlm.lastFailedAt >= delay) {
        toRetry.push(dlm);
      }
    }

    if (toRetry.length > 0) {
      logger.info('开始处理死信重试', { count: toRetry.length });

      for (const dlm of toRetry) {
        dlm.status = 'retrying';
        const success = await this.attemptReprocess(dlm);
        if (success) {
          dlm.status = 'reprocessed';
          dlm.reprocessedAt = Date.now();
        } else {
          dlm.status = 'dead';
        }
      }
    }
  }

  private async attemptReprocess(dlm: DeadLetterMessage): Promise<boolean> {
    logger.info('正在重试处理死信消息', {
      messageId: dlm.id,
      attempt: dlm.failedAttempts + 1,
    });

    try {
      return await this.reprocessMessage(dlm.message);
    } catch (error) {
      dlm.errorMessage = error instanceof Error ? error.message : '未知错误';
      dlm.lastFailedAt = Date.now();
      dlm.failedAttempts++;
      dlm.retryHistory.push({
        region: dlm.failedRegion || 'unknown',
        timestamp: Date.now(),
        error: dlm.errorMessage,
      });

      logger.warn('死信消息重试失败', {
        messageId: dlm.id,
        attempt: dlm.failedAttempts,
        error: dlm.errorMessage,
      });

      return false;
    }
  }

  private async reprocessMessage(message: Message): Promise<boolean> {
    logger.debug('模拟重新处理消息', { messageId: message.id });
    return Math.random() > 0.5;
  }

  setReprocessHandler(handler: (message: Message) => Promise<boolean>): void {
    this.reprocessMessage = handler;
    logger.info('重新处理处理器已设置');
  }

  getDeadLetter(messageId: string): DeadLetterMessage | undefined {
    return this.deadLetterQueue.get(messageId);
  }

  getDeadLettersByReason(reason: DeadLetterReason): DeadLetterMessage[] {
    const result: DeadLetterMessage[] = [];
    for (const dlm of this.deadLetterQueue.values()) {
      if (dlm.reason === reason) {
        result.push(dlm);
      }
    }
    return result;
  }

  getDeadLettersByRegion(regionId: string): DeadLetterMessage[] {
    const result: DeadLetterMessage[] = [];
    for (const dlm of this.deadLetterQueue.values()) {
      if (dlm.failedRegion === regionId) {
        result.push(dlm);
      }
    }
    return result;
  }

  getAllDeadLetters(options?: {
    status?: 'dead' | 'retrying' | 'reprocessed';
    limit?: number;
    offset?: number;
  }): DeadLetterMessage[] {
    let result = Array.from(this.deadLetterQueue.values());

    if (options?.status) {
      result = result.filter((d) => d.status === options.status);
    }

    result.sort((a, b) => b.lastFailedAt - a.lastFailedAt);

    if (options?.offset) {
      result = result.slice(options.offset);
    }

    if (options?.limit) {
      result = result.slice(0, options.limit);
    }

    return result;
  }

  async manuallyRetry(messageId: string): Promise<boolean> {
    const dlm = this.deadLetterQueue.get(messageId);
    if (!dlm) {
      logger.warn('死信消息不存在，无法重试', { messageId });
      return false;
    }

    dlm.status = 'retrying';
    const success = await this.attemptReprocess(dlm);

    if (success) {
      dlm.status = 'reprocessed';
      dlm.reprocessedAt = Date.now();
      logger.info('手动重试成功', { messageId });
    } else {
      dlm.status = 'dead';
      logger.warn('手动重试失败', { messageId });
    }

    return success;
  }

  async bulkRetry(messageIds: string[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const id of messageIds) {
      const result = await this.manuallyRetry(id);
      if (result) {
        success++;
      } else {
        failed++;
      }
    }

    logger.info('批量重试完成', { total: messageIds.length, success, failed });
    return { success, failed };
  }

  removeDeadLetter(messageId: string): boolean {
    const removed = this.deadLetterQueue.delete(messageId);
    if (removed) {
      logger.info('死信消息已删除', { messageId });
    }
    return removed;
  }

  clearDeadLetters(reason?: DeadLetterReason): number {
    let removedCount = 0;

    if (reason) {
      for (const [id, dlm] of this.deadLetterQueue.entries()) {
        if (dlm.reason === reason) {
          this.deadLetterQueue.delete(id);
          removedCount++;
        }
      }
    } else {
      removedCount = this.deadLetterQueue.size;
      this.deadLetterQueue.clear();
    }

    logger.info('死信队列已清空', { removedCount, reason });
    return removedCount;
  }

  private enforceSizeLimit(): void {
    if (this.deadLetterQueue.size <= this.maxDeadLetters) return;

    const sorted = Array.from(this.deadLetterQueue.values()).sort(
      (a, b) => a.lastFailedAt - b.lastFailedAt
    );

    const toRemove = sorted.slice(0, this.deadLetterQueue.size - this.maxDeadLetters);
    for (const dlm of toRemove) {
      this.deadLetterQueue.delete(dlm.id);
    }

    logger.warn('死信队列超出大小限制，已清理旧消息', { removed: toRemove.length });
  }

  private cleanupExpiredDeadLetters(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [id, dlm] of this.deadLetterQueue.entries()) {
      if (now - dlm.lastFailedAt > this.retentionPeriod) {
        this.deadLetterQueue.delete(id);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.info('过期死信消息已清理', { removedCount });
    }
  }

  getStats(): {
    total: number;
    byReason: Record<DeadLetterReason, number>;
    byStatus: Record<'dead' | 'retrying' | 'reprocessed', number>;
    byRegion: Record<string, number>;
  } {
    const stats = {
      total: this.deadLetterQueue.size,
      byReason: {
        max_retries_exceeded: 0,
        region_offline: 0,
        rate_limited: 0,
        payload_too_large: 0,
        invalid_message: 0,
        timeout: 0,
        unknown_error: 0,
      } as Record<DeadLetterReason, number>,
      byStatus: {
        dead: 0,
        retrying: 0,
        reprocessed: 0,
      } as Record<'dead' | 'retrying' | 'reprocessed', number>,
      byRegion: {} as Record<string, number>,
    };

    for (const dlm of this.deadLetterQueue.values()) {
      stats.byReason[dlm.reason]++;
      stats.byStatus[dlm.status]++;
      if (dlm.failedRegion) {
        stats.byRegion[dlm.failedRegion] = (stats.byRegion[dlm.failedRegion] || 0) + 1;
      }
    }

    return stats;
  }

  setMaxDeadLetters(max: number): void {
    this.maxDeadLetters = max;
    this.enforceSizeLimit();
    logger.info('死信队列最大容量已更新', { max });
  }

  setRetentionPeriod(ms: number): void {
    this.retentionPeriod = ms;
    logger.info('死信保留期已更新', { retentionPeriodMs: ms });
  }

  shutdown(): void {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
    }
    logger.info('死信处理服务已关闭');
  }
}

export const deadLetterService = new DeadLetterService();
export default deadLetterService;
