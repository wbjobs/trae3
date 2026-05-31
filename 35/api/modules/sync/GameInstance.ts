import type { Server, Socket } from 'socket.io';
import type { Player, Room } from '../../../shared/types.js';
import { SimulationEngine } from '../simulation/SimulationEngine.js';
import { StateSynchronizer } from './StateSynchronizer.js';
import { PersistenceManager } from '../persistence/PersistenceManager.js';

export class GameInstance {
  private room: Room;
  private io: Server;
  private simulationEngine: SimulationEngine;
  private stateSynchronizer: StateSynchronizer;
  private persistenceManager: PersistenceManager;
  private updateIntervalId: NodeJS.Timeout | null = null;
  private tickRate: number = 60;
  private isRunning: boolean = false;
  private isStopped: boolean = false;
  private playerSockets: Map<string, Socket> = new Map();

  constructor(
    room: Room,
    io: Server,
    persistenceManager: PersistenceManager
  ) {
    this.room = room;
    this.io = io;
    this.persistenceManager = persistenceManager;

    this.simulationEngine = new SimulationEngine(room.mapId, room.players);

    this.stateSynchronizer = new StateSynchronizer(
      io,
      room.id,
      () => this.simulationEngine.getState(),
      () => this.simulationEngine.getDamageEvents(),
      () => this.simulationEngine.getSkillCastEvents()
    );
  }

  start(): void {
    if (this.isRunning) return;

    this.simulationEngine.initialize();
    this.isRunning = true;
    this.isStopped = false;

    const tickInterval = 1000 / this.tickRate;
    this.updateIntervalId = setInterval(() => {
      this.tick();
    }, tickInterval);

    this.stateSynchronizer.start();
    this.stateSynchronizer.sendInitialState();

    this.room.status = 'playing';
    this.room.gameStartTime = Date.now();

    console.log(`[GameInstance] 游戏实例已启动，房间: ${this.room.name}`);
  }

  stop(): void {
    if (this.isStopped) return;
    this.isStopped = true;
    this.isRunning = false;

    if (this.updateIntervalId) {
      clearInterval(this.updateIntervalId);
      this.updateIntervalId = null;
    }

    this.stateSynchronizer.stop();
    this.simulationEngine.stop();

    try {
      const endTime = Date.now();
      const finalState = this.simulationEngine.getState();

      this.persistenceManager.saveGameRecord(
        this.room.id,
        this.room.name,
        this.room.players,
        finalState,
        this.room.gameStartTime || Date.now(),
        endTime
      );

      this.room.status = 'ended';
      this.room.gameEndTime = endTime;
      this.room.winnerId = finalState.winner;
      console.log(`[GameInstance] 游戏实例已停止，存档成功，房间: ${this.room.name}`);
    } catch (error) {
      console.error(`[GameInstance] 游戏存档失败:`, error);
      this.room.status = 'ended';
    }
  }

  private tick(): void {
    if (!this.isRunning) {
      if (this.updateIntervalId) {
        clearInterval(this.updateIntervalId);
        this.updateIntervalId = null;
      }
      this.stop();
      return;
    }
    this.simulationEngine.update();

    if (!this.simulationEngine.isGameRunning()) {
      this.isRunning = false;
    }
  }

  handlePlayerMove(
    playerId: string,
    entityId: string,
    targetX: number,
    targetY: number
  ): boolean {
    return this.simulationEngine.handlePlayerMove(playerId, entityId, targetX, targetY);
  }

  handlePlayerSkill(
    playerId: string,
    entityId: string,
    skillId: string,
    targetX: number,
    targetY: number
  ): boolean {
    return this.simulationEngine.handlePlayerSkill(
      playerId,
      entityId,
      skillId,
      targetX,
      targetY
    );
  }

  addPlayerSocket(playerId: string, socket: Socket): void {
    this.playerSockets.set(playerId, socket)
  }

  removePlayerSocket(playerId: string): void {
    this.playerSockets.delete(playerId)
  }

  setPlayerInterest(playerId: string, centerX: number, centerY: number): void {
    this.stateSynchronizer.setPlayerInterest(playerId, centerX, centerY)
  }

  getRoom(): Room {
    return this.room;
  }

  getSimulationEngine(): SimulationEngine {
    return this.simulationEngine;
  }

  getPlayers(): Player[] {
    return this.room.players;
  }

  isGameRunning(): boolean {
    return this.isRunning;
  }

  getCurrentState() {
    return this.simulationEngine.getState();
  }
}
