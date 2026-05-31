import { getMetadataDb, getAttachmentDb } from './index.js';

export function initMetadataSchema(): void {
  const db = getMetadataDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'operator', 'auditor', 'viewer')),
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rubbings (
      id TEXT PRIMARY KEY,
      accession_no TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      dynasty TEXT,
      era TEXT,
      author TEXT,
      calligrapher TEXT,
      material TEXT,
      width REAL,
      height REAL,
      dimension_unit TEXT DEFAULT 'cm',
      dimensions TEXT,
      rubbing_date TEXT,
      rubbing_method TEXT,
      collector TEXT,
      collection_no TEXT,
      description TEXT,
      inscription TEXT,
      location TEXT,
      inscription_content TEXT,
      transcription TEXT,
      bibliography TEXT,
      provenance TEXT,
      notes TEXT,
      keywords TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'rejected')),
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      rubbing_id TEXT REFERENCES rubbings(id) ON DELETE CASCADE,
      original_name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      dpi INTEGER,
      color_space TEXT,
      checksum TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      storage_bucket TEXT NOT NULL,
      is_primary INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS versions (
      id TEXT PRIMARY KEY,
      rubbing_id TEXT REFERENCES rubbings(id) ON DELETE CASCADE,
      version_no INTEGER NOT NULL,
      metadata_snapshot TEXT NOT NULL,
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      change_note TEXT,
      UNIQUE(rubbing_id, version_no)
    );

    CREATE TABLE IF NOT EXISTS workflow_records (
      id TEXT PRIMARY KEY,
      rubbing_id TEXT REFERENCES rubbings(id) ON DELETE CASCADE,
      action TEXT NOT NULL CHECK (action IN ('submit', 'approve', 'reject', 'modify', 'create', 'update')),
      operator_id TEXT REFERENCES users(id),
      operator_name TEXT,
      comment TEXT,
      previous_status TEXT,
      new_status TEXT NOT NULL,
      to_status TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS upload_sessions (
      id TEXT PRIMARY KEY,
      file_id TEXT,
      file_name TEXT NOT NULL,
      total_size INTEGER NOT NULL,
      total_chunks INTEGER NOT NULL,
      uploaded_chunks INTEGER DEFAULT 0,
      checksum TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed', 'expired')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rubbings_status ON rubbings(status);
    CREATE INDEX IF NOT EXISTS idx_rubbings_dynasty ON rubbings(dynasty);
    CREATE INDEX IF NOT EXISTS idx_files_rubbing_id ON files(rubbing_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_rubbing_id ON workflow_records(rubbing_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_created_at ON workflow_records(created_at DESC);
  `);
}

export function initAttachmentSchema(): void {
  const db = getAttachmentDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS attachment_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      chunk_data BLOB NOT NULL,
      chunk_size INTEGER NOT NULL,
      checksum TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(session_id, chunk_index)
    );

    CREATE TABLE IF NOT EXISTS attachment_metadata (
      id TEXT PRIMARY KEY,
      file_id TEXT UNIQUE NOT NULL,
      thumbnail_path TEXT,
      preview_path TEXT,
      tiles_path TEXT,
      format_info TEXT,
      exif_data TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_session ON attachment_chunks(session_id);
    CREATE INDEX IF NOT EXISTS idx_attachment_file ON attachment_metadata(file_id);
  `);
}

export function initAllSchemas(): void {
  initMetadataSchema();
  initAttachmentSchema();
}
