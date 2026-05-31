import { EventEmitter } from 'events';
import { createModuleLogger } from '../modules/logger';

const logger = createModuleLogger('MemoryManager');

export interface CacheOptions {
  maxSize?: number;
  ttl?: number;
  cleanupInterval?: number;
}

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  hits: number;
}

export interface ObjectPoolOptions<T> {
  maxSize?: number;
  minIdle?: number;
  createFn: () => T;
  resetFn?: (obj: T) => void;
  destroyFn?: (obj: T) => void;
}

export interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  cacheHits: number;
  cacheMisses: number;
  poolUsage: Record<string, { used: number; total: number }>;
}

export class LRUCache<K, V> {
  private cache: Map<K, CacheEntry<V>> = new Map();
  private maxSize: number;
  private ttl: number;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private hits = 0;
  private misses = 0;

  constructor(options: CacheOptions = {}) {
    this.maxSize = options.maxSize || 1000;
    this.ttl = options.ttl || 5 * 60 * 1000;
    
    if (options.cleanupInterval) {
      this.cleanupTimer = setInterval(() => this.cleanup(), options.cleanupInterval);
      this.cleanupTimer.unref();
    }
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    this.hits++;
    entry.hits++;
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      hits: 0
    });
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  cleanup(): void {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      logger.debug('cache_cleanup', `清理过期缓存 ${removed} 项`);
    }
  }

  get size(): number {
    return this.cache.size;
  }

  get stats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses > 0 ? (this.hits / (this.hits + this.misses)).toFixed(2) : '0.00'
    };
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clear();
  }
}

export class ObjectPool<T> {
  private pool: T[] = [];
  private inUse: Set<T> = new Set();
  private maxSize: number;
  private minIdle: number;
  private createFn: () => T;
  private resetFn?: (obj: T) => void;
  private destroyFn?: (obj: T) => void;

  constructor(options: ObjectPoolOptions<T>) {
    this.maxSize = options.maxSize || 50;
    this.minIdle = options.minIdle || 5;
    this.createFn = options.createFn;
    this.resetFn = options.resetFn;
    this.destroyFn = options.destroyFn;
    this.initialize();
  }

  private initialize(): void {
    for (let i = 0; i < this.minIdle; i++) {
      this.pool.push(this.createFn());
    }
    logger.debug('pool_init', `对象池初始化完成`, { minIdle: this.minIdle });
  }

  acquire(): T {
    let obj: T;
    
    if (this.pool.length > 0) {
      obj = this.pool.pop()!;
      logger.debug('pool_acquire', '从池获取对象', { poolSize: this.pool.length });
    } else if (this.inUse.size < this.maxSize) {
      obj = this.createFn();
      logger.debug('pool_create', '创建新对象', { total: this.inUse.size + 1 });
    } else {
      throw new Error('对象池已达最大容量');
    }

    this.inUse.add(obj);
    return obj;
  }

  release(obj: T): void {
    if (!this.inUse.has(obj)) return;

    this.inUse.delete(obj);
    
    if (this.resetFn) {
      this.resetFn(obj);
    }

    if (this.pool.length < this.maxSize) {
      this.pool.push(obj);
    } else if (this.destroyFn) {
      this.destroyFn(obj);
    }

    logger.debug('pool_release', '对象归还到池', { poolSize: this.pool.length });
  }

  releaseAll(): void {
    for (const obj of [...this.inUse]) {
      this.release(obj);
    }
  }

  clear(): void {
    if (this.destroyFn) {
      for (const obj of this.pool) {
        this.destroyFn(obj);
      }
      for (const obj of this.inUse) {
        this.destroyFn(obj);
      }
    }
    this.pool = [];
    this.inUse.clear();
    logger.debug('pool_clear', '对象池已清空');
  }

  get stats() {
    return {
      idle: this.pool.length,
      inUse: this.inUse.size,
      maxSize: this.maxSize,
      usage: ((this.inUse.size / this.maxSize) * 100).toFixed(2) + '%'
    };
  }
}

export class MemoryManager extends EventEmitter {
  private static instance: MemoryManager;
  private caches: Map<string, LRUCache<unknown, unknown>> = new Map();
  private pools: Map<string, ObjectPool<unknown>> = new Map();
  private monitorTimer: NodeJS.Timeout | null = null;
  private highWaterMark: number = 500 * 1024 * 1024;

  private constructor() {
    super();
  }

  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  createCache<K, V>(name: string, options?: CacheOptions): LRUCache<K, V> {
    if (this.caches.has(name)) {
      return this.caches.get(name) as LRUCache<K, V>;
    }

    const cache = new LRUCache<K, V>(options);
    this.caches.set(name, cache as LRUCache<unknown, unknown>);
    logger.info('cache_created', `缓存 ${name} 已创建`, { options });
    return cache;
  }

  getCache<K, V>(name: string): LRUCache<K, V> | undefined {
    return this.caches.get(name) as LRUCache<K, V> | undefined;
  }

  createPool<T>(name: string, options: ObjectPoolOptions<T>): ObjectPool<T> {
    if (this.pools.has(name)) {
      return this.pools.get(name) as ObjectPool<T>;
    }

    const pool = new ObjectPool<T>(options);
    this.pools.set(name, pool as ObjectPool<unknown>);
    logger.info('pool_created', `对象池 ${name} 已创建`);
    return pool;
  }

  getPool<T>(name: string): ObjectPool<T> | undefined {
    return this.pools.get(name) as ObjectPool<T> | undefined;
  }

  startMonitoring(intervalMs: number = 30000): void {
    if (this.monitorTimer) return;

    this.monitorTimer = setInterval(() => {
      const stats = this.getStats();
      this.emit('memory:stats', stats);

      if (stats.heapUsed > this.highWaterMark) {
        this.emit('memory:high', stats);
        logger.warn('memory_high', '内存使用过高', {
          heapUsed: stats.heapUsed,
          highWaterMark: this.highWaterMark
        });
        this.performGC();
      }
    }, intervalMs);

    this.monitorTimer.unref();
    logger.info('monitor_started', '内存监控已启动');
  }

  stopMonitoring(): void {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
      logger.info('monitor_stopped', '内存监控已停止');
    }
  }

  setHighWaterMark(bytes: number): void {
    this.highWaterMark = bytes;
  }

  getStats(): MemoryStats {
    const mem = process.memoryUsage();
    
    const poolUsage: Record<string, { used: number; total: number }> = {};
    for (const [name, pool] of this.pools) {
      const stats = pool.stats;
      poolUsage[name] = {
        used: stats.inUse,
        total: stats.maxSize
      };
    }

    let totalHits = 0;
    let totalMisses = 0;
    for (const cache of this.caches.values()) {
      totalHits += cache.stats.hits;
      totalMisses += cache.stats.misses;
    }

    return {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      rss: mem.rss,
      cacheHits: totalHits,
      cacheMisses: totalMisses,
      poolUsage
    };
  }

  performGC(): void {
    logger.info('gc_triggered', '触发GC清理');
    
    for (const cache of this.caches.values()) {
      cache.cleanup();
    }

    if (global.gc) {
      try {
        global.gc();
        logger.info('gc_completed', 'GC完成');
      } catch (e) {
        logger.warn('gc_failed', 'GC执行失败');
      }
    }

    this.emit('memory:gc');
  }

  shutdown(): void {
    this.stopMonitoring();
    
    for (const cache of this.caches.values()) {
      cache.destroy();
    }
    this.caches.clear();

    for (const pool of this.pools.values()) {
      pool.clear();
    }
    this.pools.clear();

    logger.info('shutdown', 'MemoryManager 已关闭');
  }
}

export const memoryManager = MemoryManager.getInstance();
export default MemoryManager;
