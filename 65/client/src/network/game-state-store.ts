import {
  MessageType,
  GameMessage,
  StateSyncPayload,
  StateSyncDeltaPayload,
  PlotData,
  PlotDataDelta,
  PlayerState,
  PlayerStateDelta,
  ResourceUpdatePayload,
  ResourceBag,
  ResourceType,
  ErrorPayload,
  BuildResult,
  DemolishResult,
} from '../../shared';
import { NetworkManager } from './network-manager';

function mergePlotDelta(base: PlotData, delta: PlotDataDelta): PlotData {
  const p = { ...base, position: { ...base.position } };
  if (delta.px !== undefined) p.position.x = delta.px;
  if (delta.py !== undefined) p.position.y = delta.py;
  if (delta.t !== undefined) p.terrain = delta.t as any;
  if (delta.b !== undefined) p.building = delta.b as any;
  if (delta.o !== undefined) p.ownerId = delta.o;
  if (delta.l !== undefined) p.level = delta.l;
  if (delta.hp !== undefined) p.hp = delta.hp;
  if (delta.mhp !== undefined) p.maxHp = delta.mhp;
  return p;
}

function mergePlayerDelta(base: PlayerState, delta: PlayerStateDelta): PlayerState {
  const p = { ...base, resources: { ...base.resources }, plots: [...base.plots] };
  if (delta.n !== undefined) p.name = delta.n;
  if (delta.s !== undefined) p.status = delta.s as any;
  if (delta.res !== undefined) {
    for (const [k, v] of Object.entries(delta.res)) {
      const key = k as ResourceType;
      if (typeof v === 'number') p.resources[key] = v;
    }
  }
  if (delta.plots !== undefined) p.plots = delta.plots;
  if (delta.c !== undefined) p.color = delta.c;
  if (delta.la !== undefined) p.lastActive = delta.la;
  return p;
}

export class GameStateStore {
  private plots: Map<string, PlotData> = new Map();
  private players: Map<string, PlayerState> = new Map();
  private myPlayerId: string | null = null;
  private tick: number = 0;
  private network: NetworkManager;
  private listeners: Map<string, Array<(...args: any[]) => void>> = new Map();

  constructor(network: NetworkManager) {
    this.network = network;
    this.setupNetworkHandlers();
  }

  private setupNetworkHandlers(): void {
    this.network.on(MessageType.STATE_SYNC, (msg) => this.handleStateSync(msg));
    this.network.on(MessageType.STATE_SYNC_DELTA, (msg) => this.handleStateSyncDelta(msg));
    this.network.on(MessageType.RESOURCE_UPDATE, (msg) => this.handleResourceUpdate(msg));
    this.network.on(MessageType.BUILD_RESULT, (msg) => this.handleBuildResult(msg));
    this.network.on(MessageType.DEMOLISH_RESULT, (msg) => this.handleDemolishResult(msg));
    this.network.on(MessageType.PLAYER_LIST, (msg) => this.handlePlayerList(msg));
    this.network.on(MessageType.ERROR, (msg) => this.handleError(msg));
    this.network.on(MessageType.TICK, (msg) => {
      this.tick = (msg.payload as any).tick;
      this.emit('tick', this.tick);
    });
  }

  private handleStateSync(msg: GameMessage): void {
    const sync = msg.payload as StateSyncPayload;
    this.tick = sync.tick;

    for (const plot of sync.plotUpdates) {
      this.plots.set(plot.id, plot);
      this.emit('plot:update', plot);
    }

    for (const player of sync.playerUpdates) {
      this.players.set(player.id, player);
      this.emit('player:update', player);
    }

    this.emit('state:sync', sync);
  }

  private handleStateSyncDelta(msg: GameMessage): void {
    const delta = msg.payload as StateSyncDeltaPayload;
    this.tick = delta.tick;

    for (const pd of delta.plots) {
      const base = this.plots.get(pd.id);
      if (!base) continue;
      const updated = mergePlotDelta(base, pd);
      this.plots.set(pd.id, updated);
      this.emit('plot:update', updated);
    }

    for (const pd of delta.players) {
      const base = this.players.get(pd.id);
      if (!base) continue;
      const updated = mergePlayerDelta(base, pd);
      this.players.set(pd.id, updated);
      this.emit('player:update', updated);
    }

    this.emit('state:delta', delta);
  }

  private handleResourceUpdate(msg: GameMessage): void {
    const update = msg.payload as ResourceUpdatePayload;
    const player = this.players.get(update.playerId);
    if (player) {
      player.resources = { ...update.resources };
      this.players.set(update.playerId, player);
      this.emit('resource:update', update);
    }
  }

  private handleBuildResult(msg: GameMessage): void {
    const result = msg.payload as BuildResult;
    this.emit('build:result', result);
    if (result.success && result.plot) {
      this.plots.set(result.plot.id, result.plot);
      this.emit('plot:update', result.plot);
    }
  }

  private handleDemolishResult(msg: GameMessage): void {
    const result = msg.payload as DemolishResult;
    this.emit('demolish:result', result);
    if (result.success && result.plot) {
      this.plots.set(result.plot.id, result.plot);
      this.emit('plot:update', result.plot);
    }
  }

  private handlePlayerList(msg: GameMessage): void {
    const players = msg.payload as PlayerState[];
    this.players.clear();
    for (const p of players) {
      this.players.set(p.id, p);
    }
    this.emit('player:list', players);
  }

  private handleError(msg: GameMessage): void {
    const error = msg.payload as ErrorPayload;
    this.emit('error', error);
    console.error(`[GameState] Error ${error.code}: ${error.message}`);
  }

  getPlot(id: string): PlotData | undefined {
    return this.plots.get(id);
  }

  getAllPlots(): PlotData[] {
    return Array.from(this.plots.values());
  }

  getPlayer(id: string): PlayerState | undefined {
    return this.players.get(id);
  }

  getMyPlayer(): PlayerState | undefined {
    if (!this.myPlayerId) return undefined;
    return this.players.get(this.myPlayerId);
  }

  setMyPlayerId(id: string): void {
    this.myPlayerId = id;
    this.network.setPlayerId(id);
  }

  getMyPlayerId(): string | null {
    return this.myPlayerId;
  }

  getTick(): number {
    return this.tick;
  }

  on(event: string, listener: (...args: any[]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  off(event: string, listener: (...args: any[]) => void): void {
    const list = this.listeners.get(event);
    if (list) {
      const idx = list.indexOf(listener);
      if (idx >= 0) list.splice(idx, 1);
    }
  }

  private emit(event: string, ...args: any[]): void {
    const list = this.listeners.get(event);
    if (list) {
      for (const listener of list) {
        listener(...args);
      }
    }
  }
}
