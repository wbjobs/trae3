import { EventEmitter } from 'events';
import {
  PlayerState,
  PlayerStatus,
  ResourceBag,
  ResourceType,
  StateSyncPayload,
  StateSyncDeltaPayload,
  PlotData,
  PlotDataDelta,
  PlayerStateDelta,
  MAX_PLAYERS,
} from '../../../shared';

const PLAYER_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
  '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1',
];

const DEFAULT_RESOURCES: ResourceBag = {
  [ResourceType.GOLD]: 100,
  [ResourceType.FOOD]: 100,
  [ResourceType.STONE]: 50,
  [ResourceType.WOOD]: 80,
  [ResourceType.IRON]: 30,
};

function isValidResourceBag(r: any): r is ResourceBag {
  if (!r || typeof r !== 'object') return false;
  for (const key of Object.values(ResourceType)) {
    if (typeof r[key] !== 'number' || !isFinite(r[key])) return false;
  }
  return true;
}

function sanitizeResources(r: Partial<ResourceBag> | undefined): ResourceBag {
  if (!r || !isValidResourceBag(r)) {
    return { ...DEFAULT_RESOURCES };
  }
  const bag: ResourceBag = { ...DEFAULT_RESOURCES };
  for (const key of Object.values(ResourceType)) {
    const val = r[key];
    bag[key] = typeof val === 'number' && isFinite(val) && val >= 0 ? val : DEFAULT_RESOURCES[key];
  }
  return bag;
}

export function plotToDelta(p: PlotData, prev?: PlotData): PlotDataDelta {
  const d: PlotDataDelta = { id: p.id };
  if (!prev || p.position.x !== prev.position.x) d.px = p.position.x;
  if (!prev || p.position.y !== prev.position.y) d.py = p.position.y;
  if (!prev || p.terrain !== prev.terrain) d.t = p.terrain;
  if (!prev || p.building !== prev.building) d.b = p.building;
  if (!prev || p.ownerId !== prev.ownerId) d.o = p.ownerId;
  if (!prev || p.level !== prev.level) d.l = p.level;
  if (!prev || p.hp !== prev.hp) d.hp = p.hp;
  if (!prev || p.maxHp !== prev.maxHp) d.mhp = p.maxHp;
  return d;
}

export function plotFromDelta(d: PlotDataDelta, base?: PlotData): PlotData {
  const p: PlotData = base ? { ...base } : {
    id: d.id,
    position: { x: 0, y: 0 },
    terrain: 'plain' as any,
    building: 'none' as any,
    ownerId: null,
    level: 0,
    hp: 0,
    maxHp: 0,
  };
  if (d.px !== undefined) p.position.x = d.px;
  if (d.py !== undefined) p.position.y = d.py;
  if (d.t !== undefined) p.terrain = d.t as any;
  if (d.b !== undefined) p.building = d.b as any;
  if (d.o !== undefined) p.ownerId = d.o;
  if (d.l !== undefined) p.level = d.l;
  if (d.hp !== undefined) p.hp = d.hp;
  if (d.mhp !== undefined) p.maxHp = d.mhp;
  return p;
}

export function playerToDelta(p: PlayerState, prev?: PlayerState): PlayerStateDelta {
  const d: PlayerStateDelta = { id: p.id };
  if (!prev || p.name !== prev.name) d.n = p.name;
  if (!prev || p.status !== prev.status) d.s = p.status;
  if (!prev || JSON.stringify(p.resources) !== JSON.stringify(prev.resources)) {
    d.res = { ...p.resources };
  }
  if (!prev || JSON.stringify(p.plots) !== JSON.stringify(prev.plots)) {
    d.plots = [...p.plots];
  }
  if (!prev || p.color !== prev.color) d.c = p.color;
  if (!prev || p.lastActive !== prev.lastActive) d.la = p.lastActive;
  return d;
}

export class StateManager extends EventEmitter {
  private players: Map<string, PlayerState> = new Map();
  private pendingDirtyPlots: Set<string> = new Set();
  private pendingDirtyPlayers: Set<string> = new Set();
  private collectedDirtyPlots: Set<string> = new Set();
  private collectedDirtyPlayers: Set<string> = new Set();
  private tick: number = 0;
  private collectPhase: boolean = false;
  private prevPlayerSnapshots: Map<string, PlayerState> = new Map();
  private prevPlotSnapshots: Map<string, PlotData> = new Map();

  addPlayer(id: string, name: string): PlayerState | null {
    if (this.players.size >= MAX_PLAYERS) return null;
    if (this.players.has(id)) return null;

    const colorIndex = this.players.size % PLAYER_COLORS.length;
    const player: PlayerState = {
      id,
      name: name || `Player_${id.slice(-4)}`,
      status: PlayerStatus.IDLE,
      resources: { ...DEFAULT_RESOURCES },
      plots: [],
      color: PLAYER_COLORS[colorIndex],
      lastActive: Date.now(),
    };

    this.players.set(id, player);
    this.markPlayerDirty(id);
    this.emit('player:join', player);
    return player;
  }

  removePlayer(id: string): PlayerState | null {
    const player = this.players.get(id);
    if (!player) return null;

    player.status = PlayerStatus.OFFLINE;
    this.players.delete(id);
    this.markPlayerDirty(id);
    this.emit('player:leave', player);
    return player;
  }

  getPlayer(id: string): PlayerState | undefined {
    return this.players.get(id);
  }

  getAllPlayers(): PlayerState[] {
    return Array.from(this.players.values());
  }

  updatePlayerResources(id: string, resources: ResourceBag): void {
    const player = this.players.get(id);
    if (!player) return;
    player.resources = sanitizeResources(resources);
    player.lastActive = Date.now();
    this.markPlayerDirty(id);
  }

  addPlotToPlayer(playerId: string, plotId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    if (!player.plots.includes(plotId)) {
      player.plots.push(plotId);
      this.markPlayerDirty(playerId);
    }
  }

  removePlotFromPlayer(playerId: string, plotId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.plots = player.plots.filter((p: string) => p !== plotId);
    this.markPlayerDirty(playerId);
  }

  updatePlayerStatus(id: string, status: PlayerStatus): void {
    const player = this.players.get(id);
    if (!player) return;
    player.status = status;
    player.lastActive = Date.now();
    this.markPlayerDirty(id);
  }

  markPlotDirty(plotId: string): void {
    if (this.collectPhase) {
      this.pendingDirtyPlots.add(plotId);
    } else {
      this.collectedDirtyPlots.add(plotId);
    }
  }

  private markPlayerDirty(playerId: string): void {
    if (this.collectPhase) {
      this.pendingDirtyPlayers.add(playerId);
    } else {
      this.collectedDirtyPlayers.add(playerId);
    }
  }

  advanceTick(): number {
    this.tick++;
    return this.tick;
  }

  getTick(): number {
    return this.tick;
  }

  collectDirtyState(allPlots: Map<string, PlotData>): StateSyncPayload | null {
    this.collectPhase = true;

    const plotUpdates: PlotData[] = [];
    for (const plotId of this.collectedDirtyPlots) {
      const plot = allPlots.get(plotId);
      if (plot) plotUpdates.push({ ...plot });
    }

    const playerUpdates: PlayerState[] = [];
    for (const playerId of this.collectedDirtyPlayers) {
      const player = this.players.get(playerId);
      if (player) playerUpdates.push({ ...player });
    }

    this.collectedDirtyPlots.clear();
    this.collectedDirtyPlayers.clear();

    for (const id of this.pendingDirtyPlots) {
      this.collectedDirtyPlots.add(id);
    }
    this.pendingDirtyPlots.clear();

    for (const id of this.pendingDirtyPlayers) {
      this.collectedDirtyPlayers.add(id);
    }
    this.pendingDirtyPlayers.clear();

    this.collectPhase = false;

    if (plotUpdates.length === 0 && playerUpdates.length === 0) return null;

    return {
      tick: this.tick,
      plotUpdates,
      playerUpdates,
    };
  }

  collectDirtyStateDelta(allPlots: Map<string, PlotData>): StateSyncDeltaPayload | null {
    this.collectPhase = true;

    const plotDeltas: PlotDataDelta[] = [];
    for (const plotId of this.collectedDirtyPlots) {
      const plot = allPlots.get(plotId);
      if (plot) {
        const prev = this.prevPlotSnapshots.get(plotId);
        plotDeltas.push(plotToDelta(plot, prev));
        this.prevPlotSnapshots.set(plotId, { ...plot });
      }
    }

    const playerDeltas: PlayerStateDelta[] = [];
    for (const playerId of this.collectedDirtyPlayers) {
      const player = this.players.get(playerId);
      if (player) {
        const prev = this.prevPlayerSnapshots.get(playerId);
        playerDeltas.push(playerToDelta(player, prev));
        this.prevPlayerSnapshots.set(playerId, { ...player });
      }
    }

    this.collectedDirtyPlots.clear();
    this.collectedDirtyPlayers.clear();

    for (const id of this.pendingDirtyPlots) {
      this.collectedDirtyPlots.add(id);
    }
    this.pendingDirtyPlots.clear();

    for (const id of this.pendingDirtyPlayers) {
      this.collectedDirtyPlayers.add(id);
    }
    this.pendingDirtyPlayers.clear();

    this.collectPhase = false;

    if (plotDeltas.length === 0 && playerDeltas.length === 0) return null;

    return {
      tick: this.tick,
      plots: plotDeltas,
      players: playerDeltas,
    };
  }

  getFullState(allPlots: Map<string, PlotData>): StateSyncPayload {
    const plots = Array.from(allPlots.values()).map(p => ({ ...p }));
    const players = this.getAllPlayers().map(p => ({ ...p }));

    this.prevPlotSnapshots.clear();
    this.prevPlayerSnapshots.clear();
    for (const p of plots) this.prevPlotSnapshots.set(p.id, p);
    for (const p of players) this.prevPlayerSnapshots.set(p.id, p);

    return {
      tick: this.tick,
      plotUpdates: plots,
      playerUpdates: players,
    };
  }
}
