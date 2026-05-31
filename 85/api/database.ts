import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { TerrainType, TerrainCell, Position, MapConfig, TacticalPlan, ReplaySnapshot, ReplayData, Faction, UnitCommand, GameState, GameEvent } from '../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db: Database.Database | null = null;

function generateMap01Terrains(): TerrainCell[] {
  const terrains: TerrainCell[] = [];
  const w = 20, h = 16;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let type: TerrainType = 'plain';
      let defenseBonus = 0;
      let movementCost = 1;

      if (x >= 9 && x <= 11 && y >= 2 && y <= 13 && !(y === 7 && x >= 9 && x <= 11)) {
        type = 'water';
        defenseBonus = -1;
        movementCost = 99;
      } else if ((x <= 3 && y <= 4) || (x <= 3 && y >= 11) || (x >= 16 && y <= 4) || (x >= 16 && y >= 11)) {
        type = 'mountain';
        defenseBonus = 3;
        movementCost = 3;
      } else if ((x >= 4 && x <= 6 && y <= 3) || (x >= 13 && x <= 15 && y >= 12)) {
        type = 'forest';
        defenseBonus = 2;
        movementCost = 2;
      } else if ((x >= 7 && x <= 8 && y >= 6 && y <= 8) || (x >= 12 && x <= 13 && y >= 6 && y <= 8)) {
        type = 'urban';
        defenseBonus = 3;
        movementCost = 1;
      } else if (y === 7 && ((x >= 0 && x <= 8) || (x >= 12 && x <= 19))) {
        type = 'road';
        defenseBonus = 0;
        movementCost = 0.5;
      } else if (x >= 9 && x <= 11 && y === 7) {
        type = 'road';
        defenseBonus = 0;
        movementCost = 0.5;
      } else if ((x >= 4 && x <= 5 && y >= 5 && y <= 10) || (x >= 14 && x <= 15 && y >= 5 && y <= 10)) {
        type = 'forest';
        defenseBonus = 2;
        movementCost = 2;
      }

      terrains.push({ x, y, type, defenseBonus, movementCost });
    }
  }
  return terrains;
}

function generateMap02Terrains(): TerrainCell[] {
  const terrains: TerrainCell[] = [];
  const w = 24, h = 18;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let type: TerrainType = 'plain';
      let defenseBonus = 0;
      let movementCost = 1;

      if (x >= 9 && x <= 14 && y >= 6 && y <= 11) {
        type = 'urban';
        defenseBonus = 3;
        movementCost = 1;
      } else if ((x >= 10 && x <= 13 && y >= 7 && y <= 10)) {
        type = 'urban';
        defenseBonus = 4;
        movementCost = 1;
      } else if (x >= 5 && x <= 6 && y >= 3 && y <= 5) {
        type = 'forest';
        defenseBonus = 2;
        movementCost = 2;
      } else if (x >= 17 && x <= 18 && y >= 12 && y <= 14) {
        type = 'forest';
        defenseBonus = 2;
        movementCost = 2;
      } else if (x >= 2 && x <= 3 && y >= 13 && y <= 15) {
        type = 'mountain';
        defenseBonus = 3;
        movementCost = 3;
      } else if (x >= 20 && x <= 21 && y >= 2 && y <= 4) {
        type = 'mountain';
        defenseBonus = 3;
        movementCost = 3;
      } else if (x >= 11 && x <= 12 && y >= 4 && y <= 6) {
        type = 'water';
        defenseBonus = -1;
        movementCost = 99;
      } else if (y === 8 && ((x >= 0 && x <= 8) || (x >= 15 && x <= 23))) {
        type = 'road';
        defenseBonus = 0;
        movementCost = 0.5;
      } else if (x === 11 && y >= 6 && y <= 11) {
        type = 'road';
        defenseBonus = 0;
        movementCost = 0.5;
      } else if (x === 12 && y >= 6 && y <= 11) {
        type = 'road';
        defenseBonus = 0;
        movementCost = 0.5;
      }

      terrains.push({ x, y, type, defenseBonus, movementCost });
    }
  }
  return terrains;
}

function getMap01SpawnPoints(): { red: Position[]; blue: Position[] } {
  return {
    red: [
      { x: 1, y: 6 }, { x: 2, y: 6 }, { x: 1, y: 7 }, { x: 2, y: 7 },
      { x: 1, y: 8 }, { x: 2, y: 8 }, { x: 1, y: 9 }, { x: 2, y: 9 }
    ],
    blue: [
      { x: 17, y: 6 }, { x: 18, y: 6 }, { x: 17, y: 7 }, { x: 18, y: 7 },
      { x: 17, y: 8 }, { x: 18, y: 8 }, { x: 17, y: 9 }, { x: 18, y: 9 }
    ]
  };
}

function getMap02SpawnPoints(): { red: Position[]; blue: Position[] } {
  return {
    red: [
      { x: 1, y: 6 }, { x: 2, y: 6 }, { x: 1, y: 7 }, { x: 2, y: 7 },
      { x: 1, y: 8 }, { x: 2, y: 8 }, { x: 1, y: 9 }, { x: 2, y: 9 },
      { x: 1, y: 10 }, { x: 2, y: 10 }
    ],
    blue: [
      { x: 21, y: 6 }, { x: 22, y: 6 }, { x: 21, y: 7 }, { x: 22, y: 7 },
      { x: 21, y: 8 }, { x: 22, y: 8 }, { x: 21, y: 9 }, { x: 22, y: 9 },
      { x: 21, y: 10 }, { x: 22, y: 10 }
    ]
  };
}

function seedMaps(db: Database.Database): void {
  const count = (db.prepare('SELECT COUNT(*) as cnt FROM map_config').get() as { cnt: number }).cnt;
  if (count > 0) return;

  const insert = db.prepare(
    'INSERT INTO map_config (mapId, name, width, height, terrains, spawnPoints) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const insertTransaction = db.transaction(() => {
    const map01Terrains = generateMap01Terrains();
    const map01Spawns = getMap01SpawnPoints();
    const t1 = JSON.stringify(map01Terrains);
    const s1 = JSON.stringify(map01Spawns);
    if (t1 && s1 && t1.length > 0 && s1.length > 0) {
      insert.run('map_01', '河谷要塞', 20, 16, t1, s1);
    }

    const map02Terrains = generateMap02Terrains();
    const map02Spawns = getMap02SpawnPoints();
    const t2 = JSON.stringify(map02Terrains);
    const s2 = JSON.stringify(map02Spawns);
    if (t2 && s2 && t2.length > 0 && s2.length > 0) {
      insert.run('map_02', '城镇争夺', 24, 18, t2, s2);
    }
  });

  try {
    insertTransaction();
  } catch (e) {
    console.error('Failed to seed maps:', e);
    db.prepare('DELETE FROM map_config').run();
  }
}

export function getDb(): Database.Database {
  if (db) return db;

  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'tactics.db');
  db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS map_config (
      mapId TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      terrains TEXT NOT NULL,
      spawnPoints TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS room (
      roomId TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      mapId TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'turn-based',
      status TEXT NOT NULL DEFAULT 'waiting',
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS player (
      playerId TEXT PRIMARY KEY,
      roomId TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'commander',
      faction TEXT NOT NULL DEFAULT 'none',
      FOREIGN KEY (roomId) REFERENCES room(roomId)
    );

    CREATE TABLE IF NOT EXISTS game_record (
      recordId TEXT PRIMARY KEY,
      roomId TEXT NOT NULL,
      result TEXT NOT NULL,
      redScore INTEGER NOT NULL DEFAULT 0,
      blueScore INTEGER NOT NULL DEFAULT 0,
      duration INTEGER NOT NULL DEFAULT 0,
      completedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (roomId) REFERENCES room(roomId)
    );

    CREATE TABLE IF NOT EXISTS game_event (
      eventId INTEGER PRIMARY KEY AUTOINCREMENT,
      recordId TEXT NOT NULL,
      turn INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      playerId TEXT NOT NULL,
      action TEXT NOT NULL,
      unitId TEXT NOT NULL,
      fromX INTEGER NOT NULL,
      fromY INTEGER NOT NULL,
      toX INTEGER NOT NULL,
      toY INTEGER NOT NULL,
      damage INTEGER DEFAULT 0,
      eliminated INTEGER DEFAULT 0,
      FOREIGN KEY (recordId) REFERENCES game_record(recordId)
    );

    CREATE TABLE IF NOT EXISTS unit (
      unitId TEXT PRIMARY KEY,
      roomId TEXT NOT NULL,
      unitType TEXT NOT NULL,
      faction TEXT NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      strength INTEGER NOT NULL,
      maxStrength INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      defenseBonus REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (roomId) REFERENCES room(roomId)
    );

    CREATE TABLE IF NOT EXISTS tactical_plan (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      room_id TEXT,
      map_id TEXT NOT NULL,
      creator TEXT NOT NULL,
      faction TEXT NOT NULL,
      commands TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (room_id) REFERENCES room(roomId)
    );

    CREATE TABLE IF NOT EXISTS replay_snapshot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id TEXT NOT NULL,
      turn INTEGER NOT NULL,
      state TEXT NOT NULL,
      events TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (record_id) REFERENCES game_record(recordId)
    );
  `);

  seedMaps(db);

  return db;
}

export function getMapFromRow(row: Record<string, unknown> | null | undefined): MapConfig | null {
  if (!row) return null;
  try {
    let terrains: TerrainCell[] = [];
    let spawnPoints: { red: Position[]; blue: Position[] } = { red: [], blue: [] };

    if (typeof row.terrains === 'string' && row.terrains.length > 0) {
      const parsed = JSON.parse(row.terrains);
      if (Array.isArray(parsed)) {
        terrains = parsed;
      }
    }
    if (typeof row.spawnPoints === 'string' && row.spawnPoints.length > 0) {
      const parsed = JSON.parse(row.spawnPoints);
      if (parsed && parsed.red && parsed.blue) {
        spawnPoints = parsed;
      }
    }

    return {
      mapId: row.mapId as string,
      name: row.name as string,
      width: Number(row.width) || 0,
      height: Number(row.height) || 0,
      terrains,
      spawnPoints,
    };
  } catch (e) {
    console.error('Failed to parse map config:', row.mapId, e);
    return null;
  }
}

export function saveGameRecordWithEvents(
  roomId: string,
  result: string,
  state: GameState,
  events: GameEvent[]
): { success: boolean; gameId?: string } {
  const db = getDb();
  const gameId = generateId();

  const insertRecord = db.prepare(
    'INSERT INTO game_record (recordId, roomId, result, redScore, blueScore, duration) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const insertEvent = db.prepare(
    'INSERT INTO game_event (recordId, turn, timestamp, playerId, action, unitId, fromX, fromY, toX, toY, damage, eliminated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  const updateUnit = db.prepare(
    'UPDATE unit SET strength = ?, status = ?, x = ?, y = ?, defenseBonus = ? WHERE unitId = ? AND roomId = ?'
  );

  const tx = db.transaction(() => {
    insertRecord.run(
      gameId, roomId, result,
      state.redScore, state.blueScore, state.turn
    );

    for (const ev of events) {
      insertEvent.run(
        gameId,
        ev.turn,
        ev.timestamp,
        ev.playerId,
        ev.action,
        ev.unitId,
        ev.from.x, ev.from.y,
        ev.to.x, ev.to.y,
        ev.result?.damage ?? 0,
        ev.result?.eliminated ? 1 : 0
      );
    }

    for (const unit of state.units) {
      updateUnit.run(
        unit.strength, unit.status,
        unit.position.x, unit.position.y,
        unit.defenseBonus,
        unit.unitId, roomId
      );
    }
  });

  try {
    tx();
    return { success: true, gameId };
  } catch (e) {
    console.error('Failed to save game record:', e);
    return { success: false };
  }
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

function validateJson(data: unknown): boolean {
  try {
    const str = JSON.stringify(data);
    const parsed = JSON.parse(str);
    return parsed !== undefined && parsed !== null;
  } catch {
    return false;
  }
}

function parseCommands(commandsStr: string): UnitCommand[] {
  try {
    const parsed = JSON.parse(commandsStr);
    if (Array.isArray(parsed)) {
      return parsed as UnitCommand[];
    }
    return [];
  } catch {
    return [];
  }
}

function parseGameState(stateStr: string): GameState | null {
  try {
    const parsed = JSON.parse(stateStr);
    return parsed as GameState;
  } catch {
    return null;
  }
}

function parseGameEvents(eventsStr: string): GameEvent[] {
  try {
    const parsed = JSON.parse(eventsStr);
    if (Array.isArray(parsed)) {
      return parsed as GameEvent[];
    }
    return [];
  } catch {
    return [];
  }
}

export function saveTacticalPlan(plan: Omit<TacticalPlan, "id" | "createdAt">): TacticalPlan {
  const db = getDb();
  const id = generateId();
  const createdAt = new Date().toISOString();

  if (!validateJson(plan.commands)) {
    throw new Error('Invalid commands data');
  }

  const commandsJson = JSON.stringify(plan.commands);

  const insert = db.prepare(`
    INSERT INTO tactical_plan (id, name, room_id, map_id, creator, faction, commands, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    insert.run(
      id,
      plan.name,
      plan.roomId || null,
      plan.mapId,
      plan.creator,
      plan.faction,
      commandsJson,
      plan.description || null,
      createdAt
    );
  });

  try {
    tx();
    return {
      ...plan,
      id,
      createdAt,
    };
  } catch (e) {
    console.error('Failed to save tactical plan:', e);
    throw e;
  }
}

export function getTacticalPlan(id: string): TacticalPlan | null {
  const db = getDb();
  try {
    const row = db.prepare('SELECT * FROM tactical_plan WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return null;

    return {
      id: row.id as string,
      name: row.name as string,
      roomId: row.room_id as string | undefined,
      mapId: row.map_id as string,
      creator: row.creator as string,
      faction: row.faction as Faction,
      commands: parseCommands(row.commands as string),
      createdAt: row.created_at as string,
      description: row.description as string | undefined,
    };
  } catch (e) {
    console.error('Failed to get tactical plan:', e);
    return null;
  }
}

export function listTacticalPlans(faction?: Faction, mapId?: string): TacticalPlan[] {
  const db = getDb();
  try {
    let query = 'SELECT * FROM tactical_plan WHERE 1=1';
    const params: unknown[] = [];

    if (faction) {
      query += ' AND faction = ?';
      params.push(faction);
    }
    if (mapId) {
      query += ' AND map_id = ?';
      params.push(mapId);
    }
    query += ' ORDER BY created_at DESC';

    const rows = db.prepare(query).all(...params) as Record<string, unknown>[];
    return rows.map(row => ({
      id: row.id as string,
      name: row.name as string,
      roomId: row.room_id as string | undefined,
      mapId: row.map_id as string,
      creator: row.creator as string,
      faction: row.faction as Faction,
      commands: parseCommands(row.commands as string),
      createdAt: row.created_at as string,
      description: row.description as string | undefined,
    }));
  } catch (e) {
    console.error('Failed to list tactical plans:', e);
    return [];
  }
}

export function deleteTacticalPlan(id: string): boolean {
  const db = getDb();
  try {
    const result = db.prepare('DELETE FROM tactical_plan WHERE id = ?').run(id);
    return result.changes > 0;
  } catch (e) {
    console.error('Failed to delete tactical plan:', e);
    return false;
  }
}

export function saveReplaySnapshot(snapshot: Omit<ReplaySnapshot, "id">, recordId: string): void {
  const db = getDb();

  if (!validateJson(snapshot.state) || !validateJson(snapshot.events)) {
    throw new Error('Invalid snapshot data');
  }

  const stateJson = JSON.stringify(snapshot.state);
  const eventsJson = JSON.stringify(snapshot.events);

  const insert = db.prepare(`
    INSERT INTO replay_snapshot (record_id, turn, state, events, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    insert.run(
      recordId,
      snapshot.turn,
      stateJson,
      eventsJson,
      snapshot.timestamp
    );
  });

  try {
    tx();
  } catch (e) {
    console.error('Failed to save replay snapshot:', e);
    throw e;
  }
}

export function getReplayData(recordId: string): ReplayData | null {
  const db = getDb();
  try {
    const recordRow = db.prepare(`
      SELECT gr.*, r.mapId
      FROM game_record gr
      JOIN room r ON gr.roomId = r.roomId
      WHERE gr.recordId = ?
    `).get(recordId) as Record<string, unknown> | undefined;

    if (!recordRow) return null;

    const mapRow = db.prepare('SELECT * FROM map_config WHERE mapId = ?').get(recordRow.mapId as string) as Record<string, unknown> | undefined;
    if (!mapRow) return null;

    const mapConfig = getMapFromRow(mapRow);
    if (!mapConfig) return null;

    const snapshotRows = db.prepare(`
      SELECT turn, state, events, timestamp
      FROM replay_snapshot
      WHERE record_id = ?
      ORDER BY turn ASC
    `).all(recordId) as Record<string, unknown>[];

    const snapshots: ReplaySnapshot[] = snapshotRows.map(row => {
      const state = parseGameState(row.state as string);
      const events = parseGameEvents(row.events as string);
      return {
        turn: row.turn as number,
        state: state || { turn: 0, phase: 'finished', units: [], redScore: 0, blueScore: 0 },
        events,
        timestamp: row.timestamp as number,
      };
    });

    const result = recordRow.result as string;
    let winner: Faction | undefined;
    if (result === 'red_win') winner = 'red';
    else if (result === 'blue_win') winner = 'blue';

    const totalTurns = snapshots.length > 0 ? snapshots[snapshots.length - 1].turn : 0;

    return {
      recordId,
      mapConfig,
      snapshots,
      winner,
      totalTurns,
    };
  } catch (e) {
    console.error('Failed to get replay data:', e);
    return null;
  }
}
