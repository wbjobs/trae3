import sqlite3
import os
from pathlib import Path

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "inspection.db")

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS inspection (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    original_path TEXT NOT NULL,
    processed_path TEXT,
    annotated_path TEXT,
    status TEXT NOT NULL DEFAULT 'processing',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS defect_type (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    severity_rules TEXT
);

CREATE TABLE IF NOT EXISTS defect (
    id TEXT PRIMARY KEY,
    inspection_id TEXT NOT NULL REFERENCES inspection(id),
    type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK(severity IN ('low', 'medium', 'high', 'critical')),
    confidence REAL NOT NULL,
    bbox TEXT NOT NULL,
    description TEXT,
    confirmed INTEGER NOT NULL DEFAULT 0,
    confirmed_by TEXT,
    vector_id TEXT,
    image_url TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_defect_inspection ON defect(inspection_id);
CREATE INDEX IF NOT EXISTS idx_defect_type ON defect(type);
CREATE INDEX IF NOT EXISTS idx_defect_severity ON defect(severity);
CREATE INDEX IF NOT EXISTS idx_inspection_status ON inspection(status);
CREATE INDEX IF NOT EXISTS idx_inspection_created ON inspection(created_at);
"""

SEED_SQL = """
INSERT OR IGNORE INTO defect_type (id, name, code, description) VALUES
    ('dt1', '裂纹', 'CRACK', '表面或内部裂纹缺陷'),
    ('dt2', '锈蚀', 'RUST', '金属表面锈蚀腐蚀'),
    ('dt3', '变形', 'DEFORM', '结构变形或弯曲'),
    ('dt4', '缺失', 'MISSING', '部件缺失或脱落'),
    ('dt5', '渗漏', 'LEAK', '液体或气体渗漏痕迹'),
    ('dt6', '磨损', 'WEAR', '表面磨损或消耗'),
    ('dt7', '松动', 'LOOSE', '连接件松动'),
    ('dt8', '异响', 'ABNORMAL', '异常振动或声音相关缺陷');
"""


def get_db() -> sqlite3.Connection:
    db_dir = os.path.dirname(DB_PATH)
    Path(db_dir).mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    conn = get_db()
    conn.executescript(SCHEMA_SQL)
    conn.executescript(SEED_SQL)
    conn.commit()
    conn.close()
