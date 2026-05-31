import { getDb } from '../database/schema.js'

export interface ArchiveStats {
  totalRecords: number
  archivedRecords: number
  tableName: string
  archiveDate: string
}

function getArchiveTableName(baseName: string, date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${baseName}_archive_${year}_${month}`
}

function ensureArchiveTable(tableName: string, archiveTableName: string): void {
  const db = getDb()

  const createTableStmt = db.prepare(`
    CREATE TABLE IF NOT EXISTS ${archiveTableName} AS
    SELECT * FROM ${tableName} WHERE 1=0
  `)
  createTableStmt.run()

  try {
    const createIndexStmt = db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_${archiveTableName.replace(/-/g, '_')}_created 
      ON ${archiveTableName}(created_at)
    `)
    createIndexStmt.run()
  } catch {
  }
}

export function archiveAlerts(olderThanDays: number = 30): ArchiveStats {
  const db = getDb()
  const now = new Date()
  const archiveDate = new Date(now.getTime() - olderThanDays * 24 * 60 * 60 * 1000)
  const archiveTableName = getArchiveTableName('alerts', archiveDate)

  ensureArchiveTable('alerts', archiveTableName)

  const dateStr = archiveDate.toISOString().slice(0, 19).replace('T', ' ')

  const countStmt = db.prepare(`
    SELECT COUNT(*) as cnt FROM alerts 
    WHERE status = 'resolved' AND created_at < ?
  `)
  const { cnt: totalRecords } = countStmt.get(dateStr) as { cnt: number }

  if (totalRecords === 0) {
    return {
      totalRecords: 0,
      archivedRecords: 0,
      tableName: archiveTableName,
      archiveDate: archiveDate.toISOString(),
    }
  }

  const insertStmt = db.prepare(`
    INSERT INTO ${archiveTableName}
    SELECT * FROM alerts 
    WHERE status = 'resolved' AND created_at < ?
  `)
  const insertResult = insertStmt.run(dateStr)

  const deleteStmt = db.prepare(`
    DELETE FROM alerts 
    WHERE status = 'resolved' AND created_at < ?
  `)
  deleteStmt.run(dateStr)

  return {
    totalRecords,
    archivedRecords: insertResult.changes ?? 0,
    tableName: archiveTableName,
    archiveDate: archiveDate.toISOString(),
  }
}

export function archiveTrendData(olderThanHours: number = 168): ArchiveStats {
  const db = getDb()
  const now = new Date()
  const archiveDate = new Date(now.getTime() - olderThanHours * 60 * 60 * 1000)
  const archiveTableName = getArchiveTableName('device_param_trend', archiveDate)

  ensureArchiveTable('device_param_trend', archiveTableName)

  const dateStr = archiveDate.toISOString().slice(0, 19).replace('T', ' ')

  const countStmt = db.prepare(`
    SELECT COUNT(*) as cnt FROM device_param_trend 
    WHERE timestamp < ?
  `)
  const { cnt: totalRecords } = countStmt.get(dateStr) as { cnt: number }

  if (totalRecords === 0) {
    return {
      totalRecords: 0,
      archivedRecords: 0,
      tableName: archiveTableName,
      archiveDate: archiveDate.toISOString(),
    }
  }

  const insertStmt = db.prepare(`
    INSERT INTO ${archiveTableName}
    SELECT * FROM device_param_trend 
    WHERE timestamp < ?
  `)
  const insertResult = insertStmt.run(dateStr)

  const deleteStmt = db.prepare(`
    DELETE FROM device_param_trend 
    WHERE timestamp < ?
  `)
  deleteStmt.run(dateStr)

  return {
    totalRecords,
    archivedRecords: insertResult.changes ?? 0,
    tableName: archiveTableName,
    archiveDate: archiveDate.toISOString(),
  }
}

export function listArchiveTables(): string[] {
  const db = getDb()
  const rows = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type = 'table' AND name LIKE '%_archive_%'
    ORDER BY name DESC
  `).all() as { name: string }[]

  return rows.map((r) => r.name)
}

export function getArchiveTableStats(tableName: string): { count: number; minDate: string; maxDate: string } {
  const db = getDb()
  const dateColumn = tableName.includes('alerts') ? 'created_at' : 'timestamp'

  try {
    const result = db.prepare(`
      SELECT 
        COUNT(*) as count,
        MIN(${dateColumn}) as minDate,
        MAX(${dateColumn}) as maxDate
      FROM ${tableName}
    `).get() as { count: number; minDate: string; maxDate: string }

    return result
  } catch {
    return { count: 0, minDate: '', maxDate: '' }
  }
}

export function exportArchiveToJson(tableName: string, limit?: number): object[] {
  const db = getDb()
  const query = limit
    ? `SELECT * FROM ${tableName} ORDER BY created_at DESC LIMIT ?`
    : `SELECT * FROM ${tableName} ORDER BY created_at DESC`

  const stmt = db.prepare(query)
  const rows = limit ? stmt.all(limit) : stmt.all()
  return rows as object[]
}

export function exportArchiveToCsv(tableName: string, limit?: number): string {
  const db = getDb()
  const query = limit
    ? `SELECT * FROM ${tableName} ORDER BY created_at DESC LIMIT ?`
    : `SELECT * FROM ${tableName} ORDER BY created_at DESC`

  const stmt = db.prepare(query)
  const rows = (limit ? stmt.all(limit) : stmt.all()) as Record<string, unknown>[]

  if (rows.length === 0) return ''

  const headers = Object.keys(rows[0])
  const csvRows = [headers.join(',')]

  for (const row of rows) {
    const values = headers.map((header) => {
      const val = row[header]
      if (typeof val === 'string') {
        return `"${val.replace(/"/g, '""')}"`
      }
      return val
    })
    csvRows.push(values.join(','))
  }

  return csvRows.join('\n')
}

export function dropArchiveTable(tableName: string): boolean {
  const db = getDb()
  try {
    db.prepare(`DROP TABLE IF EXISTS ${tableName}`).run()
    return true
  } catch {
    return false
  }
}
