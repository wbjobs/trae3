import type { GameState, Player, Unit, TacticalPlan, GameReplay, GameAction } from '../shared/types';
import { generateId, deepClone } from '../shared/utils';
import { logger } from './logger';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

interface DatabaseSchema {
  games: Record<string, GameState>;
  battleLogs: Record<string, GameAction[]>;
  tacticalPlans: Record<string, TacticalPlan>;
  replays: Record<string, GameReplay>;
  version: string;
  checksum: string;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  accessCount: number;
}

interface PendingOperation {
  type: 'create' | 'update' | 'delete';
  collection: string;
  id: string;
  data?: any;
  timestamp: number;
}

const DATABASE_VERSION = '2.0';
const MAX_CACHE_SIZE = 100;
const CACHE_TTL = 5 * 60 * 1000;
const BATCH_FLUSH_INTERVAL = 50;
const MAX_PENDING_OPS = 500;

export class DatabaseManager {
  private data: DatabaseSchema;
  private dbPath: string;
  private autoSave: boolean;
  private saveTimeout: NodeJS.Timeout | null = null;
  private isSaving: boolean = false;
  private pendingSave: boolean = false;

  private cache: Map<string, CacheEntry<any>> = new Map();
  private pendingOperations: PendingOperation[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private isFlushing: boolean = false;
  private cacheHits: number = 0;
  private cacheMisses: number = 0;

  constructor(dbPath: string, autoSave: boolean = true) {
    this.dbPath = dbPath;
    this.autoSave = autoSave;
    this.data = this.createEmptySchema();
  }

  private createEmptySchema(): DatabaseSchema {
    return {
      games: {},
      battleLogs: {},
      tacticalPlans: {},
      replays: {},
      version: DATABASE_VERSION,
      checksum: ''
    };
  }

  private calculateChecksum(data: Omit<DatabaseSchema, 'checksum'>): string {
    const dataStr = JSON.stringify({
      games: data.games,
      battleLogs: data.battleLogs,
      tacticalPlans: data.tacticalPlans,
      replays: data.replays,
      version: data.version
    });
    return crypto.createHash('sha256').update(dataStr).digest('hex');
  }

  private validateChecksum(data: DatabaseSchema): boolean {
    if (!data.checksum) return true;
    const calculated = this.calculateChecksum({
      games: data.games,
      battleLogs: data.battleLogs,
      tacticalPlans: data.tacticalPlans,
      replays: data.replays,
      version: data.version
    });
    return calculated === data.checksum;
  }

  private getCacheKey(collection: string, id: string): string {
    return `${collection}:${id}`;
  }

  private getFromCache<T>(collection: string, id: string): T | null {
    const key = this.getCacheKey(collection, id);
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.cacheMisses++;
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > CACHE_TTL) {
      this.cache.delete(key);
      this.cacheMisses++;
      return null;
    }

    entry.accessCount++;
    entry.timestamp = now;
    this.cacheHits++;
    return deepClone(entry.data);
  }

  private setInCache<T>(collection: string, id: string, data: T): void {
    const key = this.getCacheKey(collection, id);
    
    if (this.cache.size >= MAX_CACHE_SIZE) {
      const entries = Array.from(this.cache.entries())
        .sort((a, b) => a[1].accessCount - b[1].accessCount || a[1].timestamp - b[1].timestamp);
      this.cache.delete(entries[0][0]);
    }

    this.cache.set(key, {
      data: deepClone(data),
      timestamp: Date.now(),
      accessCount: 1
    });
  }

  private invalidateCache(collection: string, id: string): void {
    const key = this.getCacheKey(collection, id);
    this.cache.delete(key);
  }

  private invalidateCacheByCollection(collection: string): void {
    const prefix = `${collection}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  private queueOperation(op: Omit<PendingOperation, 'timestamp'>): void {
    this.pendingOperations.push({
      ...op,
      timestamp: Date.now()
    });

    if (this.pendingOperations.length >= MAX_PENDING_OPS) {
      this.flushBatch();
    } else if (!this.batchTimeout) {
      this.batchTimeout = setTimeout(() => this.flushBatch(), BATCH_FLUSH_INTERVAL);
    }
  }

  private flushBatch(): void {
    if (this.isFlushing || this.pendingOperations.length === 0) {
      return;
    }

    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    this.isFlushing = true;
    const ops = [...this.pendingOperations];
    this.pendingOperations = [];

    try {
      const opsByCollection = new Map<string, Map<string, PendingOperation>>();
      
      for (const op of ops) {
        if (!opsByCollection.has(op.collection)) {
          opsByCollection.set(op.collection, new Map());
        }
        opsByCollection.get(op.collection)!.set(op.id, op);
      }

      for (const [collection, idMap] of opsByCollection) {
        for (const [id, op] of idMap) {
          this.invalidateCache(collection, id);
        }
      }

      this.scheduleSave();
      logger.debug('Batch flushed', { operations: ops.length, collections: opsByCollection.size });
    } catch (error) {
      logger.error('Failed to flush batch', { error: error as Error });
    } finally {
      this.isFlushing = false;
    }
  }

  private backupDatabase(): void {
    try {
      if (!fs.existsSync(this.dbPath)) return;

      const backupDir = path.join(path.dirname(this.dbPath), 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `game_${timestamp}.db.backup`);

      fs.copyFileSync(this.dbPath, backupPath);
      logger.info('Database backup created', { backupPath });

      const backups = fs.readdirSync(backupDir)
        .filter(f => f.endsWith('.db.backup'))
        .sort()
        .reverse();

      if (backups.length > 20) {
        for (let i = 20; i < backups.length; i++) {
          fs.unlinkSync(path.join(backupDir, backups[i]));
        }
      }
    } catch (error) {
      logger.warn('Failed to create database backup', { error: error as Error });
    }
  }

  private restoreFromBackup(): boolean {
    try {
      const backupDir = path.join(path.dirname(this.dbPath), 'backups');
      if (!fs.existsSync(backupDir)) return false;

      const backups = fs.readdirSync(backupDir)
        .filter(f => f.endsWith('.db.backup'))
        .sort()
        .reverse();

      for (const backup of backups) {
        try {
          const backupPath = path.join(backupDir, backup);
          const rawData = fs.readFileSync(backupPath, 'utf8');
          const parsed = JSON.parse(rawData);
          if (this.validateChecksum(parsed)) {
            fs.copyFileSync(backupPath, this.dbPath);
            logger.info('Database restored from backup', { backupPath });
            return true;
          }
        } catch {
          continue;
        }
      }
      return false;
    } catch (error) {
      logger.warn('Failed to restore from backup', { error: error as Error });
      return false;
    }
  }

  async init(): Promise<void> {
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    if (fs.existsSync(this.dbPath)) {
      try {
        const rawData = fs.readFileSync(this.dbPath, 'utf8');

        if (rawData.trim().length === 0) {
          throw new Error('Database file is empty');
        }

        const parsed = JSON.parse(rawData);

        if (!this.validateChecksum(parsed)) {
          throw new Error('Database checksum mismatch - data may be corrupted');
        }

        this.data = this.deserializeData(parsed);
        logger.info('Database loaded from file', {
          dbPath: this.dbPath,
          gameCount: Object.keys(this.data.games).length,
          planCount: Object.keys(this.data.tacticalPlans).length,
          replayCount: Object.keys(this.data.replays).length,
          version: this.data.version
        });
        return;
      } catch (error) {
        logger.warn('Database corrupted, attempting recovery', { error: error as Error });

        this.backupDatabase();

        if (this.restoreFromBackup()) {
          try {
            const rawData = fs.readFileSync(this.dbPath, 'utf8');
            const parsed = JSON.parse(rawData);
            this.data = this.deserializeData(parsed);
            logger.info('Database recovered from backup');
            return;
          } catch (restoreError) {
            logger.warn('Backup restore failed, creating new database', { restoreError });
          }
        }

        logger.warn('Creating fresh database', { dbPath: this.dbPath });
      }
    }

    this.data = this.createEmptySchema();
    logger.info('New database created', { dbPath: this.dbPath, version: DATABASE_VERSION });
  }

  private deserializeData(data: any): DatabaseSchema {
    const schema = this.createEmptySchema();
    schema.version = data.version || DATABASE_VERSION;
    schema.checksum = data.checksum || '';

    for (const gameId in data.games) {
      try {
        const game = data.games[gameId];
        schema.games[gameId] = {
          ...game,
          createdAt: new Date(game.createdAt),
          updatedAt: new Date(game.updatedAt),
          players: (game.players || []).map((p: any) => ({ ...p })),
          units: (game.units || []).map((u: any) => ({ 
            ...u, 
            position: { ...u.position },
            hasMoved: u.hasMoved ?? false,
            hasAttacked: u.hasAttacked ?? false
          }))
        };
      } catch (error) {
        logger.warn('Failed to deserialize game', { gameId, error: error as Error });
      }
    }

    for (const gameId in data.battleLogs) {
      try {
        schema.battleLogs[gameId] = (data.battleLogs[gameId] || []).map((log: any) => ({
          ...log,
          timestamp: log.timestamp || Date.now()
        }));
      } catch (error) {
        logger.warn('Failed to deserialize battle logs', { gameId, error: error as Error });
        schema.battleLogs[gameId] = [];
      }
    }

    for (const planId in data.tacticalPlans) {
      try {
        const plan = data.tacticalPlans[planId];
        schema.tacticalPlans[planId] = {
          ...plan,
          createdAt: new Date(plan.createdAt),
          updatedAt: new Date(plan.updatedAt),
          deployments: (plan.deployments || []).map((d: any) => ({
            ...d,
            position: { ...d.position }
          }))
        };
      } catch (error) {
        logger.warn('Failed to deserialize tactical plan', { planId, error: error as Error });
      }
    }

    for (const replayId in data.replays) {
      try {
        const replay = data.replays[replayId];
        schema.replays[replayId] = {
          ...replay,
          initialState: this.deserializeGameState(replay.initialState),
          recordedAt: new Date(replay.recordedAt),
          actions: (replay.actions || []).map((a: any) => ({ ...a }))
        };
      } catch (error) {
        logger.warn('Failed to deserialize replay', { replayId, error: error as Error });
      }
    }

    return schema;
  }

  private deserializeGameState(game: any): GameState {
    return {
      ...game,
      createdAt: new Date(game.createdAt),
      updatedAt: new Date(game.updatedAt),
      players: (game.players || []).map((p: any) => ({ ...p })),
      units: (game.units || []).map((u: any) => ({ 
        ...u, 
        position: { ...u.position },
        hasMoved: u.hasMoved ?? false,
        hasAttacked: u.hasAttacked ?? false
      }))
    };
  }

  private scheduleSave(): void {
    if (!this.autoSave) return;

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.saveToFile();
    }, 200);
  }

  private async saveToFile(): Promise<void> {
    if (this.isSaving) {
      this.pendingSave = true;
      return;
    }

    this.isSaving = true;

    try {
      const dataToSave: Omit<DatabaseSchema, 'checksum'> = {
        games: this.data.games,
        battleLogs: this.data.battleLogs,
        tacticalPlans: this.data.tacticalPlans,
        replays: this.data.replays,
        version: this.data.version
      };

      const checksum = this.calculateChecksum(dataToSave);
      const saveData: DatabaseSchema = {
        ...dataToSave,
        checksum
      };

      const tmpPath = this.dbPath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(saveData));

      if (fs.existsSync(tmpPath)) {
        const stats = fs.statSync(tmpPath);
        if (stats.size === 0) {
          throw new Error('Temporary file is empty');
        }
      }

      fs.renameSync(tmpPath, this.dbPath);
      this.data.checksum = checksum;

      this.pendingSave = false;
      logger.debug('Database saved', { 
        checksum, 
        gameCount: Object.keys(this.data.games).length,
        planCount: Object.keys(this.data.tacticalPlans).length,
        replayCount: Object.keys(this.data.replays).length
      });
    } catch (error) {
      logger.error('Failed to save database', { error: error as Error });
      try {
        const tmpPath = this.dbPath + '.tmp';
        if (fs.existsSync(tmpPath)) {
          fs.unlinkSync(tmpPath);
        }
      } catch (cleanupError) {
        logger.warn('Failed to cleanup temp file', { error: cleanupError as Error });
      }
    } finally {
      this.isSaving = false;

      if (this.pendingSave) {
        setImmediate(() => this.saveToFile());
      }
    }
  }

  async createGame(game: GameState): Promise<string> {
    const gameId = game.id || generateId();
    const now = new Date();

    const gameToSave: GameState = {
      ...deepClone(game),
      id: gameId,
      createdAt: game.createdAt || now,
      updatedAt: game.updatedAt || now,
      players: deepClone(game.players),
      units: deepClone(game.units)
    };

    this.data.games[gameId] = gameToSave;
    this.data.battleLogs[gameId] = [];

    this.setInCache('games', gameId, gameToSave);
    this.queueOperation({ type: 'create', collection: 'games', id: gameId });
    
    logger.info('Game created', { gameId, name: game.name });
    return gameId;
  }

  async getGame(gameId: string): Promise<GameState | null> {
    const cached = this.getFromCache<GameState>('games', gameId);
    if (cached) return cached;

    const game = this.data.games[gameId];
    if (!game) return null;

    const cloned = deepClone(game);
    this.setInCache('games', gameId, cloned);
    return cloned;
  }

  async updateGame(gameId: string, updates: Partial<GameState>): Promise<void> {
    const game = this.data.games[gameId];
    if (!game) {
      logger.warn('Game not found for update', { gameId });
      return;
    }

    if (updates.name !== undefined) game.name = updates.name;
    if (updates.currentTurn !== undefined) game.currentTurn = updates.currentTurn;
    if (updates.phase !== undefined) game.phase = updates.phase;
    if (updates.status !== undefined) game.status = updates.status;
    if (updates.players !== undefined) game.players = deepClone(updates.players);
    if (updates.units !== undefined) game.units = deepClone(updates.units);
    game.updatedAt = new Date();

    this.setInCache('games', gameId, game);
    this.queueOperation({ type: 'update', collection: 'games', id: gameId });
  }

  async updateGameUnits(gameId: string, unitUpdates: { id: string; updates: Partial<Unit> }[]): Promise<void> {
    const game = this.data.games[gameId];
    if (!game) return;

    const unitMap = new Map(game.units.map(u => [u.id, u]));
    
    for (const { id, updates } of unitUpdates) {
      const unit = unitMap.get(id);
      if (unit) {
        Object.assign(unit, updates);
      }
    }

    game.updatedAt = new Date();
    this.invalidateCache('games', gameId);
    this.queueOperation({ type: 'update', collection: 'games', id: gameId });
  }

  async listGames(status?: string): Promise<GameState[]> {
    const gameIds = Object.keys(this.data.games);
    const games: GameState[] = [];

    for (const id of gameIds) {
      const cached = this.getFromCache<GameState>('games', id);
      if (cached) {
        games.push(cached);
      } else {
        const game = this.data.games[id];
        if (game) {
          const cloned = deepClone(game);
          this.setInCache('games', id, cloned);
          games.push(cloned);
        }
      }
    }

    let filteredGames = games;
    if (status) {
      filteredGames = games.filter(g => g.status === status);
    }

    filteredGames.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return filteredGames;
  }

  async addPlayerToGame(gameId: string, player: Player): Promise<void> {
    const game = this.data.games[gameId];
    if (!game) {
      logger.warn('Game not found for addPlayer', { gameId, playerId: player.id });
      return;
    }

    const existingIndex = game.players.findIndex(p => p.id === player.id);
    if (existingIndex >= 0) {
      game.players[existingIndex] = deepClone(player);
    } else {
      game.players.push(deepClone(player));
    }
    game.updatedAt = new Date();

    this.invalidateCache('games', gameId);
    this.queueOperation({ type: 'update', collection: 'games', id: gameId });
    logger.info('Player added to game', { gameId, playerId: player.id });
  }

  async removePlayerFromGame(gameId: string, playerId: string): Promise<void> {
    const game = this.data.games[gameId];
    if (!game) {
      logger.warn('Game not found for removePlayer', { gameId, playerId });
      return;
    }

    const playerIndex = game.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) {
      logger.warn('Player not found in game for removal', { gameId, playerId });
      return;
    }

    game.players.splice(playerIndex, 1);
    game.updatedAt = new Date();

    this.invalidateCache('games', gameId);
    this.queueOperation({ type: 'update', collection: 'games', id: gameId });
  }

  async saveUnit(gameId: string, unit: Unit): Promise<void> {
    const game = this.data.games[gameId];
    if (!game) {
      logger.warn('Game not found for saveUnit', { gameId, unitId: unit.id });
      return;
    }

    const existingIndex = game.units.findIndex(u => u.id === unit.id);
    if (existingIndex >= 0) {
      game.units[existingIndex] = deepClone(unit);
    } else {
      game.units.push(deepClone(unit));
    }
    game.updatedAt = new Date();

    this.invalidateCache('games', gameId);
    this.queueOperation({ type: 'update', collection: 'games', id: gameId });
  }

  async saveBattleLog(gameId: string, action: GameAction): Promise<void> {
    if (!this.data.battleLogs[gameId]) {
      this.data.battleLogs[gameId] = [];
    }

    this.data.battleLogs[gameId].push(action);

    if (this.data.battleLogs[gameId].length > 5000) {
      this.data.battleLogs[gameId] = this.data.battleLogs[gameId].slice(-5000);
    }

    this.queueOperation({ type: 'update', collection: 'battleLogs', id: gameId });
  }

  async getBattleLogs(gameId: string): Promise<GameAction[]> {
    const cached = this.getFromCache<GameAction[]>('battleLogs', gameId);
    if (cached) return cached;

    const logs = this.data.battleLogs[gameId] || [];
    const cloned = deepClone(logs);
    this.setInCache('battleLogs', gameId, cloned);
    return cloned;
  }

  async deleteGame(gameId: string): Promise<boolean> {
    if (!this.data.games[gameId]) {
      return false;
    }

    delete this.data.games[gameId];
    delete this.data.battleLogs[gameId];

    this.invalidateCache('games', gameId);
    this.invalidateCache('battleLogs', gameId);
    this.queueOperation({ type: 'delete', collection: 'games', id: gameId });
    
    logger.info('Game deleted', { gameId });
    return true;
  }

  async saveTacticalPlan(plan: Omit<TacticalPlan, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<TacticalPlan> {
    const planId = plan.id || generateId();
    const now = new Date();

    const existingPlan = this.data.tacticalPlans[planId];
    const planToSave: TacticalPlan = {
      ...deepClone(plan),
      id: planId,
      createdAt: existingPlan?.createdAt || now,
      updatedAt: now
    };

    this.data.tacticalPlans[planId] = planToSave;
    this.setInCache('tacticalPlans', planId, planToSave);
    this.queueOperation({ type: existingPlan ? 'update' : 'create', collection: 'tacticalPlans', id: planId });
    
    logger.info('Tactical plan saved', { planId, name: plan.name });
    return deepClone(planToSave);
  }

  async getTacticalPlan(planId: string): Promise<TacticalPlan | null> {
    const cached = this.getFromCache<TacticalPlan>('tacticalPlans', planId);
    if (cached) return cached;

    const plan = this.data.tacticalPlans[planId];
    if (!plan) return null;

    const cloned = deepClone(plan);
    this.setInCache('tacticalPlans', planId, cloned);
    return cloned;
  }

  async listTacticalPlans(playerId?: string): Promise<TacticalPlan[]> {
    const planIds = Object.keys(this.data.tacticalPlans);
    const plans: TacticalPlan[] = [];

    for (const id of planIds) {
      const cached = this.getFromCache<TacticalPlan>('tacticalPlans', id);
      const plan = cached || this.data.tacticalPlans[id];
      if (plan && (!playerId || plan.playerId === playerId)) {
        if (!cached) {
          const cloned = deepClone(plan);
          this.setInCache('tacticalPlans', id, cloned);
          plans.push(cloned);
        } else {
          plans.push(cached);
        }
      }
    }

    plans.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return plans;
  }

  async deleteTacticalPlan(planId: string): Promise<boolean> {
    if (!this.data.tacticalPlans[planId]) {
      return false;
    }

    delete this.data.tacticalPlans[planId];
    this.invalidateCache('tacticalPlans', planId);
    this.queueOperation({ type: 'delete', collection: 'tacticalPlans', id: planId });
    
    logger.info('Tactical plan deleted', { planId });
    return true;
  }

  async saveReplay(replay: Omit<GameReplay, 'id' | 'recordedAt'> & { id?: string }): Promise<GameReplay> {
    const replayId = replay.id || generateId();
    const now = new Date();

    const replayToSave: GameReplay = {
      ...deepClone(replay),
      id: replayId,
      recordedAt: now
    };

    this.data.replays[replayId] = replayToSave;
    this.setInCache('replays', replayId, replayToSave);
    this.queueOperation({ type: 'create', collection: 'replays', id: replayId });
    
    logger.info('Replay saved', { replayId, gameId: replay.gameId, name: replay.name });
    return deepClone(replayToSave);
  }

  async getReplay(replayId: string): Promise<GameReplay | null> {
    const cached = this.getFromCache<GameReplay>('replays', replayId);
    if (cached) return cached;

    const replay = this.data.replays[replayId];
    if (!replay) return null;

    const cloned = deepClone(replay);
    this.setInCache('replays', replayId, cloned);
    return cloned;
  }

  async listReplays(gameId?: string): Promise<GameReplay[]> {
    const replayIds = Object.keys(this.data.replays);
    const replays: GameReplay[] = [];

    for (const id of replayIds) {
      const cached = this.getFromCache<GameReplay>('replays', id);
      const replay = cached || this.data.replays[id];
      if (replay && (!gameId || replay.gameId === gameId)) {
        if (!cached) {
          const cloned = deepClone(replay);
          this.setInCache('replays', id, cloned);
          replays.push(cloned);
        } else {
          replays.push(cached);
        }
      }
    }

    replays.sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());
    return replays;
  }

  async deleteReplay(replayId: string): Promise<boolean> {
    if (!this.data.replays[replayId]) {
      return false;
    }

    delete this.data.replays[replayId];
    this.invalidateCache('replays', replayId);
    this.queueOperation({ type: 'delete', collection: 'replays', id: replayId });
    
    logger.info('Replay deleted', { replayId });
    return true;
  }

  getGameCount(): number {
    return Object.keys(this.data.games).length;
  }

  getStats(): any {
    return {
      gameCount: Object.keys(this.data.games).length,
      planCount: Object.keys(this.data.tacticalPlans).length,
      replayCount: Object.keys(this.data.replays).length,
      cacheSize: this.cache.size,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      cacheHitRate: this.cacheHits + this.cacheMisses > 0 
        ? (this.cacheHits / (this.cacheHits + this.cacheMisses) * 100).toFixed(1) + '%' 
        : 'N/A',
      pendingOperations: this.pendingOperations.length
    };
  }

  clearCache(): void {
    this.cache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
    logger.info('Database cache cleared');
  }

  async forceFlush(): Promise<void> {
    this.flushBatch();
    await this.saveToFile();
  }

  async close(): Promise<void> {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }

    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    this.flushBatch();
    await this.saveToFile();
    logger.info('Database connection closed', this.getStats());
  }
}
