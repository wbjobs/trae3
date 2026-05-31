import db from './main.js'
import archiveDb from './archive.js'
import bcrypt from 'bcryptjs'

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS labs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      floor INTEGER NOT NULL DEFAULT 1,
      position_x REAL NOT NULL DEFAULT 0,
      position_y REAL NOT NULL DEFAULT 0,
      capacity INTEGER NOT NULL DEFAULT 100,
      contact_person TEXT NOT NULL DEFAULT '',
      contact_phone TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'approver', 'experimenter', 'viewer')),
      lab_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sample_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('blood', 'tissue', 'cell', 'dna', 'rna', 'protein', 'other')),
      source TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 1,
      unit TEXT NOT NULL DEFAULT '份',
      storage_condition TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'in_stock' CHECK(status IN ('in_stock', 'in_transit', 'received', 'archived', 'discarded')),
      lab_id INTEGER NOT NULL,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sample_id INTEGER NOT NULL,
      from_lab_id INTEGER NOT NULL,
      to_lab_id INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'in_transit', 'received')),
      applied_by INTEGER NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now')),
      approved_by INTEGER,
      approved_at TEXT,
      received_by INTEGER,
      received_at TEXT,
      reject_reason TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('approval_pending', 'approval_result', 'transfer_received', 'system', 'transfer_timeout', 'lab_capacity', 'status_anomaly')),
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      read INTEGER NOT NULL DEFAULT 0,
      user_id INTEGER NOT NULL,
      related_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_samples_code ON samples(sample_code);
    CREATE INDEX IF NOT EXISTS idx_samples_status ON samples(status);
    CREATE INDEX IF NOT EXISTS idx_samples_lab ON samples(lab_id);
    CREATE INDEX IF NOT EXISTS idx_transfers_status ON transfers(status);
    CREATE INDEX IF NOT EXISTS idx_transfers_sample ON transfers(sample_id);
    CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_read ON messages(read);
  `)

  db.exec(`
    UPDATE transfers SET status = 'in_transit'
    WHERE status = 'approved' AND received_at IS NULL
  `)

  db.exec(`
    UPDATE samples SET status = 'in_transit'
    WHERE id IN (SELECT sample_id FROM transfers WHERE status = 'in_transit' AND received_at IS NULL)
    AND status != 'in_transit'
  `)

  const labCount = db.prepare('SELECT COUNT(*) as count FROM labs').get() as { count: number }
  if (labCount.count === 0) {
    const insertLab = db.prepare(`
      INSERT INTO labs (name, code, floor, position_x, position_y, capacity, contact_person, contact_phone)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const labs = [
      ['分子生物学实验室', 'LAB-MOL', 1, 150, 100, 200, '张主任', '13800000001'],
      ['细胞培养实验室', 'LAB-CELL', 1, 400, 100, 150, '李主任', '13800000002'],
      ['基因测序实验室', 'LAB-GENE', 2, 150, 300, 180, '王主任', '13800000003'],
      ['蛋白质分析实验室', 'LAB-PROT', 2, 400, 300, 120, '赵主任', '13800000004'],
      ['药物筛选实验室', 'LAB-DRUG', 3, 150, 500, 160, '钱主任', '13800000005'],
      ['病理标本实验室', 'LAB-PATH', 3, 400, 500, 100, '孙主任', '13800000006'],
    ] as const
    for (const lab of labs) {
      insertLab.run(...lab)
    }
  }

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }
  if (userCount.count === 0) {
    const hash = bcrypt.hashSync('123456', 10)
    const insertUser = db.prepare(`
      INSERT INTO users (username, password, role, lab_id)
      VALUES (?, ?, ?, ?)
    `)
    const users = [
      ['admin', hash, 'admin', null],
      ['zhang_approver', hash, 'approver', 1],
      ['li_approver', hash, 'approver', 2],
      ['wang_experimenter', hash, 'experimenter', 1],
      ['zhao_viewer', hash, 'viewer', 3],
    ] as const
    for (const user of users) {
      insertUser.run(...user)
    }
  }

  archiveDb.exec(`
    CREATE TABLE IF NOT EXISTS archived_transfers (
      id INTEGER PRIMARY KEY,
      sample_id INTEGER NOT NULL,
      sample_code TEXT NOT NULL,
      sample_name TEXT NOT NULL,
      from_lab_id INTEGER NOT NULL,
      from_lab_name TEXT NOT NULL,
      to_lab_id INTEGER NOT NULL,
      to_lab_name TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      applied_by INTEGER NOT NULL,
      applied_at TEXT NOT NULL,
      approved_by INTEGER,
      approved_at TEXT,
      received_by INTEGER,
      received_at TEXT,
      archived_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_archived_transfers_sample ON archived_transfers(sample_id);
    CREATE INDEX IF NOT EXISTS idx_archived_transfers_date ON archived_transfers(archived_at);

    CREATE TABLE IF NOT EXISTS archived_samples (
      id INTEGER PRIMARY KEY,
      sample_code TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 1,
      unit TEXT NOT NULL DEFAULT '',
      storage_condition TEXT NOT NULL DEFAULT '',
      final_status TEXT NOT NULL DEFAULT '',
      final_lab_id INTEGER NOT NULL,
      final_lab_name TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      archived_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_archived_samples_code ON archived_samples(sample_code);
    CREATE INDEX IF NOT EXISTS idx_archived_samples_type ON archived_samples(type);
    CREATE INDEX IF NOT EXISTS idx_archived_samples_date ON archived_samples(archived_at);

    CREATE TABLE IF NOT EXISTS archive_cleanup_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      rows_affected INTEGER NOT NULL DEFAULT 0,
      cutoff_date TEXT NOT NULL,
      executed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
}
