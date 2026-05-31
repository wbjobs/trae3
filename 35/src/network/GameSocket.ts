import { io, Socket } from 'socket.io-client';
import type { GameState, Entity, Player } from '../../shared/types';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

type EventCallback = (data: any) => void;

class GameSocketClass {
  private static instance: GameSocketClass;
  private socket: Socket | null = null;
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private _isConnected = false;
  private playerId: string = '';
  private nickname: string = '';
  private cameraPosition: { x: number; y: number } = { x: 0, y: 0 };
  private aoiUpdateInterval: NodeJS.Timeout | null = null;

  static getInstance(): GameSocketClass {
    if (!GameSocketClass.instance) {
      GameSocketClass.instance = new GameSocketClass();
    }
    return GameSocketClass.instance;
  }

  connect(playerId?: string, nickname?: string): void {
    if (this.socket?.connected) return;

    if (playerId) this.playerId = playerId;
    if (nickname) this.nickname = nickname;

    this.socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    this.socket.on('connect', () => {
      console.log('[GameSocket] 已连接到服务器, socketId:', this.socket?.id);
      this._isConnected = true;
      if (this.playerId && this.nickname) {
        (this.socket as any).playerId = this.playerId;
        this.socket.emit('player:authenticate', {
          playerId: this.playerId,
          nickname: this.nickname
        });
      }
      this.startAOIUpdates();
      this.trigger('connect', { socketId: this.socket?.id });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[GameSocket] 与服务器断开连接:', reason);
      this._isConnected = false;
      this.stopAOIUpdates();
      this.trigger('disconnect', { reason });
    });

    this.socket.on('connect_error', (error) => {
      console.error('[GameSocket] 连接错误:', error.message);
    });

    const forwardEvents = [
      'state:update',
      'entity:damage',
      'skill:cast',
      'player:joined',
      'player:left',
      'player:readyChanged',
      'room:ownerChanged',
      'room:update',
      'chat:message',
      'game:start',
      'game:end',
      'game:state',
      'game:over',
      'game:damageEvents',
      'game:skillCastEvents',
      'entity:spawn',
      'entity:destroy',
      'room:playerJoined',
      'room:playerLeft'
    ];

    for (const event of forwardEvents) {
      this.socket.on(event, (data: any) => {
        this.trigger(event, data);
      });
    }
  }

  private startAOIUpdates(): void {
    this.stopAOIUpdates();
    this.aoiUpdateInterval = setInterval(() => {
      if (this._isConnected) {
        this.socket?.emit('player:aoiUpdate', {
          playerId: this.playerId,
          centerX: this.cameraPosition.x,
          centerY: this.cameraPosition.y
        });
      }
    }, 200);
  }

  private stopAOIUpdates(): void {
    if (this.aoiUpdateInterval) {
      clearInterval(this.aoiUpdateInterval);
      this.aoiUpdateInterval = null;
    }
  }

  setCameraPosition(x: number, y: number): void {
    this.cameraPosition = { x, y };
  }

  disconnect(): void {
    this.stopAOIUpdates();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this._isConnected = false;
    }
  }

  on(event: string, callback: EventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: EventCallback): void {
    this.listeners.get(event)?.delete(callback);
  }

  private trigger(event: string, data: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          callback(data);
        } catch (error) {
          console.error(`[GameSocket] 事件处理错误 (${event}):`, error);
        }
      }
    }
  }

  emit(event: string, data: any): void {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    }
  }

  sendMove(entityId: string, targetX: number, targetY: number): void {
    this.emit('entity:move', { entityId, targetX, targetY });
  }

  sendSkill(entityId: string, skillId: string, targetX: number, targetY: number): void {
    this.emit('entity:castSkill', { entityId, skillId, targetX, targetY });
  }

  sendChatMessage(content: string): void {
    this.emit('chat:message', { content });
  }

  getSocketId(): string {
    return this.socket?.id || '';
  }

  isConnectedToServer(): boolean {
    return this._isConnected;
  }

  getPlayerId(): string {
    return this.playerId;
  }

  getNickname(): string {
    return this.nickname;
  }

  setPlayerInfo(playerId: string, nickname: string): void {
    this.playerId = playerId;
    this.nickname = nickname;
    if (this.socket?.connected) {
      (this.socket as any).playerId = playerId;
    }
  }
}

export function applyDeltaToGameState(currentState: GameState, delta: any): GameState {
  if (!delta) return currentState;
  if (delta.type === 'full' && delta.state) {
    return delta.state as GameState;
  }

  if (delta.type !== 'delta') return currentState;

  const newState = { ...currentState };

  if (delta.entities) {
    const entityMap = new Map(currentState.entities.map(e => [e.id, {
      ...e,
      position: { ...e.position },
      velocity: { ...e.velocity },
      skills: e.skills.map(s => ({ ...s }))
    }]));

    for (const change of delta.entities) {
      if (change.type === 'add' && change.entity) {
        entityMap.set(change.entity.id, change.entity);
      } else if (change.type === 'remove') {
        entityMap.delete(change.id);
      } else if (change.type === 'update') {
        const existing = entityMap.get(change.id);
        if (existing) {
          if (change.px !== undefined) existing.position.x = change.px;
          if (change.py !== undefined) existing.position.y = change.py;
          if (change.vx !== undefined) existing.velocity.x = change.vx;
          if (change.vy !== undefined) existing.velocity.y = change.vy;
          if (change.hp !== undefined) existing.health = change.hp;
          if (change.st !== undefined) existing.state = change.st;
          if (change.rot !== undefined) existing.rotation = change.rot;
          if (change.skills) {
            for (const skillDelta of change.skills) {
              const skill = existing.skills.find(s => s.configId === skillDelta.cid);
              if (skill) {
                skill.cooldown = skillDelta.cd;
              }
            }
          }
        }
      }
    }

    newState.entities = Array.from(entityMap.values());
  }

  if (delta.gt !== undefined) newState.gameTime = delta.gt;
  if (delta.isOver !== undefined) {
    newState.isGameOver = delta.isOver;
    newState.winner = delta.winner;
  }

  newState.timestamp = delta.timestamp || Date.now();
  return newState;
}

export const GameSocket = GameSocketClass;
