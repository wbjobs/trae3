import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dbPath = path.join(__dirname, 'data.db')

const db = new Database(dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS device (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    model TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'offline',
    lastSeen INTEGER NOT NULL
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS device_params (
    deviceId TEXT PRIMARY KEY,
    acVoltage REAL,
    acCurrent REAL,
    acFrequency REAL,
    acPower REAL,
    dcVoltage REAL,
    dcCurrent REAL,
    dcPower REAL,
    dailyEnergy REAL,
    totalEnergy REAL,
    temperature REAL,
    efficiency REAL,
    FOREIGN KEY (deviceId) REFERENCES device(id)
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS config_template (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    params TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS config_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deviceId TEXT NOT NULL,
    params TEXT NOT NULL,
    previousParams TEXT,
    appliedBy TEXT,
    appliedAt INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'success'
  )
`)

const columns = db.prepare("PRAGMA table_info(config_history)").all() as Array<{ name: string }>
if (!columns.find(c => c.name === 'previousParams')) {
  db.exec(`ALTER TABLE config_history ADD COLUMN previousParams TEXT`)
}

db.exec(`
  CREATE TABLE IF NOT EXISTS alert (
    id TEXT PRIMARY KEY,
    deviceId TEXT NOT NULL,
    deviceName TEXT NOT NULL,
    level TEXT NOT NULL,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    acknowledged INTEGER NOT NULL DEFAULT 0
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS alert_rule (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    paramName TEXT NOT NULL,
    operator TEXT NOT NULL,
    threshold REAL NOT NULL,
    level TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS device_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deviceId TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    acVoltage REAL,
    acCurrent REAL,
    acFrequency REAL,
    acPower REAL,
    dcVoltage REAL,
    dcCurrent REAL,
    dcPower REAL,
    dailyEnergy REAL,
    totalEnergy REAL,
    temperature REAL,
    efficiency REAL,
    FOREIGN KEY (deviceId) REFERENCES device(id),
    UNIQUE(deviceId, timestamp)
  )
`)

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_device_history_device_time ON device_history(deviceId, timestamp DESC)
`)

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_device_history_device_time_params ON device_history(deviceId, timestamp DESC, acPower, dailyEnergy)
`)

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_device_params_status ON device_params(deviceId, acPower, temperature)
`)

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_alert_level_time ON alert(level, timestamp DESC)
`)

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_alert_device_time ON alert(deviceId, timestamp DESC)
`)

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_config_history_device ON config_history(deviceId, appliedAt DESC)
`)

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_device_status ON device(status)
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS param_change_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deviceId TEXT NOT NULL,
    deviceName TEXT NOT NULL,
    paramName TEXT NOT NULL,
    oldValue REAL NOT NULL,
    newValue REAL NOT NULL,
    operator TEXT NOT NULL,
    changeType TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  )
`)

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_param_change_log_device_time ON param_change_log(deviceId, timestamp DESC)
`)

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_param_change_log_param_time ON param_change_log(paramName, timestamp DESC)
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS device_group (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    color TEXT DEFAULT '#06B6D4',
    createdAt INTEGER NOT NULL
  )
`)

const groupColumns = db.prepare("PRAGMA table_info(device_group)").all() as Array<{ name: string }>
if (!groupColumns.find(c => c.name === 'color')) {
  db.exec(`ALTER TABLE device_group ADD COLUMN color TEXT DEFAULT '#06B6D4'`)
}

db.exec(`
  CREATE TABLE IF NOT EXISTS device_group_member (
    groupId TEXT NOT NULL,
    deviceId TEXT NOT NULL,
    joinedAt INTEGER NOT NULL,
    PRIMARY KEY(groupId, deviceId),
    FOREIGN KEY (groupId) REFERENCES device_group(id),
    FOREIGN KEY (deviceId) REFERENCES device(id)
  )
`)

const groupCount = db.prepare('SELECT COUNT(*) as count FROM device_group').get() as { count: number }
if (groupCount.count === 0) {
  const now = Date.now()
  const groups = [
    { id: 'group-a', name: 'A组', description: 'A组设备', color: '#EF4444' },
    { id: 'group-b', name: 'B组', description: 'B组设备', color: '#10B981' },
    { id: 'group-c', name: 'C组', description: 'C组设备', color: '#3B82F6' },
  ]
  
  const insertGroup = db.prepare(`
    INSERT INTO device_group (id, name, description, color, createdAt) VALUES (?, ?, ?, ?, ?)
  `)
  
  const transaction = db.transaction(() => {
    for (const g of groups) {
      insertGroup.run(g.id, g.name, g.description, g.color, now)
    }
  })
  
  transaction()
}

const deviceCount = db.prepare('SELECT COUNT(*) as count FROM device').get() as { count: number }

if (deviceCount.count === 0) {
  const devices = [
    { id: 'INV-001', name: '逆变器 #1', model: 'SG-50KTL-M', ratedPower: 50 },
    { id: 'INV-002', name: '逆变器 #2', model: 'SG-50KTL-M', ratedPower: 50 },
    { id: 'INV-003', name: '逆变器 #3', model: 'SG-50KTL-M', ratedPower: 50 },
    { id: 'INV-004', name: '逆变器 #4', model: 'SG-30KTL-M', ratedPower: 30 },
    { id: 'INV-005', name: '逆变器 #5', model: 'SG-30KTL-M', ratedPower: 30 },
    { id: 'INV-006', name: '逆变器 #6', model: 'SG-30KTL-M', ratedPower: 30 },
    { id: 'INV-007', name: '逆变器 #7', model: 'SG-110KTL-M', ratedPower: 110 },
    { id: 'INV-008', name: '逆变器 #8', model: 'SG-110KTL-M', ratedPower: 110 },
  ]

  const insertDevice = db.prepare(`
    INSERT INTO device (id, name, model, status, lastSeen) VALUES (?, ?, ?, ?, ?)
  `)
  const insertParams = db.prepare(`
    INSERT INTO device_params (deviceId, acVoltage, acCurrent, acFrequency, acPower, dcVoltage, dcCurrent, dcPower, dailyEnergy, totalEnergy, temperature, efficiency)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertHistory = db.prepare(`
    INSERT INTO device_history (deviceId, timestamp, acVoltage, acCurrent, acFrequency, acPower, dcVoltage, dcCurrent, dcPower, dailyEnergy, totalEnergy, temperature, efficiency)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const now = Date.now()

  const transaction = db.transaction(() => {
    for (const d of devices) {
      const baseAcVoltage = 220 + (Math.random() - 0.5) * 10
      const baseAcFrequency = 50 + (Math.random() - 0.5) * 0.5
      const baseDcVoltage = 600 + (Math.random() - 0.5) * 40
      const baseTemp = 45 + Math.random() * 15
      const baseEfficiency = 0.96 + Math.random() * 0.03
      const baseAcCurrent = (d.ratedPower * 0.7) / baseAcVoltage
      const baseAcPower = d.ratedPower * 0.7
      const baseDcCurrent = baseAcPower / baseDcVoltage
      const baseDcPower = baseAcPower / baseEfficiency
      const baseDaily = d.ratedPower * (3 + Math.random() * 5)
      const baseTotal = d.ratedPower * (5000 + Math.random() * 3000)

      const statuses: Array<'online' | 'offline' | 'fault' | 'warning'> = ['online', 'offline', 'fault', 'warning']
      const status = Math.random() > 0.15 ? 'online' : statuses[Math.floor(Math.random() * statuses.length)]

      insertDevice.run(d.id, d.name, d.model, status, now)

      const params = {
        acVoltage: +baseAcVoltage.toFixed(2),
        acCurrent: +baseAcCurrent.toFixed(2),
        acFrequency: +baseAcFrequency.toFixed(2),
        acPower: +baseAcPower.toFixed(2),
        dcVoltage: +baseDcVoltage.toFixed(2),
        dcCurrent: +baseDcCurrent.toFixed(2),
        dcPower: +baseDcPower.toFixed(2),
        dailyEnergy: +baseDaily.toFixed(2),
        totalEnergy: +baseTotal.toFixed(2),
        temperature: +baseTemp.toFixed(2),
        efficiency: +baseEfficiency.toFixed(4),
      }
      insertParams.run(d.id, params.acVoltage, params.acCurrent, params.acFrequency, params.acPower, params.dcVoltage, params.dcCurrent, params.dcPower, params.dailyEnergy, params.totalEnergy, params.temperature, params.efficiency)

      for (let h = 23; h >= 0; h--) {
        const ts = now - h * 3600000
        const fluctuate = (v: number, pct: number) => +(v * (1 + (Math.random() - 0.5) * 2 * pct)).toFixed(2)
        insertHistory.run(
          d.id, ts,
          fluctuate(baseAcVoltage, 0.03),
          fluctuate(baseAcCurrent, 0.05),
          fluctuate(baseAcFrequency, 0.01),
          fluctuate(baseAcPower, 0.05),
          fluctuate(baseDcVoltage, 0.03),
          fluctuate(baseDcCurrent, 0.05),
          fluctuate(baseDcPower, 0.05),
          +(baseDaily * (1 - h / 24) * (1 + (Math.random() - 0.5) * 0.1)).toFixed(2),
          +(baseTotal - h * d.ratedPower * 0.7 * (1 + (Math.random() - 0.5) * 0.1)).toFixed(2),
          fluctuate(baseTemp, 0.05),
          +baseEfficiency.toFixed(4),
        )
      }
    }

    const insertAlert = db.prepare(`
      INSERT INTO alert (id, deviceId, deviceName, level, type, message, timestamp, acknowledged) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    insertAlert.run(uuidv4(), 'INV-003', '逆变器 #3', 'critical', 'over_voltage', '交流电压超过阈值 260V', now - 3600000, 0)
    insertAlert.run(uuidv4(), 'INV-005', '逆变器 #5', 'warning', 'over_temp', '设备温度过高 78°C', now - 7200000, 0)
    insertAlert.run(uuidv4(), 'INV-007', '逆变器 #7', 'warning', 'over_freq', '频率超过阈值 51.5Hz', now - 1800000, 1)
    insertAlert.run(uuidv4(), 'INV-001', '逆变器 #1', 'info', 'communication', '设备重新上线', now - 600000, 0)
    insertAlert.run(uuidv4(), 'INV-006', '逆变器 #6', 'critical', 'under_voltage', '交流电压低于阈值 190V', now - 5400000, 0)

    const insertRule = db.prepare(`
      INSERT INTO alert_rule (id, name, paramName, operator, threshold, level, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    insertRule.run(uuidv4(), '过压告警', 'acVoltage', '>', 260, 'critical', 1)
    insertRule.run(uuidv4(), '欠压告警', 'acVoltage', '<', 190, 'critical', 1)
    insertRule.run(uuidv4(), '过温告警', 'temperature', '>', 75, 'warning', 1)
    insertRule.run(uuidv4(), '过频告警', 'acFrequency', '>', 51.5, 'warning', 1)
    insertRule.run(uuidv4(), '欠频告警', 'acFrequency', '<', 49, 'warning', 1)
  })

  transaction()

  const groupIds = ['group-a', 'group-b', 'group-c']
  const insertMember = db.prepare('INSERT INTO device_group_member (groupId, deviceId, joinedAt) VALUES (?, ?, ?)')
  const memberTransaction = db.transaction(() => {
    for (const d of devices) {
      const randomGroupId = groupIds[Math.floor(Math.random() * groupIds.length)]
      insertMember.run(randomGroupId, d.id, now)
    }
  })
  memberTransaction()
}

export function logParamChange(deviceId: string, deviceName: string, paramName: string, oldValue: number, newValue: number, operator: string, changeType: 'config' | 'manual' | 'auto') {
  if (Math.abs(oldValue - newValue) < 0.001) return
  db.prepare(`INSERT INTO param_change_log (deviceId, deviceName, paramName, oldValue, newValue, operator, changeType, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(deviceId, deviceName, paramName, oldValue, newValue, operator, changeType, Date.now())
}

export default db
