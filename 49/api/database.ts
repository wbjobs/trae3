import Database from 'better-sqlite3'
import { mkdirSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const dbPath = join(__dirname, '..', 'data', 'pipeline.db')

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export function initDatabase(): Database.Database {
  const dir = dirname(dbPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  createTables()
  seedIfEmpty()

  return db
}

function createTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS area (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS pipe_node (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      area_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'junction',
      pos_x REAL NOT NULL,
      pos_y REAL NOT NULL,
      pos_z REAL NOT NULL,
      FOREIGN KEY (area_id) REFERENCES area(id)
    );

    CREATE TABLE IF NOT EXISTS pipe_segment (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      area_id TEXT NOT NULL,
      material TEXT NOT NULL DEFAULT 'steel',
      diameter REAL NOT NULL,
      length REAL NOT NULL,
      install_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'normal',
      pos_x REAL NOT NULL,
      pos_y REAL NOT NULL,
      pos_z REAL NOT NULL,
      endpoint_a_id TEXT NOT NULL,
      endpoint_b_id TEXT NOT NULL,
      FOREIGN KEY (area_id) REFERENCES area(id),
      FOREIGN KEY (endpoint_a_id) REFERENCES pipe_node(id),
      FOREIGN KEY (endpoint_b_id) REFERENCES pipe_node(id)
    );

    CREATE TABLE IF NOT EXISTS alarm_record (
      id TEXT PRIMARY KEY,
      pipe_id TEXT NOT NULL,
      type TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      value REAL NOT NULL,
      threshold REAL NOT NULL,
      message TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      acknowledged INTEGER NOT NULL DEFAULT 0,
      acknowledged_by TEXT,
      FOREIGN KEY (pipe_id) REFERENCES pipe_segment(id)
    );

    CREATE TABLE IF NOT EXISTS annotation (
      id TEXT PRIMARY KEY,
      pipe_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      content TEXT NOT NULL,
      pos_x REAL NOT NULL,
      pos_y REAL NOT NULL,
      pos_z REAL NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (pipe_id) REFERENCES pipe_segment(id)
    );

    CREATE TABLE IF NOT EXISTS inspection_path (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_by TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inspection_waypoint (
      id TEXT PRIMARY KEY,
      path_id TEXT NOT NULL,
      pipe_id TEXT NOT NULL,
      pos_x REAL NOT NULL,
      pos_y REAL NOT NULL,
      pos_z REAL NOT NULL,
      stay_duration INTEGER NOT NULL DEFAULT 2000,
      sort_order INTEGER NOT NULL,
      FOREIGN KEY (path_id) REFERENCES inspection_path(id),
      FOREIGN KEY (pipe_id) REFERENCES pipe_segment(id)
    );

    CREATE TABLE IF NOT EXISTS history_raw (
      id TEXT PRIMARY KEY,
      pipe_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      pressure REAL NOT NULL,
      flow REAL NOT NULL,
      temperature REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'normal',
      FOREIGN KEY (pipe_id) REFERENCES pipe_segment(id)
    );

    CREATE TABLE IF NOT EXISTS history_hour (
      id TEXT PRIMARY KEY,
      pipe_id TEXT NOT NULL,
      timestamp_hour INTEGER NOT NULL,
      pressure_avg REAL NOT NULL,
      pressure_min REAL NOT NULL,
      pressure_max REAL NOT NULL,
      flow_avg REAL NOT NULL,
      flow_min REAL NOT NULL,
      flow_max REAL NOT NULL,
      temp_avg REAL NOT NULL,
      temp_min REAL NOT NULL,
      temp_max REAL NOT NULL,
      FOREIGN KEY (pipe_id) REFERENCES pipe_segment(id)
    );

    CREATE TABLE IF NOT EXISTS history_day (
      id TEXT PRIMARY KEY,
      pipe_id TEXT NOT NULL,
      timestamp_day INTEGER NOT NULL,
      pressure_avg REAL NOT NULL,
      pressure_min REAL NOT NULL,
      pressure_max REAL NOT NULL,
      flow_avg REAL NOT NULL,
      flow_min REAL NOT NULL,
      flow_max REAL NOT NULL,
      temp_avg REAL NOT NULL,
      temp_min REAL NOT NULL,
      temp_max REAL NOT NULL,
      FOREIGN KEY (pipe_id) REFERENCES pipe_segment(id)
    );

    CREATE INDEX IF NOT EXISTS idx_pipe_segment_area ON pipe_segment(area_id);
    CREATE INDEX IF NOT EXISTS idx_alarm_record_pipe ON alarm_record(pipe_id);
    CREATE INDEX IF NOT EXISTS idx_alarm_record_ack ON alarm_record(acknowledged);
    CREATE INDEX IF NOT EXISTS idx_annotation_pipe ON annotation(pipe_id);
    CREATE INDEX IF NOT EXISTS idx_waypoint_path ON inspection_waypoint(path_id);
    CREATE INDEX IF NOT EXISTS idx_history_raw_pipe_time ON history_raw(pipe_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_history_hour_pipe_time ON history_hour(pipe_id, timestamp_hour);
    CREATE INDEX IF NOT EXISTS idx_history_day_pipe_time ON history_day(pipe_id, timestamp_day);
  `)
}

function seedIfEmpty(): void {
  const count = db.prepare('SELECT COUNT(*) as cnt FROM area').get() as { cnt: number }
  if (count.cnt > 0) return

  const insertArea = db.prepare(
    'INSERT INTO area (id, name, description) VALUES (?, ?, ?)'
  )
  const insertNode = db.prepare(
    'INSERT INTO pipe_node (id, name, area_id, type, pos_x, pos_y, pos_z) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  const insertSegment = db.prepare(
    `INSERT INTO pipe_segment (id, name, area_id, material, diameter, length, install_date, status, pos_x, pos_y, pos_z, endpoint_a_id, endpoint_b_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const insertAnnotation = db.prepare(
    'INSERT INTO annotation (id, pipe_id, user_id, user_name, content, pos_x, pos_y, pos_z, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )
  const insertPath = db.prepare(
    'INSERT INTO inspection_path (id, name, created_by) VALUES (?, ?, ?)'
  )
  const insertWaypoint = db.prepare(
    'INSERT INTO inspection_waypoint (id, path_id, pipe_id, pos_x, pos_y, pos_z, stay_duration, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  )

  const seed = db.transaction(() => {
    const area1Id = uuid()
    const area2Id = uuid()
    const area3Id = uuid()

    insertArea.run(area1Id, '东区供气管网', '东部工业区供气主管网，负责3个工业用户的天然气供应')
    insertArea.run(area2Id, '西区供气管网', '西部居民区供气管网，覆盖5个居民小区')
    insertArea.run(area3Id, '中心调度管网', '中心调度控制区域，连接东西区的主干管网')

    const nodes: { id: string; name: string; areaId: string; type: string; x: number; y: number; z: number }[] = [
      { id: uuid(), name: '东区进气阀井', areaId: area1Id, type: 'valve', x: 25, y: 0.5, z: -20 },
      { id: uuid(), name: '东区压力表站', areaId: area1Id, type: 'meter', x: 20, y: 1.0, z: -10 },
      { id: uuid(), name: '东区泵站A', areaId: area1Id, type: 'pump', x: 22, y: 1.5, z: 5 },
      { id: uuid(), name: '东区泵站B', areaId: area1Id, type: 'pump', x: 18, y: 2.0, z: 15 },
      { id: uuid(), name: '东区末端阀井', areaId: area1Id, type: 'valve', x: 28, y: 0.8, z: 25 },
      { id: uuid(), name: '西区进气阀井', areaId: area2Id, type: 'valve', x: -25, y: 0.5, z: -18 },
      { id: uuid(), name: '西区压力表站', areaId: area2Id, type: 'meter', x: -20, y: 1.0, z: -5 },
      { id: uuid(), name: '西区泵站', areaId: area2Id, type: 'pump', x: -22, y: 1.5, z: 10 },
      { id: uuid(), name: '西区末端节点', areaId: area2Id, type: 'junction', x: -18, y: 0.8, z: 22 },
      { id: uuid(), name: '中心调度站', areaId: area3Id, type: 'meter', x: 0, y: 2.0, z: 0 },
      { id: uuid(), name: '中心阀井A', areaId: area3Id, type: 'valve', x: 5, y: 1.0, z: -8 },
      { id: uuid(), name: '中心阀井B', areaId: area3Id, type: 'valve', x: -5, y: 1.0, z: 8 },
      { id: uuid(), name: '中心泵站', areaId: area3Id, type: 'pump', x: 2, y: 1.5, z: -15 },
      { id: uuid(), name: '东西连接节点', areaId: area3Id, type: 'junction', x: 12, y: 0.5, z: -5 },
      { id: uuid(), name: '西中连接节点', areaId: area3Id, type: 'junction', x: -12, y: 0.5, z: 5 },
    ]

    for (const n of nodes) {
      insertNode.run(n.id, n.name, n.areaId, n.type, n.x, n.y, n.z)
    }

    const n = (name: string) => nodes.find(nd => nd.name === name)!.id
    const mid = (a: string, b: string) => {
      const na = nodes.find(nd => nd.id === a)!
      const nb = nodes.find(nd => nd.id === b)!
      return { x: (na.x + nb.x) / 2, y: (na.y + nb.y) / 2, z: (na.z + nb.z) / 2 }
    }

    type SegDef = { name: string; areaId: string; material: string; diameter: number; length: number; installDate: string; aNode: string; bNode: string }
    const segDefs: SegDef[] = [
      { name: '东区进气管段A1', areaId: area1Id, material: 'steel', diameter: 500, length: 320, installDate: '2019-03-15', aNode: '东区进气阀井', bNode: '东区压力表站' },
      { name: '东区输气管段A2', areaId: area1Id, material: 'steel', diameter: 400, length: 480, installDate: '2019-03-15', aNode: '东区压力表站', bNode: '东区泵站A' },
      { name: '东区配气管段A3', areaId: area1Id, material: 'PE', diameter: 300, length: 360, installDate: '2020-06-20', aNode: '东区泵站A', bNode: '东区泵站B' },
      { name: '东区末端管段A4', areaId: area1Id, material: 'PE', diameter: 200, length: 280, installDate: '2020-06-20', aNode: '东区泵站B', bNode: '东区末端阀井' },
      { name: '西区进气管段B1', areaId: area2Id, material: 'steel', diameter: 500, length: 350, installDate: '2018-11-10', aNode: '西区进气阀井', bNode: '西区压力表站' },
      { name: '西区输气管段B2', areaId: area2Id, material: 'steel', diameter: 400, length: 420, installDate: '2018-11-10', aNode: '西区压力表站', bNode: '西区泵站' },
      { name: '西区配气管段B3', areaId: area2Id, material: 'PE', diameter: 250, length: 390, installDate: '2021-02-28', aNode: '西区泵站', bNode: '西区末端节点' },
      { name: '中心主干管段C1', areaId: area3Id, material: 'steel', diameter: 600, length: 500, installDate: '2017-07-01', aNode: '中心调度站', bNode: '中心阀井A' },
      { name: '中心主干管段C2', areaId: area3Id, material: 'steel', diameter: 600, length: 520, installDate: '2017-07-01', aNode: '中心调度站', bNode: '中心阀井B' },
      { name: '中心分支管段C3', areaId: area3Id, material: 'steel', diameter: 450, length: 280, installDate: '2018-03-15', aNode: '中心阀井A', bNode: '中心泵站' },
      { name: '东西连接管段D1', areaId: area3Id, material: 'steel', diameter: 500, length: 600, installDate: '2019-09-20', aNode: '东西连接节点', bNode: '东区压力表站' },
      { name: '东西连接管段D2', areaId: area3Id, material: 'steel', diameter: 500, length: 450, installDate: '2019-09-20', aNode: '中心阀井A', bNode: '东西连接节点' },
      { name: '西中连接管段E1', areaId: area3Id, material: 'steel', diameter: 500, length: 550, installDate: '2019-09-20', aNode: '西中连接节点', bNode: '西区压力表站' },
      { name: '西中连接管段E2', areaId: area3Id, material: 'steel', diameter: 500, length: 380, installDate: '2019-09-20', aNode: '中心阀井B', bNode: '西中连接节点' },
      { name: '中心备用管段F1', areaId: area3Id, material: 'steel', diameter: 350, length: 300, installDate: '2022-01-15', aNode: '中心泵站', bNode: '东西连接节点' },
      { name: '中心备用管段F2', areaId: area3Id, material: 'PE', diameter: 300, length: 260, installDate: '2022-01-15', aNode: '中心泵站', bNode: '西中连接节点' },
      { name: '东区旁通管段G1', areaId: area1Id, material: 'PE', diameter: 250, length: 200, installDate: '2021-08-10', aNode: '东区进气阀井', bNode: '东区泵站A' },
      { name: '西区旁通管段G2', areaId: area2Id, material: 'PE', diameter: 250, length: 230, installDate: '2021-08-10', aNode: '西区进气阀井', bNode: '西区泵站' },
      { name: '中心联络管段H1', areaId: area3Id, material: 'steel', diameter: 400, length: 340, installDate: '2020-05-10', aNode: '中心阀井A', bNode: '中心阀井B' },
      { name: '跨区应急管段J1', areaId: area3Id, material: 'steel', diameter: 450, length: 700, installDate: '2023-04-01', aNode: '东区泵站B', bNode: '西区泵站' },
    ]

    const segmentIds: string[] = []
    for (const s of segDefs) {
      const aId = n(s.aNode)
      const bId = n(s.bNode)
      const pos = mid(aId, bId)
      const id = uuid()
      segmentIds.push(id)
      insertSegment.run(
        id, s.name, s.areaId, s.material, s.diameter, s.length,
        s.installDate, 'normal', pos.x, pos.y, pos.z, aId, bId
      )
    }

    insertAnnotation.run(
      uuid(), segmentIds[0], 'user-001', '王工程师',
      '该管段压力波动频繁，建议加强监测',
      22.5, 0.75, -15, Date.now() - 86400000
    )
    insertAnnotation.run(
      uuid(), segmentIds[7], 'user-002', '李操作员',
      '中心调度站出口流量偏高，已调整阀门开度',
      2.5, 1.5, -4, Date.now() - 43200000
    )
    insertAnnotation.run(
      uuid(), segmentIds[4], 'user-003', '张经理',
      '该管段已使用7年，计划下季度检修',
      -22.5, 0.75, -11.5, Date.now() - 172800000
    )

    const path1Id = uuid()
    insertPath.run(path1Id, '东区管网日常巡检', 'user-001')
    const wp1Pipes = [0, 1, 2, 3, 16]
    for (let i = 0; i < wp1Pipes.length; i++) {
      const seg = segDefs[wp1Pipes[i]]
      const aId = n(seg.aNode)
      const bId = n(seg.bNode)
      const pos = mid(aId, bId)
      insertWaypoint.run(uuid(), path1Id, segmentIds[wp1Pipes[i]], pos.x, pos.y, pos.z, 3000, i)
    }

    const path2Id = uuid()
    insertPath.run(path2Id, '中心调度全线路巡检', 'user-002')
    const wp2Pipes = [7, 10, 11, 14, 12, 13]
    for (let i = 0; i < wp2Pipes.length; i++) {
      const seg = segDefs[wp2Pipes[i]]
      const aId = n(seg.aNode)
      const bId = n(seg.bNode)
      const pos = mid(aId, bId)
      insertWaypoint.run(uuid(), path2Id, segmentIds[wp2Pipes[i]], pos.x, pos.y, pos.z, 4000, i)
    }
  })

  seed()
}

export function insertHistoryRaw(data: { pipeId: string; timestamp: number; pressure: number; flow: number; temperature: number; status: string }): void {
  if (!db) return
  pendingHistoryBuffer.push(data)
  if (pendingHistoryBuffer.length >= FLUSH_SIZE) {
    flushHistoryBuffer()
  }
}

const FLUSH_SIZE = 50
const FLUSH_INTERVAL = 5000
let pendingHistoryBuffer: { pipeId: string; timestamp: number; pressure: number; flow: number; temperature: number; status: string }[] = []
let flushTimer: ReturnType<typeof setInterval> | null = null

export function startHistoryFlush(): void {
  if (flushTimer) return
  flushTimer = setInterval(() => {
    if (pendingHistoryBuffer.length > 0) {
      flushHistoryBuffer()
    }
  }, FLUSH_INTERVAL)
}

export function stopHistoryFlush(): void {
  if (flushTimer) {
    clearInterval(flushTimer)
    flushTimer = null
  }
  if (pendingHistoryBuffer.length > 0) {
    flushHistoryBuffer()
  }
}

export function flushHistoryBuffer(): void {
  if (!db || pendingHistoryBuffer.length === 0) return
  const batch = pendingHistoryBuffer.splice(0, pendingHistoryBuffer.length)
  const stmt = db.prepare(
    `INSERT INTO history_raw (id, pipe_id, timestamp, pressure, flow, temperature, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  const insertMany = db.transaction(() => {
    for (const data of batch) {
      stmt.run(uuid(), data.pipeId, data.timestamp, data.pressure, data.flow, data.temperature, data.status)
    }
  })
  insertMany()
}

export function aggregateHourlyData(): void {
  if (!db) return

  const now = Date.now()
  const currentHour = Math.floor(now / 3600000) * 3600000
  const previousHour = currentHour - 3600000

  const pipes = db.prepare('SELECT id FROM pipe_segment').all() as { id: string }[]

  const insertHour = db.prepare(
    `INSERT INTO history_hour (id, pipe_id, timestamp_hour, pressure_avg, pressure_min, pressure_max,
                               flow_avg, flow_min, flow_max, temp_avg, temp_min, temp_max)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )

  const transaction = db.transaction(() => {
    for (const pipe of pipes) {
      const stats = db.prepare(
        `SELECT AVG(pressure) as p_avg, MIN(pressure) as p_min, MAX(pressure) as p_max,
                AVG(flow) as f_avg, MIN(flow) as f_min, MAX(flow) as f_max,
                AVG(temperature) as t_avg, MIN(temperature) as t_min, MAX(temperature) as t_max
         FROM history_raw
         WHERE pipe_id = ? AND timestamp >= ? AND timestamp < ?`
      ).get(pipe.id, previousHour, currentHour) as Record<string, number>

      if (stats.p_avg !== null) {
        insertHour.run(
          uuid(), pipe.id, previousHour,
          stats.p_avg, stats.p_min, stats.p_max,
          stats.f_avg, stats.f_min, stats.f_max,
          stats.t_avg, stats.t_min, stats.t_max
        )
      }
    }
  })

  transaction()
  console.log(`[Aggregation] Hourly data aggregated for hour ${new Date(previousHour).toISOString()}`)
}

export function aggregateDailyData(): void {
  if (!db) return

  const now = Date.now()
  const currentDay = Math.floor(now / 86400000) * 86400000
  const previousDay = currentDay - 86400000

  const pipes = db.prepare('SELECT id FROM pipe_segment').all() as { id: string }[]

  const insertDay = db.prepare(
    `INSERT INTO history_day (id, pipe_id, timestamp_day, pressure_avg, pressure_min, pressure_max,
                              flow_avg, flow_min, flow_max, temp_avg, temp_min, temp_max)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )

  const transaction = db.transaction(() => {
    for (const pipe of pipes) {
      const stats = db.prepare(
        `SELECT AVG(pressure_avg) as p_avg, MIN(pressure_min) as p_min, MAX(pressure_max) as p_max,
                AVG(flow_avg) as f_avg, MIN(flow_min) as f_min, MAX(flow_max) as f_max,
                AVG(temp_avg) as t_avg, MIN(temp_min) as t_min, MAX(temp_max) as t_max
         FROM history_hour
         WHERE pipe_id = ? AND timestamp_hour >= ? AND timestamp_hour < ?`
      ).get(pipe.id, previousDay, currentDay) as Record<string, number>

      if (stats.p_avg !== null) {
        insertDay.run(
          uuid(), pipe.id, previousDay,
          stats.p_avg, stats.p_min, stats.p_max,
          stats.f_avg, stats.f_min, stats.f_max,
          stats.t_avg, stats.t_min, stats.t_max
        )
      }
    }
  })

  transaction()
  console.log(`[Aggregation] Daily data aggregated for day ${new Date(previousDay).toISOString()}`)
}

export function purgeOldData(): void {
  if (!db) return

  const now = Date.now()
  const sevenDaysAgo = now - 7 * 86400000
  const thirtyDaysAgo = now - 30 * 86400000
  const oneYearAgo = now - 365 * 86400000

  const transaction = db.transaction(() => {
    const rawDeleted = db.prepare('DELETE FROM history_raw WHERE timestamp < ?').run(sevenDaysAgo).changes
    const hourDeleted = db.prepare('DELETE FROM history_hour WHERE timestamp_hour < ?').run(thirtyDaysAgo).changes
    const dayDeleted = db.prepare('DELETE FROM history_day WHERE timestamp_day < ?').run(oneYearAgo).changes

    console.log(`[Purge] Deleted ${rawDeleted} raw records (>7d), ${hourDeleted} hourly records (>30d), ${dayDeleted} daily records (>1y)`)
  })

  transaction()
}
