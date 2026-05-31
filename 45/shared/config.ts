import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { MapConfig } from './types';

export interface UnitConfig {
  type: string;
  name: string;
  health: number;
  attack: number;
  defense: number;
  moveRange: number;
  attackRange: number;
  cost: number;
}

export interface GameConfig {
  maxPlayers: number;
  turnTimeLimit: number;
  startingGold: number;
  defaultMap: string;
  serverPort: number;
  serverHost: string;
  databasePath: string;
}

let gameConfig: GameConfig | null = null;
let mapConfigs: { [id: string]: MapConfig } = {};
let unitConfigs: { [type: string]: UnitConfig } = {};
let configLoaded = false;
let configLoadError: Error | null = null;

function getConfigDir(): string {
  const isCompiled = __dirname.includes('dist');
  if (isCompiled) {
    return path.join(__dirname, '..', '..', 'config');
  }
  return path.join(__dirname, '..', 'config');
}

export function loadConfig(): GameConfig {
  if (gameConfig && configLoaded && !configLoadError) {
    return gameConfig;
  }

  try {
    const configDir = getConfigDir();
    const configPath = path.join(configDir, 'game.yaml');

    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }

    const fileContent = fs.readFileSync(configPath, 'utf8');
    const parsed = yaml.parse(fileContent);

    if (!parsed) {
      throw new Error('Config file is empty or invalid');
    }

    const gameSection = parsed.game || {};
    const serverSection = parsed.server || {};
    const databaseSection = parsed.database || {};

    gameConfig = {
      maxPlayers: gameSection.maxPlayers ?? 2,
      turnTimeLimit: gameSection.turnTimeLimit ?? 60,
      startingGold: gameSection.startingGold ?? 100,
      defaultMap: gameSection.defaultMap ?? 'default',
      serverPort: serverSection.port ?? 3000,
      serverHost: serverSection.host ?? 'localhost',
      databasePath: databaseSection.path ?? 'data/game.db'
    };

    if (parsed.units && typeof parsed.units === 'object') {
      unitConfigs = {};
      for (const [type, unitData] of Object.entries(parsed.units)) {
        const unit = unitData as any;
        unitConfigs[type] = {
          type,
          name: unit.name || type,
          health: unit.health ?? 100,
          attack: unit.attack ?? 10,
          defense: unit.defense ?? 10,
          moveRange: unit.moveRange ?? 3,
          attackRange: unit.attackRange ?? 1,
          cost: unit.cost ?? 10
        };
      }
    }

    if (parsed.maps && typeof parsed.maps === 'object') {
      mapConfigs = {};
      if (Array.isArray(parsed.maps)) {
        for (const map of parsed.maps) {
          mapConfigs[map.id] = map;
        }
      } else {
        for (const [id, mapData] of Object.entries(parsed.maps)) {
          mapConfigs[id] = mapData as MapConfig;
        }
      }
    }

    configLoaded = true;
    configLoadError = null;
    return gameConfig;
  } catch (error) {
    configLoadError = error as Error;
    console.error('Failed to load config:', error);
    throw error;
  }
}

export function loadMapConfig(mapId: string): MapConfig | null {
  try {
    if (!configLoaded) {
      loadConfig();
    }

    if (mapConfigs[mapId]) {
      return mapConfigs[mapId];
    }

    const configDir = getConfigDir();
    const mapPath = path.join(configDir, 'maps', `${mapId}.yaml`);

    if (!fs.existsSync(mapPath)) {
      console.warn(`Map config not found: ${mapPath}`);
      return null;
    }

    const fileContent = fs.readFileSync(mapPath, 'utf8');
    const parsed = yaml.parse(fileContent);

    if (!parsed) {
      console.warn(`Map config is empty: ${mapPath}`);
      return null;
    }

    const mapConfig: MapConfig = {
      id: parsed.id || mapId,
      name: parsed.name || 'Unknown Map',
      width: parsed.width || 20,
      height: parsed.height || 20,
      obstacles: parsed.obstacles || [],
      spawnPoints: parsed.spawnPoints || {}
    };

    mapConfigs[mapId] = mapConfig;
    return mapConfig;
  } catch (error) {
    console.error(`Failed to load map config ${mapId}:`, error);
    return null;
  }
}

export function getUnitConfig(unitType: string): UnitConfig | null {
  try {
    if (!configLoaded) {
      loadConfig();
    }
    return unitConfigs[unitType] || null;
  } catch (error) {
    console.error(`Failed to get unit config ${unitType}:`, error);
    return null;
  }
}

export function getAllUnitConfigs(): UnitConfig[] {
  try {
    if (!configLoaded) {
      loadConfig();
    }
    return Object.values(unitConfigs);
  } catch (error) {
    console.error('Failed to get all unit configs:', error);
    return [];
  }
}

export function getAllMapConfigs(): MapConfig[] {
  try {
    if (!configLoaded) {
      loadConfig();
    }
    return Object.values(mapConfigs);
  } catch (error) {
    console.error('Failed to get all map configs:', error);
    return [];
  }
}

export function reloadConfig(): GameConfig {
  configLoaded = false;
  configLoadError = null;
  gameConfig = null;
  unitConfigs = {};
  mapConfigs = {};
  return loadConfig();
}

export function isConfigLoaded(): boolean {
  return configLoaded && configLoadError === null;
}

export function getConfigLoadError(): Error | null {
  return configLoadError;
}
