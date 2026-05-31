import WebSocket from 'ws';
import {
  GameMessage,
  MessageType,
  JoinGamePayload,
  BuildRequest,
  DemolishRequest,
  ChatPayload,
  ErrorPayload,
  BuildResult,
  DemolishResult,
  ResourceType,
  ResourceUpdatePayload,
  getBuildingCost,
  PlotChangeLogEntry,
  HistoryQueryRequest,
  HistoryQueryResult,
  BuildSchemeSaveRequest,
  BuildSchemeApplyRequest,
  BuildScheme,
  BuildingBlueprint,
  BuildingType,
} from '../../../shared';
import { PlotEngine } from '../core/plot-engine';
import { StateManager, plotToDelta } from '../core/state-manager';
import { Database } from '../core/database';

export class GameRoom {
  private plotEngine: PlotEngine;
  private stateManager: StateManager;
  private db: Database;
  private clients: Map<string, WebSocket> = new Map();
  private playerToClient: Map<string, string> = new Map();
  private tickTimer: NodeJS.Timer | null = null;
  private yieldTimer: NodeJS.Timer | null = null;
  private gameId: string;
  private mapSeed: number;

  constructor(db: Database) {
    this.db = db;
    this.plotEngine = new PlotEngine();
    this.stateManager = new StateManager();
    this.gameId = `game_${Date.now()}`;
    this.mapSeed = Date.now();
    this.plotEngine.generateMap(this.mapSeed);
    this.stateManager.on('player:join', () => this.broadcastPlayerList());
    this.stateManager.on('player:leave', () => this.broadcastPlayerList());
  }

  start(): void {
    this.tickTimer = setInterval(() => this.onTick(), 200);
    this.yieldTimer = setInterval(() => this.onResourceYield(), 5000);
    this.db.saveGame({
      id: this.gameId,
      tick: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      mapSeed: this.mapSeed,
    });
    console.log(`[GameRoom] Started game ${this.gameId} with seed ${this.mapSeed}`);
  }

  stop(): void {
    if (this.tickTimer) clearInterval(this.tickTimer as any);
    if (this.yieldTimer) clearInterval(this.yieldTimer as any);
    this.persistState();
    console.log(`[GameRoom] Stopped game ${this.gameId}`);
  }

  handleConnection(ws: WebSocket): void {
    const playerId = `player_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    this.clients.set(playerId, ws);
    this.playerToClient.set(playerId, playerId);
    console.log(`[GameRoom] Client connected: ${playerId}`);

    ws.on('message', (raw: WebSocket.Data) => {
      try {
        const msg: GameMessage = JSON.parse(raw.toString());
        this.handleMessage(playerId, msg);
      } catch (err) {
        this.sendError(ws, 'PARSE_ERROR', 'Invalid message format');
      }
    });

    ws.on('close', () => {
      this.handleDisconnect(playerId);
    });

    ws.on('error', () => {
      this.handleDisconnect(playerId);
    });
  }

  private handleMessage(playerId: string, msg: GameMessage): void {
    switch (msg.type) {
      case MessageType.JOIN_GAME:
        this.handleJoin(playerId, msg.payload as JoinGamePayload);
        break;
      case MessageType.BUILD_REQUEST:
        this.handleBuild(playerId, msg.payload as BuildRequest);
        break;
      case MessageType.DEMOLISH_REQUEST:
        this.handleDemolish(playerId, msg.payload as DemolishRequest);
        break;
      case MessageType.CHAT_MESSAGE:
        this.handleChat(playerId, msg.payload as ChatPayload);
        break;
      case MessageType.HISTORY_QUERY:
        this.handleHistoryQuery(playerId, msg.payload as HistoryQueryRequest);
        break;
      case MessageType.SCHEME_SAVE:
        this.handleSchemeSave(playerId, msg.payload as BuildSchemeSaveRequest);
        break;
      case MessageType.SCHEME_APPLY:
        this.handleSchemeApply(playerId, msg.payload as BuildSchemeApplyRequest);
        break;
      case MessageType.SCHEME_LIST:
        this.handleSchemeList(playerId);
        break;
      default:
        break;
    }
  }

  private handleJoin(playerId: string, payload: JoinGamePayload): void {
    const player = this.stateManager.addPlayer(playerId, payload.playerName);
    if (!player) {
      const ws = this.clients.get(playerId);
      if (ws) this.sendError(ws, 'JOIN_FAILED', 'Game is full or player already exists');
      return;
    }

    const fullSync = this.stateManager.getFullState(
      new Map(this.plotEngine.getAllPlots().map(p => [p.id, p]))
    );
    this.sendToClient(playerId, {
      type: MessageType.STATE_SYNC,
      payload: fullSync,
      timestamp: Date.now(),
      playerId,
    });
  }

  private handleBuild(playerId: string, req: BuildRequest): void {
    const player = this.stateManager.getPlayer(playerId);
    if (!player) return;

    const before = this.plotEngine.getPlot(req.plotId);
    const beforeDelta = before ? plotToDelta(before) : { id: req.plotId };

    const result = this.plotEngine.tryPlaceBuilding(req.plotId, req.buildingType, playerId, player.resources);

    if (!result.ok) {
      this.sendToClient(playerId, {
        type: MessageType.BUILD_RESULT,
        payload: { success: false, plot: null as any, remainingResources: null as any, reason: result.reason },
        timestamp: Date.now(),
        playerId,
      });
      return;
    }

    const afterDelta = plotToDelta(result.plot);
    this.logHistoryEntry(req.plotId, playerId, 'BUILD', beforeDelta, afterDelta);

    this.stateManager.updatePlayerResources(playerId, result.remaining);
    this.stateManager.addPlotToPlayer(playerId, req.plotId);
    this.stateManager.markPlotDirty(req.plotId);

    const buildResult: BuildResult = {
      success: true,
      plot: result.plot,
      remainingResources: result.remaining,
    };

    this.sendToClient(playerId, {
      type: MessageType.BUILD_RESULT,
      payload: buildResult,
      timestamp: Date.now(),
      playerId,
    });

    const cost = getBuildingCost(req.buildingType);
    const resourceUpdate: ResourceUpdatePayload = {
      playerId,
      resources: result.remaining,
      delta: Object.fromEntries(
        Object.entries(cost).map(([k, v]) => [k, -(v as number)])
      ) as any,
    };

    this.sendToClient(playerId, {
      type: MessageType.RESOURCE_UPDATE,
      payload: resourceUpdate,
      timestamp: Date.now(),
      playerId,
    });
  }

  private handleDemolish(playerId: string, req: DemolishRequest): void {
    const plot = this.plotEngine.getPlot(req.plotId);
    if (!plot) {
      this.sendToClient(playerId, {
        type: MessageType.DEMOLISH_RESULT,
        payload: { success: false, plot: null as any, refund: {}, reason: 'PLOT_NOT_FOUND' },
        timestamp: Date.now(),
        playerId,
      });
      return;
    }

    if (plot.ownerId !== playerId) {
      this.sendToClient(playerId, {
        type: MessageType.DEMOLISH_RESULT,
        payload: { success: false, plot: null as any, refund: {}, reason: 'NOT_OWNER' },
        timestamp: Date.now(),
        playerId,
      });
      return;
    }

    const beforeDelta = plotToDelta(plot);
    const result = this.plotEngine.tryDemolishBuilding(req.plotId);

    if (!result.ok) {
      this.sendToClient(playerId, {
        type: MessageType.DEMOLISH_RESULT,
        payload: { success: false, plot: null as any, refund: {}, reason: result.reason },
        timestamp: Date.now(),
        playerId,
      });
      return;
    }

    this.logHistoryEntry(req.plotId, playerId, 'DEMOLISH', beforeDelta, plotToDelta(result.plot));

    const player = this.stateManager.getPlayer(playerId);
    if (player) {
      const newResources = { ...player.resources };
      for (const [res, amount] of Object.entries(result.refund)) {
        const key = res as ResourceType;
        const safeAmount = typeof amount === 'number' && amount > 0 ? amount : 0;
        newResources[key] = (newResources[key] || 0) + safeAmount;
      }
      this.stateManager.updatePlayerResources(playerId, newResources);
      this.stateManager.removePlotFromPlayer(playerId, req.plotId);
    }

    this.stateManager.markPlotDirty(req.plotId);

    const demolishResult: DemolishResult = {
      success: true,
      plot: result.plot,
      refund: result.refund,
    };

    this.sendToClient(playerId, {
      type: MessageType.DEMOLISH_RESULT,
      payload: demolishResult,
      timestamp: Date.now(),
      playerId,
    });
  }

  private handleHistoryQuery(playerId: string, req: HistoryQueryRequest): void {
    const entries = this.db.queryHistory(req.plotId, req.limit || 50, req.beforeTick);
    const result: HistoryQueryResult = {
      plotId: req.plotId,
      entries,
      total: entries.length,
    };
    this.sendToClient(playerId, {
      type: MessageType.HISTORY_RESULT,
      payload: result,
      timestamp: Date.now(),
      playerId,
    });
  }

  private handleSchemeSave(playerId: string, req: BuildSchemeSaveRequest): void {
    const player = this.stateManager.getPlayer(playerId);
    if (!player) {
      this.sendToClient(playerId, {
        type: MessageType.SCHEME_SAVE_RESULT,
        payload: { success: false, reason: 'PLAYER_NOT_FOUND' },
        timestamp: Date.now(),
        playerId,
      });
      return;
    }

    const blueprints: BuildingBlueprint[] = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const plotId of req.plotIds) {
      const plot = this.plotEngine.getPlot(plotId);
      if (!plot || plot.building === BuildingType.NONE) continue;
      if (plot.ownerId !== playerId) continue;

      blueprints.push({
        plotId,
        x: plot.position.x,
        y: plot.position.y,
        buildingType: plot.building,
        terrain: plot.terrain,
      });
      minX = Math.min(minX, plot.position.x);
      maxX = Math.max(maxX, plot.position.x);
      minY = Math.min(minY, plot.position.y);
      maxY = Math.max(maxY, plot.position.y);
    }

    if (blueprints.length === 0) {
      this.sendToClient(playerId, {
        type: MessageType.SCHEME_SAVE_RESULT,
        payload: { success: false, reason: 'NO_VALID_BUILDINGS' },
        timestamp: Date.now(),
        playerId,
      });
      return;
    }

    const scheme: BuildScheme = {
      id: `scheme_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: req.name || 'Unnamed Scheme',
      ownerId: playerId,
      blueprints,
      centerX: req.centerX,
      centerY: req.centerY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.db.saveScheme(scheme);

    this.sendToClient(playerId, {
      type: MessageType.SCHEME_SAVE_RESULT,
      payload: { success: true, scheme },
      timestamp: Date.now(),
      playerId,
    });
  }

  private handleSchemeApply(playerId: string, req: BuildSchemeApplyRequest): void {
    const player = this.stateManager.getPlayer(playerId);
    const scheme = this.db.getScheme(req.schemeId);

    if (!player || !scheme) {
      this.sendToClient(playerId, {
        type: MessageType.SCHEME_APPLY_RESULT,
        payload: { success: false, reason: 'NOT_FOUND' },
        timestamp: Date.now(),
        playerId,
      });
      return;
    }

    if (scheme.ownerId !== playerId) {
      this.sendToClient(playerId, {
        type: MessageType.SCHEME_APPLY_RESULT,
        payload: { success: false, reason: 'NOT_OWNER' },
        timestamp: Date.now(),
        playerId,
      });
      return;
    }

    const results: Array<{ plotId: string; ok: boolean; reason?: string }> = [];
    let totalCost = { [ResourceType.GOLD]: 0, [ResourceType.FOOD]: 0, [ResourceType.STONE]: 0, [ResourceType.WOOD]: 0, [ResourceType.IRON]: 0 };

    for (const bp of scheme.blueprints) {
      const offsetX = bp.x - scheme.centerX;
      const offsetY = bp.y - scheme.centerY;
      const targetX = req.targetX + offsetX;
      const targetY = req.targetY + offsetY;
      const targetPlotId = `plot_${targetX}_${targetY}`;

      const cost = getBuildingCost(bp.buildingType);
      for (const key of Object.values(ResourceType)) {
        totalCost[key] += cost[key] || 0;
      }

      const plot = this.plotEngine.getPlot(targetPlotId);
      if (!plot || plot.building !== BuildingType.NONE || plot.terrain === 'water' as any) {
        results.push({ plotId: targetPlotId, ok: false, reason: 'UNAVAILABLE' });
      } else {
        results.push({ plotId: targetPlotId, ok: true });
      }
    }

    const canAfford = Object.values(ResourceType).every(k => player.resources[k] >= totalCost[k]);
    if (!canAfford) {
      this.sendToClient(playerId, {
        type: MessageType.SCHEME_APPLY_RESULT,
        payload: { success: false, reason: 'INSUFFICIENT_RESOURCES' },
        timestamp: Date.now(),
        playerId,
      });
      return;
    }

    let currentResources = { ...player.resources };
    const applied: string[] = [];

    for (let i = 0; i < scheme.blueprints.length; i++) {
      const bp = scheme.blueprints[i];
      const res = results[i];
      if (!res.ok) continue;

      const buildResult = this.plotEngine.tryPlaceBuilding(res.plotId, bp.buildingType, playerId, currentResources);
      if (buildResult.ok) {
        currentResources = buildResult.remaining;
        applied.push(res.plotId);
        this.stateManager.addPlotToPlayer(playerId, res.plotId);
        this.stateManager.markPlotDirty(res.plotId);
      }
    }

    this.stateManager.updatePlayerResources(playerId, currentResources);

    this.sendToClient(playerId, {
      type: MessageType.SCHEME_APPLY_RESULT,
      payload: { success: true, applied, total: scheme.blueprints.length },
      timestamp: Date.now(),
      playerId,
    });
  }

  private handleSchemeList(playerId: string): void {
    const schemes = this.db.listSchemesByOwner(playerId);
    this.sendToClient(playerId, {
      type: MessageType.SCHEME_LIST_RESULT,
      payload: { schemes },
      timestamp: Date.now(),
      playerId,
    });
  }

  private handleChat(playerId: string, payload: ChatPayload): void {
    const player = this.stateManager.getPlayer(playerId);
    if (!player) return;

    const chatPayload: ChatPayload = {
      playerId,
      playerName: player.name,
      text: payload.text,
    };

    this.broadcast({
      type: MessageType.CHAT_MESSAGE,
      payload: chatPayload,
      timestamp: Date.now(),
    });
  }

  private handleDisconnect(playerId: string): void {
    this.clients.delete(playerId);
    this.playerToClient.delete(playerId);
    this.stateManager.removePlayer(playerId);
    console.log(`[GameRoom] Client disconnected: ${playerId}`);
  }

  private onTick(): void {
    const tick = this.stateManager.advanceTick();
    const allPlots = new Map(this.plotEngine.getAllPlots().map(p => [p.id, p]));
    const delta = this.stateManager.collectDirtyStateDelta(allPlots);

    if (delta) {
      this.broadcast({
        type: MessageType.STATE_SYNC_DELTA,
        payload: delta,
        timestamp: Date.now(),
      });
    }

    this.broadcast({
      type: MessageType.TICK,
      payload: { tick, timestamp: Date.now() },
      timestamp: Date.now(),
    });
  }

  private onResourceYield(): void {
    const players = this.stateManager.getAllPlayers();
    for (const player of players) {
      const delta = this.plotEngine.computeYield(player.id);
      if (Object.keys(delta).length === 0) continue;

      const newResources = { ...player.resources };
      for (const [res, amount] of Object.entries(delta)) {
        const key = res as ResourceType;
        const safeAmount = typeof amount === 'number' && amount > 0 ? amount : 0;
        newResources[key] = (newResources[key] || 0) + safeAmount;
      }

      this.stateManager.updatePlayerResources(player.id, newResources);

      const update: ResourceUpdatePayload = {
        playerId: player.id,
        resources: newResources,
        delta,
      };

      this.sendToClient(player.id, {
        type: MessageType.RESOURCE_UPDATE,
        payload: update,
        timestamp: Date.now(),
      });
    }
  }

  private logHistoryEntry(
    plotId: string,
    playerId: string | null,
    action: 'BUILD' | 'DEMOLISH' | 'CAPTURE' | 'LEVEL_UP',
    before: any,
    after: any
  ): void {
    const entry: PlotChangeLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      plotId,
      tick: this.stateManager.getTick(),
      timestamp: Date.now(),
      playerId,
      action,
      before,
      after,
    };
    this.db.appendHistoryEntry(entry);
  }

  broadcastPlayerList(): void {
    const players = this.stateManager.getAllPlayers();
    this.broadcast({
      type: MessageType.PLAYER_LIST,
      payload: players,
      timestamp: Date.now(),
    });
  }

  private broadcast(msg: GameMessage): void {
    const raw = JSON.stringify(msg);
    for (const [id, ws] of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(raw);
      }
    }
  }

  private sendToClient(playerId: string, msg: GameMessage): void {
    const ws = this.clients.get(playerId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  private sendError(ws: WebSocket, code: string, message: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      const errorPayload: ErrorPayload = { code, message };
      ws.send(JSON.stringify({
        type: MessageType.ERROR,
        payload: errorPayload,
        timestamp: Date.now(),
      }));
    }
  }

  private persistState(): void {
    const allPlots = this.plotEngine.getAllPlots();
    const allPlayers = this.stateManager.getAllPlayers();
    this.db.savePlots(allPlots);
    this.db.savePlayers(allPlayers);
    this.db.saveGame({
      id: this.gameId,
      tick: this.stateManager.getTick(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      mapSeed: this.mapSeed,
    });
  }
}
