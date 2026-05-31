import { getBaseDb, saveBaseDb } from './base-db.js';
import { getFlowDb, saveFlowDb } from './flow-db.js';

export async function initializeDatabases(): Promise<void> {
  const baseDb = await getBaseDb();

  baseDb.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('operator', 'reviewer', 'admin')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  baseDb.run(`
    CREATE TABLE IF NOT EXISTS sample_types (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  baseDb.run(`
    CREATE TABLE IF NOT EXISTS samples (
      id TEXT PRIMARY KEY,
      sample_no TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      type_code TEXT NOT NULL,
      source TEXT NOT NULL,
      specification TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (type_code) REFERENCES sample_types(code)
    )
  `);

  baseDb.run(`
    CREATE TABLE IF NOT EXISTS sample_details (
      id TEXT PRIMARY KEY,
      sample_id TEXT UNIQUE NOT NULL,
      storage_location TEXT,
      expiry_date TEXT,
      hazard_level TEXT,
      handling_notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (sample_id) REFERENCES samples(id) ON DELETE CASCADE
    )
  `);

  baseDb.run(`
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      sample_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_category TEXT DEFAULT 'other' CHECK(file_category IN ('report', 'image', 'certificate', 'other')),
      uploaded_by TEXT NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (sample_id) REFERENCES samples(id) ON DELETE CASCADE
    )
  `);

  baseDb.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('approval', 'reminder', 'system')),
      title TEXT NOT NULL,
      content TEXT,
      related_sample_id TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (related_sample_id) REFERENCES samples(id) ON DELETE SET NULL
    )
  `);

  baseDb.run(`CREATE INDEX IF NOT EXISTS idx_samples_status ON samples(status)`);
  baseDb.run(`CREATE INDEX IF NOT EXISTS idx_samples_created_at ON samples(created_at)`);
  baseDb.run(`CREATE INDEX IF NOT EXISTS idx_samples_type_code ON samples(type_code)`);
  baseDb.run(`CREATE INDEX IF NOT EXISTS idx_samples_created_by ON samples(created_by)`);
  baseDb.run(`CREATE INDEX IF NOT EXISTS idx_sample_details_sample_id ON sample_details(sample_id)`);
  baseDb.run(`CREATE INDEX IF NOT EXISTS idx_attachments_sample_id ON attachments(sample_id)`);
  baseDb.run(`CREATE INDEX IF NOT EXISTS idx_attachments_file_type ON attachments(file_type)`);
  baseDb.run(`CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)`);
  baseDb.run(`CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read)`);
  baseDb.run(`CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at)`);

  const userCount = baseDb.exec("SELECT COUNT(*) as cnt FROM users");
  if (userCount[0]?.values[0]?.[0] === 0) {
    baseDb.run(`INSERT INTO users (id, username, password_hash, display_name, role) VALUES ('u001', 'admin', 'hashed_admin_123', '系统管理员', 'admin')`);
    baseDb.run(`INSERT INTO users (id, username, password_hash, display_name, role) VALUES ('u002', 'operator01', 'hashed_op_123', '张操作', 'operator')`);
    baseDb.run(`INSERT INTO users (id, username, password_hash, display_name, role) VALUES ('u003', 'reviewer01', 'hashed_rev_123', '李审批', 'reviewer')`);
  }

  const typeCount = baseDb.exec("SELECT COUNT(*) as cnt FROM sample_types");
  if (typeCount[0]?.values[0]?.[0] === 0) {
    baseDb.run(`INSERT INTO sample_types (code, name, description) VALUES ('chem', '化学试剂', '化学类样品及试剂')`);
    baseDb.run(`INSERT INTO sample_types (code, name, description) VALUES ('bio', '生物样品', '生物类检测样品')`);
    baseDb.run(`INSERT INTO sample_types (code, name, description) VALUES ('env', '环境样品', '环境监测样品')`);
    baseDb.run(`INSERT INTO sample_types (code, name, description) VALUES ('food', '食品样品', '食品检测样品')`);
    baseDb.run(`INSERT INTO sample_types (code, name, description) VALUES ('drug', '药品样品', '药品检测样品')`);
    baseDb.run(`INSERT INTO sample_types (code, name, description) VALUES ('other', '其他', '其他类型样品')`);
  }

  saveBaseDb();

  const flowDb = await getFlowDb();

  flowDb.run(`
    CREATE TABLE IF NOT EXISTS flow_stages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  flowDb.run(`
    CREATE TABLE IF NOT EXISTS flow_records (
      id TEXT PRIMARY KEY,
      sample_id TEXT NOT NULL,
      stage_id TEXT,
      step TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('submit', 'approve', 'reject', 'resubmit')),
      operator TEXT NOT NULL,
      comment TEXT,
      duration_seconds INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (stage_id) REFERENCES flow_stages(id) ON DELETE SET NULL
    )
  `);

  flowDb.run(`CREATE INDEX IF NOT EXISTS idx_flow_records_sample_id ON flow_records(sample_id)`);
  flowDb.run(`CREATE INDEX IF NOT EXISTS idx_flow_records_created_at ON flow_records(created_at)`);
  flowDb.run(`CREATE INDEX IF NOT EXISTS idx_flow_records_action ON flow_records(action)`);
  flowDb.run(`CREATE INDEX IF NOT EXISTS idx_flow_records_stage_id ON flow_records(stage_id)`);
  flowDb.run(`CREATE INDEX IF NOT EXISTS idx_flow_stages_sequence ON flow_stages(sequence)`);

  const stageCount = flowDb.exec("SELECT COUNT(*) as cnt FROM flow_stages");
  if (stageCount[0]?.values[0]?.[0] === 0) {
    flowDb.run(`INSERT INTO flow_stages (id, name, sequence, description) VALUES ('s001', '样品登记', 1, '样品信息录入与附件上传')`);
    flowDb.run(`INSERT INTO flow_stages (id, name, sequence, description) VALUES ('s002', '待审批', 2, '等待审批人员审核')`);
    flowDb.run(`INSERT INTO flow_stages (id, name, sequence, description) VALUES ('s003', '已通过', 3, '审批通过，可进行检测')`);
    flowDb.run(`INSERT INTO flow_stages (id, name, sequence, description) VALUES ('s004', '已退回', 4, '审批退回，需补充信息')`);
  }

  saveFlowDb();

  console.log('Databases initialized successfully');
}
