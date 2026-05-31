import archiveDb from '../db/archive.js'

export function findArchivedTransfers(query: {
  sampleCode?: string
  fromDate?: string
  toDate?: string
  page?: number
  pageSize?: number
}): { data: any[]; total: number } {
  const page = query.page || 1
  const pageSize = query.pageSize || 20
  const offset = (page - 1) * pageSize

  let where = 'WHERE 1=1'
  const params: any[] = []

  if (query.sampleCode) {
    where += ' AND sample_code LIKE ?'
    params.push(`%${query.sampleCode}%`)
  }
  if (query.fromDate) {
    where += ' AND archived_at >= ?'
    params.push(query.fromDate)
  }
  if (query.toDate) {
    where += ' AND archived_at <= ?'
    params.push(query.toDate)
  }

  const countRow = archiveDb.prepare(`SELECT COUNT(*) as total FROM archived_transfers ${where}`).get(...params) as { total: number }
  const data = archiveDb.prepare(`
    SELECT * FROM archived_transfers ${where}
    ORDER BY archived_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset)

  return { data, total: countRow.total }
}

export function findArchivedSamples(query: {
  sampleCode?: string
  type?: string
  page?: number
  pageSize?: number
}): { data: any[]; total: number } {
  const page = query.page || 1
  const pageSize = query.pageSize || 20
  const offset = (page - 1) * pageSize

  let where = 'WHERE 1=1'
  const params: any[] = []

  if (query.sampleCode) {
    where += ' AND sample_code LIKE ?'
    params.push(`%${query.sampleCode}%`)
  }
  if (query.type) {
    where += ' AND type = ?'
    params.push(query.type)
  }

  const countRow = archiveDb.prepare(`SELECT COUNT(*) as total FROM archived_samples ${where}`).get(...params) as { total: number }
  const data = archiveDb.prepare(`
    SELECT * FROM archived_samples ${where}
    ORDER BY archived_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset)

  return { data, total: countRow.total }
}

export function archiveSample(sample: {
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
  lab_name: string
  created_by: number
  created_at: string
}): void {
  archiveDb.prepare(`
    INSERT INTO archived_samples (id, sample_code, name, type, source, quantity, unit,
      storage_condition, final_status, final_lab_id, final_lab_name, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sample.id, sample.sample_code, sample.name, sample.type, sample.source,
    sample.quantity, sample.unit, sample.storage_condition, sample.status,
    sample.lab_id, sample.lab_name, sample.created_by, sample.created_at
  )
}

export function cleanupOldArchives(daysToKeep: number = 365): number {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - daysToKeep)
  const cutoffStr = cutoff.toISOString().slice(0, 19).replace('T', ' ')

  const transferResult = archiveDb.prepare(
    "DELETE FROM archived_transfers WHERE archived_at < ?"
  ).run(cutoffStr)

  const sampleResult = archiveDb.prepare(
    "DELETE FROM archived_samples WHERE archived_at < ?"
  ).run(cutoffStr)

  const totalDeleted = transferResult.changes + sampleResult.changes

  if (totalDeleted > 0) {
    archiveDb.prepare(
      "INSERT INTO archive_cleanup_log (table_name, rows_affected, cutoff_date) VALUES (?, ?, ?)"
    ).run('archived_transfers+archived_samples', totalDeleted, cutoffStr)
  }

  return totalDeleted
}

export function getArchiveStats(): { transferCount: number; sampleCount: number; oldestRecord: string | null } {
  const tc = archiveDb.prepare('SELECT COUNT(*) as c FROM archived_transfers').get() as { c: number }
  const sc = archiveDb.prepare('SELECT COUNT(*) as c FROM archived_samples').get() as { c: number }
  const oldest = archiveDb.prepare('SELECT MIN(archived_at) as d FROM archived_transfers').get() as { d: string | null }

  return { transferCount: tc.c, sampleCount: sc.c, oldestRecord: oldest.d }
}
