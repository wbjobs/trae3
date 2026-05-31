const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const metadataDbPath = path.join(__dirname, '../data/metadata.db');
const fs = require('fs');

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const metadataDb = new sqlite3.Database(metadataDbPath, (err) => {
  if (err) {
    console.error('连接元数据数据库失败:', err.message);
  } else {
    console.log('已连接到元数据数据库');
    initMetadataTables();
  }
});

function initMetadataTables() {
  metadataDb.serialize(() => {
    metadataDb.run(`
      CREATE TABLE IF NOT EXISTS archives (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        archive_number TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        retention_period TEXT NOT NULL,
        description TEXT,
        creator TEXT NOT NULL,
        creation_date TEXT NOT NULL,
        department TEXT NOT NULL,
        keywords TEXT,
        file_name TEXT,
        file_original_name TEXT,
        file_size INTEGER,
        file_type TEXT,
        file_path TEXT,
        file_relative_path TEXT,
        status TEXT DEFAULT '正常',
        review_status TEXT DEFAULT '待审核',
        reviewer TEXT,
        review_comment TEXT,
        reviewed_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    metadataDb.run(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    metadataDb.run(`
      CREATE TABLE IF NOT EXISTS operation_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        archive_id INTEGER,
        operation TEXT NOT NULL,
        operator TEXT NOT NULL,
        details TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (archive_id) REFERENCES archives(id)
      )
    `);

    metadataDb.run(`
      CREATE TABLE IF NOT EXISTS review_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        archive_id INTEGER NOT NULL,
        reviewer TEXT NOT NULL,
        action TEXT NOT NULL,
        comment TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (archive_id) REFERENCES archives(id)
      )
    `);

    metadataDb.run(`
      CREATE TABLE IF NOT EXISTS import_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT UNIQUE NOT NULL,
        file_name TEXT NOT NULL,
        total_count INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        fail_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'processing',
        error_log TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT
      )
    `);

    const defaultCategories = [
      { code: 'WS', name: '文书档案' },
      { code: 'KJ', name: '科技档案' },
      { code: 'KD', name: '会计档案' },
      { code: 'RS', name: '人事档案' },
      { code: 'SX', name: '声像档案' },
      { code: 'DZ', name: '电子档案' }
    ];

    defaultCategories.forEach(cat => {
      metadataDb.run(
        'INSERT OR IGNORE INTO categories (code, name) VALUES (?, ?)',
        [cat.code, cat.name]
      );
    });
  });
}

function runQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function getQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function allQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function serializeTransaction(operations) {
  return new Promise((resolve, reject) => {
    metadataDb.serialize(() => {
      metadataDb.run('BEGIN TRANSACTION');
      
      try {
        const results = [];
        operations.forEach(op => {
          metadataDb.run(op.sql, op.params || [], function(err) {
            if (err) {
              metadataDb.run('ROLLBACK');
              reject(err);
            } else {
              results.push({ lastID: this.lastID, changes: this.changes });
            }
          });
        });
        
        metadataDb.run('COMMIT', (err) => {
          if (err) {
            metadataDb.run('ROLLBACK');
            reject(err);
          } else {
            resolve(results);
          }
        });
      } catch (err) {
        metadataDb.run('ROLLBACK');
        reject(err);
      }
    });
  });
}

module.exports = {
  metadataDb,
  runQuery,
  getQuery,
  allQuery,
  serializeTransaction
};
