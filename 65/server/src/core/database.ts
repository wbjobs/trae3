import {
  PlotData,
  PlayerState,
  ResourceType,
  TerrainType,
  BuildingType,
  PlayerStatus,
  BuildScheme,
  PlotChangeLogEntry,
} from '../../../shared';

export interface DBPlotRow {
  id: string;
  x: number;
  y: number;
  terrain: string;
  building: string;
  owner_id: string | null;
  level: number;
  hp: number;
  max_hp: number;
}

export interface DBPlayerRow {
  id: string;
  name: string;
  status: string;
  gold: number;
  food: number;
  stone: number;
  wood: number;
  iron: number;
  color: string;
  plots: string;
  last_active: number;
}

export interface DBGameRow {
  id: string;
  tick: number;
  created_at: number;
  updated_at: number;
  map_seed: number;
}

const VALID_TERRAINS = new Set<string>(Object.values(TerrainType));
const VALID_BUILDINGS = new Set<string>(Object.values(BuildingType));
const VALID_STATUSES = new Set<string>(Object.values(PlayerStatus));

function plotToRow(p: PlotData): DBPlotRow {
  return {
    id: p.id,
    x: p.position.x,
    y: p.position.y,
    terrain: p.terrain,
    building: p.building,
    owner_id: p.ownerId,
    level: p.level,
    hp: p.hp,
    max_hp: p.maxHp,
  };
}

function isValidPlotRow(r: any): r is DBPlotRow {
  if (!r || typeof r !== 'object') return false;
  if (typeof r.id !== 'string' || !r.id) return false;
  if (typeof r.x !== 'number' || !isFinite(r.x) || r.x < 0) return false;
  if (typeof r.y !== 'number' || !isFinite(r.y) || r.y < 0) return false;
  if (typeof r.terrain !== 'string' || !VALID_TERRAINS.has(r.terrain)) return false;
  if (typeof r.building !== 'string' || !VALID_BUILDINGS.has(r.building)) return false;
  if (r.owner_id !== null && typeof r.owner_id !== 'string') return false;
  if (typeof r.level !== 'number' || !isFinite(r.level) || r.level < 0) return false;
  if (typeof r.hp !== 'number' || !isFinite(r.hp)) return false;
  if (typeof r.max_hp !== 'number' || !isFinite(r.max_hp)) return false;
  return true;
}

function sanitizePlotRow(r: any): DBPlotRow {
  return {
    id: typeof r?.id === 'string' && r.id ? r.id : `plot_0_0`,
    x: typeof r?.x === 'number' && isFinite(r.x) && r.x >= 0 ? Math.floor(r.x) : 0,
    y: typeof r?.y === 'number' && isFinite(r.y) && r.y >= 0 ? Math.floor(r.y) : 0,
    terrain: typeof r?.terrain === 'string' && VALID_TERRAINS.has(r.terrain) ? r.terrain : TerrainType.PLAIN,
    building: typeof r?.building === 'string' && VALID_BUILDINGS.has(r.building) ? r.building : BuildingType.NONE,
    owner_id: r?.owner_id === null || typeof r?.owner_id === 'string' ? r.owner_id : null,
    level: typeof r?.level === 'number' && isFinite(r.level) && r.level >= 0 ? Math.floor(r.level) : 0,
    hp: typeof r?.hp === 'number' && isFinite(r.hp) ? r.hp : 0,
    max_hp: typeof r?.max_hp === 'number' && isFinite(r.max_hp) ? r.max_hp : 0,
  };
}

function rowToPlot(r: DBPlotRow): PlotData {
  return {
    id: r.id,
    position: { x: r.x, y: r.y },
    terrain: r.terrain as PlotData['terrain'],
    building: r.building as PlotData['building'],
    ownerId: r.owner_id,
    level: r.level,
    hp: r.hp,
    maxHp: r.max_hp,
  };
}

function isValidPlayerRow(r: any): r is DBPlayerRow {
  if (!r || typeof r !== 'object') return false;
  if (typeof r.id !== 'string' || !r.id) return false;
  if (typeof r.name !== 'string' || !r.name) return false;
  if (typeof r.status !== 'string' || !VALID_STATUSES.has(r.status)) return false;
  for (const key of ['gold', 'food', 'stone', 'wood', 'iron']) {
    if (typeof r[key] !== 'number' || !isFinite(r[key])) return false;
  }
  if (typeof r.color !== 'string') return false;
  if (typeof r.plots !== 'string') return false;
  if (typeof r.last_active !== 'number' || !isFinite(r.last_active)) return false;
  return true;
}

function sanitizePlayerRow(r: any): DBPlayerRow {
  const safePlots = (() => {
    try {
      const parsed = JSON.parse(r?.plots || '[]');
      if (Array.isArray(parsed) && parsed.every((p: any) => typeof p === 'string')) return r.plots;
    } catch {}
    return '[]';
  })();

  return {
    id: typeof r?.id === 'string' && r.id ? r.id : `unknown_${Date.now()}`,
    name: typeof r?.name === 'string' && r.name ? r.name : 'Unknown',
    status: typeof r?.status === 'string' && VALID_STATUSES.has(r.status) ? r.status : PlayerStatus.IDLE,
    gold: typeof r?.gold === 'number' && isFinite(r.gold) ? Math.max(0, r.gold) : 100,
    food: typeof r?.food === 'number' && isFinite(r.food) ? Math.max(0, r.food) : 100,
    stone: typeof r?.stone === 'number' && isFinite(r.stone) ? Math.max(0, r.stone) : 50,
    wood: typeof r?.wood === 'number' && isFinite(r.wood) ? Math.max(0, r.wood) : 80,
    iron: typeof r?.iron === 'number' && isFinite(r.iron) ? Math.max(0, r.iron) : 30,
    color: typeof r?.color === 'string' && r.color ? r.color : '#ffffff',
    plots: safePlots,
    last_active: typeof r?.last_active === 'number' && isFinite(r.last_active) ? r.last_active : Date.now(),
  };
}

function playerToRow(p: PlayerState): DBPlayerRow {
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    gold: p.resources[ResourceType.GOLD],
    food: p.resources[ResourceType.FOOD],
    stone: p.resources[ResourceType.STONE],
    wood: p.resources[ResourceType.WOOD],
    iron: p.resources[ResourceType.IRON],
    color: p.color,
    plots: JSON.stringify(p.plots),
    last_active: p.lastActive,
  };
}

function rowToPlayer(r: DBPlayerRow): PlayerState {
  return {
    id: r.id,
    name: r.name,
    status: r.status as PlayerState['status'],
    resources: {
      [ResourceType.GOLD]: r.gold,
      [ResourceType.FOOD]: r.food,
      [ResourceType.STONE]: r.stone,
      [ResourceType.WOOD]: r.wood,
      [ResourceType.IRON]: r.iron,
    },
    plots: JSON.parse(r.plots || '[]'),
    color: r.color,
    lastActive: r.last_active,
  };
}

class LRUCache<K, V> {
  private capacity: number;
  private cache: Map<K, V>;
  private hits = 0;
  private misses = 0;

  constructor(capacity: number = 512) {
    this.capacity = capacity;
    this.cache = new Map();
  }

  get(key: K): V | undefined {
    const val = this.cache.get(key);
    if (val !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, val);
      this.hits++;
    } else {
      this.misses++;
    }
    return val;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      const first = this.cache.keys().next().value;
      if (first !== undefined) this.cache.delete(first);
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  getStats() {
    return { hits: this.hits, misses: this.misses, size: this.cache.size, capacity: this.capacity };
  }
}

export class Database {
  private data: {
    games: Map<string, DBGameRow>;
    plots: Map<string, DBPlotRow>;
    players: Map<string, DBPlayerRow>;
    schemes: Map<string, BuildScheme>;
    history: Map<string, PlotChangeLogEntry[]>;
  };

  private plotCache: LRUCache<string, DBPlotRow>;
  private playerCache: LRUCache<string, DBPlayerRow>;
  private schemeCache: LRUCache<string, BuildScheme>;
  private historyCache: LRUCache<string, PlotChangeLogEntry[]>;

  private dirtyPlots: Set<string> = new Set();
  private dirtyPlayers: Set<string> = new Set();
  private dirtySchemes: Set<string> = new Set();
  private dirtyHistory: Set<string> = new Set();

  private flushTimer: NodeJS.Timer | null = null;
  private flushIntervalMs = 5000;

  constructor() {
    this.data = {
      games: new Map(),
      plots: new Map(),
      players: new Map(),
      schemes: new Map(),
      history: new Map(),
    };
    this.plotCache = new LRUCache(1024);
    this.playerCache = new LRUCache(256);
    this.schemeCache = new LRUCache(128);
    this.historyCache = new LRUCache(64);
    this.startAutoFlush();
  }

  private startAutoFlush(): void {
    this.flushTimer = setInterval(() => this.flushDirty(), this.flushIntervalMs);
  }

  stopAutoFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer as any);
      this.flushDirty();
      this.flushTimer = null;
    }
  }

  flushDirty(): void {
    const dirtyCount = this.dirtyPlots.size + this.dirtyPlayers.size + this.dirtySchemes.size + this.dirtyHistory.size;
    if (dirtyCount > 0) {
      console.log(`[DB] Flushing ${dirtyCount} dirty entries`);
      this.dirtyPlots.clear();
      this.dirtyPlayers.clear();
      this.dirtySchemes.clear();
      this.dirtyHistory.clear();
    }
  }

  saveGame(state: { id: string; tick: number; createdAt: number; updatedAt: number; mapSeed: number }): void {
    const row: DBGameRow = {
      id: state.id,
      tick: state.tick,
      created_at: state.createdAt,
      updated_at: state.updatedAt,
      map_seed: state.mapSeed,
    };
    this.data.games.set(state.id, row);
  }

  loadGame(id: string): DBGameRow | null {
    const row = this.data.games.get(id);
    if (!row) return null;
    if (!row.id || typeof row.tick !== 'number' || !isFinite(row.tick)) {
      console.warn(`[DB] Corrupted game row: ${id}, discarding`);
      this.data.games.delete(id);
      return null;
    }
    return row;
  }

  savePlots(plots: PlotData[], immediate = false): void {
    const batch: DBPlotRow[] = [];
    for (const p of plots) {
      const row = plotToRow(p);
      batch.push(row);
      this.data.plots.set(p.id, row);
      this.plotCache.set(p.id, row);
      if (!immediate) this.dirtyPlots.add(p.id);
    }
    if (immediate) this.flushDirty();
  }

  loadPlots(): PlotData[] {
    const result: PlotData[] = [];
    const corruptedIds: string[] = [];

    for (const [id, row] of this.data.plots) {
      const cached = this.plotCache.get(id);
      const r = cached || row;

      if (isValidPlotRow(r)) {
        result.push(rowToPlot(r));
        if (!cached) this.plotCache.set(id, r);
      } else {
        console.warn(`[DB] Corrupted plot row: ${id}, attempting sanitize`);
        const sanitized = sanitizePlotRow(r);
        this.data.plots.set(id, sanitized);
        this.plotCache.set(id, sanitized);
        result.push(rowToPlot(sanitized));
        corruptedIds.push(id);
      }
    }

    if (corruptedIds.length > 0) {
      console.warn(`[DB] Sanitized ${corruptedIds.length} corrupted plot(s)`);
    }

    return result;
  }

  getPlotById(id: string): PlotData | null {
    const cached = this.plotCache.get(id);
    if (cached) return isValidPlotRow(cached) ? rowToPlot(cached) : null;
    const row = this.data.plots.get(id);
    if (!row) return null;
    if (isValidPlotRow(row)) {
      this.plotCache.set(id, row);
      return rowToPlot(row);
    }
    return null;
  }

  savePlayers(players: PlayerState[], immediate = false): void {
    for (const p of players) {
      const row = playerToRow(p);
      this.data.players.set(p.id, row);
      this.playerCache.set(p.id, row);
      if (!immediate) this.dirtyPlayers.add(p.id);
    }
    if (immediate) this.flushDirty();
  }

  loadPlayers(): PlayerState[] {
    const result: PlayerState[] = [];
    const corruptedIds: string[] = [];

    for (const [id, row] of this.data.players) {
      const cached = this.playerCache.get(id);
      const r = cached || row;

      if (isValidPlayerRow(r)) {
        result.push(rowToPlayer(r));
        if (!cached) this.playerCache.set(id, r);
      } else {
        console.warn(`[DB] Corrupted player row: ${id}, attempting sanitize`);
        const sanitized = sanitizePlayerRow(r);
        this.data.players.set(id, sanitized);
        this.playerCache.set(id, sanitized);
        result.push(rowToPlayer(sanitized));
        corruptedIds.push(id);
      }
    }

    if (corruptedIds.length > 0) {
      console.warn(`[DB] Sanitized ${corruptedIds.length} corrupted player(s)`);
    }

    return result;
  }

  saveScheme(scheme: BuildScheme, immediate = false): void {
    this.data.schemes.set(scheme.id, scheme);
    this.schemeCache.set(scheme.id, scheme);
    if (!immediate) this.dirtySchemes.add(scheme.id);
  }

  getScheme(id: string): BuildScheme | null {
    const cached = this.schemeCache.get(id);
    if (cached) return cached;
    const s = this.data.schemes.get(id) || null;
    if (s) this.schemeCache.set(id, s);
    return s;
  }

  listSchemesByOwner(ownerId: string): BuildScheme[] {
    return Array.from(this.data.schemes.values()).filter(s => s.ownerId === ownerId);
  }

  deleteScheme(id: string): void {
    this.data.schemes.delete(id);
    this.schemeCache.delete(id);
    this.dirtySchemes.delete(id);
  }

  appendHistoryEntry(entry: PlotChangeLogEntry, immediate = false): void {
    let list = this.data.history.get(entry.plotId);
    if (!list) {
      list = [];
      this.data.history.set(entry.plotId, list);
    }
    list.push(entry);
    if (list.length > 200) list.shift();
    this.historyCache.set(entry.plotId, list);
    if (!immediate) this.dirtyHistory.add(entry.plotId);
  }

  queryHistory(plotId: string, limit = 50, beforeTick?: number): PlotChangeLogEntry[] {
    const cached = this.historyCache.get(plotId);
    const list = cached || this.data.history.get(plotId) || [];
    if (!cached && list.length > 0) this.historyCache.set(plotId, list);

    let filtered = [...list];
    if (beforeTick !== undefined) {
      filtered = filtered.filter(e => e.tick < beforeTick);
    }
    return filtered.slice(-limit).reverse();
  }

  deleteGame(id: string): void {
    this.data.games.delete(id);
  }

  listGames(): DBGameRow[] {
    return Array.from(this.data.games.values()).filter(g =>
      g.id && typeof g.tick === 'number' && isFinite(g.tick)
    );
  }

  getCacheStats(): any {
    return {
      plots: this.plotCache.getStats(),
      players: this.playerCache.getStats(),
      schemes: this.schemeCache.getStats(),
      history: this.historyCache.getStats(),
      dirty: {
        plots: this.dirtyPlots.size,
        players: this.dirtyPlayers.size,
        schemes: this.dirtySchemes.size,
        history: this.dirtyHistory.size,
      },
    };
  }
}
