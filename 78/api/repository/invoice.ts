import db from '../database.js'
import type { Invoice } from '../../shared/types.js'

interface CreateData {
  id: string
  fileName: string
  filePath: string
  status?: Invoice['status']
}

interface FindAllFilters {
  page: number
  limit: number
  status?: string
  keyword?: string
  dateFrom?: string
  dateTo?: string
}

function mapRow(row: Record<string, unknown>): Invoice {
  return {
    id: row.id as string,
    fileName: row.file_name as string,
    filePath: row.file_path as string,
    status: row.status as Invoice['status'],
    invoiceCode: row.invoice_code as string | null,
    invoiceNumber: row.invoice_number as string | null,
    invoiceDate: row.invoice_date as string | null,
    amount: row.amount as number | null,
    taxAmount: row.tax_amount as number | null,
    totalAmount: row.total_amount as number | null,
    sellerName: row.seller_name as string | null,
    sellerTaxNumber: row.seller_tax_number as string | null,
    buyerName: row.buyer_name as string | null,
    buyerTaxNumber: row.buyer_tax_number as string | null,
    checkCode: row.check_code as string | null,
    remarks: row.remarks as string | null,
    confidence: row.confidence as string | null,
    verified: row.verified as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

const stmtCache = new Map<string, ReturnType<typeof db.prepare>>()

function getStmt(sql: string) {
  let stmt = stmtCache.get(sql)
  if (!stmt) {
    stmt = db.prepare(sql)
    stmtCache.set(sql, stmt)
  }
  return stmt
}

export function create(data: CreateData): Invoice {
  const stmt = getStmt('INSERT INTO invoices (id, file_name, file_path, status) VALUES (@id, @fileName, @filePath, @status)')
  stmt.run({
    id: data.id,
    fileName: data.fileName,
    filePath: data.filePath,
    status: data.status ?? 'pending',
  })
  return findById(data.id)!
}

export function findById(id: string): Invoice | undefined {
  const stmt = getStmt('SELECT * FROM invoices WHERE id = ?')
  const row = stmt.get(id) as Record<string, unknown> | undefined
  return row ? mapRow(row) : undefined
}

function buildWhereClause(filters: Omit<FindAllFilters, 'page' | 'limit'>): { where: string; params: unknown[] } {
  const { status, keyword, dateFrom, dateTo } = filters
  const conditions: string[] = []
  const params: unknown[] = []

  if (status) {
    conditions.push('status = ?')
    params.push(status)
  }
  if (keyword) {
    conditions.push('(seller_name LIKE ? OR buyer_name LIKE ? OR invoice_number LIKE ?)')
    const like = `%${keyword}%`
    params.push(like, like, like)
  }
  if (dateFrom) {
    conditions.push('invoice_date >= ?')
    params.push(dateFrom)
  }
  if (dateTo) {
    conditions.push('invoice_date <= ?')
    params.push(dateTo)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  return { where, params }
}

export function findAll(filters: FindAllFilters): Invoice[] {
  const { page, limit } = filters
  const { where, params } = buildWhereClause(filters)
  const offset = (page - 1) * limit

  const stmt = getStmt(
    `SELECT * FROM invoices ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  )
  const rows = (stmt.all.bind(stmt) as (...args: unknown[]) => Record<string, unknown>[])(...params, limit, offset)
  return rows.map(mapRow)
}

export function count(filters: Omit<FindAllFilters, 'page' | 'limit'>): number {
  const { where, params } = buildWhereClause(filters)
  const stmt = getStmt(`SELECT COUNT(*) as total FROM invoices ${where}`)
  const row = (stmt.get.bind(stmt) as (...args: unknown[]) => { total: number })(...params)
  return row.total
}

interface UpdateData {
  status?: Invoice['status']
  invoiceCode?: string | null
  invoiceNumber?: string | null
  invoiceDate?: string | null
  amount?: number | null
  taxAmount?: number | null
  totalAmount?: number | null
  sellerName?: string | null
  sellerTaxNumber?: string | null
  buyerName?: string | null
  buyerTaxNumber?: string | null
  checkCode?: string | null
  remarks?: string | null
  confidence?: string | null
  verified?: number
}

const columnMap: Record<string, string> = {
  status: 'status',
  invoiceCode: 'invoice_code',
  invoiceNumber: 'invoice_number',
  invoiceDate: 'invoice_date',
  amount: 'amount',
  taxAmount: 'tax_amount',
  totalAmount: 'total_amount',
  sellerName: 'seller_name',
  sellerTaxNumber: 'seller_tax_number',
  buyerName: 'buyer_name',
  buyerTaxNumber: 'buyer_tax_number',
  checkCode: 'check_code',
  remarks: 'remarks',
  confidence: 'confidence',
  verified: 'verified',
}

export function update(id: string, data: UpdateData): Invoice | undefined {
  const fields: string[] = []
  const params: Record<string, unknown> = { id }

  for (const [key, col] of Object.entries(columnMap)) {
    if ((data as Record<string, unknown>)[key] !== undefined) {
      fields.push(`${col} = @${key}`)
      params[key] = (data as Record<string, unknown>)[key]
    }
  }

  if (fields.length === 0) return findById(id)

  fields.push("updated_at = datetime('now', 'localtime')")
  const sql = `UPDATE invoices SET ${fields.join(', ')} WHERE id = @id`
  const stmt = getStmt(sql)
  stmt.run(params)
  return findById(id)
}

export function remove(id: number | string): boolean {
  const stmt = getStmt('DELETE FROM invoices WHERE id = ?')
  const result = stmt.run(id)
  return result.changes > 0
}

export function findByIds(ids: string[]): Invoice[] {
  if (ids.length === 0) return []
  const placeholders = ids.map(() => '?').join(',')
  const stmt = getStmt(`SELECT * FROM invoices WHERE id IN (${placeholders})`)
  const rows = (stmt.all.bind(stmt) as (...args: unknown[]) => Record<string, unknown>[])(...ids)
  return rows.map(mapRow)
}
