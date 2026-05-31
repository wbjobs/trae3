import { Router, type Request, type Response } from 'express'
import { getDb } from '../database.js'
import { getRealtimeData, generateHistoryData } from '../realtime-cache.js'
import type { PipeSegment } from '../../shared/types.js'

const router = Router()

function rowToSegment(row: Record<string, unknown>): PipeSegment {
  return {
    id: row.id as string,
    name: row.name as string,
    areaId: row.area_id as string,
    material: row.material as string,
    diameter: row.diameter as number,
    length: row.length as number,
    installDate: row.install_date as string,
    status: row.status as PipeSegment['status'],
    position: {
      x: row.pos_x as number,
      y: row.pos_y as number,
      z: row.pos_z as number,
    },
    endpoints: [row.endpoint_a_id as string, row.endpoint_b_id as string],
  }
}

router.get('/', (_req: Request, res: Response): void => {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM pipe_segment').all() as Record<string, unknown>[]
  const segments = rows.map(rowToSegment)
  res.json({ success: true, data: segments })
})

router.get('/:id', (req: Request, res: Response): void => {
  const db = getDb()
  const row = db.prepare('SELECT * FROM pipe_segment WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined
  if (!row) {
    res.status(404).json({ success: false, error: 'Pipe segment not found' })
    return
  }
  res.json({ success: true, data: rowToSegment(row) })
})

router.get('/:id/realtime', (req: Request, res: Response): void => {
  const data = getRealtimeData(req.params.id)
  if (!data) {
    res.status(404).json({ success: false, error: 'Realtime data not found' })
    return
  }
  res.json({ success: true, data })
})

router.get('/:id/history', (req: Request, res: Response): void => {
  const range = req.query.range as string
  if (range !== '24h' && range !== '7d') {
    res.status(400).json({ success: false, error: 'Invalid range, use 24h or 7d' })
    return
  }
  const db = getDb()
  const seg = db.prepare('SELECT id FROM pipe_segment WHERE id = ?').get(req.params.id)
  if (!seg) {
    res.status(404).json({ success: false, error: 'Pipe segment not found' })
    return
  }
  const data = generateHistoryData(req.params.id, range)
  res.json({ success: true, data })
})

router.get('/:id/history/aggregated', (req: Request, res: Response): void => {
  const range = req.query.range as string
  const validRanges = ['24h', '7d', '30d', '1y']
  if (!validRanges.includes(range)) {
    res.status(400).json({ success: false, error: 'Invalid range, use 24h, 7d, 30d, or 1y' })
    return
  }

  const db = getDb()
  const seg = db.prepare('SELECT id FROM pipe_segment WHERE id = ?').get(req.params.id)
  if (!seg) {
    res.status(404).json({ success: false, error: 'Pipe segment not found' })
    return
  }

  const now = Date.now()
  let startTime: number
  let table: string
  let timestampColumn: string

  switch (range) {
    case '24h':
      startTime = now - 24 * 3600000
      table = 'history_raw'
      timestampColumn = 'timestamp'
      break
    case '7d':
      startTime = now - 7 * 86400000
      table = 'history_hour'
      timestampColumn = 'timestamp_hour'
      break
    case '30d':
    case '1y':
      startTime = now - (range === '30d' ? 30 : 365) * 86400000
      table = 'history_day'
      timestampColumn = 'timestamp_day'
      break
    default:
      res.status(400).json({ success: false, error: 'Invalid range' })
      return
  }

  let rows: Record<string, unknown>[]
  if (table === 'history_raw') {
    rows = db.prepare(
      `SELECT timestamp, pressure, flow, temperature
       FROM ${table}
       WHERE pipe_id = ? AND ${timestampColumn} >= ?
       ORDER BY ${timestampColumn} ASC`
    ).all(req.params.id, startTime) as Record<string, unknown>[]

    const timestamps: number[] = []
    const pressure: { avg: number; min: number; max: number }[] = []
    const flow: { avg: number; min: number; max: number }[] = []
    const temperature: { avg: number; min: number; max: number }[] = []

    for (const row of rows) {
      timestamps.push(row.timestamp as number)
      const p = row.pressure as number
      const f = row.flow as number
      const t = row.temperature as number
      pressure.push({ avg: p, min: p, max: p })
      flow.push({ avg: f, min: f, max: f })
      temperature.push({ avg: t, min: t, max: t })
    }

    res.json({
      success: true,
      data: { timestamps, pressure, flow, temperature },
    })
  } else {
    rows = db.prepare(
      `SELECT ${timestampColumn}, pressure_avg, pressure_min, pressure_max,
              flow_avg, flow_min, flow_max, temp_avg, temp_min, temp_max
       FROM ${table}
       WHERE pipe_id = ? AND ${timestampColumn} >= ?
       ORDER BY ${timestampColumn} ASC`
    ).all(req.params.id, startTime) as Record<string, unknown>[]

    const timestamps: number[] = []
    const pressure: { avg: number; min: number; max: number }[] = []
    const flow: { avg: number; min: number; max: number }[] = []
    const temperature: { avg: number; min: number; max: number }[] = []

    for (const row of rows) {
      timestamps.push(row[timestampColumn] as number)
      pressure.push({
        avg: row.pressure_avg as number,
        min: row.pressure_min as number,
        max: row.pressure_max as number,
      })
      flow.push({
        avg: row.flow_avg as number,
        min: row.flow_min as number,
        max: row.flow_max as number,
      })
      temperature.push({
        avg: row.temp_avg as number,
        min: row.temp_min as number,
        max: row.temp_max as number,
      })
    }

    res.json({
      success: true,
      data: { timestamps, pressure, flow, temperature },
    })
  }
})

export default router
