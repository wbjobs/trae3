import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import { CacheEntry, CacheStats } from '@shared/types';
import { CACHE_MAX_SIZE, CACHE_DEFAULT_TTL, CACHE_DB_NAME, CACHE_STORE_NAME } from '@shared/constants';

class LocalCacheService {
  private memoryCache: Map<string, CacheEntry> = new Map();
  private cacheDir: string = '';
  private indexFile: string = '';
  private initialized: boolean = false;
  private hits: number = 0;
  private misses: number = 0;

  async initialize(baseDir: string): Promise<void> {
    if (this.initialized) return;

    this.cacheDir = path.join(baseDir, 'cache');
    this.indexFile = path.join(this.cacheDir, 'index.json');

    await fs.ensureDir(this.cacheDir);

    await this.loadIndex();
    this.initialized = true;
  }

  private async loadIndex(): Promise<void> {
    try {
      if (await fs.pathExists(this.indexFile)) {
        const raw = await fs.readFile(this.indexFile, 'utf-8');
        const entries: CacheEntry[] = JSON.parse(raw);
        for (const entry of entries) {
          this.memoryCache.set(entry.key, entry);
        }
      }
    } catch {
      this.memoryCache.clear();
    }
  }

  private async saveIndex(): Promise<void> {
    const entries = Array.from(this.memoryCache.values());
    await fs.writeFile(this.indexFile, JSON.stringify(entries, null, 2), 'utf-8');
  }

  async get(key: string): Promise<Buffer | null> {
    const entry = this.memoryCache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    if (entry.expiresAt && new Date(entry.expiresAt).getTime() < Date.now()) {
      await this.delete(key);
      this.misses++;
      return null;
    }

    const filePath = this.getFilePath(entry.key);
    try {
      const data = await fs.readFile(filePath);
      entry.accessedAt = new Date().toISOString();
      this.hits++;
      await this.saveIndex();
      return data;
    } catch {
      this.memoryCache.delete(key);
      this.misses++;
      return null;
    }
  }

  async set(
    key: string,
    data: Buffer | string,
    ttl?: number
  ): Promise<void> {
    const buffer = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;

    const currentStats = this.getStatsSync();
    if (currentStats.totalSize + buffer.length > CACHE_MAX_SIZE) {
      await this.evict(buffer.length);
    }

    const existing = this.memoryCache.get(key);
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + (ttl ?? CACHE_DEFAULT_TTL)).toISOString();

    const entry: CacheEntry = {
      key,
      data: buffer.toString('base64'),
      size: buffer.length,
      accessedAt: now,
      createdAt: existing?.createdAt ?? now,
      expiresAt,
    };

    const filePath = this.getFilePath(key);
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, buffer);

    this.memoryCache.set(key, entry);
    await this.saveIndex();
  }

  async delete(key: string): Promise<boolean> {
    const entry = this.memoryCache.get(key);
    if (!entry) return false;

    const filePath = this.getFilePath(key);
    try {
      await fs.unlink(filePath);
    } catch {
      // file may not exist
    }

    this.memoryCache.delete(key);
    await this.saveIndex();
    return true;
  }

  async clear(): Promise<void> {
    for (const key of this.memoryCache.keys()) {
      const filePath = this.getFilePath(key);
      try { await fs.unlink(filePath); } catch { /* ignore */ }
    }
    this.memoryCache.clear();
    this.hits = 0;
    this.misses = 0;
    await this.saveIndex();
  }

  getStats(): CacheStats {
    return this.getStatsSync();
  }

  private getStatsSync(): CacheStats {
    let totalSize = 0;
    for (const entry of this.memoryCache.values()) {
      totalSize += entry.size;
    }

    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0;

    return {
      totalEntries: this.memoryCache.size,
      totalSize,
      maxCapacity: CACHE_MAX_SIZE,
      hitRate: Math.round(hitRate * 100) / 100,
    };
  }

  async has(key: string): Promise<boolean> {
    const entry = this.memoryCache.get(key);
    if (!entry) return false;
    if (entry.expiresAt && new Date(entry.expiresAt).getTime() < Date.now()) {
      await this.delete(key);
      return false;
    }
    return true;
  }

  async evict(requiredSpace: number): Promise<number> {
    const entries = Array.from(this.memoryCache.values()).sort(
      (a, b) => new Date(a.accessedAt).getTime() - new Date(b.accessedAt).getTime()
    );

    let freed = 0;
    for (const entry of entries) {
      if (freed >= requiredSpace) break;
      await this.delete(entry.key);
      freed += entry.size;
    }

    return freed;
  }

  async cleanupExpired(): Promise<number> {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expiresAt && new Date(entry.expiresAt).getTime() < now) {
        await this.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  private getFilePath(key: string): string {
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    const subdir = hash.substring(0, 2);
    return path.join(this.cacheDir, subdir, hash);
  }
}

export const localCacheService = new LocalCacheService();
export { LocalCacheService };
