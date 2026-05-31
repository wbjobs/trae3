export enum TerrainType {
  PLAIN = 'plain',
  FOREST = 'forest',
  MOUNTAIN = 'mountain',
  WATER = 'water',
  DESERT = 'desert',
  SWAMP = 'swamp',
}

export enum BuildingType {
  NONE = 'none',
  CASTLE = 'castle',
  FARM = 'farm',
  MINE = 'mine',
  BARRACKS = 'barracks',
  MARKET = 'market',
  WALL = 'wall',
  TOWER = 'tower',
}

export enum ResourceType {
  GOLD = 'gold',
  FOOD = 'food',
  STONE = 'stone',
  WOOD = 'wood',
  IRON = 'iron',
}

export enum PlayerStatus {
  IDLE = 'idle',
  BUILDING = 'building',
  ATTACKING = 'attacking',
  DEFENDING = 'defending',
  OFFLINE = 'offline',
}

export enum MessageType {
  JOIN_GAME = 'join_game',
  LEAVE_GAME = 'leave_game',
  STATE_SYNC = 'state_sync',
  STATE_SYNC_DELTA = 'state_sync_delta',
  PLOT_UPDATE = 'plot_update',
  BUILD_REQUEST = 'build_request',
  BUILD_RESULT = 'build_result',
  DEMOLISH_REQUEST = 'demolish_request',
  DEMOLISH_RESULT = 'demolish_result',
  RESOURCE_UPDATE = 'resource_update',
  PLAYER_LIST = 'player_list',
  CHAT_MESSAGE = 'chat_message',
  ERROR = 'error',
  PONG = 'pong',
  TICK = 'tick',
  HISTORY_QUERY = 'history_query',
  HISTORY_RESULT = 'history_result',
  SCHEME_SAVE = 'scheme_save',
  SCHEME_SAVE_RESULT = 'scheme_save_result',
  SCHEME_APPLY = 'scheme_apply',
  SCHEME_APPLY_RESULT = 'scheme_apply_result',
  SCHEME_LIST = 'scheme_list',
  SCHEME_LIST_RESULT = 'scheme_list_result',
}

export const GRID_SIZE = 32;
export const PLOT_SIZE = 1.0;
export const TICK_INTERVAL_MS = 200;
export const RESOURCE_YIELD_INTERVAL_MS = 5000;
export const MAX_PLAYERS = 8;

export const TERRAIN_RESOURCE_MAP: Record<TerrainType, Partial<Record<ResourceType, number>>> = {
  [TerrainType.PLAIN]: { [ResourceType.FOOD]: 2, [ResourceType.GOLD]: 1 },
  [TerrainType.FOREST]: { [ResourceType.WOOD]: 3, [ResourceType.FOOD]: 1 },
  [TerrainType.MOUNTAIN]: { [ResourceType.STONE]: 3, [ResourceType.IRON]: 2 },
  [TerrainType.WATER]: { [ResourceType.FOOD]: 2, [ResourceType.GOLD]: 1 },
  [TerrainType.DESERT]: { [ResourceType.GOLD]: 2, [ResourceType.IRON]: 1 },
  [TerrainType.SWAMP]: { [ResourceType.FOOD]: 1, [ResourceType.STONE]: 1 },
};

export const BUILDING_COST: Record<BuildingType, Record<ResourceType, number>> = {
  [BuildingType.NONE]: { [ResourceType.GOLD]: 0, [ResourceType.FOOD]: 0, [ResourceType.STONE]: 0, [ResourceType.WOOD]: 0, [ResourceType.IRON]: 0 },
  [BuildingType.CASTLE]: { [ResourceType.GOLD]: 50, [ResourceType.FOOD]: 0, [ResourceType.STONE]: 30, [ResourceType.WOOD]: 20, [ResourceType.IRON]: 10 },
  [BuildingType.FARM]: { [ResourceType.GOLD]: 5, [ResourceType.FOOD]: 0, [ResourceType.STONE]: 5, [ResourceType.WOOD]: 10, [ResourceType.IRON]: 0 },
  [BuildingType.MINE]: { [ResourceType.GOLD]: 10, [ResourceType.FOOD]: 0, [ResourceType.STONE]: 10, [ResourceType.WOOD]: 5, [ResourceType.IRON]: 5 },
  [BuildingType.BARRACKS]: { [ResourceType.GOLD]: 20, [ResourceType.FOOD]: 0, [ResourceType.STONE]: 15, [ResourceType.WOOD]: 10, [ResourceType.IRON]: 10 },
  [BuildingType.MARKET]: { [ResourceType.GOLD]: 15, [ResourceType.FOOD]: 0, [ResourceType.STONE]: 10, [ResourceType.WOOD]: 15, [ResourceType.IRON]: 0 },
  [BuildingType.WALL]: { [ResourceType.GOLD]: 5, [ResourceType.FOOD]: 0, [ResourceType.STONE]: 20, [ResourceType.WOOD]: 0, [ResourceType.IRON]: 5 },
  [BuildingType.TOWER]: { [ResourceType.GOLD]: 15, [ResourceType.FOOD]: 0, [ResourceType.STONE]: 25, [ResourceType.WOOD]: 5, [ResourceType.IRON]: 15 },
};

const EMPTY_RESOURCE_BAG: Record<ResourceType, number> = {
  [ResourceType.GOLD]: 0,
  [ResourceType.FOOD]: 0,
  [ResourceType.STONE]: 0,
  [ResourceType.WOOD]: 0,
  [ResourceType.IRON]: 0,
};

export function getTerrainYield(terrain: string): Partial<Record<ResourceType, number>> | null {
  if (terrain in TERRAIN_RESOURCE_MAP) {
    return TERRAIN_RESOURCE_MAP[terrain as TerrainType];
  }
  console.warn(`[Config] Unknown terrain type: ${terrain}, falling back to empty yield`);
  return null;
}

export function getBuildingCost(building: string): Record<ResourceType, number> {
  if (building in BUILDING_COST) {
    return BUILDING_COST[building as BuildingType];
  }
  console.warn(`[Config] Unknown building type: ${building}, falling back to zero cost`);
  return { ...EMPTY_RESOURCE_BAG };
}
