import Redis, { Cluster } from 'ioredis';
import { getLogger } from '../logger';
import { config } from '../../utils/config';

const logger = getLogger('DatabaseOptimizer');

export interface PoolConfig {
  minConnections: number;
  maxConnections: number;
  maxRetriesPerRequest: number;
  connectionTimeout: number;
  idleTimeout: number;
}

export interface BatchOperationResult {
  success: number;
  failed: number;
  total: number;
  errors: string[];
  duration: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  maxSize: number;
}

interface CacheEntry<T> {
  value: T;
  expiry: number;
  hitCount: number;
}

class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private hits: number = 0;
  private misses: number = 0;

  constructor(private maxSize: number = 1000) {}

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    entry.hitCount++;

    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  set(key: string, value: T, ttl: number = 60000): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      value,
      expiry: Date.now() + ttl,
      hitCount: 0,
    });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? (this.hits / total) * 100 : 0,
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }
}

class RedisConnectionPool {
  private pool: Redis[] = [];
  private currentIndex: number = 0;
  private waitingRequests: Array<(client: Redis) => void> = [];

  constructor(
    private poolConfig: PoolConfig,
    private redisConfig: {
      host: string;
      port: number;
      password?: string;
      db: number;
    }
  ) {
    this.initializePool();
  }

  private initializePool(): void {
    for (let i = 0; i < this.poolConfig.minConnections; i++) {
      this.createConnection();
    }
    logger.info('Redis 连接池初始化完成', { minConnections: this.poolConfig.minConnections });
  }

  private createConnection(): Redis {
    const client = new Redis({
      host: this.redisConfig.host,
      port: this.redisConfig.port,
      password: this.redisConfig.password,
      db: this.redisConfig.db,
      enableOfflineQueue: true,
      maxRetriesPerRequest: this.poolConfig.maxRetriesPerRequest,
      connectTimeout: this.poolConfig.connectionTimeout,
      lazyConnect: false,
    });

    client.on('error', (err) => {
      logger.error('Redis 连接错误', err);
    });

    client.on('ready', () => {
      logger.debug('Redis 连接就绪');
    });

    this.pool.push(client);
    return client;
  }

  getConnection(): Redis {
    if (this.pool.length === 0) {
      return this.createConnection();
    }

    if (this.waitingRequests.length > 0) {
      const resolve = this.waitingRequests.shift();
      if (resolve) {
        resolve(this.pool[this.currentIndex]);
      }
    }

    const client = this.pool[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.pool.length;

    return client;
  }

  async getConnectionAsync(): Promise<Redis> {
    if (this.pool.length < this.poolConfig.maxConnections) {
      return this.createConnection();
    }

    return new Promise((resolve) => {
      this.waitingRequests.push(resolve);
    });
  }

  getStats(): { active: number; waiting: number; max: number } {
    return {
      active: this.pool.length,
      waiting: this.waitingRequests.length,
      max: this.poolConfig.maxConnections,
    };
  }

  async close(): Promise<void> {
    for (const client of this.pool) {
      await client.quit();
    }
    this.pool = [];
    logger.info('Redis 连接池已关闭');
  }
}

export class DatabaseOptimizer {
  private redisPool: RedisConnectionPool;
  private queryCache: LRUCache<unknown>;
  private writeBuffer: Map<string, { value: unknown; ttl: number; timestamp: number }> = new Map();
  private flushInterval: NodeJS.Timeout | null = null;
  private batchSize: number = 50;
  private flushIntervalMs: number = 100;

  constructor() {
    this.redisPool = new RedisConnectionPool(
      {
        minConnections: 5,
        maxConnections: 50,
        maxRetriesPerRequest: 3,
        connectionTimeout: 10000,
        idleTimeout: 300000,
      },
      {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db,
      }
    );

    this.queryCache = new LRUCache(5000);
    this.startAutoFlush();

    logger.info('数据库优化器初始化完成');
  }

  private startAutoFlush(): void {
    this.flushInterval = setInterval(() => {
      this.flushWriteBuffer();
    }, this.flushIntervalMs);
  }

  private async flushWriteBuffer(): Promise<void> {
    if (this.writeBuffer.size === 0) return;

    const entries = Array.from(this.writeBuffer.entries());
    this.writeBuffer.clear();

    const client = this.redisPool.getConnection();
    const pipeline = client.pipeline();

    for (const [key, entry] of entries) {
      pipeline.set(key, JSON.stringify(entry.value), 'PX', entry.ttl);
    }

    try {
      await pipeline.exec();
      logger.debug('批量写入完成', { count: entries.length });
    } catch (error) {
      logger.error('批量写入失败', error as Error);
      for (const [key, entry] of entries) {
        if (!this.writeBuffer.has(key)) {
          this.writeBuffer.set(key, entry);
        }
      }
    }
  }

  async get<T>(key: string, useCache: boolean = true): Promise<T | null> {
    if (useCache) {
      const cached = this.queryCache.get(key);
      if (cached !== null) {
        logger.debug('查询缓存命中', { key });
        return cached as T;
      }
    }

    const client = this.redisPool.getConnection();
    const value = await client.get(key);

    if (value) {
      const parsed = JSON.parse(value) as T;
      if (useCache) {
        this.queryCache.set(key, parsed, 5000);
      }
      return parsed;
    }

    return null;
  }

  async set(key: string, value: unknown, ttl: number = 3600000, batchWrite: boolean = true): Promise<void> {
    if (batchWrite) {
      this.writeBuffer.set(key, { value, ttl, timestamp: Date.now() });

      if (this.writeBuffer.size >= this.batchSize) {
        await this.flushWriteBuffer();
      }
    } else {
      const client = this.redisPool.getConnection();
      await client.set(key, JSON.stringify(value), 'PX', ttl);
    }
  }

  async delete(key: string): Promise<boolean> {
    this.queryCache.delete(key);

    const client = this.redisPool.getConnection();
    const result = await client.del(key);
    return result > 0;
  }

  async batchGet<T>(keys: string[], useCache: boolean = true): Promise<Map<string, T | null>> {
    const result = new Map<string, T | null>();
    const toFetch: string[] = [];

    if (useCache) {
      for (const key of keys) {
        const cached = this.queryCache.get(key);
        if (cached !== null) {
          result.set(key, cached as T);
        } else {
          toFetch.push(key);
        }
      }
    } else {
      toFetch.push(...keys);
    }

    if (toFetch.length > 0) {
      const client = this.redisPool.getConnection();
      const values = await client.mget(...toFetch);

      for (let i = 0; i < toFetch.length; i++) {
        const key = toFetch[i];
        const value = values[i];
        if (value) {
          const parsed = JSON.parse(value) as T;
          result.set(key, parsed);
          if (useCache) {
            this.queryCache.set(key, parsed, 5000);
          }
        } else {
          result.set(key, null);
        }
      }
    }

    return result;
  }

  async batchSet(entries: Array<{ key: string; value: unknown; ttl?: number }>): Promise<BatchOperationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let success = 0;

    const client = this.redisPool.getConnection();
    const pipeline = client.pipeline();

    for (const entry of entries) {
      const ttl = entry.ttl || 3600000;
      pipeline.set(entry.key, JSON.stringify(entry.value), 'PX', ttl);
    }

    try {
      const results = await pipeline.exec();
      if (results) {
        for (let i = 0; i < results.length; i++) {
          const [err] = results[i];
          if (err) {
            errors.push(`Key ${entries[i].key}: ${err.message}`);
          } else {
            success++;
            this.queryCache.delete(entries[i].key);
          }
        }
      }
    } catch (error) {
      errors.push(`Pipeline error: ${(error as Error).message}`);
    }

    return {
      success,
      failed: entries.length - success,
      total: entries.length,
      errors,
      duration: Date.now() - startTime,
    };
  }

  async batchDelete(keys: string[]): Promise<BatchOperationResult> {
    const startTime = Date.now();
    const client = this.redisPool.getConnection();

    const pipeline = client.pipeline();
    for (const key of keys) {
      pipeline.del(key);
      this.queryCache.delete(key);
    }

    let success = 0;
    const errors: string[] = [];

    try {
      const results = await pipeline.exec();
      if (results) {
        for (const [err] of results) {
          if (err) {
            errors.push(err.message);
          } else {
            success++;
          }
        }
      }
    } catch (error) {
      errors.push((error as Error).message);
    }

    return {
      success,
      failed: keys.length - success,
      total: keys.length,
      errors,
      duration: Date.now() - startTime,
    };
  }

  async exists(key: string): Promise<boolean> {
    const client = this.redisPool.getConnection();
    const result = await client.exists(key);
    return result > 0;
  }

  async increment(key: string, amount: number = 1): Promise<number> {
    this.queryCache.delete(key);
    const client = this.redisPool.getConnection();
    return client.incrby(key, amount);
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    const client = this.redisPool.getConnection();
    const result = await client.pexpire(key, ttl);
    return result > 0;
  }

  async getWithFallback<T>(
    key: string,
    fallbackFn: () => Promise<T>,
    ttl: number = 3600000
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await fallbackFn();
    await this.set(key, value, ttl);
    return value;
  }

  getCacheStats(): CacheStats {
    return this.queryCache.getStats();
  }

  getPoolStats(): { active: number; waiting: number; max: number } {
    return this.redisPool.getStats();
  }

  getWriteBufferSize(): number {
    return this.writeBuffer.size;
  }

  invalidateCache(pattern?: string): number {
    if (pattern) {
      let count = 0;
      logger.debug('缓存模式失效', { pattern });
      return count;
    } else {
      const stats = this.queryCache.getStats();
      this.queryCache.clear();
      logger.info('查询缓存已全部失效', { clearedCount: stats.size });
      return stats.size;
    }
  }

  setBatchSize(size: number): void {
    this.batchSize = size;
    logger.info('批量写入大小已更新', { size });
  }

  async forceFlush(): Promise<void> {
    await this.flushWriteBuffer();
    logger.info('强制刷新写入缓冲区完成');
  }

  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    await this.flushWriteBuffer();
    await this.redisPool.close();
    this.queryCache.clear();

    logger.info('数据库优化器已关闭');
  }
}

export const databaseOptimizer = new DatabaseOptimizer();
export default databaseOptimizer;
