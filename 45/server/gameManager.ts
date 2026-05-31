import type { GameState, Player, Position, Unit, GameAction, TacticalPlan, GameReplay } from '../shared/types';
import { GamePhase, GameStatus, DEFAULT_GAME_CONFIG, ERROR_CODES, Team, UnitType, DEFAULT_UNIT_STATS } from '../shared/constants';
import { generateId, deepClone } from '../shared/utils';
import { ActionType } from '../shared/types';
import { logger } from './logger';
import type { DatabaseManager } from './database';
import type { StateSyncService } from './stateSync';
import type { TacticalEngine } from './tacticalEngine';

export class GameManager {
  private database: DatabaseManager;
  private stateSync: StateSyncService;
  private engine: TacticalEngine;
  private actionLogs: Map<string, GameAction[]> = new Map();

  constructor(database: DatabaseManager, stateSync: StateSyncService, engine: TacticalEngine) {
    this.database = database;
    this.stateSync = stateSync;
    this.engine = engine;
    logger.info('GameManager initialized');
  }

  async createGame(name: string, creator: Player, mapId?: string): Promise<GameState> {
    const now = new Date();
    const gameState: GameState = {
      id: generateId(),
      name,
      players: [creator],
      units: [],
      currentTurn: '',
      phase: GamePhase.WAITING,
      status: GameStatus.LOBBY,
      createdAt: now,
      updatedAt: now
    };

    await this.database.createGame(gameState);
    this.stateSync.setState(gameState.id, gameState);
    this.actionLogs.set(gameState.id, []);

    logger.info('Game created', { gameId: gameState.id, name, creatorId: creator.id });
    return gameState;
  }

  async joinGame(gameId: string, player: Player): Promise<{ success: boolean; game?: GameState; error?: string }> {
    let game = this.stateSync.getState(gameId);
    if (!game) {
      game = await this.database.getGame(gameId);
    }

    if (!game) {
      return { success: false, error: ERROR_CODES.GAME_NOT_FOUND };
    }

    if (game.status !== GameStatus.LOBBY) {
      return { success: false, error: ERROR_CODES.GAME_ALREADY_STARTED };
    }

    if (game.players.length >= DEFAULT_GAME_CONFIG.maxPlayers) {
      return { success: false, error: ERROR_CODES.GAME_FULL };
    }

    const existingPlayer = game.players.find(p => p.id === player.id);
    if (existingPlayer) {
      existingPlayer.socketId = player.socketId;
      existingPlayer.name = player.name;
    } else {
      game.players.push(player);
    }

    await this.database.addPlayerToGame(gameId, player);
    this.stateSync.setState(gameId, game);

    logger.info('Player joined game', { gameId, playerId: player.id });
    return { success: true, game };
  }

  async leaveGame(gameId: string, playerId: string): Promise<{ success: boolean; error?: string }> {
    let game = this.stateSync.getState(gameId);
    if (!game) {
      game = await this.database.getGame(gameId);
    }

    if (!game) {
      return { success: false, error: ERROR_CODES.GAME_NOT_FOUND };
    }

    const playerIndex = game.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) {
      return { success: false, error: ERROR_CODES.PLAYER_NOT_FOUND };
    }

    game.players.splice(playerIndex, 1);
    await this.database.removePlayerFromGame(gameId, playerId);

    if (game.players.length === 0) {
      this.stateSync.removeGame(gameId);
      this.actionLogs.delete(gameId);
      logger.info('Game removed due to no players', { gameId });
    } else {
      this.stateSync.setState(gameId, game);
    }

    logger.info('Player left game', { gameId, playerId });
    return { success: true };
  }

  async startGame(gameId: string): Promise<{ success: boolean; game?: GameState; error?: string }> {
    let game = this.stateSync.getState(gameId);
    if (!game) {
      game = await this.database.getGame(gameId);
    }

    if (!game) {
      return { success: false, error: ERROR_CODES.GAME_NOT_FOUND };
    }

    if (game.status !== GameStatus.LOBBY) {
      return { success: false, error: ERROR_CODES.GAME_ALREADY_STARTED };
    }

    if (game.players.length < 2) {
      return { success: false, error: 'Need at least 2 players to start' };
    }

    const allReady = game.players.every(p => p.isReady);
    if (!allReady) {
      return { success: false, error: 'Not all players are ready' };
    }

    game.phase = GamePhase.PREPARING;
    game.status = GameStatus.IN_PROGRESS;
    game.currentTurn = game.players[0].id;

    this.spawnInitialUnits(game);

    game.phase = GamePhase.PLAYING;
    await this.database.updateGame(gameId, {
      phase: game.phase,
      status: game.status,
      currentTurn: game.currentTurn
    });

    for (const unit of game.units) {
      await this.database.saveUnit(gameId, unit);
    }

    this.stateSync.setState(gameId, game);
    this.actionLogs.set(gameId, []);

    this.logAction(gameId, {
      id: generateId(),
      type: ActionType.GAME_START,
      playerId: game.currentTurn,
      timestamp: Date.now(),
      data: { players: game.players.map(p => p.id), mapId: 'default' }
    });

    logger.info('Game started', { gameId, playerCount: game.players.length });
    return { success: true, game };
  }

  async playerReady(gameId: string, playerId: string, isReady: boolean): Promise<void> {
    let game = this.stateSync.getState(gameId);
    if (!game) {
      game = await this.database.getGame(gameId);
    }

    if (!game) {
      logger.warn('Game not found for playerReady', { gameId, playerId });
      return;
    }

    const player = game.players.find(p => p.id === playerId);
    if (player) {
      player.isReady = isReady;
      await this.database.addPlayerToGame(gameId, player);
      this.stateSync.setState(gameId, game);
      logger.debug('Player ready status updated', { gameId, playerId, isReady });
    }
  }

  async handleMove(gameId: string, playerId: string, unitId: string, targetPos: Position): Promise<{ success: boolean; error?: string }> {
    const game = this.stateSync.getState(gameId);
    if (!game) {
      return { success: false, error: ERROR_CODES.GAME_NOT_FOUND };
    }

    if (game.status !== GameStatus.IN_PROGRESS || game.phase !== GamePhase.PLAYING) {
      return { success: false, error: 'Game is not in playing phase' };
    }

    if (game.currentTurn !== playerId) {
      return { success: false, error: ERROR_CODES.NOT_YOUR_TURN };
    }

    const unit = game.units.find(u => u.id === unitId);
    if (!unit) {
      return { success: false, error: ERROR_CODES.UNIT_NOT_FOUND };
    }

    if (unit.playerId !== playerId) {
      return { success: false, error: 'Not your unit' };
    }

    const result = this.engine.moveUnit(game, unitId, targetPos);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    const updatedUnit = result.newState.units.find(u => u.id === unitId)!;
    await this.database.saveUnit(gameId, updatedUnit);
    this.stateSync.setState(gameId, result.newState);

    this.logAction(gameId, {
      id: generateId(),
      type: ActionType.MOVE,
      playerId,
      timestamp: Date.now(),
      data: {
        unitId,
        from: { x: unit.position.x, y: unit.position.y },
        to: { x: targetPos.x, y: targetPos.y }
      }
    });

    logger.debug('Unit moved', { gameId, unitId, targetPos });
    return { success: true };
  }

  async handleAttack(gameId: string, playerId: string, attackerId: string, targetId: string): Promise<{ success: boolean; error?: string }> {
    const game = this.stateSync.getState(gameId);
    if (!game) {
      return { success: false, error: ERROR_CODES.GAME_NOT_FOUND };
    }

    if (game.status !== GameStatus.IN_PROGRESS || game.phase !== GamePhase.PLAYING) {
      return { success: false, error: 'Game is not in playing phase' };
    }

    if (game.currentTurn !== playerId) {
      return { success: false, error: ERROR_CODES.NOT_YOUR_TURN };
    }

    const attacker = game.units.find(u => u.id === attackerId);
    if (!attacker || attacker.playerId !== playerId) {
      return { success: false, error: ERROR_CODES.UNIT_NOT_FOUND };
    }

    const result = this.engine.attackUnit(game, attackerId, targetId);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    await this.database.saveBattleLog(gameId, {
      id: generateId(),
      type: ActionType.ATTACK,
      playerId,
      timestamp: Date.now(),
      data: {
        attackerId,
        targetId,
        damage: result.damage
      }
    });

    const targetUnit = result.newState.units.find(u => u.id === targetId);
    if (targetUnit) {
      await this.database.saveUnit(gameId, targetUnit);
    }

    await this.database.saveUnit(gameId, result.newState.units.find(u => u.id === attackerId)!);
    this.stateSync.setState(gameId, result.newState);

    this.logAction(gameId, {
      id: generateId(),
      type: ActionType.ATTACK,
      playerId,
      timestamp: Date.now(),
      data: {
        attackerId,
        targetId,
        damage: result.damage,
        targetHealth: targetUnit ? targetUnit.health : 0
      }
    });

    const gameOverResult = this.engine.checkGameOver(result.newState);
    if (gameOverResult.isOver) {
      this.logAction(gameId, {
        id: generateId(),
        type: ActionType.GAME_END,
        playerId: gameOverResult.winner || '',
        timestamp: Date.now(),
        data: { winner: gameOverResult.winner, reason: gameOverResult.reason || '' }
      });
    }

    logger.debug('Attack executed', { gameId, attackerId, targetId, damage: result.damage });
    return { success: true };
  }

  async handleEndTurn(gameId: string, playerId: string): Promise<{ success: boolean; error?: string }> {
    const game = this.stateSync.getState(gameId);
    if (!game) {
      return { success: false, error: ERROR_CODES.GAME_NOT_FOUND };
    }

    if (game.status !== GameStatus.IN_PROGRESS || game.phase !== GamePhase.PLAYING) {
      return { success: false, error: 'Game is not in playing phase' };
    }

    if (game.currentTurn !== playerId) {
      return { success: false, error: ERROR_CODES.NOT_YOUR_TURN };
    }

    const newState = this.engine.endTurn(game);

    await this.database.updateGame(gameId, {
      currentTurn: newState.currentTurn,
      phase: newState.phase,
      status: newState.status
    });

    this.stateSync.setState(gameId, newState);

    this.logAction(gameId, {
      id: generateId(),
      type: ActionType.END_TURN,
      playerId,
      timestamp: Date.now(),
      data: { nextPlayer: newState.currentTurn }
    });

    const gameOverResult = this.engine.checkGameOver(newState);
    if (gameOverResult.isOver) {
      logger.info('Game over', { gameId, winner: gameOverResult.winner });
    }

    logger.debug('Turn ended', { gameId, nextPlayer: newState.currentTurn });
    return { success: true };
  }

  async applyTacticalPlan(gameId: string, playerId: string, plan: TacticalPlan): Promise<{ success: boolean; error?: string }> {
    let game = this.stateSync.getState(gameId);
    if (!game) {
      game = await this.database.getGame(gameId);
    }

    if (!game) {
      return { success: false, error: ERROR_CODES.GAME_NOT_FOUND };
    }

    if (game.status !== GameStatus.IN_PROGRESS || game.phase !== GamePhase.PLAYING) {
      return { success: false, error: 'Game is not in playing phase' };
    }

    if (game.currentTurn !== playerId) {
      return { success: false, error: ERROR_CODES.NOT_YOUR_TURN };
    }

    if (plan.playerId !== playerId) {
      return { success: false, error: 'Not your tactical plan' };
    }

    const playerUnits = game.units.filter(u => u.playerId === playerId);
    const unitUpdates: { id: string; updates: Partial<Unit> }[] = [];

    for (const deployment of plan.deployments) {
      const unit = playerUnits.find(u => u.type === deployment.type || u.type === deployment.unitType);
      if (unit) {
        const canMove = this.engine.canMoveTo(game, unit, deployment.position);
        if (canMove) {
          unitUpdates.push({
            id: unit.id,
            updates: {
              position: deployment.position,
              hasMoved: true
            }
          });
        }
      }
    }

    if (unitUpdates.length > 0) {
      await this.database.updateGameUnits(gameId, unitUpdates);

      const unitMap = new Map(game.units.map(u => [u.id, { ...u }]));
      for (const { id, updates } of unitUpdates) {
        const unit = unitMap.get(id);
        if (unit) {
          Object.assign(unit, updates);
        }
      }
      game.units = Array.from(unitMap.values());

      this.stateSync.setState(gameId, game);

      this.logAction(gameId, {
        id: generateId(),
        type: ActionType.APPLY_PLAN,
        playerId,
        timestamp: Date.now(),
        data: {
          planId: plan.id,
          planName: plan.name,
          unitsDeployed: unitUpdates.length
        }
      });

      logger.info('Tactical plan applied', { gameId, planId: plan.id, unitsDeployed: unitUpdates.length });
      return { success: true };
    }

    return { success: false, error: 'No valid deployments in plan' };
  }

  async saveReplay(gameId: string, name: string): Promise<GameReplay | null> {
    let game = this.stateSync.getState(gameId);
    if (!game) {
      game = await this.database.getGame(gameId);
    }

    if (!game) {
      return null;
    }

    const actions = this.actionLogs.get(gameId) || [];

    const replay: GameReplay = {
      id: generateId(),
      gameId,
      name,
      initialState: deepClone(game),
      actions: deepClone(actions),
      recordedAt: new Date(),
      playerCount: game.players.length,
      winner: (this.engine.checkGameOver(game)).winner || null,
      duration: actions.length > 0
        ? actions[actions.length - 1].timestamp - actions[0].timestamp
        : 0
    };

    return replay;
  }

  async listGames(): Promise<GameState[]> {
    const dbGames = await this.database.listGames();
    const syncedGames: GameState[] = [];

    for (const game of dbGames) {
      const syncedState = this.stateSync.getState(game.id);
      syncedGames.push(syncedState || game);
    }

    return syncedGames;
  }

  async getGame(gameId: string): Promise<GameState | null> {
    const syncedState = this.stateSync.getState(gameId);
    if (syncedState) {
      return syncedState;
    }
    return await this.database.getGame(gameId);
  }

  private logAction(gameId: string, action: GameAction): void {
    const logs = this.actionLogs.get(gameId);
    if (logs) {
      logs.push(action);
    }
  }

  private spawnInitialUnits(game: GameState): void {
    const units: Unit[] = [];
    const unitTypes = [UnitType.SOLDIER, UnitType.ARCHER, UnitType.CAVALRY];

    for (let i = 0; i < game.players.length; i++) {
      const player = game.players[i];
      const team = player.team === Team.RED ? Team.RED : Team.BLUE;
      const spawnX = team === Team.RED ? 2 : DEFAULT_GAME_CONFIG.mapWidth - 3;

      for (let j = 0; j < unitTypes.length; j++) {
        const unitType = unitTypes[j];
        const stats = DEFAULT_UNIT_STATS[unitType];
        const unit: Unit = {
          id: generateId(),
          playerId: player.id,
          type: unitType,
          position: { x: spawnX, y: 5 + j * 3, z: 0 },
          health: stats.health,
          maxHealth: stats.health,
          attack: stats.attack,
          defense: stats.defense,
          moveRange: stats.moveRange,
          attackRange: stats.attackRange,
          hasMoved: false,
          hasAttacked: false
        };
        units.push(unit);
      }
    }

    game.units = units;
  }
}
