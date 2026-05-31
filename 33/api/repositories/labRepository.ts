import db from '../db/main.js'

export interface Lab {
  id: number
  name: string
  code: string
  floor: number
  position_x: number
  position_y: number
  capacity: number
  contact_person: string
  contact_phone: string
  created_at: string
}

export interface LabWithSampleCount extends Lab {
  sample_count: number
}

export function findAll(): any[] {
  return db.prepare(`
    SELECT l.*, COALESCE(s.sample_count, 0) as current_count
    FROM labs l
    LEFT JOIN (SELECT lab_id, COUNT(*) as sample_count FROM samples GROUP BY lab_id) s ON l.id = s.lab_id
    ORDER BY l.id
  `).all()
}

export function findById(id: number): Lab | undefined {
  return db.prepare('SELECT * FROM labs WHERE id = ?').get(id) as Lab | undefined
}

export function getSampleCountByLab(): LabWithSampleCount[] {
  return db.prepare(`
    SELECT l.*, COALESCE(s.sample_count, 0) as sample_count
    FROM labs l
    LEFT JOIN (SELECT lab_id, COUNT(*) as sample_count FROM samples GROUP BY lab_id) s ON l.id = s.lab_id
    ORDER BY l.id
  `).all() as LabWithSampleCount[]
}

export function updatePosition(id: number, x: number, y: number): void {
  db.prepare('UPDATE labs SET position_x = ?, position_y = ? WHERE id = ?').run(x, y, id)
}
