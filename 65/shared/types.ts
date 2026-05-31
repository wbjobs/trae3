import {
  TerrainType,
  BuildingType,
  ResourceType,
  PlayerStatus,
  MessageType,
} from './constants';

export interface Position {
  x: number;
  y: number;
}

export interface PlotData {
  id: string;
  position: Position;
  terrain: TerrainType;
  building: BuildingType;
  ownerId: string | null;
  level: number;
  hp: number;
  maxHp: number;
}

export interface PlotDataDelta {
  id: string;
  px?: number;
  py?: number;
  t?: string;
  b?: string;
  o?: string | null;
  l?: number;
  hp?: number;
  mhp?: number;
}

export interface PlayerStateDelta {
  id: string;
  n?: string;
  s?: string;
  res?: Partial<Record<string, number>>;
  plots?: string[];
  c?: string;
  la?: number;
}

export interface StateSyncDeltaPayload {
  tick: number;
  plots: PlotDataDelta[];
  players: PlayerStateDelta[];
}

export interface ResourceBag {
  [ResourceType.GOLD]: number;
  [ResourceType.FOOD]: number;
  [ResourceType.STONE]: number;
  [ResourceType.WOOD]: number;
  [ResourceType.IRON]: number;
}

export interface PlayerState {
  id: string;
  name: string;
  status: PlayerStatus;
  resources: ResourceBag;
  plots: string[];
  color: string;
  lastActive: number;
}

export interface GameMap {
  width: number;
  height: number;
  plots: PlotData[];
}

export interface GameState {
  id: string;
  map: GameMap;
  players: Map<string, PlayerState>;
  tick: number;
  createdAt: number;
  updatedAt: number;
}

export interface BuildRequest {
  playerId: string;
  plotId: string;
  buildingType: BuildingType;
}

export interface DemolishRequest {
  playerId: string;
  plotId: string;
}

export interface BuildResult {
  success: boolean;
  plot: PlotData;
  remainingResources: ResourceBag;
  reason?: string;
}

export interface DemolishResult {
  success: boolean;
  plot: PlotData;
  refund: Partial<ResourceBag>;
  reason?: string;
}

export interface GameMessage {
  type: MessageType;
  payload: unknown;
  timestamp: number;
  playerId?: string;
}

export interface JoinGamePayload {
  playerName: string;
}

export interface LeaveGamePayload {
  playerId: string;
}

export interface StateSyncPayload {
  tick: number;
  plotUpdates: PlotData[];
  playerUpdates: PlayerState[];
}

export interface ResourceUpdatePayload {
  playerId: string;
  resources: ResourceBag;
  delta: Partial<ResourceBag>;
}

export interface ChatPayload {
  playerId: string;
  playerName: string;
  text: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export interface TickPayload {
  tick: number;
  timestamp: number;
}

export interface BuildingBlueprint {
  plotId: string;
  x: number;
  y: number;
  buildingType: BuildingType;
  terrain: TerrainType;
}

export interface BuildScheme {
  id: string;
  name: string;
  ownerId: string;
  blueprints: BuildingBlueprint[];
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  createdAt: number;
  updatedAt: number;
}

export interface PlotChangeLogEntry {
  id: string;
  plotId: string;
  tick: number;
  timestamp: number;
  playerId: string | null;
  action: 'BUILD' | 'DEMOLISH' | 'CAPTURE' | 'LEVEL_UP';
  before: PlotDataDelta;
  after: PlotDataDelta;
  meta?: Record<string, unknown>;
}

export interface HistoryQueryRequest {
  plotId: string;
  limit?: number;
  beforeTick?: number;
}

export interface HistoryQueryResult {
  plotId: string;
  entries: PlotChangeLogEntry[];
  total: number;
}

export interface BuildSchemeSaveRequest {
  name: string;
  plotIds: string[];
  centerX: number;
  centerY: number;
}

export interface BuildSchemeApplyRequest {
  schemeId: string;
  targetX: number;
  targetY: number;
}
