import type {
  Room,
  Player,
  GameState,
  GameEvent,
  UnitCommand,
  UnitState,
  DeployUnit,
  MapConfig,
  Faction,
  GamePhase,
  GameResult,
  ServerMessage,
  ReplaySnapshot,
} from '../shared/types.js';
import { UNIT_STATS } from '../shared/types.js';
import { resolveTurn, type ResolveTurnContext } from './engine.js';
import { getDb, getMapFromRow, saveGameRecordWithEvents, saveReplaySnapshot, getTacticalPlan } from './database.js';

interface RoomState {
  room: Room;
  gameState: GameState | null;
  mapConfig: MapConfig | null;
  commands: Map<string, UnitCommand[]>;
  confirmedFactions: Set<Faction>;
  redPlayerId: string;
  bluePlayerId: string;
  readyFactions: Set<Faction>;
  deployedFactions: Set<Faction>;
  pendingDeploys: Map<Faction, DeployUnit[]>;
  gameRecordId: string | null;
}

const rooms = new Map<string, RoomState>();

export type BroadcastFn = (roomId: string, message: ServerMessage) => void;

let broadcastFn: BroadcastFn = () => {};

export function setBroadcastFn(fn: BroadcastFn): void {
  broadcastFn = fn;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

export function createRoom(name: string, mapId: string, mode: string): Room {
  const roomId = generateId();
  const room: Room = {
    roomId,
    name,
    mapId,
    mode: mode as Room['mode'],
    status: 'waiting',
    players: [],
    createdAt: new Date().toISOString(),
  };

  const roomState: RoomState = {
    room,
    gameState: null,
    mapConfig: null,
    commands: new Map(),
    confirmedFactions: new Set(),
    redPlayerId: '',
    bluePlayerId: '',
    readyFactions: new Set(),
    deployedFactions: new Set(),
    pendingDeploys: new Map(),
    gameRecordId: null,
  };

  rooms.set(roomId, roomState);

  const db = getDb();
  db.prepare(
    'INSERT INTO room (roomId, name, mapId, mode, status) VALUES (?, ?, ?, ?, ?)'
  ).run(roomId, name, mapId, mode, 'waiting');

  return room;
}

export function joinRoom(roomId: string, playerId: string, playerName: string, faction: Faction): { success: boolean; room?: Room; error?: string } {
  const roomState = rooms.get(roomId);
  if (!roomState) return { success: false, error: 'Room not found' };

  if (roomState.room.players.length >= 2) {
    return { success: false, error: 'Room is full' };
  }

  const existingFaction = roomState.room.players.find(p => p.faction === faction);
  if (existingFaction) {
    return { success: false, error: 'Faction already taken' };
  }

  const player: Player = {
    playerId,
    name: playerName,
    role: 'commander',
    faction,
  };

  roomState.room.players.push(player);
  roomState.room.status = 'playing';

  if (faction === 'red') {
    roomState.redPlayerId = playerId;
  } else {
    roomState.bluePlayerId = playerId;
  }

  const db = getDb();
  db.prepare(
    'INSERT INTO player (playerId, roomId, name, role, faction) VALUES (?, ?, ?, ?, ?)'
  ).run(playerId, roomId, playerName, 'commander', faction);
  db.prepare('UPDATE room SET status = ? WHERE roomId = ?').run('playing', roomId);

  return { success: true, room: roomState.room };
}

export function deployUnits(roomId: string, faction: Faction, units: DeployUnit[]): { success: boolean; error?: string } {
  const roomState = rooms.get(roomId);
  if (!roomState) return { success: false, error: 'Room not found' };

  roomState.pendingDeploys.set(faction, units);
  roomState.deployedFactions.add(faction);

  if (roomState.deployedFactions.has('red') && roomState.deployedFactions.has('blue')) {
    startGame(roomId);
  }

  return { success: true };
}

function startGame(roomId: string): void {
  const roomState = rooms.get(roomId);
  if (!roomState) return;

  const db = getDb();
  const mapRow = db.prepare('SELECT * FROM map_config WHERE mapId = ?').get(roomState.room.mapId) as Record<string, unknown>;
  if (!mapRow) return;

  const mapConfig = getMapFromRow(mapRow);
  roomState.mapConfig = mapConfig;

  const units: UnitState[] = [];
  const redDeploys = roomState.pendingDeploys.get('red') ?? [];
  const blueDeploys = roomState.pendingDeploys.get('blue') ?? [];

  for (const du of redDeploys) {
    const stats = UNIT_STATS[du.unitType];
    if (!stats) continue;
    const terrain = mapConfig.terrains.find(t => t.x === du.position.x && t.y === du.position.y);
    const unit: UnitState = {
      unitId: du.unitId,
      unitType: du.unitType,
      faction: 'red',
      position: du.position,
      strength: du.strength || stats.maxStrength,
      maxStrength: stats.maxStrength,
      status: 'active',
      defenseBonus: terrain?.defenseBonus ?? 0,
    };
    units.push(unit);

    db.prepare(
      'INSERT INTO unit (unitId, roomId, unitType, faction, x, y, strength, maxStrength, status, defenseBonus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(unit.unitId, roomId, unit.unitType, unit.faction, unit.position.x, unit.position.y, unit.strength, unit.maxStrength, unit.status, unit.defenseBonus);
  }

  for (const du of blueDeploys) {
    const stats = UNIT_STATS[du.unitType];
    if (!stats) continue;
    const terrain = mapConfig.terrains.find(t => t.x === du.position.x && t.y === du.position.y);
    const unit: UnitState = {
      unitId: du.unitId,
      unitType: du.unitType,
      faction: 'blue',
      position: du.position,
      strength: du.strength || stats.maxStrength,
      maxStrength: stats.maxStrength,
      status: 'active',
      defenseBonus: terrain?.defenseBonus ?? 0,
    };
    units.push(unit);

    db.prepare(
      'INSERT INTO unit (unitId, roomId, unitType, faction, x, y, strength, maxStrength, status, defenseBonus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(unit.unitId, roomId, unit.unitType, unit.faction, unit.position.x, unit.position.y, unit.strength, unit.maxStrength, unit.status, unit.defenseBonus);
  }

  const gameState: GameState = {
    turn: 1,
    phase: 'command',
    units,
    redScore: 0,
    blueScore: 0,
  };

  roomState.gameState = gameState;
  roomState.room.status = 'playing';

  broadcastFn(roomId, {
    type: 'game_start',
    mapConfig,
    initialState: gameState,
  });
}

export function submitCommands(roomId: string, playerId: string, commands: UnitCommand[]): { success: boolean; error?: string } {
  const roomState = rooms.get(roomId);
  if (!roomState) return { success: false, error: 'Room not found' };
  if (!roomState.gameState) return { success: false, error: 'Game not started' };

  roomState.commands.set(playerId, commands);
  return { success: true };
}

export function confirmTurn(roomId: string, playerId: string, turn: number): { success: boolean; error?: string } {
  const roomState = rooms.get(roomId);
  if (!roomState) return { success: false, error: 'Room not found' };
  if (!roomState.gameState) return { success: false, error: 'Game not started' };

  const faction: Faction = playerId === roomState.redPlayerId ? 'red' : 'blue';
  roomState.confirmedFactions.add(faction);

  if (roomState.confirmedFactions.has('red') && roomState.confirmedFactions.has('blue')) {
    resolveCurrentTurn(roomId);
  }

  return { success: true };
}

function resolveCurrentTurn(roomId: string): void {
  const roomState = rooms.get(roomId);
  if (!roomState || !roomState.gameState || !roomState.mapConfig) return;

  const ctx: ResolveTurnContext = {
    state: roomState.gameState,
    commands: roomState.commands,
    terrains: roomState.mapConfig.terrains,
    redPlayerId: roomState.redPlayerId,
    bluePlayerId: roomState.bluePlayerId,
  };

  const { events, newState } = resolveTurn(ctx);
  roomState.gameState = newState;
  roomState.commands.clear();
  roomState.confirmedFactions.clear();

  const snapshot: ReplaySnapshot = {
    turn: newState.turn - 1,
    state: { ...newState, turn: newState.turn - 1 },
    events,
    timestamp: Date.now(),
  };

  if (!roomState.gameRecordId) {
    const db = getDb();
    const tempResult = newState.phase === 'finished' ? determineGameResult(newState) : 'in_progress';
    const recordResult = saveGameRecordWithEvents(roomId, tempResult, newState, []);
    if (recordResult.success && recordResult.gameId) {
      roomState.gameRecordId = recordResult.gameId;
    }
  }

  if (roomState.gameRecordId) {
    try {
      saveReplaySnapshot(snapshot, roomState.gameRecordId);
    } catch (e) {
      console.error('Failed to save replay snapshot:', e);
    }
  }

  if (newState.phase === 'finished') {
    roomState.room.status = 'finished';
    const result = determineGameResult(newState);
    if (roomState.gameRecordId) {
      const db = getDb();
      db.prepare('UPDATE game_record SET result = ?, redScore = ?, blueScore = ?, duration = ? WHERE recordId = ?')
        .run(result, newState.redScore, newState.blueScore, newState.turn, roomState.gameRecordId);
    }
    broadcastFn(roomId, {
      type: 'game_over',
      result,
      state: newState,
    });
  } else {
    broadcastFn(roomId, {
      type: 'turn_result',
      turn: newState.turn - 1,
      events,
      state: newState,
    });
  }
}

function determineGameResult(state: GameState): GameResult {
  const activeRed = state.units.filter(u => u.faction === 'red' && u.status === 'active').length;
  const activeBlue = state.units.filter(u => u.faction === 'blue' && u.status === 'active').length;

  if (activeRed === 0 && activeBlue === 0) return 'draw';
  if (activeRed === 0) return 'blue_win';
  if (activeBlue === 0) return 'red_win';
  if (state.redScore > state.blueScore) return 'red_win';
  if (state.blueScore > state.redScore) return 'blue_win';
  return 'draw';
}

export function playerReady(roomId: string, playerId: string): { success: boolean; error?: string } {
  const roomState = rooms.get(roomId);
  if (!roomState) return { success: false, error: 'Room not found' };

  const faction: Faction = playerId === roomState.redPlayerId ? 'red' : 'blue';
  roomState.readyFactions.add(faction);

  if (roomState.readyFactions.has('red') && roomState.readyFactions.has('blue')) {
    roomState.gameState = {
      turn: 1,
      phase: 'deploy',
      units: [],
      redScore: 0,
      blueScore: 0,
    };
    broadcastFn(roomId, {
      type: 'sync',
      state: roomState.gameState,
    });
  }

  return { success: true };
}

export function getRoomState(roomId: string): RoomState | undefined {
  return rooms.get(roomId);
}

export function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId)?.room;
}

export function getAllRooms(): Room[] {
  return Array.from(rooms.values()).map(rs => rs.room);
}

export function getGameState(roomId: string): GameState | null {
  return rooms.get(roomId)?.gameState ?? null;
}

export function getMapConfig(roomId: string): MapConfig | null {
  return rooms.get(roomId)?.mapConfig ?? null;
}

export function loadTacticalPlan(roomId: string, planId: string, playerId: string): UnitCommand[] {
  const roomState = rooms.get(roomId);
  if (!roomState) return [];

  const plan = getTacticalPlan(planId);
  if (!plan) return [];

  const playerFaction: Faction = playerId === roomState.redPlayerId ? 'red' : 'blue';
  if (plan.faction !== playerFaction) return [];

  if (plan.mapId && roomState.room.mapId !== plan.mapId) return [];

  const validCommands: UnitCommand[] = [];
  const roomUnitIds = new Set(roomState.gameState?.units.filter(u => u.faction === playerFaction && u.status === 'active').map(u => u.unitId) || []);

  for (const cmd of plan.commands) {
    if (roomUnitIds.has(cmd.unitId)) {
      validCommands.push(cmd);
    }
  }

  if (validCommands.length > 0) {
    submitCommands(roomId, playerId, validCommands);
    broadcastFn(roomId, {
      type: 'log',
      entry: {
        timestamp: new Date().toISOString(),
        playerId,
        playerName: roomState.room.players.find(p => p.playerId === playerId)?.name || '',
        faction: playerFaction,
        content: `已加载战术方案: ${plan.name}`,
      },
    });
  }

  return validCommands;
}
