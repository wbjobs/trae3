import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { allScenarios } from "./scenarios.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.resolve(__dirname, "../data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "war-sandbox.db");

export const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS scenarios (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    map_width INTEGER NOT NULL,
    map_height INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS hex_tiles (
    id TEXT PRIMARY KEY,
    scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
    q INTEGER NOT NULL,
    r INTEGER NOT NULL,
    terrain TEXT NOT NULL DEFAULT 'plain'
  );

  CREATE TABLE IF NOT EXISTS scenario_units (
    id TEXT PRIMARY KEY,
    scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    faction TEXT NOT NULL,
    q INTEGER NOT NULL,
    r INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    scenario_id TEXT NOT NULL REFERENCES scenarios(id),
    status TEXT NOT NULL DEFAULT 'waiting',
    current_turn INTEGER NOT NULL DEFAULT 0,
    max_turns INTEGER NOT NULL DEFAULT 20,
    phase TEXT NOT NULL DEFAULT 'move',
    join_code TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    faction TEXT NOT NULL,
    is_ready INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS units (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    faction TEXT NOT NULL,
    hp INTEGER NOT NULL,
    max_hp INTEGER NOT NULL,
    attack INTEGER NOT NULL,
    defense INTEGER NOT NULL,
    movement INTEGER NOT NULL,
    q INTEGER NOT NULL,
    r INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    moved INTEGER NOT NULL DEFAULT 0,
    attacked INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS turns (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    turn_number INTEGER NOT NULL,
    phase TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT
  );

  CREATE TABLE IF NOT EXISTS turn_events (
    id TEXT PRIMARY KEY,
    turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    data TEXT
  );

  CREATE TABLE IF NOT EXISTS game_snapshots (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    turn INTEGER NOT NULL,
    phase TEXT NOT NULL,
    state_data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
  CREATE INDEX IF NOT EXISTS idx_games_updated ON games(updated_at);
  CREATE INDEX IF NOT EXISTS idx_units_game ON units(game_id);
  CREATE INDEX IF NOT EXISTS idx_units_game_status ON units(game_id, status);
  CREATE INDEX IF NOT EXISTS idx_turns_game ON turns(game_id);
  CREATE INDEX IF NOT EXISTS idx_players_game ON players(game_id);
  CREATE INDEX IF NOT EXISTS idx_hex_tiles_scenario ON hex_tiles(scenario_id);
  CREATE INDEX IF NOT EXISTS idx_scenario_units_scenario ON scenario_units(scenario_id);
  CREATE INDEX IF NOT EXISTS idx_game_snapshots_game ON game_snapshots(game_id);
  CREATE INDEX IF NOT EXISTS idx_game_snapshots_game_created ON game_snapshots(game_id, created_at);
`);

const hasPhaseColumn = db
  .prepare("SELECT COUNT(*) as cnt FROM pragma_table_info('games') WHERE name = 'phase'")
  .get() as { cnt: number };

if (hasPhaseColumn.cnt === 0) {
  db.exec("ALTER TABLE games ADD COLUMN phase TEXT NOT NULL DEFAULT 'move'");
}

const hasMovedColumn = db
  .prepare("SELECT COUNT(*) as cnt FROM pragma_table_info('units') WHERE name = 'moved'")
  .get() as { cnt: number };

if (hasMovedColumn.cnt === 0) {
  db.exec("ALTER TABLE units ADD COLUMN moved INTEGER NOT NULL DEFAULT 0");
}

const hasAttackedColumn = db
  .prepare("SELECT COUNT(*) as cnt FROM pragma_table_info('units') WHERE name = 'attacked'")
  .get() as { cnt: number };

if (hasAttackedColumn.cnt === 0) {
  db.exec("ALTER TABLE units ADD COLUMN attacked INTEGER NOT NULL DEFAULT 0");
}

function initializeScenarios() {
  const insertScenario = db.prepare(
    "INSERT OR REPLACE INTO scenarios (id, name, description, map_width, map_height) VALUES (?, ?, ?, ?, ?)"
  );
  const deleteTiles = db.prepare("DELETE FROM hex_tiles WHERE scenario_id = ?");
  const deleteUnits = db.prepare("DELETE FROM scenario_units WHERE scenario_id = ?");
  const insertTile = db.prepare(
    "INSERT INTO hex_tiles (id, scenario_id, q, r, terrain) VALUES (?, ?, ?, ?, ?)"
  );
  const insertUnit = db.prepare(
    "INSERT INTO scenario_units (id, scenario_id, type, faction, q, r) VALUES (?, ?, ?, ?, ?, ?)"
  );

  const transaction = db.transaction(() => {
    for (const scenario of allScenarios) {
      insertScenario.run(scenario.id, scenario.name, scenario.description, scenario.mapWidth, scenario.mapHeight);

      deleteTiles.run(scenario.id);
      deleteUnits.run(scenario.id);

      for (const tile of scenario.tiles) {
        insertTile.run(uuidv4(), scenario.id, tile.q, tile.r, tile.terrain);
      }
      for (const unit of scenario.units) {
        insertUnit.run(uuidv4(), scenario.id, unit.type, unit.faction, unit.q, unit.r);
      }
    }
  });

  transaction();
}

initializeScenarios();
