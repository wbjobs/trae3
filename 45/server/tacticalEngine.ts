import type { GameState, Unit, Position } from '../shared/types';
import { GamePhase, GameStatus, DEFAULT_GAME_CONFIG, ERROR_CODES } from '../shared/constants';
import { deepClone, calculateChebyshevDistance, positionsEqual, randomInt, isValidPosition } from '../shared/utils';
import { loadMapConfig } from '../shared/config';

export interface MoveResult {
  success: boolean;
  newState: GameState;
  error?: string;
}

export interface AttackResult {
  success: boolean;
  newState: GameState;
  damage: number;
  error?: string;
}

export interface GameOverResult {
  isOver: boolean;
  winner?: string;
  reason?: string;
}

export class TacticalEngine {
  private currentMapId: string = 'default';

  setMap(mapId: string): void {
    this.currentMapId = mapId;
  }

  private getObstacles(): Position[] {
    const mapConfig = loadMapConfig(this.currentMapId);
    return mapConfig?.obstacles || [];
  }

  private isObstacle(pos: Position): boolean {
    const obstacles = this.getObstacles();
    return obstacles.some(obs => positionsEqual(obs, pos));
  }

  moveUnit(gameState: GameState, unitId: string, targetPos: Position): MoveResult {
    const newState = deepClone(gameState);
    const unit = newState.units.find(u => u.id === unitId);

    if (!unit) {
      return {
        success: false,
        newState,
        error: ERROR_CODES.UNIT_NOT_FOUND
      };
    }

    if (unit.hasMoved) {
      return {
        success: false,
        newState,
        error: 'Unit has already moved this turn'
      };
    }

    if (!this.validateMove(newState, unit, targetPos)) {
      return {
        success: false,
        newState,
        error: ERROR_CODES.INVALID_MOVE
      };
    }

    unit.position = { ...targetPos };
    unit.hasMoved = true;
    newState.updatedAt = new Date();

    return {
      success: true,
      newState
    };
  }

  attackUnit(gameState: GameState, attackerId: string, targetId: string): AttackResult {
    const newState = deepClone(gameState);
    const attacker = newState.units.find(u => u.id === attackerId);
    const target = newState.units.find(u => u.id === targetId);

    if (!attacker || !target) {
      return {
        success: false,
        newState,
        damage: 0,
        error: ERROR_CODES.UNIT_NOT_FOUND
      };
    }

    if (attacker.hasAttacked) {
      return {
        success: false,
        newState,
        damage: 0,
        error: 'Unit has already attacked this turn'
      };
    }

    if (!this.validateAttack(newState, attacker, target)) {
      return {
        success: false,
        newState,
        damage: 0,
        error: ERROR_CODES.INVALID_ATTACK
      };
    }

    const damage = this.calculateDamage(attacker, target);
    target.health = Math.max(0, target.health - damage);
    attacker.hasAttacked = true;

    if (target.health <= 0) {
      newState.units = newState.units.filter(u => u.id !== targetId);
    }

    newState.updatedAt = new Date();

    const gameOverResult = this.checkGameOver(newState);
    if (gameOverResult.isOver) {
      newState.phase = GamePhase.FINISHED;
      newState.status = GameStatus.COMPLETED;
    }

    return {
      success: true,
      newState,
      damage
    };
  }

  calculateDamage(attacker: Unit, defender: Unit): number {
    const baseDamage = Math.max(1, attacker.attack - defender.defense * 0.5);
    const isCritical = Math.random() < 0.1;
    const criticalMultiplier = isCritical ? 1.5 : 1;

    const terrainModifier = 1.0;
    const randomFactor = randomInt(90, 110) / 100;

    const damage = Math.max(1, Math.floor(baseDamage * criticalMultiplier * terrainModifier * randomFactor));

    return damage;
  }

  validateMove(gameState: GameState, unit: Unit, targetPos: Position): boolean {
    if (!isValidPosition(targetPos, DEFAULT_GAME_CONFIG.mapWidth, DEFAULT_GAME_CONFIG.mapHeight)) {
      return false;
    }

    if (this.isObstacle(targetPos)) {
      return false;
    }

    const distance = calculateChebyshevDistance(unit.position, targetPos);
    if (distance > unit.moveRange) {
      return false;
    }

    if (distance === 0) {
      return false;
    }

    const unitAtTarget = gameState.units.find(u => positionsEqual(u.position, targetPos));
    if (unitAtTarget) {
      return false;
    }

    return true;
  }

  validateAttack(gameState: GameState, attacker: Unit, target: Unit): boolean {
    if (attacker.playerId === target.playerId) {
      return false;
    }

    if (target.health <= 0) {
      return false;
    }

    const distance = calculateChebyshevDistance(attacker.position, target.position);
    if (distance > attacker.attackRange) {
      return false;
    }

    if (distance === 0) {
      return false;
    }

    return true;
  }

  checkGameOver(gameState: GameState): GameOverResult {
    const playerUnits = new Map<string, Unit[]>();

    for (const unit of gameState.units) {
      if (!playerUnits.has(unit.playerId)) {
        playerUnits.set(unit.playerId, []);
      }
      playerUnits.get(unit.playerId)!.push(unit);
    }

    const activePlayers = Array.from(playerUnits.keys()).filter(
      playerId => playerUnits.get(playerId)!.length > 0
    );

    if (activePlayers.length === 1) {
      return {
        isOver: true,
        winner: activePlayers[0]
      };
    }

    if (activePlayers.length === 0) {
      return {
        isOver: true
      };
    }

    if (gameState.players.length < 2) {
      return {
        isOver: true,
        winner: gameState.players[0]?.id
      };
    }

    return {
      isOver: false
    };
  }

  endTurn(gameState: GameState): GameState {
    const newState = deepClone(gameState);

    const playerIds = newState.players.map(p => p.id);

    if (playerIds.length === 0) {
      newState.phase = GamePhase.FINISHED;
      newState.status = GameStatus.COMPLETED;
      return newState;
    }

    const currentTurnIndex = playerIds.indexOf(newState.currentTurn);
    const validIndex = currentTurnIndex >= 0 ? currentTurnIndex : -1;
    const nextTurnIndex = (validIndex + 1) % playerIds.length;
    newState.currentTurn = playerIds[nextTurnIndex];

    for (const unit of newState.units) {
      if (unit.playerId === newState.currentTurn) {
        unit.hasMoved = false;
        unit.hasAttacked = false;
      }
    }

    newState.updatedAt = new Date();

    const gameOverResult = this.checkGameOver(newState);
    if (gameOverResult.isOver) {
      newState.phase = GamePhase.FINISHED;
      newState.status = GameStatus.COMPLETED;
    }

    return newState;
  }

  resetUnitActionsForPlayer(gameState: GameState, playerId: string): GameState {
    const newState = deepClone(gameState);

    for (const unit of newState.units) {
      if (unit.playerId === playerId) {
        unit.hasMoved = false;
        unit.hasAttacked = false;
      }
    }

    newState.updatedAt = new Date();
    return newState;
  }

  canUnitMove(gameState: GameState, unitId: string): boolean {
    const unit = gameState.units.find(u => u.id === unitId);
    if (!unit) return false;
    if (unit.hasMoved) return false;
    if (unit.playerId !== gameState.currentTurn) return false;
    return true;
  }

  canUnitAttack(gameState: GameState, unitId: string): boolean {
    const unit = gameState.units.find(u => u.id === unitId);
    if (!unit) return false;
    if (unit.hasAttacked) return false;
    if (unit.playerId !== gameState.currentTurn) return false;
    return true;
  }

  canMoveTo(gameState: GameState, unit: Unit, targetPos: Position): boolean {
    if (unit.hasMoved) return false;
    if (unit.playerId !== gameState.currentTurn) return false;
    return this.validateMove(gameState, unit, targetPos);
  }
}

export const tacticalEngine = new TacticalEngine();
