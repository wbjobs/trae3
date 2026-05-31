import { Router, type Request, type Response } from 'express'
import { v4 as uuid } from 'uuid'
import { getDb } from '../database.js'
import type { Annotation } from '../../shared/types.js'

const router = Router()

function rowToAnnotation(row: Record<string, unknown>): Annotation {
  return {
    id: row.id as string,
    pipeId: row.pipe_id as string,
    userId: row.user_id as string,
    userName: row.user_name as string,
    content: row.content as string,
    position: {
      x: row.pos_x as number,
      y: row.pos_y as number,
      z: row.pos_z as number,
    },
    timestamp: row.timestamp as number,
  }
}

router.get('/', (req: Request, res: Response): void => {
  const db = getDb()
  const pipeId = req.query.pipeId as string | undefined

  let rows: Record<string, unknown>[]
  if (pipeId) {
    rows = db.prepare('SELECT * FROM annotation WHERE pipe_id = ? ORDER BY timestamp DESC').all(pipeId) as Record<string, unknown>[]
  } else {
    rows = db.prepare('SELECT * FROM annotation ORDER BY timestamp DESC').all() as Record<string, unknown>[]
  }

  res.json({ success: true, data: rows.map(rowToAnnotation) })
})

router.post('/', (req: Request, res: Response): void => {
  const db = getDb()
  const body = req.body as Omit<Annotation, 'id' | 'timestamp'>

  if (!body.pipeId || !body.userId || !body.content) {
    res.status(400).json({ success: false, error: 'pipeId, userId, and content are required' })
    return
  }

  const id = uuid()
  const timestamp = Date.now()

  db.prepare(
    'INSERT INTO annotation (id, pipe_id, user_id, user_name, content, pos_x, pos_y, pos_z, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, body.pipeId, body.userId, body.userName || '', body.content, body.position?.x ?? 0, body.position?.y ?? 0, body.position?.z ?? 0, timestamp)

  const row = db.prepare('SELECT * FROM annotation WHERE id = ?').get(id) as Record<string, unknown>
  res.status(201).json({ success: true, data: rowToAnnotation(row) })
})

export default router
