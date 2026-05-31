import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Player, GameRecord } from '../../../shared/types.js';
import { IDGenerator } from '../../utils/IDGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface LRUCacheEntry<T> {
  value: T;
  lastAccess: number;
}

class LRUCache<K, V> {
  private cache: Map<K, LRUCacheEntry<V>> = new Map();
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      entry.lastAccess = Date.now();
      return entry.value;
    }
    return undefined;
  }

  set(key: K, value: V): void {
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictOldest();
    }
    this.cache.set(key, { value, lastAccess: Date.now() });
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  private evictOldest(): void {
    let oldestKey: K | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      this.cache.delete(oldestKey);
    }
  }

  size(): number {
    return this.cache.size;
  }

  values(): V[] {
    return Array.from(this.cache.values()).map(e => e.value);
  }
}

export interface PlayerData {
  id: string;
  nickname: string;
  createdAt: number;
  totalGames: number;
  wins: number;
  kills: number;
  playTime: number;
}

interface WriteBuffer {
  players: PlayerData[];
  records: GameRecord[];
  timeout: NodeJS.Timeout | null;
}

export class Database {
  private static instance: Database;
  private dbDir: string;
  private playersFile: string;
  private recordsFile: string;

  private playerCache: LRUCache<string, PlayerData>;
  private recordsCache: LRUCache<string, GameRecord>;

  private writeBuffer: WriteBuffer;
  private writeDelay: number = 1000;
  private isWriting: boolean = false;

  private stats = {
    cacheHits: 0,
    cacheMisses: 0,
    totalWrites: 0,
    bufferedWrites: 0
  };

  private constructor() {
    this.dbDir = path.resolve(__dirname, '..', '..', '..', 'database');
    this.playersFile = path.join(this.dbDir, 'players.json');
    this.recordsFile = path.join(this.dbDir, 'records.json');

    this.playerCache = new LRUCache<string, PlayerData>(200);
    this.recordsCache = new LRUCache<string, GameRecord>(500);

    this.writeBuffer = {
      players: [],
      records: [],
      timeout: null
    };

    this.init();
  }

  static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  private init(): void {
    try {
      if (!fs.existsSync(this.dbDir)) {
        fs.mkdirSync(this.dbDir, { recursive: true });
      }

      if (fs.existsSync(this.playersFile)) {
        const data = JSON.parse(fs.readFileSync(this.playersFile, 'utf-8'));
        if (Array.isArray(data)) {
          for (const p of data) {
            this.playerCache.set(p.id, p);
          }
        }
      }

      if (fs.existsSync(this.recordsFile)) {
        const data = JSON.parse(fs.readFileSync(this.recordsFile, 'utf-8'));
        if (Array.isArray(data)) {
          for (const r of data.slice(0, 500)) {
            this.recordsCache.set(r.id, r);
          }
        }
      }
    } catch (e) {
      console.warn('[Database] 加载数据失败，使用空数据:', e);
    }

    console.log(`[Database] 初始化完成 - 缓存玩家: ${this.playerCache.size()}, 记录: ${this.recordsCache.size()}`);
  }

  private scheduleWrite(): void {
    if (this.writeBuffer.timeout) {
      return;
    }

    this.writeBuffer.timeout = setTimeout(() => {
      this.flushWrites();
    }, this.writeDelay);
  }

  private flushWrites(): void {
    if (this.isWriting) {
      this.writeBuffer.timeout = null;
      this.scheduleWrite();
      return;
    }

    this.isWriting = true;
    this.writeBuffer.timeout = null;

    const playersToWrite = [...this.writeBuffer.players];
    const recordsToWrite = [...this.writeBuffer.records];
    this.writeBuffer.players = [];
    this.writeBuffer.records = [];

    if (playersToWrite.length > 0) {
      try {
        const allPlayers = this.playerCache.values();
        fs.writeFileSync(this.playersFile, JSON.stringify(allPlayers, null, 2), 'utf-8');
        this.stats.totalWrites++;
        this.stats.bufferedWrites += playersToWrite.length;
      } catch (error) {
        console.error('[Database] 写入玩家数据失败:', error);
        this.writeBuffer.players.push(...playersToWrite);
      }
    }

    if (recordsToWrite.length > 0) {
      try {
        const allRecords = this.getAllRecordsSync();
        fs.writeFileSync(this.recordsFile, JSON.stringify(allRecords, null, 2), 'utf-8');
        this.stats.totalWrites++;
        this.stats.bufferedWrites += recordsToWrite.length;
      } catch (error) {
        console.error('[Database] 写入对局记录失败:', error);
        this.writeBuffer.records.push(...recordsToWrite);
      }
    }

    this.isWriting = false;

    if (this.writeBuffer.players.length > 0 || this.writeBuffer.records.length > 0) {
      this.scheduleWrite();
    }
  }

  private getAllRecordsSync(): GameRecord[] {
    try {
      if (fs.existsSync(this.recordsFile)) {
        return JSON.parse(fs.readFileSync(this.recordsFile, 'utf-8'));
      }
    } catch (e) {
      console.warn('[Database] 读取记录失败:', e);
    }
    return [];
  }

  findOrCreatePlayer(nickname: string): PlayerData {
    for (const player of this.playerCache.values()) {
      if (player.nickname.toLowerCase() === nickname.toLowerCase()) {
        this.stats.cacheHits++;
        return player;
      }
    }

    const newPlayer: PlayerData = {
      id: IDGenerator.generate(),
      nickname,
      createdAt: Date.now(),
      totalGames: 0,
      wins: 0,
      kills: 0,
      playTime: 0
    };

    this.playerCache.set(newPlayer.id, newPlayer);
    this.stats.cacheMisses++;
    this.writeBuffer.players.push(newPlayer);
    this.scheduleWrite();

    console.log(`[Database] 创建新玩家: ${nickname}`);
    return newPlayer;
  }

  getPlayer(id: string): PlayerData | undefined {
    const cached = this.playerCache.get(id);
    if (cached) {
      this.stats.cacheHits++;
      return cached;
    }
    this.stats.cacheMisses++;
    return undefined;
  }

  updatePlayerStats(playerId: string, stats: Partial<PlayerData>): void {
    const player = this.playerCache.get(playerId);
    if (player) {
      Object.assign(player, stats);
      this.stats.cacheHits++;
      this.writeBuffer.players.push(player);
      this.scheduleWrite();
    }
  }

  addGameRecord(record: GameRecord): void {
    this.recordsCache.set(record.id, record);

    for (const stat of record.playerStats) {
      const player = this.playerCache.get(stat.playerId);
      if (player) {
        player.totalGames++;
        player.kills += stat.kills;
        player.playTime += record.duration;
        if (record.winnerId === stat.playerId) {
          player.wins++;
        }
        this.writeBuffer.players.push(player);
      }
    }

    this.writeBuffer.records.push(record);
    this.scheduleWrite();
    console.log(`[Database] 缓存对局记录: ${record.id}, 时长: ${Math.round(record.duration / 1000)}秒`);
  }

  getGameRecords(limit: number = 50): GameRecord[] {
    const records = this.recordsCache.values();
    records.sort((a, b) => b.endTime - a.endTime);
    this.stats.cacheHits++;
    return records.slice(0, limit);
  }

  getPlayerRecords(playerId: string, limit: number = 20): GameRecord[] {
    const playerRecords: GameRecord[] = [];

    for (const record of this.recordsCache.values()) {
      if (record.playerStats.some(s => s.playerId === playerId)) {
        playerRecords.push(record);
      }
    }

    playerRecords.sort((a, b) => b.endTime - a.endTime);
    this.stats.cacheHits++;
    return playerRecords.slice(0, limit);
  }

  getLeaderboard(limit: number = 10): PlayerData[] {
    const players = this.playerCache.values();
    players.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.kills - a.kills;
    });
    this.stats.cacheHits++;
    return players.slice(0, limit);
  }

  forceFlush(): void {
    if (this.writeBuffer.timeout) {
      clearTimeout(this.writeBuffer.timeout);
    }
    this.flushWrites();
  }

  getStats() {
    const cacheHitRate = this.stats.cacheHits + this.stats.cacheMisses > 0
      ? Math.round((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100)
      : 0;

    return {
      ...this.stats,
      cacheHitRate,
      playerCacheSize: this.playerCache.size(),
      recordCacheSize: this.recordsCache.size(),
      pendingPlayers: this.writeBuffer.players.length,
      pendingRecords: this.writeBuffer.records.length
    };
  }

  shutdown(): void {
    this.forceFlush();
    console.log('[Database] 已关闭，所有缓存已写入磁盘');
    console.log('[Database] 统计:', JSON.stringify(this.getStats()));
  }
}
