import db from '../db/main.js'
import archiveDb from '../db/archive.js'

export interface Transfer {
  id: number
  sample_id: number
  from_lab_id: number
  to_lab_id: number
  reason: string
  status: string
  applied_by: number
  applied_at: string
  approved_by: number | null
  approved_at: string | null
  received_by: number | null
  received_at: string | null
  reject_reason: string | null
}

export interface TransferWithDetails extends Transfer {
  sample_code: string
  sample_name: string
  from_lab_name: string
  to_lab_name: string
  applied_by_name: string
  approved_by_name: string | null
  received_by_name: string | null
}

export interface TransferQuery {
  page?: number
  pageSize?: number
  status?: string
  keyword?: string
}

export function create(data: {
  sample_id: number
  from_lab_id: number
  to_lab_id: number
  reason?: string
  applied_by: number
}): Transfer {
  const result = db.prepare(`
    INSERT INTO transfers (sample_id, from_lab_id, to_lab_id, reason, status, applied_by)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `).run(data.sample_id, data.from_lab_id, data.to_lab_id, data.reason || '', data.applied_by)
  return db.prepare('SELECT * FROM transfers WHERE id = ?').get(result.lastInsertRowid) as Transfer
}

export function findById(id: number): TransferWithDetails | undefined {
  return db.prepare(`
    SELECT t.*,
      s.sample_code, s.name as sample_name,
      fl.name as from_lab_name,
      tl.name as to_lab_name,
      au.username as applied_by_name,
      apu.username as approved_by_name,
      ru.username as received_by_name
    FROM transfers t
    LEFT JOIN samples s ON t.sample_id = s.id
    LEFT JOIN labs fl ON t.from_lab_id = fl.id
    LEFT JOIN labs tl ON t.to_lab_id = tl.id
    LEFT JOIN users au ON t.applied_by = au.id
    LEFT JOIN users apu ON t.approved_by = apu.id
    LEFT JOIN users ru ON t.received_by = ru.id
    WHERE t.id = ?
  `).get(id) as TransferWithDetails | undefined
}

export function findAll(query: TransferQuery): { data: TransferWithDetails[]; total: number; page: number; pageSize: number } {
  const page = query.page || 1
  const pageSize = query.pageSize || 10
  const offset = (page - 1) * pageSize

  let where = 'WHERE 1=1'
  const params: any[] = []

  if (query.status) {
    where += ' AND t.status = ?'
    params.push(query.status)
  }
  if (query.keyword) {
    where += ' AND (s.sample_code LIKE ? OR s.name LIKE ? OR t.reason LIKE ?)'
    const kw = `%${query.keyword}%`
    params.push(kw, kw, kw)
  }

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM transfers t LEFT JOIN samples s ON t.sample_id = s.id ${where}`).get(...params) as { total: number }
  const data = db.prepare(`
    SELECT t.*,
      s.sample_code, s.name as sample_name,
      fl.name as from_lab_name,
      tl.name as to_lab_name,
      au.username as applied_by_name,
      apu.username as approved_by_name,
      ru.username as received_by_name
    FROM transfers t
    LEFT JOIN samples s ON t.sample_id = s.id
    LEFT JOIN labs fl ON t.from_lab_id = fl.id
    LEFT JOIN labs tl ON t.to_lab_id = tl.id
    LEFT JOIN users au ON t.applied_by = au.id
    LEFT JOIN users apu ON t.approved_by = apu.id
    LEFT JOIN users ru ON t.received_by = ru.id
    ${where}
    ORDER BY t.applied_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset) as TransferWithDetails[]

  return { data, total: countRow.total, page, pageSize }
}

export function findPendingByLabId(labId: number): TransferWithDetails[] {
  return db.prepare(`
    SELECT t.*,
      s.sample_code, s.name as sample_name,
      fl.name as from_lab_name,
      tl.name as to_lab_name,
      au.username as applied_by_name,
      apu.username as approved_by_name,
      ru.username as received_by_name
    FROM transfers t
    LEFT JOIN samples s ON t.sample_id = s.id
    LEFT JOIN labs fl ON t.from_lab_id = fl.id
    LEFT JOIN labs tl ON t.to_lab_id = tl.id
    LEFT JOIN users au ON t.applied_by = au.id
    LEFT JOIN users apu ON t.approved_by = apu.id
    LEFT JOIN users ru ON t.received_by = ru.id
    WHERE t.to_lab_id = ? AND t.status = 'pending'
    ORDER BY t.applied_at DESC
  `).all(labId) as TransferWithDetails[]
}

export function updateStatus(id: number, status: string, approvedBy?: number, rejectReason?: string): void {
  if (status === 'approved' || status === 'in_transit') {
    db.prepare(`
      UPDATE transfers SET status = ?, approved_by = ?, approved_at = datetime('now')
      WHERE id = ?
    `).run(status, approvedBy ?? null, id)
  } else if (status === 'rejected') {
    db.prepare(`
      UPDATE transfers SET status = ?, approved_by = ?, approved_at = datetime('now'), reject_reason = ?
      WHERE id = ?
    `).run(status, approvedBy ?? null, rejectReason || '', id)
  } else {
    db.prepare('UPDATE transfers SET status = ? WHERE id = ?').run(status, id)
  }
}

export function receive(id: number, receivedBy: number): void {
  db.prepare(`
    UPDATE transfers SET status = 'received', received_by = ?, received_at = datetime('now')
    WHERE id = ?
  `).run(receivedBy, id)
}

export function archive(transfer: TransferWithDetails): void {
  archiveDb.prepare(`
    INSERT INTO archived_transfers (id, sample_id, sample_code, sample_name, from_lab_id, from_lab_name,
      to_lab_id, to_lab_name, reason, applied_by, applied_at, approved_by, approved_at, received_by, received_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    transfer.id,
    transfer.sample_id,
    transfer.sample_code,
    transfer.sample_name,
    transfer.from_lab_id,
    transfer.from_lab_name,
    transfer.to_lab_id,
    transfer.to_lab_name,
    transfer.reason,
    transfer.applied_by,
    transfer.applied_at,
    transfer.approved_by,
    transfer.approved_at,
    transfer.received_by,
    transfer.received_at
  )
}

export function countTrend(days: number): { date: string; count: number }[] {
  return db.prepare(`
    SELECT DATE(applied_at) as date, COUNT(*) as count
    FROM transfers
    WHERE applied_at >= DATE('now', '-' || ? || ' days')
    GROUP BY DATE(applied_at)
    ORDER BY date
  `).all(days) as { date: string; count: number }[]
}
