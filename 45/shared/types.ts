export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface Unit {
  id: string;
  playerId: string;
  type: string;
  position: Position;
  health: number;
  maxHealth: number;
  attack: number;
  defense: number;
  moveRange: number;
  attackRange: number;
  hasMoved: boolean;
  hasAttacked: boolean;
}

export interface Player {
  id: string;
  name: string;
  socketId: string;
  team: string;
  isReady: boolean;
}

export interface GameState {
  id: string;
  name: string;
  players: Player[];
  units: Unit[];
  currentTurn: string;
  phase: string;
  status: string;
  version?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MapConfig {
  id: string;
  name: string;
  width: number;
  height: number;
  obstacles: Position[];
  spawnPoints: { [team: string]: Position[] };
}

export interface UnitDeployment {
  type: string;
  unitType: string;
  position: Position;
}

export interface TacticalPlan {
  id: string;
  name: string;
  description: string;
  playerId: string;
  mapId: string;
  team: string;
  deployments: UnitDeployment[];
  createdAt: Date;
  updatedAt: Date;
}

export enum ActionType {
  MOVE = 'move',
  ATTACK = 'attack',
  END_TURN = 'end_turn',
  DEPLOY = 'deploy',
  APPLY_PLAN = 'apply_plan',
  GAME_START = 'game_start',
  GAME_END = 'game_end'
}

export interface GameAction {
  id: string;
  type: ActionType;
  playerId: string;
  timestamp: number;
  data: Record<string, any>;
}

export interface GameReplay {
  id: string;
  gameId: string;
  name: string;
  playerCount: number;
  winner: string | null;
  actions: GameAction[];
  initialState: GameState;
  duration: number;
  recordedAt: Date;
}

export type FieldUpdate = {
  field: string;
  value: any;
  path?: string[];
};

export type ArrayUpdate = {
  array: string;
  action: 'add' | 'remove' | 'update';
  index?: number;
  id?: string;
  value?: any;
};

export interface StateDelta {
  gameId: string;
  version: number;
  baseVersion: number;
  fields?: FieldUpdate[];
  arrays?: ArrayUpdate[];
  timestamp: number;
}

export interface UnitDelta {
  id: string;
  updates: Partial<Unit>;
}

export interface IncrementalStateUpdate {
  gameId: string;
  version: number;
  baseVersion: number;
  unitUpdates?: UnitDelta[];
  fieldUpdates?: { field: keyof GameState; value: any }[];
  timestamp: number;
}

export enum SocketEvent {
  JOIN_ROOM = 'join_room',
  LEAVE_ROOM = 'leave_room',
  MOVE_UNIT = 'move_unit',
  ATTACK_UNIT = 'attack_unit',
  END_TURN = 'end_turn',
  GAME_STATE_UPDATE = 'game_state_update',
  INCREMENTAL_UPDATE = 'incremental_update',
  STATE_DELTA = 'state_delta',
  REQUEST_FULL_STATE = 'request_full_state',
  PLAYER_READY = 'player_ready',
  GAME_START = 'game_start',
  GAME_OVER = 'game_over',
  CHAT_MESSAGE = 'chat_message',
  LIST_GAMES = 'list_games',
  CREATE_GAME = 'create_game',
  SAVE_TACTICAL_PLAN = 'save_tactical_plan',
  LOAD_TACTICAL_PLAN = 'load_tactical_plan',
  LIST_TACTICAL_PLANS = 'list_tactical_plans',
  DELETE_TACTICAL_PLAN = 'delete_tactical_plan',
  APPLY_TACTICAL_PLAN = 'apply_tactical_plan',
  SAVE_REPLAY = 'save_replay',
  LOAD_REPLAY = 'load_replay',
  LIST_REPLAYS = 'list_replays',
  DELETE_REPLAY = 'delete_replay',
  PLAY_REPLAY = 'play_replay',
  PAUSE_REPLAY = 'pause_replay',
  SEEK_REPLAY = 'seek_replay',
  ERROR = 'error'
}

export interface JoinRoomMessage {
  roomId: string;
  playerName: string;
  team: string;
}

export interface LeaveRoomMessage {
  roomId: string;
  playerId: string;
}

export interface MoveUnitMessage {
  unitId: string;
  position: Position;
}

export interface AttackUnitMessage {
  attackerId: string;
  targetId: string;
}

export interface EndTurnMessage {
  playerId: string;
}

export interface GameStateUpdateMessage {
  gameState: GameState;
}

export interface ChatMessage {
  playerId: string;
  content: string;
  timestamp: Date;
}

export interface ErrorMessage {
  code: string;
  message: string;
}

export interface TacticalPlanMessage {
  planId?: string;
  plan?: Partial<TacticalPlan>;
  playerId?: string;
}

export interface ReplayMessage {
  replayId?: string;
  gameId?: string;
  seekTime?: number;
  action?: GameAction;
}
