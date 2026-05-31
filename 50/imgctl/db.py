import sqlite3
import os
import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


class Database:
    def __init__(self, db_path=None):
        self.db_path = db_path or os.path.join(
            os.path.expanduser("~"), ".imgctl", "imgctl.db"
        )
        self._conn = None

    def _ensure_dir(self):
        db_dir = os.path.dirname(self.db_path)
        if db_dir:
            os.makedirs(db_dir, exist_ok=True)

    @property
    def conn(self):
        if self._conn is None:
            self._ensure_dir()
            self._conn = sqlite3.connect(self.db_path)
            self._conn.row_factory = sqlite3.Row
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA foreign_keys=ON")
        return self._conn

    def _safe_execute(self, func, *args, **kwargs):
        try:
            return func(*args, **kwargs)
        except sqlite3.Error as e:
            logger.error(f"Database error: {e}")
            try:
                self._conn.rollback()
            except Exception:
                pass
            raise RuntimeError(f"Database operation failed: {e}")

    def init_tables(self):
        cur = self.conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                repository TEXT NOT NULL,
                digest TEXT,
                size_bytes INTEGER DEFAULT 0,
                created_at TEXT,
                updated_at TEXT,
                metadata_json TEXT DEFAULT '{}',
                UNIQUE(repository, name)
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                image_id INTEGER NOT NULL,
                tag TEXT NOT NULL,
                digest TEXT,
                created_at TEXT,
                FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
                UNIQUE(image_id, tag)
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS cleanup_policies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                strategy TEXT NOT NULL,
                params_json TEXT DEFAULT '{}',
                enabled INTEGER DEFAULT 1,
                created_at TEXT,
                updated_at TEXT
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS cleanup_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                policy_id INTEGER,
                action TEXT NOT NULL,
                target TEXT NOT NULL,
                status TEXT NOT NULL,
                detail TEXT,
                executed_at TEXT,
                FOREIGN KEY (policy_id) REFERENCES cleanup_policies(id) ON DELETE SET NULL
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS operation_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                module TEXT NOT NULL,
                action TEXT NOT NULL,
                target TEXT NOT NULL,
                status TEXT NOT NULL,
                detail TEXT,
                executed_at TEXT
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS locked_tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                repository TEXT NOT NULL,
                tag TEXT NOT NULL,
                digest TEXT,
                reason TEXT,
                locked_by TEXT,
                locked_at TEXT,
                expires_at TEXT,
                UNIQUE(repository, tag)
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS scheduled_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                task_type TEXT NOT NULL,
                cron TEXT,
                params_json TEXT DEFAULT '{}',
                enabled INTEGER DEFAULT 1,
                last_run_at TEXT,
                next_run_at TEXT,
                created_at TEXT,
                updated_at TEXT
            )
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_tags_image_id ON tags(image_id)
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag)
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_images_repository ON images(repository)
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_operation_logs_module ON operation_logs(module)
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_operation_logs_executed_at ON operation_logs(executed_at)
        """)
        self.conn.commit()

    def upsert_image(self, name, repository, digest=None, size_bytes=0, metadata=None):
        now = datetime.utcnow().isoformat()
        cur = self.conn.cursor()
        cur.execute(
            "SELECT id FROM images WHERE repository=? AND name=?",
            (repository, name),
        )
        row = cur.fetchone()
        if row:
            cur.execute(
                """UPDATE images SET digest=?, size_bytes=?, updated_at=?, metadata_json=?
                   WHERE id=?""",
                (digest, size_bytes, now, json.dumps(metadata or {}), row["id"]),
            )
            return row["id"]
        cur.execute(
            """INSERT INTO images (name, repository, digest, size_bytes, created_at, updated_at, metadata_json)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (name, repository, digest, size_bytes, now, now, json.dumps(metadata or {})),
        )
        self.conn.commit()
        return cur.lastrowid

    def get_image(self, image_id=None, name=None, repository=None):
        cur = self.conn.cursor()
        if image_id:
            cur.execute("SELECT * FROM images WHERE id=?", (image_id,))
        elif name and repository:
            cur.execute(
                "SELECT * FROM images WHERE name=? AND repository=?", (name, repository)
            )
        else:
            return None
        return cur.fetchone()

    def list_images(self, repository=None, limit=100, offset=0):
        cur = self.conn.cursor()
        if repository:
            cur.execute(
                "SELECT * FROM images WHERE repository=? ORDER BY updated_at DESC LIMIT ? OFFSET ?",
                (repository, limit, offset),
            )
        else:
            cur.execute(
                "SELECT * FROM images ORDER BY updated_at DESC LIMIT ? OFFSET ?",
                (limit, offset),
            )
        return cur.fetchall()

    def delete_image(self, image_id):
        cur = self.conn.cursor()
        cur.execute("DELETE FROM images WHERE id=?", (image_id,))
        self.conn.commit()
        return cur.rowcount

    def add_tag(self, image_id, tag, digest=None):
        now = datetime.utcnow().isoformat()
        cur = self.conn.cursor()
        cur.execute(
            "INSERT OR REPLACE INTO tags (image_id, tag, digest, created_at) VALUES (?, ?, ?, ?)",
            (image_id, tag, digest, now),
        )
        self.conn.commit()
        return cur.lastrowid

    def get_tags(self, image_id):
        cur = self.conn.cursor()
        cur.execute("SELECT * FROM tags WHERE image_id=?", (image_id,))
        return cur.fetchall()

    def delete_tag(self, image_id, tag):
        cur = self.conn.cursor()
        cur.execute(
            "DELETE FROM tags WHERE image_id=? AND tag=?", (image_id, tag)
        )
        self.conn.commit()
        return cur.rowcount

    def add_policy(self, name, strategy, params=None):
        now = datetime.utcnow().isoformat()
        cur = self.conn.cursor()
        cur.execute(
            """INSERT INTO cleanup_policies (name, strategy, params_json, enabled, created_at, updated_at)
               VALUES (?, ?, ?, 1, ?, ?)""",
            (name, strategy, json.dumps(params or {}), now, now),
        )
        self.conn.commit()
        return cur.lastrowid

    def get_policy(self, name=None, policy_id=None):
        cur = self.conn.cursor()
        if name:
            cur.execute("SELECT * FROM cleanup_policies WHERE name=?", (name,))
        elif policy_id:
            cur.execute("SELECT * FROM cleanup_policies WHERE id=?", (policy_id,))
        else:
            return None
        return cur.fetchone()

    def list_policies(self):
        cur = self.conn.cursor()
        cur.execute("SELECT * FROM cleanup_policies ORDER BY created_at DESC")
        return cur.fetchall()

    def delete_policy(self, name):
        cur = self.conn.cursor()
        cur.execute("DELETE FROM cleanup_policies WHERE name=?", (name,))
        self.conn.commit()
        return cur.rowcount

    def toggle_policy(self, name, enabled):
        now = datetime.utcnow().isoformat()
        cur = self.conn.cursor()
        cur.execute(
            "UPDATE cleanup_policies SET enabled=?, updated_at=? WHERE name=?",
            (1 if enabled else 0, now, name),
        )
        self.conn.commit()
        return cur.rowcount

    def add_cleanup_log(self, policy_id, action, target, status, detail=None):
        now = datetime.utcnow().isoformat()
        try:
            cur = self.conn.cursor()
            cur.execute(
                """INSERT INTO cleanup_logs (policy_id, action, target, status, detail, executed_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (policy_id, action, target, status, detail, now),
            )
            self.conn.commit()
            return cur.lastrowid
        except sqlite3.Error as e:
            logger.error(f"Failed to write cleanup log: {e}")
            return None

    def list_cleanup_logs(self, limit=50):
        cur = self.conn.cursor()
        cur.execute(
            "SELECT * FROM cleanup_logs ORDER BY executed_at DESC LIMIT ?", (limit,)
        )
        return cur.fetchall()

    def add_operation_log(self, module, action, target, status, detail=None):
        now = datetime.utcnow().isoformat()
        try:
            cur = self.conn.cursor()
            cur.execute(
                """INSERT INTO operation_logs (module, action, target, status, detail, executed_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (module, action, target, status, detail, now),
            )
            self.conn.commit()
            return cur.lastrowid
        except sqlite3.Error as e:
            logger.error(f"Failed to write operation log: {e}")
            return None

    def list_operation_logs(self, module=None, limit=50):
        cur = self.conn.cursor()
        if module:
            cur.execute(
                "SELECT * FROM operation_logs WHERE module=? ORDER BY executed_at DESC LIMIT ?",
                (module, limit),
            )
        else:
            cur.execute(
                "SELECT * FROM operation_logs ORDER BY executed_at DESC LIMIT ?",
                (limit,),
            )
        return cur.fetchall()

    def add_locked_tag(self, repository, tag, digest=None, reason=None, locked_by=None, expires_at=None):
        now = datetime.utcnow().isoformat()
        cur = self.conn.cursor()
        try:
            cur.execute(
                """INSERT INTO locked_tags (repository, tag, digest, reason, locked_by, locked_at, expires_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (repository, tag, digest, reason, locked_by, now, expires_at),
            )
            self.conn.commit()
            return cur.lastrowid
        except sqlite3.IntegrityError:
            return None

    def get_locked_tag(self, repository, tag):
        now = datetime.utcnow().isoformat()
        cur = self.conn.cursor()
        cur.execute(
            """SELECT * FROM locked_tags WHERE repository=? AND tag=?
               AND (expires_at IS NULL OR expires_at > ?)""",
            (repository, tag, now),
        )
        return cur.fetchone()

    def is_tag_locked(self, repository, tag):
        return self.get_locked_tag(repository, tag) is not None

    def list_locked_tags(self, repository=None):
        now = datetime.utcnow().isoformat()
        cur = self.conn.cursor()
        if repository:
            cur.execute(
                """SELECT * FROM locked_tags WHERE repository=?
                   AND (expires_at IS NULL OR expires_at > ?) ORDER BY locked_at DESC""",
                (repository, now),
            )
        else:
            cur.execute(
                """SELECT * FROM locked_tags WHERE expires_at IS NULL OR expires_at > ?
                   ORDER BY locked_at DESC""",
                (now,),
            )
        return cur.fetchall()

    def delete_locked_tag(self, repository, tag):
        cur = self.conn.cursor()
        cur.execute(
            "DELETE FROM locked_tags WHERE repository=? AND tag=?",
            (repository, tag),
        )
        self.conn.commit()
        return cur.rowcount

    def get_expired_locks(self):
        now = datetime.utcnow().isoformat()
        cur = self.conn.cursor()
        cur.execute(
            "SELECT * FROM locked_tags WHERE expires_at IS NOT NULL AND expires_at <= ?",
            (now,),
        )
        return cur.fetchall()

    def purge_expired_locks(self):
        now = datetime.utcnow().isoformat()
        cur = self.conn.cursor()
        cur.execute(
            "DELETE FROM locked_tags WHERE expires_at IS NOT NULL AND expires_at <= ?",
            (now,),
        )
        self.conn.commit()
        return cur.rowcount

    def add_scheduled_task(self, name, task_type, cron=None, params=None):
        now = datetime.utcnow().isoformat()
        cur = self.conn.cursor()
        try:
            cur.execute(
                """INSERT INTO scheduled_tasks
                   (name, task_type, cron, params_json, enabled, created_at, updated_at)
                   VALUES (?, ?, ?, ?, 1, ?, ?)""",
                (name, task_type, cron, json.dumps(params or {}), now, now),
            )
            self.conn.commit()
            return cur.lastrowid
        except sqlite3.IntegrityError:
            return None

    def get_scheduled_task(self, name):
        cur = self.conn.cursor()
        cur.execute("SELECT * FROM scheduled_tasks WHERE name=?", (name,))
        return cur.fetchone()

    def list_scheduled_tasks(self):
        cur = self.conn.cursor()
        cur.execute("SELECT * FROM scheduled_tasks ORDER BY created_at DESC")
        return cur.fetchall()

    def delete_scheduled_task(self, name):
        cur = self.conn.cursor()
        cur.execute("DELETE FROM scheduled_tasks WHERE name=?", (name,))
        self.conn.commit()
        return cur.rowcount

    def toggle_scheduled_task(self, name, enabled):
        now = datetime.utcnow().isoformat()
        cur = self.conn.cursor()
        cur.execute(
            "UPDATE scheduled_tasks SET enabled=?, updated_at=? WHERE name=?",
            (1 if enabled else 0, now, name),
        )
        self.conn.commit()
        return cur.rowcount

    def update_scheduled_task_run(self, name, last_run_at, next_run_at):
        now = datetime.utcnow().isoformat()
        cur = self.conn.cursor()
        cur.execute(
            "UPDATE scheduled_tasks SET last_run_at=?, next_run_at=?, updated_at=? WHERE name=?",
            (last_run_at, next_run_at, now, name),
        )
        self.conn.commit()
        return cur.rowcount

    def close(self):
        if self._conn:
            self._conn.close()
            self._conn = None
