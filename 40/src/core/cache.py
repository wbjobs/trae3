import time
import threading
import hashlib
import sqlite3
import json
from typing import Any, Callable, Dict, List, Optional, Generic, TypeVar
from dataclasses import dataclass, field
from collections import OrderedDict
from pathlib import Path
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

K = TypeVar('K')
V = TypeVar('V')


@dataclass
class CacheEntry(Generic[V]):
    value: V
    expires_at: float
    created_at: float
    access_count: int = 0


class LRUCache(Generic[K, V]):
    def __init__(self, max_size: int = 1000, ttl_seconds: int = 300):
        self.max_size = max_size
        self.ttl_seconds = ttl_seconds
        self._cache: OrderedDict[K, CacheEntry[V]] = OrderedDict()
        self._lock = threading.RLock()
    
    def get(self, key: K) -> Optional[V]:
        with self._lock:
            if key not in self._cache:
                return None
            
            entry = self._cache[key]
            
            if time.time() > entry.expires_at:
                del self._cache[key]
                return None
            
            entry.access_count += 1
            self._cache.move_to_end(key)
            return entry.value
    
    def put(self, key: K, value: V, ttl_seconds: Optional[int] = None):
        with self._lock:
            if key in self._cache:
                del self._cache[key]
            
            if len(self._cache) >= self.max_size:
                self._evict_lru()
            
            ttl = ttl_seconds or self.ttl_seconds
            self._cache[key] = CacheEntry(
                value=value,
                expires_at=time.time() + ttl,
                created_at=time.time()
            )
    
    def _evict_lru(self):
        if self._cache:
            self._cache.popitem(last=False)
    
    def invalidate(self, key: K):
        with self._lock:
            if key in self._cache:
                del self._cache[key]
    
    def clear(self):
        with self._lock:
            self._cache.clear()
    
    def size(self) -> int:
        with self._lock:
            return len(self._cache)
    
    def cleanup_expired(self) -> int:
        with self._lock:
            now = time.time()
            expired_keys = [
                key for key, entry in self._cache.items()
                if now > entry.expires_at
            ]
            for key in expired_keys:
                del self._cache[key]
            return len(expired_keys)


class ConfigCache:
    def __init__(self, cache_dir: str = "./cache"):
        self.memory_cache = LRUCache[str, Any](max_size=1000, ttl_seconds=300)
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.cache_dir / "config_cache.db"
        self._init_db()
        self._lock = threading.RLock()
    
    def _init_db(self):
        conn = sqlite3.connect(str(self.db_path))
        conn.execute("""
            CREATE TABLE IF NOT EXISTS config_cache (
                key TEXT PRIMARY KEY,
                value TEXT,
                created_at REAL,
                expires_at REAL,
                access_count INTEGER DEFAULT 0
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_expires ON config_cache(expires_at)
        """)
        conn.commit()
        conn.close()
    
    def _get_cache_key(self, cluster: str, data_id: str, group: str, namespace: str) -> str:
        raw_key = f"{cluster}:{namespace}:{group}:{data_id}"
        return hashlib.md5(raw_key.encode()).hexdigest()
    
    def get(self, cluster: str, data_id: str, group: str = "DEFAULT_GROUP", namespace: str = "public") -> Optional[Dict[str, Any]]:
        cache_key = self._get_cache_key(cluster, data_id, group, namespace)
        
        value = self.memory_cache.get(cache_key)
        if value is not None:
            logger.debug(f"内存缓存命中: {data_id}")
            return value
        
        with self._lock:
            conn = sqlite3.connect(str(self.db_path))
            cursor = conn.execute(
                "SELECT value FROM config_cache WHERE key = ? AND expires_at > ?",
                (cache_key, time.time())
            )
            row = cursor.fetchone()
            conn.close()
            
            if row:
                value = json.loads(row[0])
                self.memory_cache.put(cache_key, value)
                logger.debug(f"磁盘缓存命中: {data_id}")
                return value
        
        return None
    
    def put(
        self,
        cluster: str,
        data_id: str,
        group: str = "DEFAULT_GROUP",
        namespace: str = "public",
        value: Any = None,
        ttl_seconds: int = 300
    ):
        cache_key = self._get_cache_key(cluster, data_id, group, namespace)
        
        self.memory_cache.put(cache_key, value, ttl_seconds)
        
        with self._lock:
            conn = sqlite3.connect(str(self.db_path))
            conn.execute(
                """
                REPLACE INTO config_cache (key, value, created_at, expires_at, access_count)
                VALUES (?, ?, ?, ?, 0)
                """,
                (
                    cache_key,
                    json.dumps(value, ensure_ascii=False),
                    time.time(),
                    time.time() + ttl_seconds
                )
            )
            conn.commit()
            conn.close()
        
        logger.debug(f"缓存已更新: {data_id}")
    
    def invalidate(
        self,
        cluster: str,
        data_id: str,
        group: str = "DEFAULT_GROUP",
        namespace: str = "public"
    ):
        cache_key = self._get_cache_key(cluster, data_id, group, namespace)
        self.memory_cache.invalidate(cache_key)
        
        with self._lock:
            conn = sqlite3.connect(str(self.db_path))
            conn.execute("DELETE FROM config_cache WHERE key = ?", (cache_key,))
            conn.commit()
            conn.close()
    
    def invalidate_cluster(self, cluster: str):
        self.memory_cache.clear()
        
        with self._lock:
            conn = sqlite3.connect(str(self.db_path))
            conn.execute("DELETE FROM config_cache")
            conn.commit()
            conn.close()
    
    def cleanup_expired(self) -> int:
        memory_count = self.memory_cache.cleanup_expired()
        
        with self._lock:
            conn = sqlite3.connect(str(self.db_path))
            cursor = conn.execute(
                "DELETE FROM config_cache WHERE expires_at < ?",
                (time.time(),)
            )
            disk_count = cursor.rowcount
            conn.commit()
            conn.close()
        
        return memory_count + disk_count
    
    def get_stats(self) -> Dict[str, Any]:
        with self._lock:
            conn = sqlite3.connect(str(self.db_path))
            cursor = conn.execute("SELECT COUNT(*) FROM config_cache")
            disk_count = cursor.fetchone()[0]
            conn.close()
        
        return {
            "memory_cache_size": self.memory_cache.size(),
            "disk_cache_count": disk_count
        }


class ConfigDBClient:
    def __init__(self, db_path: str = "./config_db.sqlite"):
        self.db_path = Path(db_path)
        self._lock = threading.RLock()
        self._init_db()
    
    def _init_db(self):
        conn = sqlite3.connect(str(self.db_path))
        conn.execute("""
            CREATE TABLE IF NOT EXISTS configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cluster TEXT NOT NULL,
                namespace TEXT NOT NULL,
                group_name TEXT NOT NULL,
                data_id TEXT NOT NULL,
                content TEXT,
                config_type TEXT DEFAULT 'yaml',
                version INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(cluster, namespace, group_name, data_id, version)
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_config_lookup ON configs(cluster, namespace, group_name, data_id)
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS config_audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                operation TEXT NOT NULL,
                cluster TEXT NOT NULL,
                namespace TEXT NOT NULL,
                group_name TEXT NOT NULL,
                data_id TEXT NOT NULL,
                old_content TEXT,
                new_content TEXT,
                operator TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
        conn.close()
    
    def save_config(
        self,
        cluster: str,
        namespace: str,
        group_name: str,
        data_id: str,
        content: str,
        config_type: str = "yaml",
        operator: str = "system"
    ) -> int:
        with self._lock:
            conn = sqlite3.connect(str(self.db_path))
            
            cursor = conn.execute(
                "SELECT MAX(version) FROM configs WHERE cluster=? AND namespace=? AND group_name=? AND data_id=?",
                (cluster, namespace, group_name, data_id)
            )
            row = cursor.fetchone()
            new_version = (row[0] or 0) + 1 if row[0] else 1
            
            conn.execute(
                """
                INSERT INTO configs 
                (cluster, namespace, group_name, data_id, content, config_type, version)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (cluster, namespace, group_name, data_id, content, config_type, new_version)
            )
            
            conn.execute(
                """
                INSERT INTO config_audit_logs 
                (operation, cluster, namespace, group_name, data_id, new_content, operator)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                ("CREATE", cluster, namespace, group_name, data_id, content, operator)
            )
            
            conn.commit()
            conn.close()
        
        return new_version
    
    def get_config(
        self,
        cluster: str,
        namespace: str,
        group_name: str,
        data_id: str,
        version: Optional[int] = None
    ) -> Optional[Dict[str, Any]]:
        with self._lock:
            conn = sqlite3.connect(str(self.db_path))
            
            if version:
                cursor = conn.execute(
                    """
                        SELECT content, config_type, version, created_at
                        FROM configs
                        WHERE cluster=? AND namespace=? AND group_name=? AND data_id=? AND version=?
                    """,
                    (cluster, namespace, group_name, data_id, version)
                )
            else:
                cursor = conn.execute(
                    """
                        SELECT content, config_type, version, created_at
                        FROM configs
                        WHERE cluster=? AND namespace=? AND group_name=? AND data_id=?
                        ORDER BY version DESC LIMIT 1
                    """,
                    (cluster, namespace, group_name, data_id)
                )
            
            row = cursor.fetchone()
            conn.close()
            
            if row:
                return {
                    "content": row[0],
                    "type": row[1],
                    "version": row[2],
                    "created_at": row[3]
                }
            return None
    
    def list_configs(
        self,
        cluster: str,
        namespace: Optional[str] = None,
        group_name: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        with self._lock:
            conn = sqlite3.connect(str(self.db_path))
            
            query = """
                SELECT DISTINCT c1.cluster, c1.namespace, c1.group_name, c1.data_id, c1.config_type, c1.version, c1.updated_at
                FROM configs c1
                INNER JOIN (
                    SELECT cluster, namespace, group_name, data_id, MAX(version) as max_ver
                    FROM configs
                    GROUP BY cluster, namespace, group_name, data_id
                ) c2 ON c1.cluster = c2.cluster 
                    AND c1.namespace = c2.namespace 
                    AND c1.group_name = c2.group_name 
                    AND c1.data_id = c2.data_id 
                    AND c1.version = c2.max_ver
                WHERE c1.cluster = ?
            """
            params = [cluster]
            
            if namespace:
                query += " AND c1.namespace = ?"
                params.append(namespace)
            
            if group_name:
                query += " AND c1.group_name = ?"
                params.append(group_name)
            
            cursor = conn.execute(query, params)
            rows = cursor.fetchall()
            conn.close()
            
            return [
                {
                    "cluster": row[0],
                    "namespace": row[1],
                    "group": row[2],
                    "data_id": row[3],
                    "type": row[4],
                    "version": row[5],
                    "updated_at": row[6]
                }
                for row in rows
            ]
    
    def get_history(
        self,
        cluster: str,
        namespace: str,
        group_name: str,
        data_id: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        with self._lock:
            conn = sqlite3.connect(str(self.db_path))
            cursor = conn.execute(
                """
                SELECT version, content, created_at
                FROM configs
                WHERE cluster=? AND namespace=? AND group_name=? AND data_id=?
                ORDER BY version DESC LIMIT ?
                """,
                (cluster, namespace, group_name, data_id, limit)
            )
            rows = cursor.fetchall()
            conn.close()
            
            return [
                {
                    "version": row[0],
                    "content": row[1],
                    "created_at": row[2]
                }
                for row in rows
            ]
    
    def get_audit_logs(
        self,
        cluster: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        with self._lock:
            conn = sqlite3.connect(str(self.db_path))
            
            query = """
                SELECT id, operation, cluster, namespace, group_name, data_id, operator, created_at
                FROM config_audit_logs
            """
            params = []
            
            if cluster:
                query += " WHERE cluster = ?"
                params.append(cluster)
            
            query += " ORDER BY id DESC LIMIT ?"
            params.append(limit)
            
            cursor = conn.execute(query, params)
            rows = cursor.fetchall()
            conn.close()
            
            return [
                {
                    "id": row[0],
                    "operation": row[1],
                    "cluster": row[2],
                    "namespace": row[3],
                    "group": row[4],
                    "data_id": row[5],
                    "operator": row[6],
                    "created_at": row[7]
                }
                for row in rows
            ]
