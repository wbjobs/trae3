export const GamePhase = {
  WAITING: 'waiting',
  PREPARING: 'preparing',
  PLAYING: 'playing',
  FINISHED: 'finished'
} as const;

export type GamePhase = typeof GamePhase[keyof typeof GamePhase];

export const UnitType = {
  SOLDIER: 'soldier',
  ARCHER: 'archer',
  CAVALRY: 'cavalry',
  MAGE: 'mage',
  HEALER: 'healer',
  TANK: 'tank'
} as const;

export type UnitType = typeof UnitType[keyof typeof UnitType];

export const Team = {
  RED: 'red',
  BLUE: 'blue'
} as const;

export type Team = typeof Team[keyof typeof Team];

export const GameStatus = {
  LOBBY: 'lobby',
  IN_PROGRESS: 'in_progress',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
} as const;

export type GameStatus = typeof GameStatus[keyof typeof GameStatus];

export const DEFAULT_GAME_CONFIG = {
  maxPlayers: 2,
  turnTimeLimit: 60,
  startingGold: 100,
  defaultMap: 'default',
  mapWidth: 20,
  mapHeight: 20
} as const;

export const DEFAULT_UNIT_STATS = {
  [UnitType.SOLDIER]: {
    health: 100,
    attack: 20,
    defense: 15,
    moveRange: 3,
    attackRange: 1,
    cost: 50
  },
  [UnitType.ARCHER]: {
    health: 70,
    attack: 25,
    defense: 8,
    moveRange: 2,
    attackRange: 4,
    cost: 60
  },
  [UnitType.CAVALRY]: {
    health: 90,
    attack: 30,
    defense: 12,
    moveRange: 5,
    attackRange: 1,
    cost: 80
  },
  [UnitType.MAGE]: {
    health: 60,
    attack: 35,
    defense: 5,
    moveRange: 2,
    attackRange: 3,
    cost: 90
  },
  [UnitType.HEALER]: {
    health: 55,
    attack: 10,
    defense: 6,
    moveRange: 2,
    attackRange: 2,
    cost: 70
  },
  [UnitType.TANK]: {
    health: 150,
    attack: 15,
    defense: 25,
    moveRange: 2,
    attackRange: 1,
    cost: 75
  }
} as const;

export const ERROR_CODES = {
  INVALID_MOVE: 'INVALID_MOVE',
  INVALID_ATTACK: 'INVALID_ATTACK',
  NOT_YOUR_TURN: 'NOT_YOUR_TURN',
  UNIT_NOT_FOUND: 'UNIT_NOT_FOUND',
  GAME_NOT_FOUND: 'GAME_NOT_FOUND',
  PLAYER_NOT_FOUND: 'PLAYER_NOT_FOUND',
  GAME_FULL: 'GAME_FULL',
  GAME_ALREADY_STARTED: 'GAME_ALREADY_STARTED',
  INSUFFICIENT_GOLD: 'INSUFFICIENT_GOLD',
  INVALID_POSITION: 'INVALID_POSITION'
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

export const DIRECTIONS = {
  NORTH: { x: 0, y: -1, z: 0 },
  SOUTH: { x: 0, y: 1, z: 0 },
  EAST: { x: 1, y: 0, z: 0 },
  WEST: { x: -1, y: 0, z: 0 },
  NORTHEAST: { x: 1, y: -1, z: 0 },
  NORTHWEST: { x: -1, y: -1, z: 0 },
  SOUTHEAST: { x: 1, y: 1, z: 0 },
  SOUTHWEST: { x: -1, y: 1, z: 0 }
} as const;

export type Direction = keyof typeof DIRECTIONS;
