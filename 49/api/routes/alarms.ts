import { Router, type Request, type Response } from 'express'
import { getDb } from '../database.js'
import { clearActiveAlarm } from '../realtime-cache.js'
import type { AlarmRecord } from '../../shared/types.js'

const router = Router()

function rowToAlarm(row: Record<string, unknown>): AlarmRecord {
  return {
    id: row.id as string,
    pipeId: row.pipe_id as string,
    type: row.type as AlarmRecord['type'],
    level: row.level as AlarmRecord['level'],
    value: row.value as number,
    threshold: row.threshold as number,
    message: row.message as string,
    timestamp: row.timestamp as number,
    acknowledged: (row.acknowledged as number) === 1,
    acknowledgedBy: (row.acknowledged_by as string) || undefined,
  }
}

router.get('/', (req: Request, res: Response): void => {
  const db = getDb()
  const acknowledged = req.query.acknowledged as string | undefined

  let rows: Record<string, unknown>[]
  if (acknowledged !== undefined) {
    const ack = acknowledged === 'true' ? 1 : 0
    rows = db.prepare('SELECT * FROM alarm_record WHERE acknowledged = ? ORDER BY timestamp DESC').all(ack) as Record<string, unknown>[]
  } else {
    rows = db.prepare('SELECT * FROM alarm_record ORDER BY timestamp DESC').all() as Record<string, unknown>[]
  }

  res.json({ success: true, data: rows.map(rowToAlarm) })
})

router.put('/:id/acknowledge', (req: Request, res: Response): void => {
  const db = getDb()
  const { userId } = req.body as { userId: string }

  if (!userId) {
    res.status(400).json({ success: false, error: 'userId is required' })
    return
  }

  const existing = db.prepare('SELECT * FROM alarm_record WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined
  if (!existing) {
    res.status(404).json({ success: false, error: 'Alarm not found' })
    return
  }

  db.prepare('UPDATE alarm_record SET acknowledged = 1, acknowledged_by = ? WHERE id = ?').run(userId, req.params.id)

  const pipeId = existing.pipe_id as string
  clearActiveAlarm(pipeId)

  const updated = db.prepare('SELECT * FROM alarm_record WHERE id = ?').get(req.params.id) as Record<string, unknown>
  res.json({ success: true, data: rowToAlarm(updated) })
})

export default router
