import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'app.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS sensors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    protocol TEXT NOT NULL DEFAULT 'MQTT',
    frequency INTEGER NOT NULL DEFAULT 1000,
    unit TEXT NOT NULL DEFAULT '',
    range_min REAL NOT NULL DEFAULT 0,
    range_max REAL NOT NULL DEFAULT 100,
    status TEXT NOT NULL DEFAULT 'offline',
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sensor_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sensor_id TEXT NOT NULL,
    value REAL NOT NULL,
    quality TEXT NOT NULL DEFAULT 'good',
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (sensor_id) REFERENCES sensors(id)
  );

  CREATE INDEX IF NOT EXISTS idx_sensor_data_sensor_id ON sensor_data(sensor_id);
  CREATE INDEX IF NOT EXISTS idx_sensor_data_timestamp ON sensor_data(timestamp);

  CREATE TABLE IF NOT EXISTS scada_panels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    layout TEXT NOT NULL DEFAULT '{}',
    components TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS metadata_versions (
    version INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'analyst',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const sensorCount = db.prepare('SELECT COUNT(*) as count FROM sensors').get() as { count: number };

if (sensorCount.count === 0) {
  const insertSensor = db.prepare(`
    INSERT INTO sensors (id, name, type, protocol, frequency, unit, range_min, range_max, status, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertPanel = db.prepare(`
    INSERT INTO scada_panels (id, name, description, layout, components)
    VALUES (?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    insertSensor.run('sensor-001', '反应釜温度', 'temperature', 'MQTT', 2000, '°C', 0, 200, 'online', '["反应釜","温度"]');
    insertSensor.run('sensor-002', '管道压力', 'pressure', 'MQTT', 1000, 'MPa', 0, 10, 'online', '["管道","压力"]');
    insertSensor.run('sensor-003', '进料流量', 'flow', 'Modbus', 3000, 'm³/h', 0, 500, 'online', '["进料","流量"]');
    insertSensor.run('sensor-004', '电机振动', 'vibration', 'OPC-UA', 500, 'mm/s', 0, 50, 'offline', '["电机","振动"]');
    insertSensor.run('sensor-005', '储罐液位', 'level', 'MQTT', 2000, 'm', 0, 20, 'online', '["储罐","液位"]');
    insertSensor.run('sensor-006', '车间湿度', 'humidity', 'MQTT', 5000, '%RH', 0, 100, 'alarm', '["车间","湿度"]');

    insertPanel.run(
      'panel-001',
      '反应釜监控面板',
      '反应釜区域主要传感器监控',
      '{"cols":12,"rows":8,"gridGap":8}',
      '[{"id":"comp-001","type":"gauge","x":0,"y":0,"width":160,"height":120,"props":{"min":0,"max":200,"unit":"°C","title":"反应釜温度"},"sensorBindings":["sensor-001"]},{"id":"comp-002","type":"gauge","x":200,"y":0,"width":160,"height":120,"props":{"min":0,"max":10,"unit":"MPa","title":"管道压力"},"sensorBindings":["sensor-002"]},{"id":"comp-003","type":"chart","x":0,"y":160,"width":400,"height":160,"props":{"title":"温度与压力趋势","chartType":"line"},"sensorBindings":["sensor-001","sensor-002"]},{"id":"comp-004","type":"indicator","x":400,"y":0,"width":120,"height":60,"props":{"label":"液位状态"},"sensorBindings":["sensor-005"]}]'
    );

    const sensorRows = db.prepare('SELECT * FROM sensors').all() as any[];
    const snapshot = JSON.stringify(sensorRows);
    db.prepare('INSERT INTO metadata_versions (snapshot) VALUES (?)').run(snapshot);
  });

  transaction();
}

const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };

if (userCount.count === 0) {
  db.prepare(
    "INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)"
  ).run('admin', 'admin', Buffer.from('admin123').toString('base64'), 'admin');
}

export function ensureMonthlyTable(yearMonth: string): void {
  const tableName = `sensor_data_${yearMonth}`;
  const tableCheck = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
  ).get(tableName);
  if (tableCheck) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sensor_id TEXT NOT NULL,
      value REAL NOT NULL,
      quality TEXT NOT NULL DEFAULT 'good',
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (sensor_id) REFERENCES sensors(id)
    );
    CREATE INDEX IF NOT EXISTS idx_${tableName}_sensor_id ON ${tableName}(sensor_id);
    CREATE INDEX IF NOT EXISTS idx_${tableName}_timestamp ON ${tableName}(timestamp);
  `);
}

export default db;
