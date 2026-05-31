export interface HexCoord {
  q: number;
  r: number;
}

export type TerrainType = "plain" | "forest" | "mountain" | "water" | "urban" | "road";
export type UnitType = "infantry" | "armor" | "artillery" | "recon" | "engineer" | "supply";
export type UnitStatus = "active" | "damaged" | "destroyed";
export type GameStatus = "waiting" | "playing" | "finished";
export type Phase = "deploy" | "move" | "combat" | "settle";

export interface HexTile {
  q: number;
  r: number;
  terrain: TerrainType;
}

export interface Unit {
  id: string;
  type: UnitType;
  faction: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  movement: number;
  position: HexCoord;
  status: UnitStatus;
  moved: boolean;
  attacked: boolean;
}

export interface Player {
  id: string;
  name: string;
  faction: string;
  isReady: boolean;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  mapWidth: number;
  mapHeight: number;
  tiles: HexTile[];
  units: ScenarioUnit[];
  factions: string[];
}

export interface ScenarioUnit {
  type: UnitType;
  faction: string;
  q: number;
  r: number;
}

export interface GameCommand {
  type: "move" | "attack" | "wait" | "deploy";
  unitId: string;
  target?: HexCoord;
  targetUnitId?: string;
}

export interface BattleResult {
  attackerId: string;
  defenderId: string;
  damageDealt: number;
  damageReceived: number;
  attackerHp: number;
  defenderHp: number;
  defenderDestroyed: boolean;
}

export interface MovementAction {
  unitId: string;
  from: HexCoord;
  to: HexCoord;
}

export interface GameEvent {
  type: "unit_destroyed" | "objective_captured" | "reinforcement_arrived" | "turn_end" | "battle";
  description: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

export interface TurnResult {
  turn: number;
  phase: Phase;
  movements: MovementAction[];
  battles: BattleResult[];
  events: GameEvent[];
}

export interface GameState {
  id: string;
  scenarioId: string;
  scenarioName: string;
  status: GameStatus;
  currentTurn: number;
  maxTurns: number;
  phase: Phase;
  players: Player[];
  units: Unit[];
  tiles: HexTile[];
  mapWidth: number;
  mapHeight: number;
  joinCode: string;
}

export interface GameListItem {
  id: string;
  scenarioName: string;
  playerCount: number;
  status: GameStatus;
  currentTurn: number;
  createdAt: string;
  factions: string[];
}

export interface GameSnapshot {
  id: string;
  gameId: string;
  name: string;
  turn: number;
  phase: Phase;
  stateData: string;
  createdAt: string;
}

export interface GameStateDiff {
  id: string;
  currentTurn?: number;
  phase?: Phase;
  status?: GameStatus;
  units?: Partial<Unit>[];
  players?: Partial<Player>[];
}

export interface ReplayBookmark {
  turn: number;
  phase: Phase;
  label: string;
  description?: string;
}

export interface ClientToServerEvents {
  "game:join": (gameId: string) => void;
  "game:leave": (gameId: string) => void;
  "game:command": (command: GameCommand) => void;
  "game:ready": (gameId: string) => void;
  "chat:message": (gameId: string, message: string) => void;
}

export interface ServerToClientEvents {
  "game:state": (state: GameState) => void;
  "game:stateDiff": (diff: GameStateDiff) => void;
  "game:turnResult": (result: TurnResult) => void;
  "game:phaseChange": (phase: Phase) => void;
  "game:playerJoined": (playerId: string, playerName: string, faction: string) => void;
  "game:playerLeft": (playerId: string) => void;
  "chat:message": (senderId: string, senderName: string, message: string) => void;
  "game:error": (error: { code: string; message: string }) => void;
}

export const TERRAIN_COLORS: Record<TerrainType, string> = {
  plain: "#8B9A6B",
  forest: "#2D5A27",
  mountain: "#7A6B5A",
  water: "#2B5C8A",
  urban: "#5A5A5A",
  road: "#B8A88A",
};

export const TERRAIN_MOVE_COST: Record<TerrainType, number> = {
  plain: 1,
  forest: 2,
  mountain: 3,
  water: 99,
  urban: 1,
  road: 0.5,
};

export const UNIT_STATS: Record<UnitType, { hp: number; attack: number; defense: number; movement: number; icon: string; label: string }> = {
  infantry: { hp: 100, attack: 30, defense: 25, movement: 3, icon: "🚶", label: "步兵" },
  armor: { hp: 150, attack: 45, defense: 40, movement: 4, icon: "🛡️", label: "装甲" },
  artillery: { hp: 80, attack: 55, defense: 10, movement: 2, icon: "💣", label: "炮兵" },
  recon: { hp: 70, attack: 15, defense: 15, movement: 5, icon: "🔭", label: "侦察" },
  engineer: { hp: 90, attack: 20, defense: 20, movement: 3, icon: "🔧", label: "工兵" },
  supply: { hp: 60, attack: 5, defense: 5, movement: 3, icon: "📦", label: "补给" },
};
