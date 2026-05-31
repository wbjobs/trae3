import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dataDir = path.resolve(__dirname, '..', 'data')
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const dbPath = path.join(dataDir, 'invoices.db')
const db = new Database(dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.pragma('synchronous = NORMAL')
db.pragma('cache_size = -64000')
db.pragma('temp_store = MEMORY')
db.pragma('mmap_size = 268435456')

db.exec(`
  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
    invoice_code TEXT,
    invoice_number TEXT,
    invoice_date TEXT,
    amount REAL,
    tax_amount REAL,
    total_amount REAL,
    seller_name TEXT,
    seller_tax_number TEXT,
    buyer_name TEXT,
    buyer_tax_number TEXT,
    check_code TEXT,
    remarks TEXT,
    confidence TEXT,
    verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
  CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date);
  CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
  CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(created_at);
  CREATE INDEX IF NOT EXISTS idx_invoices_verified ON invoices(verified);
  CREATE INDEX IF NOT EXISTS idx_invoices_status_created ON invoices(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_invoices_seller_name ON invoices(seller_name);
  CREATE INDEX IF NOT EXISTS idx_invoices_buyer_name ON invoices(buyer_name);
`)

export default db
