import db from '../db/main.js'

export interface Sample {
  id: number
  sample_code: string
  name: string
  type: string
  source: string
  quantity: number
  unit: string
  storage_condition: string
  status: string
  lab_id: number
  created_by: number
  created_at: string
  updated_at: string
}

export interface SampleWithLab extends Sample {
  lab_name: string
}

export interface SampleQuery {
  page?: number
  pageSize?: number
  keyword?: string
  type?: string
  status?: string
  labId?: number
}

function generateSampleCode(): string {
  const now = new Date()
  const dateStr = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0')
  const prefix = `SMP-${dateStr}-`
  const row = db.prepare(
    "SELECT sample_code FROM samples WHERE sample_code LIKE ? ORDER BY sample_code DESC LIMIT 1"
  ).get(`${prefix}%`) as { sample_code: string } | undefined
  let seq = 1
  if (row) {
    const lastSeq = parseInt(row.sample_code.substring(prefix.length), 10)
    seq = lastSeq + 1
  }
  return prefix + String(seq).padStart(4, '0')
}

export function create(data: {
  name: string
  type: string
  source?: string
  quantity?: number
  unit?: string
  storage_condition?: string
  lab_id: number
  created_by: number
}): Sample {
  const sampleCode = generateSampleCode()
  const result = db.prepare(`
    INSERT INTO samples (sample_code, name, type, source, quantity, unit, storage_condition, status, lab_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'in_stock', ?, ?)
  `).run(
    sampleCode,
    data.name,
    data.type,
    data.source || '',
    data.quantity || 1,
    data.unit || '份',
    data.storage_condition || '',
    data.lab_id,
    data.created_by
  )
  return db.prepare('SELECT * FROM samples WHERE id = ?').get(result.lastInsertRowid) as Sample
}

export function findById(id: number): SampleWithLab | undefined {
  return db.prepare(`
    SELECT s.*, l.name as lab_name
    FROM samples s
    LEFT JOIN labs l ON s.lab_id = l.id
    WHERE s.id = ?
  `).get(id) as SampleWithLab | undefined
}

export function findAll(query: SampleQuery): { data: SampleWithLab[]; total: number; page: number; pageSize: number } {
  const page = query.page || 1
  const pageSize = query.pageSize || 10
  const offset = (page - 1) * pageSize

  let where = 'WHERE 1=1'
  const params: any[] = []

  if (query.keyword) {
    where += ' AND (s.sample_code LIKE ? OR s.name LIKE ? OR s.source LIKE ?)'
    const kw = `%${query.keyword}%`
    params.push(kw, kw, kw)
  }
  if (query.type) {
    where += ' AND s.type = ?'
    params.push(query.type)
  }
  if (query.status) {
    where += ' AND s.status = ?'
    params.push(query.status)
  }
  if (query.labId) {
    where += ' AND s.lab_id = ?'
    params.push(query.labId)
  }

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM samples s ${where}`).get(...params) as { total: number }
  const data = db.prepare(`
    SELECT s.*, l.name as lab_name
    FROM samples s
    LEFT JOIN labs l ON s.lab_id = l.id
    ${where}
    ORDER BY s.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset) as SampleWithLab[]

  return { data, total: countRow.total, page, pageSize }
}

export function updateStatus(id: number, status: string): void {
  db.prepare("UPDATE samples SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id)
}

export function updateLab(id: number, labId: number): void {
  db.prepare("UPDATE samples SET lab_id = ?, updated_at = datetime('now') WHERE id = ?").run(labId, id)
}

export function countByStatus(): { status: string; count: number }[] {
  return db.prepare('SELECT status, COUNT(*) as count FROM samples GROUP BY status').all() as { status: string; count: number }[]
}

export function countByType(): { type: string; count: number }[] {
  return db.prepare('SELECT type, COUNT(*) as count FROM samples GROUP BY type').all() as { type: string; count: number }[]
}

export function countByLab(): { lab_id: number; lab_name: string; count: number }[] {
  return db.prepare(`
    SELECT s.lab_id, l.name as lab_name, COUNT(*) as count
    FROM samples s
    LEFT JOIN labs l ON s.lab_id = l.id
    GROUP BY s.lab_id
  `).all() as { lab_id: number; lab_name: string; count: number }[]
}
