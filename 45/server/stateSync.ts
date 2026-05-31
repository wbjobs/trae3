import type { Server, Socket } from 'socket.io';
import type { GameState, Unit, UnitDelta, IncrementalStateUpdate, Position } from '../shared/types';
import { SocketEvent } from '../shared/types';
import { deepClone } from '../shared/utils';
import { logger } from './logger';

function serializeGameState(state: GameState): any {
  return {
    ...state,
    createdAt: state.createdAt instanceof Date ? state.createdAt.toISOString() : state.createdAt,
    updatedAt: state.updatedAt instanceof Date ? state.updatedAt.toISOString() : state.updatedAt
  };
}

function serializeDate(date: Date | string): string {
  return date instanceof Date ? date.toISOString() : date;
}

interface StateEntry {
  version: number;
  state: GameState;
  timestamp: Date;
}

interface QueuedMessage {
  event: string;
  data: any;
  priority: number;
  createdAt: number;
}

interface ClientState {
  socketId: string;
  lastVersion: number;
  lastAckTime: number;
  pendingMessages: QueuedMessage[];
}

interface GameStateStore {
  current: GameState | null;
  version: number;
  history: StateEntry[];
  lastState: GameState | null;
  clients: Map<string, ClientState>;
  messageQueue: QueuedMessage[];
  flushTimeout: NodeJS.Timeout | null;
  broadcastThrottle: number;
  lastBroadcastTime: number;
}

export class StateSyncService {
  private states: Map<string, GameStateStore>;
  private readonly defaultBroadcastThrottle: number = 50;
  private readonly maxHistorySize: number = 200;
  private readonly maxQueueSize: number = 100;
  private readonly flushInterval: number = 16;

  constructor() {
    this.states = new Map();
    logger.info('StateSyncService initialized with incremental sync');
  }

  private ensureStore(gameId: string): GameStateStore {
    let store = this.states.get(gameId);
    if (!store) {
      store = {
        current: null,
        version: 0,
        history: [],
        lastState: null,
        clients: new Map(),
        messageQueue: [],
        flushTimeout: null,
        broadcastThrottle: this.defaultBroadcastThrottle,
        lastBroadcastTime: 0
      };
      this.states.set(gameId, store);
    }
    return store;
  }

  getState(gameId: string): GameState | null {
    const store = this.states.get(gameId);
    return store ? deepClone(store.current) : null;
  }

  setState(gameId: string, state: GameState): void {
    const store = this.ensureStore(gameId);

    store.lastState = store.current ? deepClone(store.current) : null;
    store.version++;
    store.current = deepClone(state);

    store.history.push({
      version: store.version,
      state: deepClone(state),
      timestamp: new Date()
    });

    if (store.history.length > this.maxHistorySize) {
      store.history = store.history.slice(-this.maxHistorySize);
    }

    logger.debug('State updated', { gameId, version: store.version });
  }

  private computeIncrementalUpdate(
    gameId: string,
    oldState: GameState,
    newState: GameState,
    baseVersion: number
  ): IncrementalStateUpdate | null {
    const unitUpdates: UnitDelta[] = [];
    const fieldUpdates: { field: keyof GameState; value: any }[] = [];

    const oldUnitsMap = new Map(oldState.units.map(u => [u.id, u]));
    const newUnitsMap = new Map(newState.units.map(u => [u.id, u]));

    for (const [id, newUnit] of newUnitsMap) {
      const oldUnit = oldUnitsMap.get(id);
      if (!oldUnit) {
        unitUpdates.push({ id, updates: { ...newUnit } });
        continue;
      }

      const updates: Partial<Unit> = {};
      let hasChanges = false;

      (Object.keys(newUnit) as (keyof Unit)[]).forEach(key => {
        if (key === 'id') return;
        const oldVal = oldUnit[key];
        const newVal = newUnit[key];
        
        if (key === 'position') {
          const oldPos = oldVal as Position;
          const newPos = newVal as Position;
          if (oldPos.x !== newPos.x || oldPos.y !== newPos.y || oldPos.z !== newPos.z) {
            updates.position = { ...newPos };
            hasChanges = true;
          }
        } else if (oldVal !== newVal) {
          (updates as any)[key] = newVal;
          hasChanges = true;
        }
      });

      if (hasChanges) {
        unitUpdates.push({ id, updates });
      }
    }

    for (const id of oldUnitsMap.keys()) {
      if (!newUnitsMap.has(id)) {
        unitUpdates.push({ id, updates: { health: 0 } as any });
      }
    }

    const simpleFields: (keyof GameState)[] = ['currentTurn', 'phase', 'status', 'name'];
    for (const field of simpleFields) {
      if (oldState[field] !== newState[field]) {
        fieldUpdates.push({ field, value: newState[field] });
      }
    }

    if (JSON.stringify(oldState.players) !== JSON.stringify(newState.players)) {
      fieldUpdates.push({ field: 'players', value: newState.players });
    }

    if (unitUpdates.length === 0 && fieldUpdates.length === 0) {
      return null;
    }

    const store = this.states.get(gameId)!;
    return {
      gameId,
      version: store.version,
      baseVersion,
      unitUpdates,
      fieldUpdates,
      timestamp: Date.now()
    };
  }

  broadcastState(gameId: string, io: Server, forceFull: boolean = false): void {
    const store = this.states.get(gameId);
    if (!store || !store.current) {
      logger.warn('Cannot broadcast state: game not found', { gameId });
      return;
    }

    const now = Date.now();
    if (!forceFull && now - store.lastBroadcastTime < store.broadcastThrottle) {
      return;
    }
    store.lastBroadcastTime = now;

    const serializedState = serializeGameState(store.current);
    const playerCount = io.sockets.adapter.rooms.get(gameId)?.size || 0;

    if (forceFull || !store.lastState) {
      io.to(gameId).emit(SocketEvent.GAME_STATE_UPDATE, {
        gameState: serializedState,
        version: store.version,
        timestamp: now
      });
      logger.debug('Full state broadcasted', { gameId, version: store.version, playerCount });
      return;
    }

    const incremental = this.computeIncrementalUpdate(
      gameId,
      store.lastState,
      store.current,
      store.version - 1
    );

    if (incremental && incremental.unitUpdates!.length + incremental.fieldUpdates!.length <= 10) {
      io.to(gameId).emit(SocketEvent.INCREMENTAL_UPDATE, incremental);
      logger.debug('Incremental update broadcasted', {
        gameId,
        version: store.version,
        unitChanges: incremental.unitUpdates?.length || 0,
        fieldChanges: incremental.fieldUpdates?.length || 0,
        playerCount
      });
    } else {
      io.to(gameId).emit(SocketEvent.GAME_STATE_UPDATE, {
        gameState: serializedState,
        version: store.version,
        timestamp: now
      });
      logger.debug('Full state broadcasted (fallback)', {
        gameId,
        version: store.version,
        playerCount
      });
    }
  }

  sendStateToPlayer(gameId: string, playerSocket: Socket, forceFull: boolean = true): void {
    const store = this.states.get(gameId);
    if (!store || !store.current) {
      logger.warn('Cannot send state: game not found', { gameId });
      return;
    }

    const clientState = store.clients.get(playerSocket.id) || {
      socketId: playerSocket.id,
      lastVersion: 0,
      lastAckTime: Date.now(),
      pendingMessages: []
    };
    store.clients.set(playerSocket.id, clientState);

    if (forceFull || clientState.lastVersion === 0 || !store.lastState) {
      const serializedState = serializeGameState(store.current);
      playerSocket.emit(SocketEvent.GAME_STATE_UPDATE, {
        gameState: serializedState,
        version: store.version,
        timestamp: Date.now()
      });
      clientState.lastVersion = store.version;
      logger.debug('Full state sent to player', {
        gameId,
        version: store.version,
        socketId: playerSocket.id
      });
      return;
    }

    if (store.version - clientState.lastVersion > 10) {
      const serializedState = serializeGameState(store.current);
      playerSocket.emit(SocketEvent.GAME_STATE_UPDATE, {
        gameState: serializedState,
        version: store.version,
        timestamp: Date.now()
      });
      clientState.lastVersion = store.version;
      logger.debug('Full state sent (version gap too large)', {
        gameId,
        version: store.version,
        lastKnown: clientState.lastVersion,
        socketId: playerSocket.id
      });
      return;
    }

    let baseState = store.lastState;
    for (let v = clientState.lastVersion + 1; v <= store.version; v++) {
      const entry = store.history.find(h => h.version === v);
      if (entry && v - 1 === clientState.lastVersion) {
        const incremental = this.computeIncrementalUpdate(
          gameId,
          baseState,
          entry.state,
          v - 1
        );
        if (incremental) {
          playerSocket.emit(SocketEvent.INCREMENTAL_UPDATE, incremental);
          clientState.lastVersion = v;
          baseState = entry.state;
        }
      }
    }

    logger.debug('Incremental updates sent to player', {
      gameId,
      fromVersion: clientState.lastVersion,
      toVersion: store.version,
      socketId: playerSocket.id
    });
  }

  queueMessage(gameId: string, event: string, data: any, priority: number = 1): void {
    const store = this.ensureStore(gameId);
    const message: QueuedMessage = { event, data, priority, createdAt: Date.now() };
    
    store.messageQueue.push(message);
    
    if (store.messageQueue.length > this.maxQueueSize) {
      store.messageQueue = store.messageQueue
        .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)
        .slice(0, this.maxQueueSize);
      logger.warn('Message queue overflow, trimmed', { gameId, size: store.messageQueue.length });
    }

    if (!store.flushTimeout) {
      store.flushTimeout = setTimeout(() => this.flushQueue(gameId), this.flushInterval);
    }
  }

  private flushQueue(gameId: string): void {
    const store = this.states.get(gameId);
    if (!store || store.messageQueue.length === 0) {
      if (store) store.flushTimeout = null;
      return;
    }

    const messages = store.messageQueue
      .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
    
    store.messageQueue = [];
    store.flushTimeout = null;

    logger.debug('Flushing message queue', { gameId, count: messages.length });
  }

  applyDelta(gameId: string, delta: Partial<GameState>): GameState {
    const currentState = this.getState(gameId);
    if (!currentState) {
      throw new Error(`Game state not found for gameId: ${gameId}`);
    }

    const newState = deepClone(currentState);

    for (const key of Object.keys(delta) as (keyof GameState)[]) {
      if (delta[key] !== undefined) {
        (newState as any)[key] = deepClone(delta[key]);
      }
    }

    newState.updatedAt = new Date();
    this.setState(gameId, newState);

    return newState;
  }

  getStateVersion(gameId: string): number {
    const store = this.states.get(gameId);
    return store ? store.version : 0;
  }

  rollbackState(gameId: string, version: number): GameState | null {
    const store = this.states.get(gameId);
    if (!store) {
      logger.warn('Cannot rollback: game not found', { gameId });
      return null;
    }

    const entry = store.history.find(h => h.version === version);
    if (!entry) {
      logger.warn('Cannot rollback: version not found', { gameId, version });
      return null;
    }

    store.lastState = store.current ? deepClone(store.current) : null;
    store.current = deepClone(entry.state);
    store.version = version;
    store.history = store.history.filter(h => h.version <= version);

    logger.info('State rolled back', { gameId, version });
    return deepClone(store.current);
  }

  removeGame(gameId: string): void {
    const store = this.states.get(gameId);
    if (store?.flushTimeout) {
      clearTimeout(store.flushTimeout);
    }
    this.states.delete(gameId);
    logger.info('Game state removed', { gameId });
  }

  removeClient(gameId: string, socketId: string): void {
    const store = this.states.get(gameId);
    if (store) {
      store.clients.delete(socketId);
    }
  }

  hasGame(gameId: string): boolean {
    return this.states.has(gameId);
  }

  getHistory(gameId: string): StateEntry[] {
    const store = this.states.get(gameId);
    return store ? [...store.history] : [];
  }

  setBroadcastThrottle(gameId: string, throttleMs: number): void {
    const store = this.ensureStore(gameId);
    store.broadcastThrottle = Math.max(16, throttleMs);
    logger.info('Broadcast throttle updated', { gameId, throttleMs: store.broadcastThrottle });
  }

  getStats(gameId: string): any {
    const store = this.states.get(gameId);
    if (!store) return null;
    return {
      version: store.version,
      historySize: store.history.length,
      connectedClients: store.clients.size,
      queueSize: store.messageQueue.length,
      broadcastThrottle: store.broadcastThrottle
    };
  }
}

export const stateSyncService = new StateSyncService();
