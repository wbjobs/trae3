const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

let db = null;

const initDatabase = async () => {
  const dbPath = process.env.DB_PATH || './database/logs.db';
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        reject(err);
        return;
      }
      db.run('PRAGMA journal_mode=WAL', (walErr) => {
        if (walErr) {
          logger.warn('设置WAL模式失败:', walErr);
        }
      });
      db.run('PRAGMA busy_timeout=5000');
      db.run('PRAGMA synchronous=NORMAL');
      db.run('PRAGMA cache_size=-64000');
      createTables().then(resolve).catch(reject);
    });
  });
};

const createTables = async () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS terminals (
        id TEXT PRIMARY KEY,
        name TEXT,
        vehicle_number TEXT,
        status TEXT DEFAULT 'offline',
        last_online DATETIME,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        terminal_id TEXT,
        level TEXT NOT NULL CHECK(level IN ('debug','info','warning','error','critical')),
        module TEXT,
        message TEXT NOT NULL,
        metadata TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE INDEX IF NOT EXISTS idx_logs_terminal ON logs(terminal_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_logs_terminal_timestamp ON logs(terminal_id, timestamp DESC)`);

      db.run(`CREATE TABLE IF NOT EXISTS log_statistics (
        date DATE PRIMARY KEY,
        total_logs INTEGER DEFAULT 0,
        debug_logs INTEGER DEFAULT 0,
        info_logs INTEGER DEFAULT 0,
        warning_logs INTEGER DEFAULT 0,
        error_logs INTEGER DEFAULT 0,
        critical_logs INTEGER DEFAULT 0
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        terminal_id TEXT,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        level TEXT NOT NULL CHECK(level IN ('debug','info','warning','error','critical')),
        rule_name TEXT DEFAULT '',
        resolved INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME
      )`);

      resolve();
    });
  });
};

const getDb = () => db;

const runQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

const getQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const allQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

module.exports = {
  initDatabase,
  getDb,
  runQuery,
  getQuery,
  allQuery,
};