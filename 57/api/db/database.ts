import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export function initDatabase(): Database.Database {
  const dataDir = path.resolve(process.cwd(), 'data')
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  const dbPath = path.resolve(dataDir, 'monitor.db')
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  createTables(db)
  createIndexes(db)

  return db
}

function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      river TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'online',
      data_format TEXT NOT NULL DEFAULT 'json',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ts_monitor_data (
      id TEXT PRIMARY KEY,
      station_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      water_level REAL,
      flow_rate REAL,
      rainfall REAL,
      water_temp REAL,
      ph REAL,
      dissolved_oxygen REAL,
      FOREIGN KEY (station_id) REFERENCES stations(id)
    );

    CREATE TABLE IF NOT EXISTS alert_rules (
      id TEXT PRIMARY KEY,
      station_id TEXT NOT NULL,
      metric TEXT NOT NULL,
      level TEXT NOT NULL CHECK(level IN ('blue','yellow','orange','red')),
      threshold REAL NOT NULL,
      operator TEXT NOT NULL DEFAULT 'gt',
      enabled INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (station_id) REFERENCES stations(id)
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      station_id TEXT NOT NULL,
      rule_id TEXT NOT NULL,
      level TEXT NOT NULL,
      metric TEXT NOT NULL,
      value REAL NOT NULL,
      threshold REAL NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      timestamp TEXT NOT NULL,
      comment TEXT,
      FOREIGN KEY (station_id) REFERENCES stations(id),
      FOREIGN KEY (rule_id) REFERENCES alert_rules(id)
    );

    CREATE TABLE IF NOT EXISTS indicator_results (
      id TEXT PRIMARY KEY,
      station_id TEXT NOT NULL,
      indicator_type TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      calculated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (station_id) REFERENCES stations(id)
    );
  `)
}

function createIndexes(db: Database.Database): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ts_data_station_time ON ts_monitor_data(station_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_ts_data_timestamp ON ts_monitor_data(timestamp);
    CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
    CREATE INDEX IF NOT EXISTS idx_alerts_level ON alerts(level);
    CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp);
    CREATE INDEX IF NOT EXISTS idx_indicators_station_type ON indicator_results(station_id, indicator_type);
  `)
}
