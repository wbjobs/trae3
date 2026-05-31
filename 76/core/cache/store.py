import json
import os
import sqlite3
import threading
import time
from typing import Any

from utils.logger import setup_logger
from utils.config import ConfigManager
from exceptions import CacheError, CacheKeyNotFoundError


class CacheStore:
    def __init__(self, db_path: str) -> None:
        config = ConfigManager.get()
        self._logger = setup_logger("cache.store", config.logging.level, config.logging.file)
        self._db_path = db_path
        self._lock = threading.Lock()
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self._init_db()

    def _init_db(self) -> None:
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            try:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS cache_entries (
                        key TEXT PRIMARY KEY,
                        value TEXT NOT NULL,
                        created_at REAL NOT NULL,
                        last_access REAL NOT NULL,
                        access_count INTEGER DEFAULT 1,
                        size_bytes INTEGER DEFAULT 0,
                        category TEXT DEFAULT '',
                        metadata TEXT DEFAULT '{}'
                    )
                """)
                conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_last_access
                    ON cache_entries(last_access)
                """)
                conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_category
                    ON cache_entries(category)
                """)
                conn.commit()
            finally:
                conn.close()

    def put(
        self,
        key: str,
        value: Any,
        category: str = "",
        metadata: dict | None = None,
    ) -> None:
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            try:
                now = time.time()
                value_str = json.dumps(value, ensure_ascii=False) if not isinstance(value, str) else value
                size = len(value_str.encode("utf-8"))
                meta_str = json.dumps(metadata or {}, ensure_ascii=False)
                conn.execute(
                    """
                    INSERT OR REPLACE INTO cache_entries
                    (key, value, created_at, last_access, access_count, size_bytes, category, metadata)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (key, value_str, now, now, 1, size, category, meta_str),
                )
                conn.commit()
            except sqlite3.Error as e:
                raise CacheError(f"缓存写入失败: {e}") from e
            finally:
                conn.close()

    def get(self, key: str) -> Any:
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            try:
                cursor = conn.execute(
                    "SELECT value, access_count FROM cache_entries WHERE key = ?",
                    (key,),
                )
                row = cursor.fetchone()
                if row is None:
                    raise CacheKeyNotFoundError(f"缓存键不存在: {key}")

                conn.execute(
                    """
                    UPDATE cache_entries
                    SET last_access = ?, access_count = ?
                    WHERE key = ?
                    """,
                    (time.time(), row[1] + 1, key),
                )
                conn.commit()

                try:
                    return json.loads(row[0])
                except (json.JSONDecodeError, TypeError):
                    return row[0]
            except CacheKeyNotFoundError:
                raise
            except sqlite3.Error as e:
                raise CacheError(f"缓存读取失败: {e}") from e
            finally:
                conn.close()

    def has(self, key: str) -> bool:
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            try:
                cursor = conn.execute(
                    "SELECT 1 FROM cache_entries WHERE key = ?", (key,)
                )
                return cursor.fetchone() is not None
            finally:
                conn.close()

    def delete(self, key: str) -> bool:
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            try:
                cursor = conn.execute(
                    "DELETE FROM cache_entries WHERE key = ?", (key,)
                )
                conn.commit()
                return cursor.rowcount > 0
            finally:
                conn.close()

    def clear(self) -> int:
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            try:
                cursor = conn.execute("SELECT COUNT(*) FROM cache_entries")
                count = cursor.fetchone()[0]
                conn.execute("DELETE FROM cache_entries")
                conn.commit()
                return count
            finally:
                conn.close()

    def get_total_size(self) -> int:
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            try:
                cursor = conn.execute("SELECT COALESCE(SUM(size_bytes), 0) FROM cache_entries")
                return cursor.fetchone()[0]
            finally:
                conn.close()

    def get_entry_count(self) -> int:
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            try:
                cursor = conn.execute("SELECT COUNT(*) FROM cache_entries")
                return cursor.fetchone()[0]
            finally:
                conn.close()

    def get_all_entries(self) -> dict[str, dict[str, Any]]:
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            try:
                cursor = conn.execute(
                    "SELECT key, size_bytes, created_at, last_access, access_count, category FROM cache_entries"
                )
                entries = {}
                for row in cursor.fetchall():
                    entries[row[0]] = {
                        "size_bytes": row[1],
                        "created_at": row[2],
                        "last_access": row[3],
                        "access_count": row[4],
                        "category": row[5],
                    }
                return entries
            finally:
                conn.close()

    def evict_by_key(self, key: str) -> bool:
        return self.delete(key)

    def evict_oldest(self, count: int = 1) -> list[str]:
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            try:
                cursor = conn.execute(
                    "SELECT key FROM cache_entries ORDER BY last_access ASC LIMIT ?",
                    (count,),
                )
                keys = [row[0] for row in cursor.fetchall()]
                for key in keys:
                    conn.execute("DELETE FROM cache_entries WHERE key = ?", (key,))
                conn.commit()
                return keys
            finally:
                conn.close()

    def get_by_category(self, category: str) -> dict[str, Any]:
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            try:
                cursor = conn.execute(
                    "SELECT key, value FROM cache_entries WHERE category = ?",
                    (category,),
                )
                results = {}
                for row in cursor.fetchall():
                    try:
                        results[row[0]] = json.loads(row[1])
                    except (json.JSONDecodeError, TypeError):
                        results[row[0]] = row[1]
                return results
            finally:
                conn.close()
