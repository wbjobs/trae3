import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { DatabaseManager } from '../database/DatabaseManager';
import { CacheEntry, AppConfig } from '../../shared/types';

export class CacheManager {
  private db: DatabaseManager;
  private cacheDir: string;
  private static instance: CacheManager;
  private memoryCache: Map<string, CacheEntry<unknown>> = new Map();
  private maxMemoryCacheSize: number = 100;

  private constructor(db: DatabaseManager, config: AppConfig) {
    this.db = db;
    this.cacheDir = config.cacheDir;
    this.ensureCacheDir();
    this.startCleanupJob();
  }

  public static getInstance(db?: DatabaseManager, config?: AppConfig): CacheManager {
    if (!CacheManager.instance) {
      if (!db || !config) {
        throw new Error('DatabaseManager and config must be provided for first initialization');
      }
      CacheManager.instance = new CacheManager(db, config);
    }
    return CacheManager.instance;
  }

  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  public updateConfig(config: AppConfig): void {
    this.cacheDir = config.cacheDir;
    this.ensureCacheDir();
  }

  public get<T>(key: string): T | null {
    const memoryEntry = this.memoryCache.get(key) as CacheEntry<T> | undefined;
    if (memoryEntry && this.isValid(memoryEntry)) {
      return memoryEntry.data;
    }

    const dbEntry = this.db.getCache<T>(key);
    if (dbEntry && this.isValid(dbEntry)) {
      this.memoryCache.set(key, dbEntry);
      this.trimMemoryCache();
      return dbEntry.data;
    }

    const fileEntry = this.readFromFile<T>(key);
    if (fileEntry && this.isValid(fileEntry)) {
      this.db.setCache(key, fileEntry.data, fileEntry.expiresAt ? fileEntry.expiresAt - Date.now() : undefined);
      this.memoryCache.set(key, fileEntry);
      this.trimMemoryCache();
      return fileEntry.data;
    }

    return null;
  }

  public set<T>(key: string, data: T, ttl?: number): void {
    const now = Date.now();
    const entry: CacheEntry<T> = {
      key,
      data,
      timestamp: now,
      expiresAt: ttl ? now + ttl : undefined,
    };

    this.memoryCache.set(key, entry);
    this.trimMemoryCache();

    this.db.setCache(key, data, ttl);

    this.writeToFile(key, entry);
  }

  public has(key: string): boolean {
    return this.get(key) !== null;
  }

  public delete(key: string): void {
    this.memoryCache.delete(key);
    this.db.clearCache(key);
    this.deleteFile(key);
  }

  public clear(): void {
    this.memoryCache.clear();
    this.db.clearCache();
    this.clearCacheDir();
  }

  public getEntry<T>(key: string): CacheEntry<T> | null {
    const memoryEntry = this.memoryCache.get(key) as CacheEntry<T> | undefined;
    if (memoryEntry && this.isValid(memoryEntry)) {
      return memoryEntry;
    }

    const dbEntry = this.db.getCache<T>(key);
    if (dbEntry && this.isValid(dbEntry)) {
      return dbEntry;
    }

    const fileEntry = this.readFromFile<T>(key);
    if (fileEntry && this.isValid(fileEntry)) {
      return fileEntry;
    }

    return null;
  }

  public getKeys(pattern?: string): string[] {
    const keys: Set<string> = new Set();

    this.memoryCache.forEach((_, key) => {
      if (!pattern || key.includes(pattern)) {
        keys.add(key);
      }
    });

    try {
      if (fs.existsSync(this.cacheDir)) {
        const files = fs.readdirSync(this.cacheDir);
        files.forEach(file => {
          const key = file.replace('.json', '');
          if (!pattern || key.includes(pattern)) {
            keys.add(key);
          }
        });
      }
    } catch (error) {
      console.error('Error reading cache directory:', error);
    }

    return Array.from(keys);
  }

  public getSize(): { memory: number; disk: number; database: number } {
    let memorySize = 0;
    this.memoryCache.forEach(entry => {
      memorySize += Buffer.byteLength(JSON.stringify(entry.data), 'utf8');
    });

    let diskSize = 0;
    try {
      if (fs.existsSync(this.cacheDir)) {
        const files = fs.readdirSync(this.cacheDir);
        files.forEach(file => {
          const filePath = path.join(this.cacheDir, file);
          const stats = fs.statSync(filePath);
          diskSize += stats.size;
        });
      }
    } catch (error) {
      console.error('Error calculating disk cache size:', error);
    }

    return {
      memory: memorySize,
      disk: diskSize,
      database: -1,
    };
  }

  public cleanupExpired(): number {
    let removedCount = 0;

    const now = Date.now();
    const keysToRemove: string[] = [];
    this.memoryCache.forEach((entry, key) => {
      if (!this.isValid(entry)) {
        keysToRemove.push(key);
      }
    });
    keysToRemove.forEach(key => {
      this.memoryCache.delete(key);
      removedCount++;
    });

    try {
      if (fs.existsSync(this.cacheDir)) {
        const files = fs.readdirSync(this.cacheDir);
        files.forEach(file => {
          const filePath = path.join(this.cacheDir, file);
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            const entry: CacheEntry<unknown> = JSON.parse(content);
            if (entry.expiresAt && entry.expiresAt <= now) {
              fs.unlinkSync(filePath);
              removedCount++;
            }
          } catch {
            fs.unlinkSync(filePath);
            removedCount++;
          }
        });
      }
    } catch (error) {
      console.error('Error cleaning up disk cache:', error);
    }

    this.db.cleanupExpiredCache();

    return removedCount;
  }

  private isValid<T>(entry: CacheEntry<T>): boolean {
    if (!entry.expiresAt) return true;
    return entry.expiresAt > Date.now();
  }

  private trimMemoryCache(): void {
    if (this.memoryCache.size <= this.maxMemoryCacheSize) return;

    const entries = Array.from(this.memoryCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    const removeCount = this.memoryCache.size - this.maxMemoryCacheSize;
    for (let i = 0; i < removeCount; i++) {
      this.memoryCache.delete(entries[i][0]);
    }
  }

  private getCacheFilePath(key: string): string {
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.cacheDir, `${safeKey}.json`);
  }

  private readFromFile<T>(key: string): CacheEntry<T> | null {
    const filePath = this.getCacheFilePath(key);
    try {
      if (!fs.existsSync(filePath)) return null;
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content) as CacheEntry<T>;
    } catch {
      return null;
    }
  }

  private writeToFile<T>(key: string, entry: CacheEntry<T>): void {
    const filePath = this.getCacheFilePath(key);
    try {
      fs.writeFileSync(filePath, JSON.stringify(entry), 'utf8');
    } catch (error) {
      console.error('Error writing cache file:', error);
    }
  }

  private deleteFile(key: string): void {
    const filePath = this.getCacheFilePath(key);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error('Error deleting cache file:', error);
    }
  }

  private clearCacheDir(): void {
    try {
      if (fs.existsSync(this.cacheDir)) {
        const files = fs.readdirSync(this.cacheDir);
        files.forEach(file => {
          const filePath = path.join(this.cacheDir, file);
          fs.unlinkSync(filePath);
        });
      }
    } catch (error) {
      console.error('Error clearing cache directory:', error);
    }
  }

  private startCleanupJob(): void {
    setInterval(() => {
      this.cleanupExpired();
    }, 3600000);
  }

  public getStats(): {
    itemCount: number;
    totalSize: number;
    hitRate: number;
    lastCleanup: number;
  } {
    const keys = this.getKeys();
    const sizes = this.getSize();
    return {
      itemCount: keys.length,
      totalSize: sizes.memory + sizes.disk,
      hitRate: 0,
      lastCleanup: Date.now(),
    };
  }
}
