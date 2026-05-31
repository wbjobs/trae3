import { Router, type Request, type Response } from 'express'
import { getDb } from '../database.js'
import type { PipeNode } from '../../shared/types.js'

const router = Router()

function rowToNode(row: Record<string, unknown>): PipeNode {
  return {
    id: row.id as string,
    name: row.name as string,
    areaId: row.area_id as string,
    type: row.type as PipeNode['type'],
    position: {
      x: row.pos_x as number,
      y: row.pos_y as number,
      z: row.pos_z as number,
    },
  }
}

router.get('/', (_req: Request, res: Response): void => {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM pipe_node').all() as Record<string, unknown>[]
  const nodes = rows.map(rowToNode)
  res.json({ success: true, data: nodes })
})

export default router
