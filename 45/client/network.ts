import { io, Socket } from 'socket.io-client';
import {
  GameState, Player, Position, SocketEvent, Unit,
  IncrementalStateUpdate, TacticalPlan, GameReplay,
  GameAction, TacticalPlanMessage, ReplayMessage
} from '../shared/types';

function deserializeGameState(state: any): GameState {
  if (!state) return state;

  return {
    ...state,
    createdAt: state.createdAt ? new Date(state.createdAt) : new Date(),
    updatedAt: state.updatedAt ? new Date(state.updatedAt) : new Date(),
    players: (state.players || []).map((p: any) => ({ ...p })),
    units: (state.units || []).map((u: any) => ({
      ...u,
      position: { ...u.position },
      hasMoved: u.hasMoved ?? false,
      hasAttacked: u.hasAttacked ?? false
    }))
  };
}

function deserializeTacticalPlan(plan: any): TacticalPlan {
  if (!plan) return plan;
  return {
    ...plan,
    createdAt: plan.createdAt ? new Date(plan.createdAt) : new Date(),
    updatedAt: plan.updatedAt ? new Date(plan.updatedAt) : new Date(),
    deployments: (plan.deployments || []).map((d: any) => ({
      ...d,
      position: { ...d.position }
    }))
  };
}

function deserializeGameReplay(replay: any): GameReplay {
  if (!replay) return replay;
  return {
    ...replay,
    initialState: deserializeGameState(replay.initialState),
    recordedAt: replay.recordedAt ? new Date(replay.recordedAt) : new Date(),
    actions: (replay.actions || []).map((a: any) => ({ ...a }))
  };
}

function applyIncrementalUpdate(state: GameState, update: IncrementalStateUpdate): GameState {
  const newState = { ...state };
  
  if (update.unitUpdates) {
    const unitMap = new Map(newState.units.map(u => [u.id, { ...u }]));
    
    for (const unitDelta of update.unitUpdates) {
      const existing = unitMap.get(unitDelta.id);
      if (existing) {
        if (unitDelta.updates.health === 0 && unitDelta.updates.maxHealth === undefined) {
          unitMap.delete(unitDelta.id);
        } else {
          unitMap.set(unitDelta.id, { ...existing, ...unitDelta.updates });
        }
      } else if (unitDelta.updates.health !== 0) {
        unitMap.set(unitDelta.id, unitDelta.updates as Unit);
      }
    }
    
    newState.units = Array.from(unitMap.values());
  }

  if (update.fieldUpdates) {
    for (const fieldUpdate of update.fieldUpdates) {
      (newState as any)[fieldUpdate.field] = fieldUpdate.value;
    }
  }

  newState.updatedAt = new Date();
  return newState;
}

interface StateUpdateData {
  gameState: GameState;
  version: number;
  timestamp: number;
}

interface IncrementalUpdateData extends IncrementalStateUpdate {}

export class NetworkClient {
  private socket: Socket | null = null;
  isConnected: boolean = false;
  currentGameId: string | null = null;
  currentPlayer: Player | null = null;
  private stateVersion: number = 0;
  private currentState: GameState | null = null;
  private eventListeners: Map<SocketEvent, Set<(data: any) => void>> = new Map();
  private pendingPromises: Map<string, { resolve: (value: any) => void; reject: (reason: any) => void }> = new Map();
  private autoRequestFullState: boolean = true;

  constructor(private serverUrl: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(this.serverUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        ackTimeout: 10000
      });

      this.socket.on('connect', () => {
        this.isConnected = true;
        this.stateVersion = 0;
        this.currentState = null;
        resolve();
      });

      this.socket.on('connect_error', (error: Error) => {
        this.isConnected = false;
        reject(error);
      });

      this.socket.on('disconnect', () => {
        this.isConnected = false;
      });

      this.socket.on(SocketEvent.GAME_STATE_UPDATE, (data: StateUpdateData) => {
        this.handleStateUpdate(data);
      });

      this.socket.on(SocketEvent.INCREMENTAL_UPDATE, (data: IncrementalUpdateData) => {
        this.handleIncrementalUpdate(data);
      });

      this.socket.on(SocketEvent.ERROR, (data: { code: string; message: string }) => {
        console.error('Server error:', data);
        this.emitToListeners(SocketEvent.ERROR, data);
      });

      this.socket.on(SocketEvent.GAME_START, (data: { success: boolean; game: GameState }) => {
        if (data.success && data.game) {
          const deserialized = deserializeGameState(data.game);
          this.currentState = deserialized;
          this.emitToListeners(SocketEvent.GAME_START, { ...data, game: deserialized });
        }
      });

      this.socket.on(SocketEvent.CHAT_MESSAGE, (data: any) => {
        this.emitToListeners(SocketEvent.CHAT_MESSAGE, {
          ...data,
          timestamp: data.timestamp ? new Date(data.timestamp) : new Date()
        });
      });
    });
  }

  private handleStateUpdate(data: StateUpdateData): void {
    if (!data || !data.gameState) {
      console.warn('Received invalid state update');
      return;
    }

    if (data.version !== undefined && data.version < this.stateVersion) {
      console.warn('Received outdated state update, ignoring', {
        received: data.version,
        current: this.stateVersion
      });
      return;
    }

    const deserialized = deserializeGameState(data.gameState);
    this.currentState = deserialized;

    if (data.version !== undefined) {
      this.stateVersion = data.version;
    }

    this.emitToListeners(SocketEvent.GAME_STATE_UPDATE, {
      ...data,
      gameState: deserialized
    });
  }

  private handleIncrementalUpdate(data: IncrementalUpdateData): void {
    if (!data || !data.gameId) {
      console.warn('Received invalid incremental update');
      return;
    }

    if (data.baseVersion !== this.stateVersion) {
      console.warn('Version mismatch for incremental update', {
        baseVersion: data.baseVersion,
        currentVersion: this.stateVersion
      });
      if (this.autoRequestFullState && this.socket) {
        this.requestFullState();
      }
      return;
    }

    if (!this.currentState) {
      console.warn('No current state, requesting full state');
      if (this.autoRequestFullState && this.socket) {
        this.requestFullState();
      }
      return;
    }

    try {
      const updatedState = applyIncrementalUpdate(this.currentState, data);
      this.currentState = updatedState;
      this.stateVersion = data.version;

      this.emitToListeners(SocketEvent.GAME_STATE_UPDATE, {
        gameState: updatedState,
        version: data.version,
        timestamp: data.timestamp,
        incremental: true
      });
    } catch (error) {
      console.error('Failed to apply incremental update:', error);
      if (this.autoRequestFullState && this.socket) {
        this.requestFullState();
      }
    }
  }

  private requestFullState(): void {
    if (!this.socket || !this.currentGameId) return;
    
    this.socket.emit(SocketEvent.REQUEST_FULL_STATE, {
      roomId: this.currentGameId
    });
  }

  private emitToListeners(event: SocketEvent, data: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in event listener', { event, error });
        }
      });
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.currentGameId = null;
      this.currentPlayer = null;
      this.stateVersion = 0;
      this.currentState = null;
    }
  }

  createGame(name: string, playerName: string, team: string = 'RED'): Promise<GameState> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.isConnected) {
        reject(new Error('Not connected to server'));
        return;
      }

      const requestId = `create_${Date.now()}`;
      this.pendingPromises.set(requestId, { resolve, reject });

      this.socket.emit(SocketEvent.CREATE_GAME, { name, playerName, team }, (response: any) => {
        this.pendingPromises.delete(requestId);
        if (response.success && response.game) {
          const game = deserializeGameState(response.game);
          this.currentGameId = game.id;
          this.currentState = game;
          resolve(game);
        } else {
          reject(new Error(response.error || 'Failed to create game'));
        }
      });
    });
  }

  listGames(): Promise<GameState[]> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.isConnected) {
        reject(new Error('Not connected to server'));
        return;
      }

      const requestId = `list_${Date.now()}`;
      this.pendingPromises.set(requestId, { resolve, reject });

      this.socket.emit(SocketEvent.LIST_GAMES, {}, (response: any) => {
        this.pendingPromises.delete(requestId);
        if (response.success && response.games) {
          const games = response.games.map(deserializeGameState);
          resolve(games);
        } else {
          reject(new Error(response.error || 'Failed to list games'));
        }
      });
    });
  }

  joinGame(gameId: string, playerName: string, team: string = 'BLUE'): Promise<{ success: boolean; game?: GameState; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.isConnected) {
        resolve({ success: false, error: 'Not connected to server' });
        return;
      }

      const requestId = `join_${Date.now()}`;
      this.pendingPromises.set(requestId, {
        resolve: (v) => resolve(v),
        reject: (e) => resolve({ success: false, error: e.message })
      });

      this.socket.emit(SocketEvent.JOIN_ROOM, { roomId: gameId, playerName, team }, (response: any) => {
        this.pendingPromises.delete(requestId);
        if (response.success && response.game) {
          const game = deserializeGameState(response.game);
          this.currentGameId = gameId;
          this.currentPlayer = response.player || null;
          this.currentState = game;
          this.stateVersion = 0;
          resolve({ success: true, game });
        } else {
          resolve({ success: false, error: response.error || 'Failed to join game' });
        }
      });
    });
  }

  leaveGame(): void {
    if (this.socket && this.currentGameId && this.currentPlayer) {
      this.socket.emit(SocketEvent.LEAVE_ROOM, {
        roomId: this.currentGameId,
        playerId: this.currentPlayer.id
      }, () => {
        this.currentGameId = null;
        this.currentPlayer = null;
        this.stateVersion = 0;
        this.currentState = null;
      });
    } else {
      this.currentGameId = null;
      this.currentPlayer = null;
      this.stateVersion = 0;
      this.currentState = null;
    }
  }

  setReady(isReady: boolean): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.socket || !this.currentGameId || !this.currentPlayer) {
        resolve(false);
        return;
      }

      this.socket.emit(SocketEvent.PLAYER_READY, {
        roomId: this.currentGameId,
        playerId: this.currentPlayer.id,
        isReady
      }, (response: any) => {
        resolve(response?.success ?? true);
      });
    });
  }

  startGame(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.socket || !this.currentGameId) {
        resolve(false);
        return;
      }

      this.socket.emit(SocketEvent.GAME_START, {
        roomId: this.currentGameId
      }, (response: any) => {
        resolve(response?.success ?? false);
      });
    });
  }

  moveUnit(unitId: string, targetPos: Position): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.socket || !this.currentGameId || !this.currentPlayer) {
        resolve(false);
        return;
      }

      this.socket.emit(SocketEvent.MOVE_UNIT, {
        roomId: this.currentGameId,
        playerId: this.currentPlayer.id,
        unitId,
        position: targetPos
      }, (response: any) => {
        resolve(response?.success ?? false);
      });
    });
  }

  attackUnit(attackerId: string, targetId: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.socket || !this.currentGameId || !this.currentPlayer) {
        resolve(false);
        return;
      }

      this.socket.emit(SocketEvent.ATTACK_UNIT, {
        roomId: this.currentGameId,
        playerId: this.currentPlayer.id,
        attackerId,
        targetId
      }, (response: any) => {
        resolve(response?.success ?? false);
      });
    });
  }

  endTurn(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.socket || !this.currentGameId || !this.currentPlayer) {
        resolve(false);
        return;
      }

      this.socket.emit(SocketEvent.END_TURN, {
        roomId: this.currentGameId,
        playerId: this.currentPlayer.id
      }, (response: any) => {
        resolve(response?.success ?? false);
      });
    });
  }

  sendChat(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.socket || !this.currentGameId || !this.currentPlayer || !message.trim()) {
        resolve(false);
        return;
      }

      this.socket.emit(SocketEvent.CHAT_MESSAGE, {
        roomId: this.currentGameId,
        playerId: this.currentPlayer.id,
        content: message
      }, (response: any) => {
        resolve(response?.success ?? false);
      });
    });
  }

  saveTacticalPlan(plan: Partial<TacticalPlan>): Promise<TacticalPlan | null> {
    return new Promise((resolve) => {
      if (!this.socket || !this.isConnected || !this.currentPlayer) {
        resolve(null);
        return;
      }

      this.socket.emit(SocketEvent.SAVE_TACTICAL_PLAN, {
        plan: { ...plan, playerId: this.currentPlayer.id }
      }, (response: any) => {
        if (response?.success && response.plan) {
          resolve(deserializeTacticalPlan(response.plan));
        } else {
          resolve(null);
        }
      });
    });
  }

  loadTacticalPlan(planId: string): Promise<TacticalPlan | null> {
    return new Promise((resolve) => {
      if (!this.socket || !this.isConnected) {
        resolve(null);
        return;
      }

      this.socket.emit(SocketEvent.LOAD_TACTICAL_PLAN, { planId }, (response: any) => {
        if (response?.success && response.plan) {
          resolve(deserializeTacticalPlan(response.plan));
        } else {
          resolve(null);
        }
      });
    });
  }

  listTacticalPlans(playerId?: string): Promise<TacticalPlan[]> {
    return new Promise((resolve) => {
      if (!this.socket || !this.isConnected) {
        resolve([]);
        return;
      }

      this.socket.emit(SocketEvent.LIST_TACTICAL_PLANS, {
        playerId: playerId || this.currentPlayer?.id
      }, (response: any) => {
        if (response?.success && response.plans) {
          resolve(response.plans.map(deserializeTacticalPlan));
        } else {
          resolve([]);
        }
      });
    });
  }

  deleteTacticalPlan(planId: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.socket || !this.isConnected) {
        resolve(false);
        return;
      }

      this.socket.emit(SocketEvent.DELETE_TACTICAL_PLAN, { planId }, (response: any) => {
        resolve(response?.success ?? false);
      });
    });
  }

  applyTacticalPlan(planId: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.socket || !this.currentGameId || !this.currentPlayer) {
        resolve(false);
        return;
      }

      this.socket.emit(SocketEvent.APPLY_TACTICAL_PLAN, {
        roomId: this.currentGameId,
        playerId: this.currentPlayer.id,
        planId
      }, (response: any) => {
        resolve(response?.success ?? false);
      });
    });
  }

  saveReplay(gameId: string, name: string): Promise<GameReplay | null> {
    return new Promise((resolve) => {
      if (!this.socket || !this.isConnected) {
        resolve(null);
        return;
      }

      this.socket.emit(SocketEvent.SAVE_REPLAY, { gameId, name }, (response: any) => {
        if (response?.success && response.replay) {
          resolve(deserializeGameReplay(response.replay));
        } else {
          resolve(null);
        }
      });
    });
  }

  loadReplay(replayId: string): Promise<GameReplay | null> {
    return new Promise((resolve) => {
      if (!this.socket || !this.isConnected) {
        resolve(null);
        return;
      }

      this.socket.emit(SocketEvent.LOAD_REPLAY, { replayId }, (response: any) => {
        if (response?.success && response.replay) {
          resolve(deserializeGameReplay(response.replay));
        } else {
          resolve(null);
        }
      });
    });
  }

  listReplays(): Promise<GameReplay[]> {
    return new Promise((resolve) => {
      if (!this.socket || !this.isConnected) {
        resolve([]);
        return;
      }

      this.socket.emit(SocketEvent.LIST_REPLAYS, {}, (response: any) => {
        if (response?.success && response.replays) {
          resolve(response.replays.map(deserializeGameReplay));
        } else {
          resolve([]);
        }
      });
    });
  }

  deleteReplay(replayId: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.socket || !this.isConnected) {
        resolve(false);
        return;
      }

      this.socket.emit(SocketEvent.DELETE_REPLAY, { replayId }, (response: any) => {
        resolve(response?.success ?? false);
      });
    });
  }

  getCurrentState(): GameState | null {
    return this.currentState ? { ...this.currentState } : null;
  }

  on(event: SocketEvent, callback: (data: any) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);

    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event: SocketEvent, callback: (data: any) => void): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }

    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  getStateVersion(): number {
    return this.stateVersion;
  }

  reconnect(): Promise<void> {
    this.disconnect();
    return this.connect();
  }

  setAutoRequestFullState(enabled: boolean): void {
    this.autoRequestFullState = enabled;
  }
}
