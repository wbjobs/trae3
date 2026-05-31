import type { Server } from 'socket.io';
import type { GameState, Entity, DamageEvent, SkillCastEvent } from '../../../shared/types.js';
import { MathUtils } from '../../utils/MathUtils.js';

interface PlayerInterest {
  centerX: number;
  centerY: number;
  radius: number;
  visibleEntityIds: Set<string>;
}

interface DeltaBuffer {
  sequence: number;
  entities: any[];
  players: any[];
  events: {
    damage: DamageEvent[];
    skills: SkillCastEvent[];
  };
  timestamp: number;
}

export class StateSynchronizer {
  private io: Server;
  private roomId: string;
  private syncInterval: number = 50;
  private intervalId: NodeJS.Timeout | null = null;
  private getState: () => GameState;
  private getDamageEvents: () => DamageEvent[];
  private getSkillCastEvents: () => SkillCastEvent[];

  private sequenceNumber: number = 0;
  private lastSentStates: Map<string, GameState> = new Map();
  private playerInterests: Map<string, PlayerInterest> = new Map();
  private deltaBuffer: DeltaBuffer | null = null;
  private aoiEnabled: boolean = true;
  private defaultAoiRadius: number = 600;

  private stats = {
    totalSyncs: 0,
    avgPayloadSize: 0,
    payloadSizes: [] as number[]
  };

  constructor(
    io: Server,
    roomId: string,
    getState: () => GameState,
    getDamageEvents: () => DamageEvent[],
    getSkillCastEvents: () => SkillCastEvent[]
  ) {
    this.io = io;
    this.roomId = roomId;
    this.getState = getState;
    this.getDamageEvents = getDamageEvents;
    this.getSkillCastEvents = getSkillCastEvents;
  }

  start(): void {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      this.sync();
    }, this.syncInterval);

    console.log(`[StateSynchronizer] 状态同步已启动，房间: ${this.roomId}, 间隔: ${this.syncInterval}ms, AOI: ${this.aoiEnabled ? '开启' : '关闭'}`);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log(`[StateSynchronizer] 状态同步已停止，房间: ${this.roomId}`);
      console.log(`[StateSynchronizer] 统计 - 总同步: ${this.stats.totalSyncs}, 平均包大小: ${Math.round(this.stats.avgPayloadSize)} bytes`);
    }
  }

  setPlayerInterest(playerId: string, centerX: number, centerY: number, radius?: number): void {
    const existing = this.playerInterests.get(playerId);
    this.playerInterests.set(playerId, {
      centerX,
      centerY,
      radius: radius || this.defaultAoiRadius,
      visibleEntityIds: existing?.visibleEntityIds || new Set()
    });
  }

  removePlayerInterest(playerId: string): void {
    this.playerInterests.delete(playerId);
  }

  private sync(): void {
    const state = this.getState();
    this.sequenceNumber++;
    this.stats.totalSyncs++;

    const damageEvents = this.getDamageEvents();
    const skillEvents = this.getSkillCastEvents();

    const sockets = this.io.sockets.adapter.rooms.get(this.roomId);
    if (!sockets) return;

    for (const socketId of sockets) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (!socket) continue;

      const playerId = (socket as any).playerId;
      if (!playerId) continue;

      const interest = this.playerInterests.get(playerId);
      const lastState = this.lastSentStates.get(playerId);

      const payload = this.buildDeltaForPlayer(
        state,
        lastState,
        interest,
        damageEvents,
        skillEvents
      );

      const payloadStr = JSON.stringify(payload);
      this.recordPayloadSize(payloadStr.length);

      socket.emit('state:update', payload);

      this.lastSentStates.set(playerId, { ...state });
    }

    if (state.isGameOver) {
      this.io.to(this.roomId).emit('game:over', {
        winner: state.winner,
        stats: state.players
      });
      this.stop();
    }
  }

  private buildDeltaForPlayer(
    currentState: GameState,
    lastState: GameState | undefined,
    interest: PlayerInterest | undefined,
    damageEvents: DamageEvent[],
    skillEvents: SkillCastEvent[]
  ): object {
    const visibleEntities = interest && this.aoiEnabled
      ? currentState.entities.filter(e => this.isInAOI(e, interest))
      : currentState.entities;

    if (!lastState) {
      return {
        type: 'full',
        seq: this.sequenceNumber,
        state: {
          ...currentState,
          entities: visibleEntities
        },
        timestamp: Date.now()
      };
    }

    const delta: any = {
      type: 'delta',
      seq: this.sequenceNumber,
      timestamp: Date.now()
    };

    const lastVisibleMap = new Map(lastState.entities.map(e => [e.id, e]));
    const currentVisibleMap = new Map(visibleEntities.map(e => [e.id, e]));
    const entityDeltas: any[] = [];

    for (const entity of visibleEntities) {
      const prev = lastVisibleMap.get(entity.id);
      if (!prev) {
        entityDeltas.push({ type: 'add', entity });
        continue;
      }

      const changed: any = { id: entity.id, type: 'update' };
      let hasChange = false;

      if (!MathUtils.floatsEqual(entity.position.x, prev.position.x, 0.01)) {
        changed.px = Math.round(entity.position.x * 100) / 100;
        hasChange = true;
      }
      if (!MathUtils.floatsEqual(entity.position.y, prev.position.y, 0.01)) {
        changed.py = Math.round(entity.position.y * 100) / 100;
        hasChange = true;
      }
      if (!MathUtils.floatsEqual(entity.velocity.x, prev.velocity.x, 0.1)) {
        changed.vx = Math.round(entity.velocity.x * 10) / 10;
        hasChange = true;
      }
      if (!MathUtils.floatsEqual(entity.velocity.y, prev.velocity.y, 0.1)) {
        changed.vy = Math.round(entity.velocity.y * 10) / 10;
        hasChange = true;
      }
      if (entity.health !== prev.health) {
        changed.hp = Math.round(entity.health);
        hasChange = true;
      }
      if (entity.state !== prev.state) {
        changed.st = entity.state;
        hasChange = true;
      }
      if (!MathUtils.floatsEqual(entity.rotation, prev.rotation, 0.001)) {
        changed.rot = Math.round(entity.rotation * 1000) / 1000;
        hasChange = true;
      }

      const skillChanged = entity.skills.some((s, i) => {
        const ps = prev.skills[i];
        return !ps || !MathUtils.floatsEqual(s.cooldown, ps.cooldown, 0.01);
      });
      if (skillChanged) {
        changed.skills = entity.skills.map(s => ({
          cid: s.configId,
          cd: Math.round(s.cooldown * 100) / 100
        }));
        hasChange = true;
      }

      if (hasChange) {
        entityDeltas.push(changed);
      }
    }

    for (const [id] of lastVisibleMap) {
      if (!currentVisibleMap.has(id)) {
        entityDeltas.push({ type: 'remove', id });
      }
    }

    delta.entities = entityDeltas;

    if (currentState.gameTime !== lastState.gameTime) {
      delta.gt = currentState.gameTime;
    }
    if (currentState.isGameOver !== lastState.isGameOver) {
      delta.isOver = currentState.isGameOver;
      delta.winner = currentState.winner;
    }

    if (damageEvents.length > 0) {
      delta.dmg = damageEvents.map(e => ({
        tid: e.targetId,
        sid: e.sourceId,
        dmg: e.damage,
        x: e.x,
        y: e.y
      }));
    }

    if (skillEvents.length > 0) {
      delta.skl = skillEvents.map(e => ({
        sid: e.skillId,
        cid: e.casterId,
        x: e.x,
        y: e.y
      }));
    }

    return delta;
  }

  private isInAOI(entity: Entity, interest: PlayerInterest): boolean {
    const dx = entity.position.x - interest.centerX;
    const dy = entity.position.y - interest.centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist <= interest.radius + 200;
  }

  private recordPayloadSize(size: number): void {
    this.stats.payloadSizes.push(size);
    if (this.stats.payloadSizes.length > 100) {
      this.stats.payloadSizes.shift();
    }
    this.stats.avgPayloadSize = this.stats.payloadSizes.reduce((a, b) => a + b, 0) / this.stats.payloadSizes.length;
  }

  sendInitialState(): void {
    const state = this.getState();
    this.sequenceNumber++;
    this.io.to(this.roomId).emit('game:start', {
      type: 'full',
      seq: this.sequenceNumber,
      state,
      timestamp: Date.now()
    });
    console.log(`[StateSynchronizer] 发送初始状态，房间: ${this.roomId}`);
  }

  broadcast(event: string, data: unknown): void {
    this.io.to(this.roomId).emit(event, data);
  }

  sendTo(socketId: string, event: string, data: unknown): void {
    this.io.to(socketId).emit(event, data);
  }

  setAOIEnabled(enabled: boolean): void {
    this.aoiEnabled = enabled;
    console.log(`[StateSynchronizer] AOI ${enabled ? '启用' : '禁用'}`);
  }

  setSyncInterval(interval: number): void {
    this.syncInterval = Math.max(16, interval);
    if (this.intervalId) {
      this.stop();
      this.start();
    }
  }

  setDefaultAoiRadius(radius: number): void {
    this.defaultAoiRadius = radius;
  }

  getStats() {
    return { ...this.stats };
  }
}
