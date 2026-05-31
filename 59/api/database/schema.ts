import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'data', 'mep.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('hvac','plumbing','electrical','fire')),
      floor INTEGER NOT NULL,
      position_x REAL NOT NULL,
      position_y REAL NOT NULL,
      position_z REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'offline' CHECK(status IN ('online','offline','alarm')),
      health_score REAL NOT NULL DEFAULT 100,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS device_params (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      param_key TEXT NOT NULL,
      label TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT NOT NULL,
      threshold_min REAL,
      threshold_max REAL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(device_id, param_key)
    );

    CREATE TABLE IF NOT EXISTS device_param_trend (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      param_key TEXT NOT NULL,
      value REAL NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS alert_rules (
      id TEXT PRIMARY KEY,
      device_type TEXT NOT NULL,
      param_key TEXT NOT NULL,
      level TEXT NOT NULL CHECK(level IN ('critical','major','minor')),
      condition TEXT NOT NULL CHECK(condition IN ('gt','lt','eq')),
      threshold REAL NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      level TEXT NOT NULL CHECK(level IN ('critical','major','minor')),
      message TEXT NOT NULL,
      param_key TEXT NOT NULL,
      param_value REAL NOT NULL,
      threshold REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','confirmed','resolved')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      confirmed_at TEXT,
      confirmed_by TEXT,
      remark TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_devices_type ON devices(type);
    CREATE INDEX IF NOT EXISTS idx_devices_floor ON devices(floor);
    CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
    CREATE INDEX IF NOT EXISTS idx_device_params_device_id ON device_params(device_id);
    CREATE INDEX IF NOT EXISTS idx_param_trend_device_param ON device_param_trend(device_id, param_key);
    CREATE INDEX IF NOT EXISTS idx_param_trend_timestamp ON device_param_trend(timestamp);
    CREATE INDEX IF NOT EXISTS idx_alerts_device_id ON alerts(device_id);
    CREATE INDEX IF NOT EXISTS idx_alerts_level ON alerts(level);
    CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
    CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at);
  `);

  return db;
}
