import { getLogger } from '../logger';

const logger = getLogger('RateLimiter');

export type LimitDimension = 'ip' | 'user' | 'api' | 'region' | 'global';

export interface RateLimitConfig {
  tokensPerSecond: number;
  burstCapacity: number;
  dimension: LimitDimension;
  maxWaitTime?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
  waitTime?: number;
  dimension: LimitDimension;
  key: string;
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRate: number;
}

interface DynamicLimitRule {
  condition: (metrics: { errorRate: number; avgLatency: number; qps: number }) => boolean;
  multiplier: number;
  name: string;
}

export class RateLimiter {
  private buckets: Map<string, TokenBucket> = new Map();
  private configs: Map<LimitDimension, RateLimitConfig> = new Map();
  private globalRequestCount: number = 0;
  private lastResetTime: number = Date.now();
  private dynamicRules: DynamicLimitRule[] = [];
  private baseMultiplier: number = 1;

  constructor() {
    this.setDefaultConfigs();
    this.initializeDynamicRules();
    setInterval(() => this.cleanupExpiredBuckets(), 60000);
    setInterval(() => this.adjustLimitsDynamically(), 5000);
    logger.info('限流器初始化完成');
  }

  private setDefaultConfigs(): void {
    this.configs.set('global', {
      tokensPerSecond: 1000,
      burstCapacity: 2000,
      dimension: 'global',
    });

    this.configs.set('ip', {
      tokensPerSecond: 100,
      burstCapacity: 200,
      dimension: 'ip',
    });

    this.configs.set('user', {
      tokensPerSecond: 50,
      burstCapacity: 100,
      dimension: 'user',
    });

    this.configs.set('api', {
      tokensPerSecond: 500,
      burstCapacity: 1000,
      dimension: 'api',
    });

    this.configs.set('region', {
      tokensPerSecond: 200,
      burstCapacity: 500,
      dimension: 'region',
    });
  }

  private initializeDynamicRules(): void {
    this.dynamicRules = [
      {
        name: '高错误率降载',
        condition: (metrics) => metrics.errorRate > 0.1,
        multiplier: 0.5,
      },
      {
        name: '高延迟降载',
        condition: (metrics) => metrics.avgLatency > 1000,
        multiplier: 0.7,
      },
      {
        name: '极端QPS降载',
        condition: (metrics) => metrics.qps > 5000,
        multiplier: 0.6,
      },
    ];
  }

  setConfig(dimension: LimitDimension, config: Partial<RateLimitConfig>): void {
    const existingConfig = this.configs.get(dimension) || {
      tokensPerSecond: 100,
      burstCapacity: 200,
      dimension,
    };

    this.configs.set(dimension, { ...existingConfig, ...config });
    logger.info('限流配置已更新', { dimension, config });
  }

  getConfig(dimension: LimitDimension): RateLimitConfig | undefined {
    return this.configs.get(dimension);
  }

  getAllConfigs(): Map<LimitDimension, RateLimitConfig> {
    return new Map(this.configs);
  }

  private getBucketKey(dimension: LimitDimension, identifier: string): string {
    return `${dimension}:${identifier}`;
  }

  private getOrCreateBucket(key: string, config: RateLimitConfig): TokenBucket {
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = {
        tokens: config.burstCapacity * this.baseMultiplier,
        lastRefill: Date.now(),
        capacity: config.burstCapacity * this.baseMultiplier,
        refillRate: config.tokensPerSecond * this.baseMultiplier,
      };
      this.buckets.set(key, bucket);
    }

    return bucket;
  }

  private refillBucket(bucket: TokenBucket, config: RateLimitConfig): void {
    const now = Date.now();
    const elapsed = (now - bucket.lastRefill) / 1000;

    if (elapsed > 0) {
      const newTokens = elapsed * config.tokensPerSecond * this.baseMultiplier;
      bucket.tokens = Math.min(bucket.capacity, bucket.tokens + newTokens);
      bucket.lastRefill = now;
    }
  }

  tryAcquire(
    dimension: LimitDimension,
    identifier: string,
    tokens: number = 1
  ): RateLimitResult {
    const config = this.configs.get(dimension);
    if (!config) {
      return {
        allowed: true,
        limit: Infinity,
        remaining: Infinity,
        resetTime: Date.now() + 1000,
        dimension,
        key: identifier,
      };
    }

    const key = this.getBucketKey(dimension, identifier);
    const bucket = this.getOrCreateBucket(key, config);

    this.refillBucket(bucket, config);

    const allowed = bucket.tokens >= tokens;

    if (allowed) {
      bucket.tokens -= tokens;
    }

    const timeToRefill = config.tokensPerSecond > 0
      ? (tokens - bucket.tokens) / config.tokensPerSecond * 1000
      : 1000;

    const result: RateLimitResult = {
      allowed,
      limit: config.burstCapacity * this.baseMultiplier,
      remaining: Math.max(0, Math.floor(bucket.tokens)),
      resetTime: Date.now() + Math.max(0, timeToRefill),
      dimension,
      key: identifier,
      waitTime: allowed ? 0 : Math.ceil(timeToRefill),
    };

    if (!allowed) {
      logger.warn('请求被限流', {
        dimension,
        identifier,
        tokens,
        remaining: bucket.tokens,
      });
    }

    return result;
  }

  tryAcquireMulti(
    requests: Array<{ dimension: LimitDimension; identifier: string; tokens?: number }>
  ): RateLimitResult[] {
    return requests.map((req) =>
      this.tryAcquire(req.dimension, req.identifier, req.tokens || 1)
    );
  }

  async acquireWithWait(
    dimension: LimitDimension,
    identifier: string,
    tokens: number = 1,
    maxWaitTime?: number
  ): Promise<RateLimitResult> {
    const result = this.tryAcquire(dimension, identifier, tokens);

    if (result.allowed) {
      return result;
    }

    const waitTime = result.waitTime || 0;
    const actualMaxWait = maxWaitTime || 5000;

    if (waitTime <= actualMaxWait) {
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      return this.tryAcquire(dimension, identifier, tokens);
    }

    return result;
  }

  getBucketStatus(dimension: LimitDimension, identifier: string): TokenBucket | null {
    const key = this.getBucketKey(dimension, identifier);
    return this.buckets.get(key) || null;
  }

  resetBucket(dimension: LimitDimension, identifier: string): boolean {
    const key = this.getBucketKey(dimension, identifier);
    return this.buckets.delete(key);
  }

  resetAllBuckets(): void {
    this.buckets.clear();
    logger.info('所有限流桶已重置');
  }

  private cleanupExpiredBuckets(): void {
    const now = Date.now();
    const expirationTime = 5 * 60 * 1000;
    let cleanedCount = 0;

    for (const [key, bucket] of this.buckets.entries()) {
      if (now - bucket.lastRefill > expirationTime && bucket.tokens >= bucket.capacity * 0.9) {
        this.buckets.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug('过期限流桶已清理', { cleanedCount });
    }
  }

  recordMetrics(metrics: { errorRate: number; avgLatency: number; qps: number }): void {
    this.globalRequestCount++;
  }

  private adjustLimitsDynamically(): void {
    const metrics = this.getSystemMetrics();
    let newMultiplier = 1;

    for (const rule of this.dynamicRules) {
      if (rule.condition(metrics)) {
        newMultiplier = Math.min(newMultiplier, rule.multiplier);
        logger.info('触发动态限流规则', {
          rule: rule.name,
          multiplier: rule.multiplier,
          metrics,
        });
      }
    }

    if (newMultiplier !== this.baseMultiplier) {
      this.baseMultiplier = newMultiplier;
      this.buckets.forEach((bucket, key) => {
        const [dimension] = key.split(':');
        const config = this.configs.get(dimension as LimitDimension);
        if (config) {
          bucket.capacity = config.burstCapacity * newMultiplier;
          bucket.refillRate = config.tokensPerSecond * newMultiplier;
        }
      });
      logger.info('限流倍率已动态调整', {
        oldMultiplier: this.baseMultiplier,
        newMultiplier,
      });
    }
  }

  private getSystemMetrics(): { errorRate: number; avgLatency: number; qps: number } {
    const elapsed = (Date.now() - this.lastResetTime) / 1000;
    const qps = elapsed > 0 ? this.globalRequestCount / elapsed : 0;

    return {
      errorRate: 0.05,
      avgLatency: 150,
      qps,
    };
  }

  addDynamicRule(rule: DynamicLimitRule): void {
    this.dynamicRules.push(rule);
    logger.info('动态限流规则已添加', { name: rule.name });
  }

  removeDynamicRule(name: string): boolean {
    const index = this.dynamicRules.findIndex((r) => r.name === name);
    if (index !== -1) {
      this.dynamicRules.splice(index, 1);
      logger.info('动态限流规则已移除', { name });
      return true;
    }
    return false;
  }

  getStats(): {
    totalBuckets: number;
    globalRequestCount: number;
    baseMultiplier: number;
    dimensions: Record<LimitDimension, { bucketCount: number; totalTokens: number }>;
  } {
    const dimensions: Record<LimitDimension, { bucketCount: number; totalTokens: number }> = {
      global: { bucketCount: 0, totalTokens: 0 },
      ip: { bucketCount: 0, totalTokens: 0 },
      user: { bucketCount: 0, totalTokens: 0 },
      api: { bucketCount: 0, totalTokens: 0 },
      region: { bucketCount: 0, totalTokens: 0 },
    };

    for (const [key, bucket] of this.buckets.entries()) {
      const [dimension] = key.split(':') as [LimitDimension];
      if (dimensions[dimension]) {
        dimensions[dimension].bucketCount++;
        dimensions[dimension].totalTokens += bucket.tokens;
      }
    }

    return {
      totalBuckets: this.buckets.size,
      globalRequestCount: this.globalRequestCount,
      baseMultiplier: this.baseMultiplier,
      dimensions,
    };
  }
}

export const rateLimiter = new RateLimiter();
export default rateLimiter;
