export interface Position {
  x: number;
  y: number;
}

export type TerrainType = "plain" | "mountain" | "water" | "urban" | "forest" | "road";
export type UnitType = "infantry" | "armor" | "artillery" | "recon" | "supply";
export type Faction = "red" | "blue";
export type PlayerRole = "commander" | "staff" | "observer";
export type GameMode = "turn-based" | "realtime";
export type RoomStatus = "waiting" | "playing" | "finished";
export type GamePhase = "deploy" | "command" | "resolving" | "finished";
export type UnitStatus = "active" | "suppressed" | "destroyed";
export type CommandType = "move" | "attack" | "defend" | "hold";
export type GameResult = "red_win" | "blue_win" | "draw";

export interface TerrainCell {
  x: number;
  y: number;
  type: TerrainType;
  defenseBonus: number;
  movementCost: number;
}

export interface MapConfig {
  mapId: string;
  name: string;
  width: number;
  height: number;
  terrains: TerrainCell[];
  spawnPoints: { red: Position[]; blue: Position[] };
}

export interface Player {
  playerId: string;
  name: string;
  role: PlayerRole;
  faction: Faction | "none";
}

export interface Room {
  roomId: string;
  name: string;
  mapId: string;
  mode: GameMode;
  status: RoomStatus;
  players: Player[];
  createdAt: string;
}

export interface CreateRoomRequest {
  name: string;
  mapId: string;
  mode: GameMode;
  maxPlayers: number;
  timeLimit: number;
}

export interface UnitState {
  unitId: string;
  unitType: UnitType;
  faction: Faction;
  position: Position;
  strength: number;
  maxStrength: number;
  status: UnitStatus;
  defenseBonus: number;
}

export interface DeltaUnit {
  unitId: string;
  position?: Position;
  strength?: number;
  status?: UnitStatus;
}

export interface DeltaGameState {
  turn?: number;
  units: DeltaUnit[];
}

export interface DeployUnit {
  unitId: string;
  unitType: UnitType;
  position: Position;
  strength: number;
}

export interface UnitCommand {
  unitId: string;
  action: CommandType;
  target?: Position;
  targetUnitId?: string;
}

export interface GameEvent {
  turn: number;
  timestamp: string;
  playerId: string;
  action: "deploy" | "move" | "attack" | "defend";
  unitId: string;
  from: Position;
  to: Position;
  result?: { damage: number; eliminated: boolean };
}

export interface GameState {
  turn: number;
  phase: GamePhase;
  units: UnitState[];
  redScore: number;
  blueScore: number;
}

export interface LogEntry {
  timestamp: string;
  playerId: string;
  playerName: string;
  faction: Faction;
  content: string;
}

export interface TacticalPlan {
  id: string;
  name: string;
  roomId?: string;
  mapId: string;
  creator: string;
  faction: Faction;
  commands: UnitCommand[];
  createdAt: string;
  description?: string;
}

export interface ReplaySnapshot {
  turn: number;
  state: GameState;
  events: GameEvent[];
  timestamp: number;
}

export interface ReplayData {
  recordId: string;
  mapConfig: MapConfig;
  snapshots: ReplaySnapshot[];
  winner?: Faction;
  totalTurns: number;
}

export type ClientMessage =
  | { type: "join"; roomId: string; playerId: string; playerName: string; faction: Faction }
  | { type: "deploy"; units: DeployUnit[] }
  | { type: "command"; commands: UnitCommand[] }
  | { type: "confirm_turn"; turn: number }
  | { type: "ready" }
  | { type: "chat"; message: string }
  | { type: "save_plan"; plan: Omit<TacticalPlan, "id" | "createdAt"> }
  | { type: "load_plan"; planId: string }
  | { type: "delete_plan"; planId: string }
  | { type: "list_plans"; faction?: Faction; mapId?: string };

export type ServerMessage =
  | { type: "room_state"; state: Room }
  | { type: "map_config"; config: MapConfig }
  | { type: "game_start"; mapConfig: MapConfig; initialState: GameState }
  | { type: "turn_result"; turn: number; events: GameEvent[]; state: GameState }
  | { type: "sync"; state: GameState }
  | { type: "delta_sync"; delta: DeltaGameState; hash: number }
  | { type: "player_joined"; player: Player }
  | { type: "log"; entry: LogEntry }
  | { type: "game_over"; result: GameResult; state: GameState }
  | { type: "error"; message: string }
  | { type: "plan_saved"; plan: TacticalPlan }
  | { type: "plan_loaded"; plan: TacticalPlan }
  | { type: "plan_deleted"; planId: string }
  | { type: "plans_list"; plans: TacticalPlan[] }
  | { type: "replay_data"; replay: ReplayData }
  | { type: "replay_snapshot"; snapshot: ReplaySnapshot };

export const UNIT_STATS: Record<UnitType, { maxStrength: number; attack: number; defense: number; movement: number; range: number }> = {
  infantry: { maxStrength: 100, attack: 30, defense: 25, movement: 2, range: 1 },
  armor: { maxStrength: 150, attack: 45, defense: 40, movement: 3, range: 1 },
  artillery: { maxStrength: 80, attack: 55, defense: 10, movement: 1, range: 3 },
  recon: { maxStrength: 60, attack: 15, defense: 10, movement: 4, range: 2 },
  supply: { maxStrength: 70, attack: 5, defense: 5, movement: 2, range: 0 },
};

export const TERRAIN_COLORS: Record<TerrainType, string> = {
  plain: "#8B9A6B",
  mountain: "#7A6B5D",
  water: "#4A7A9B",
  urban: "#9A8A7A",
  forest: "#4A6B3A",
  road: "#B8A88A",
};
