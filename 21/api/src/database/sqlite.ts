
import Database from 'better-sqlite3'
import config from '../../config'
import fs from 'fs'
import path from 'path'

let db: Database.Database | null = null

export const getSQLiteDB = (): Database.Database => {
  if (!db) {
    const dbDir = path.dirname(config.sqlite.path)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }
    
    db = new Database(config.sqlite.path)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initTables()
    initSeedData()
  }
  return db
}

const initTables = () => {
  const database = getSQLiteDB()
  
  database.exec(`
    CREATE TABLE IF NOT EXISTS cabins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      position TEXT,
      status INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sensors (
      id TEXT PRIMARY KEY,
      cabin_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      min_value REAL NOT NULL,
      max_value REAL NOT NULL,
      warn_threshold REAL NOT NULL,
      alarm_threshold REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cabin_id) REFERENCES cabins(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      cabin_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'off',
      current_value REAL DEFAULT 0,
      target_value REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cabin_id) REFERENCES cabins(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS alarm_rules (
      id TEXT PRIMARY KEY,
      sensor_id TEXT NOT NULL,
      condition TEXT NOT NULL,
      threshold REAL NOT NULL,
      level TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sensor_id) REFERENCES sensors(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS alarm_logs (
      id TEXT PRIMARY KEY,
      rule_id TEXT,
      sensor_id TEXT NOT NULL,
      trigger_value REAL NOT NULL,
      level TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'pending',
      handler_id TEXT,
      resolved_at DATETIME,
      message TEXT,
      FOREIGN KEY (rule_id) REFERENCES alarm_rules(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS control_logs (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      action TEXT NOT NULL,
      value REAL,
      operator_id TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      success INTEGER DEFAULT 1,
      message TEXT,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS linkage_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      sensor_id TEXT NOT NULL,
      sensor_operator TEXT NOT NULL,
      sensor_value REAL NOT NULL,
      device_id TEXT NOT NULL,
      device_command TEXT NOT NULL,
      device_value REAL,
      enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sensor_id) REFERENCES sensors(id) ON DELETE CASCADE,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS system_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE,
      data_points INTEGER DEFAULT 0,
      alarms INTEGER DEFAULT 0,
      controls INTEGER DEFAULT 0
    );
  `)
}

const initSeedData = () => {
  const database = getSQLiteDB()
  
  const cabinCount = database.prepare('SELECT COUNT(*) as count FROM cabins').get() as { count: number }
  if (cabinCount.count > 0) return

  const cabins = [
    { id: 'cabin-1', name: '主机舱', description: '船舶主发动机舱室', position: '船中前部' },
    { id: 'cabin-2', name: '辅机舱', description: '船舶辅助发动机舱室', position: '船中部' },
    { id: 'cabin-3', name: '燃油舱', description: '燃油存储舱室', position: '船中后部' },
    { id: 'cabin-4', name: '淡水舱', description: '淡水存储舱室', position: '船后部' },
    { id: 'cabin-5', name: '压载水舱', description: '压载水调节舱室', position: '船底两侧' },
  ]

  const insertCabin = database.prepare(
    'INSERT INTO cabins (id, name, description, position) VALUES (?, ?, ?, ?)'
  )

  cabins.forEach(cabin => {
    insertCabin.run(cabin.id, cabin.name, cabin.description, cabin.position)
  })

  const sensors = [
    { id: 'sensor-1-1', cabinId: 'cabin-1', type: 'temperature', name: '主机进气温度', unit: '°C', min: 0, max: 100, warn: 75, alarm: 85 },
    { id: 'sensor-1-2', cabinId: 'cabin-1', type: 'temperature', name: '主机排气温度', unit: '°C', min: 0, max: 500, warn: 380, alarm: 420 },
    { id: 'sensor-1-3', cabinId: 'cabin-1', type: 'humidity', name: '舱内湿度', unit: '%', min: 0, max: 100, warn: 70, alarm: 85 },
    { id: 'sensor-1-4', cabinId: 'cabin-1', type: 'pressure', name: '主机油压', unit: 'MPa', min: 0, max: 1, warn: 0.5, alarm: 0.3 },
    { id: 'sensor-2-1', cabinId: 'cabin-2', type: 'temperature', name: '辅机温度', unit: '°C', min: 0, max: 120, warn: 85, alarm: 95 },
    { id: 'sensor-2-2', cabinId: 'cabin-2', type: 'pressure', name: '辅机气压', unit: 'MPa', min: 0, max: 1.5, warn: 1.0, alarm: 1.2 },
    { id: 'sensor-2-3', cabinId: 'cabin-2', type: 'humidity', name: '舱内湿度', unit: '%', min: 0, max: 100, warn: 65, alarm: 80 },
    { id: 'sensor-3-1', cabinId: 'cabin-3', type: 'level', name: '燃油液位', unit: '%', min: 0, max: 100, warn: 20, alarm: 10 },
    { id: 'sensor-3-2', cabinId: 'cabin-3', type: 'temperature', name: '燃油温度', unit: '°C', min: 0, max: 80, warn: 50, alarm: 60 },
    { id: 'sensor-4-1', cabinId: 'cabin-4', type: 'level', name: '淡水液位', unit: '%', min: 0, max: 100, warn: 30, alarm: 15 },
    { id: 'sensor-5-1', cabinId: 'cabin-5', type: 'level', name: '左舷压载液位', unit: '%', min: 0, max: 100, warn: 80, alarm: 90 },
    { id: 'sensor-5-2', cabinId: 'cabin-5', type: 'level', name: '右舷压载液位', unit: '%', min: 0, max: 100, warn: 80, alarm: 90 },
    { id: 'sensor-5-3', cabinId: 'cabin-5', type: 'pressure', name: '压载泵压力', unit: 'MPa', min: 0, max: 0.8, warn: 0.5, alarm: 0.6 },
  ]

  const insertSensor = database.prepare(
    'INSERT INTO sensors (id, cabin_id, type, name, unit, min_value, max_value, warn_threshold, alarm_threshold) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )

  sensors.forEach(sensor => {
    insertSensor.run(
      sensor.id, sensor.cabinId, sensor.type, sensor.name, sensor.unit,
      sensor.min, sensor.max, sensor.warn, sensor.alarm
    )
  })

  const devices = [
    { id: 'device-1-1', cabinId: 'cabin-1', type: 'fan', name: '主机舱通风机', status: 'on', value: 75 },
    { id: 'device-1-2', cabinId: 'cabin-1', type: 'pump', name: '主机冷却水泵', status: 'on', value: 100 },
    { id: 'device-1-3', cabinId: 'cabin-1', type: 'heater', name: '主机预热器', status: 'off', value: 0 },
    { id: 'device-2-1', cabinId: 'cabin-2', type: 'fan', name: '辅机舱通风机', status: 'on', value: 60 },
    { id: 'device-2-2', cabinId: 'cabin-2', type: 'cooler', name: '辅机冷却器', status: 'on', value: 80 },
    { id: 'device-3-1', cabinId: 'cabin-3', type: 'pump', name: '燃油输送泵', status: 'off', value: 0 },
    { id: 'device-3-2', cabinId: 'cabin-3', type: 'heater', name: '燃油加热器', status: 'off', value: 0 },
    { id: 'device-3-3', cabinId: 'cabin-3', type: 'valve', name: '燃油出口阀', status: 'off', value: 0 },
    { id: 'device-4-1', cabinId: 'cabin-4', type: 'pump', name: '淡水泵', status: 'off', value: 0 },
    { id: 'device-5-1', cabinId: 'cabin-5', type: 'pump', name: '左舷压载泵', status: 'off', value: 0 },
    { id: 'device-5-2', cabinId: 'cabin-5', type: 'pump', name: '右舷压载泵', status: 'off', value: 0 },
    { id: 'device-5-3', cabinId: 'cabin-5', type: 'valve', name: '压载舱控制阀组', status: 'off', value: 0 },
  ]

  const insertDevice = database.prepare(
    'INSERT INTO devices (id, cabin_id, type, name, status, current_value) VALUES (?, ?, ?, ?, ?, ?)'
  )

  devices.forEach(device => {
    insertDevice.run(device.id, device.cabinId, device.type, device.name, device.status, device.value)
  })

  const linkageRules = [
    {
      id: 'linkage-1', name: '高温自动通风', description: '主机舱温度过高时开启通风',
      sensorId: 'sensor-1-1', operator: '>', sensorValue: 70,
      deviceId: 'device-1-1', command: 'setValue', deviceValue: 100
    },
    {
      id: 'linkage-2', name: '低液位自动补油', description: '燃油液位过低时启动输送泵',
      sensorId: 'sensor-3-1', operator: '<', sensorValue: 25,
      deviceId: 'device-3-1', command: 'turnOn', deviceValue: 100
    },
  ]

  const insertLinkage = database.prepare(
    `INSERT INTO linkage_rules (id, name, description, sensor_id, sensor_operator, sensor_value, 
     device_id, device_command, device_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )

  linkageRules.forEach(rule => {
    insertLinkage.run(
      rule.id, rule.name, rule.description, rule.sensorId, rule.operator, rule.sensorValue,
      rule.deviceId, rule.command, rule.deviceValue
    )
  })
}

export default getSQLiteDB
