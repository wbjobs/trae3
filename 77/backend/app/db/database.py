import sqlite3
import json
import os
import time
import threading
from typing import List, Dict, Any, Optional, Tuple
from contextlib import contextmanager
from pathlib import Path
from collections import OrderedDict
from functools import lru_cache

from ..core.config import settings


class LRUCache:
    def __init__(self, capacity: int = 100, ttl: int = 30):
        self.cache = OrderedDict()
        self.capacity = capacity
        self.ttl = ttl
        self.lock = threading.Lock()

    def get(self, key: str) -> Optional[Any]:
        with self.lock:
            if key in self.cache:
                value, timestamp = self.cache[key]
                if time.time() - timestamp < self.ttl:
                    self.cache.move_to_end(key)
                    return value
                else:
                    del self.cache[key]
            return None

    def put(self, key: str, value: Any) -> None:
        with self.lock:
            if key in self.cache:
                self.cache.move_to_end(key)
            self.cache[key] = (value, time.time())
            if len(self.cache) > self.capacity:
                self.cache.popitem(last=False)

    def clear(self) -> None:
        with self.lock:
            self.cache.clear()


INIT_SQL = """
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000;
PRAGMA temp_store = MEMORY;
PRAGMA mmap_size = 30000000000;

CREATE TABLE IF NOT EXISTS metric_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    metric TEXT NOT NULL,
    value REAL NOT NULL,
    source TEXT NOT NULL,
    tags TEXT,
    is_anomaly INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_metric_data_time ON metric_data(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metric_data_metric ON metric_data(metric, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metric_data_source ON metric_data(source, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metric_data_anomaly ON metric_data(is_anomaly, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metric_data_composite ON metric_data(metric, source, timestamp DESC);

CREATE TABLE IF NOT EXISTS alert_event (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    metric TEXT NOT NULL,
    source TEXT NOT NULL,
    level TEXT NOT NULL,
    alert_type TEXT NOT NULL,
    value REAL NOT NULL,
    threshold REAL NOT NULL,
    duration REAL,
    description TEXT,
    acknowledged INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_alert_time ON alert_event(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alert_level ON alert_event(level, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alert_metric ON alert_event(metric, timestamp DESC);

CREATE TABLE IF NOT EXISTS metric_def (
    name TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    unit TEXT,
    warn_threshold REAL,
    crit_threshold REAL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS data_source (
    name TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'active'
);
"""

SEED_DATA = [
    (
        'cpu_usage', 'CPU使用率', '%', 80, 95, '服务器CPU使用率'
    ),
    (
        'memory_usage', '内存使用率', '%', 85, 95, '服务器内存使用率'
    ),
    (
        'disk_io', '磁盘IO', 'MB/s', 100, 200, '磁盘读写速率'
    ),
    (
        'network_latency', '网络延迟', 'ms', 100, 300, '网络响应延迟'
    ),
    (
        'temperature', '温度', '°C', 70, 85, '设备温度'
    ),
    (
        'error_rate', '错误率', '%', 5, 15, '请求错误率'
    ),
]

SEED_SOURCES = [
    ('server_01', '应用服务器-01', 'server', 'active'),
    ('server_02', '应用服务器-02', 'server', 'active'),
    ('db_01', '数据库服务器', 'database', 'active'),
    ('gateway_01', '网关设备', 'network', 'active'),
]

QUERY_TIMEOUT = 30.0


class Database:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._init_db()
        return cls._instance

    def _init_db(self):
        db_path = settings.DATABASE_URL.replace("sqlite:///", "")
        db_dir = os.path.dirname(db_path)
        if db_dir and not os.path.exists(db_dir):
            Path(db_dir).mkdir(parents=True, exist_ok=True)

        self.db_path = db_path
        self.local = threading.local()
        self.query_cache = LRUCache(capacity=200, ttl=15)
        self.lock = threading.Lock()
        self._execute(INIT_SQL)
        self._seed_data()

    @contextmanager
    def _get_conn(self):
        conn = sqlite3.connect(
            self.db_path,
            check_same_thread=False,
            timeout=QUERY_TIMEOUT,
            isolation_level=None
        )
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = OFF")
        conn.execute("PRAGMA cache_size = -128000")
        conn.execute("PRAGMA temp_store = MEMORY")
        conn.execute("PRAGMA mmap_size = 30000000000")
        conn.execute("PRAGMA busy_timeout = 30000")
        conn.execute("PRAGMA journal_size_limit = 100000000")
        try:
            yield conn
        finally:
            conn.close()

    def _execute(self, sql: str, params: Optional[Tuple] = None) -> int:
        with self._get_conn() as conn:
            cursor = conn.cursor()
            if params:
                cursor.execute(sql, params)
            else:
                cursor.executescript(sql)
            return cursor.lastrowid

    def _query(self, sql: str, params: Optional[Tuple] = None, use_cache: bool = True) -> List[Dict[str, Any]]:
        cache_key = None
        if use_cache and params is not None:
            cache_key = f"{sql}:{params}"
            cached = self.query_cache.get(cache_key)
            if cached is not None:
                return cached

        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(sql, params or ())
            rows = cursor.fetchall()
            result = [dict(row) for row in rows]

        if use_cache and cache_key:
            self.query_cache.put(cache_key, result)

        return result

    def _seed_data(self):
        for row in SEED_DATA:
            self._execute(
                "INSERT OR IGNORE INTO metric_def (name, display_name, unit, warn_threshold, crit_threshold, description) VALUES (?, ?, ?, ?, ?, ?)",
                row
            )
        for row in SEED_SOURCES:
            self._execute(
                "INSERT OR IGNORE INTO data_source (name, display_name, type, status) VALUES (?, ?, ?, ?)",
                row
            )

    def insert_metric_data(self, timestamp: int, metric: str, value: float,
                           source: str, tags: Optional[Dict] = None,
                           is_anomaly: int = 0) -> int:
        tags_json = json.dumps(tags) if tags else None
        return self._execute(
            "INSERT INTO metric_data (timestamp, metric, value, source, tags, is_anomaly) VALUES (?, ?, ?, ?, ?, ?)",
            (timestamp, metric, value, source, tags_json, is_anomaly)
        )

    def insert_metric_batch(self, data: List[Dict]) -> None:
        with self._get_conn() as conn:
            cursor = conn.cursor()
            try:
                for item in data:
                    tags_json = json.dumps(item.get("tags")) if item.get("tags") else None
                    cursor.execute(
                        "INSERT INTO metric_data (timestamp, metric, value, source, tags, is_anomaly) VALUES (?, ?, ?, ?, ?, ?)",
                        (item["timestamp"], item["metric"], item["value"],
                         item["source"], tags_json, item.get("is_anomaly", 0))
                    )
                conn.commit()
            except Exception:
                conn.rollback()
                raise
        self.query_cache.clear()

    def insert_alert(self, alert: Dict) -> str:
        self.query_cache.clear()
        return self._execute(
            """INSERT INTO alert_event (id, timestamp, metric, source, level, alert_type,
               value, threshold, duration, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (alert["id"], alert["timestamp"], alert["metric"], alert["source"],
             alert["level"], alert["alert_type"], alert["value"],
             alert["threshold"], alert.get("duration"), alert.get("description"))
        )

    def query_metric_data(self, start_time: int, end_time: int,
                          metrics: Optional[List[str]] = None,
                          sources: Optional[List[str]] = None,
                          only_anomalies: bool = False,
                          limit: int = 10000) -> List[Dict]:
        sql_parts = [
            "SELECT timestamp, metric, value, source, tags, is_anomaly",
            "FROM metric_data",
            "WHERE timestamp >= ? AND timestamp <= ?"
        ]
        params: List[Any] = [start_time, end_time]

        if metrics:
            placeholders = ",".join(["?"] * len(metrics))
            sql_parts.append(f" AND metric IN ({placeholders})")
            params.extend(metrics)

        if sources:
            placeholders = ",".join(["?"] * len(sources))
            sql_parts.append(f" AND source IN ({placeholders})")
            params.extend(sources)

        if only_anomalies:
            sql_parts.append(" AND is_anomaly = 1")

        sql_parts.append(" ORDER BY timestamp DESC LIMIT ?")
        params.append(limit)

        sql = " ".join(sql_parts)
        rows = self._query(sql, tuple(params), use_cache=True)

        for row in rows:
            if row.get("tags") and isinstance(row["tags"], str):
                row["tags"] = json.loads(row["tags"])
        return rows

    def query_aggregated_data(self, start_time: int, end_time: int,
                              metric: str, aggregation: str = "1m",
                              source: Optional[str] = None) -> List[Dict]:
        agg_ms = {
            "raw": 1,
            "1m": 60 * 1000,
            "5m": 5 * 60 * 1000,
            "15m": 15 * 60 * 1000,
            "1h": 60 * 60 * 1000,
        }.get(aggregation, 60 * 1000)

        if agg_ms == 1:
            sql_parts = [
                "SELECT",
                "    timestamp AS time_bucket,",
                "    1 as count,",
                "    value as min_val,",
                "    value as max_val,",
                "    value as avg_val,",
                "    is_anomaly as anomaly_count",
                "FROM metric_data",
                "WHERE timestamp >= ? AND timestamp <= ? AND metric = ?"
            ]
            params: List[Any] = [start_time, end_time, metric]
            if source:
                sql_parts.append(" AND source = ?")
                params.append(source)
            sql_parts.append(" ORDER BY timestamp ASC LIMIT 5000")
            return self._query(" ".join(sql_parts), tuple(params), use_cache=True)

        sql = """
            SELECT
                (timestamp / ?) * ? AS time_bucket,
                COUNT(*) as count,
                MIN(value) as min_val,
                MAX(value) as max_val,
                AVG(value) as avg_val,
                SUM(is_anomaly) as anomaly_count
            FROM metric_data
            WHERE timestamp >= ? AND timestamp <= ? AND metric = ?
        """
        params: List[Any] = [agg_ms, agg_ms, start_time, end_time, metric]

        if source:
            sql += " AND source = ?"
            params.append(source)

        sql += " GROUP BY time_bucket ORDER BY time_bucket ASC LIMIT 2000"
        return self._query(sql, tuple(params), use_cache=True)

    def get_metric_definitions(self) -> List[Dict]:
        return self._query("SELECT * FROM metric_def ORDER BY name", use_cache=True)

    def get_data_sources(self) -> List[Dict]:
        return self._query("SELECT * FROM data_source ORDER BY name", use_cache=True)

    def get_metric_definition(self, name: str) -> Optional[Dict]:
        rows = self._query("SELECT * FROM metric_def WHERE name = ?", (name,), use_cache=True)
        return rows[0] if rows else None

    def get_latest_data(self, metric: Optional[str] = None,
                        source: Optional[str] = None,
                        limit: int = 100) -> List[Dict]:
        sql_parts = [
            "SELECT timestamp, metric, value, source, tags, is_anomaly",
            "FROM metric_data",
            "WHERE 1=1"
        ]
        params: List[Any] = []

        if metric:
            sql_parts.append(" AND metric = ?")
            params.append(metric)

        if source:
            sql_parts.append(" AND source = ?")
            params.append(source)

        sql_parts.append(" ORDER BY timestamp DESC LIMIT ?")
        params.append(limit)

        sql = " ".join(sql_parts)
        rows = self._query(sql, tuple(params), use_cache=False)

        for row in rows:
            if row.get("tags") and isinstance(row["tags"], str):
                row["tags"] = json.loads(row["tags"])
        return rows

    def query_alerts(self, start_time: Optional[int] = None,
                     end_time: Optional[int] = None,
                     level: Optional[str] = None,
                     limit: int = 100) -> List[Dict]:
        sql = "SELECT * FROM alert_event WHERE 1=1"
        params: List[Any] = []

        if start_time:
            sql += " AND timestamp >= ?"
            params.append(start_time)

        if end_time:
            sql += " AND timestamp <= ?"
            params.append(end_time)

        if level:
            sql += " AND level = ?"
            params.append(level)

        sql += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)

        return self._query(sql, tuple(params), use_cache=True)

    def get_alert_stats(self, start_time: Optional[int] = None,
                        end_time: Optional[int] = None) -> Dict:
        sql = "SELECT level, COUNT(*) as count FROM alert_event WHERE 1=1"
        params: List[Any] = []
        where_clauses = []

        if start_time:
            where_clauses.append("timestamp >= ?")
            params.append(start_time)

        if end_time:
            where_clauses.append("timestamp <= ?")
            params.append(end_time)

        if where_clauses:
            sql += " AND " + " AND ".join(where_clauses)

        sql += " GROUP BY level"
        rows = self._query(sql, tuple(params) if params else (), use_cache=True)

        metric_sql = "SELECT metric, COUNT(*) as count FROM alert_event"
        if where_clauses:
            metric_sql += " WHERE " + " AND ".join(where_clauses)
        metric_sql += " GROUP BY metric ORDER BY count DESC LIMIT 5"
        top_metrics = self._query(metric_sql, tuple(params) if params else (), use_cache=True)

        return {
            "by_level": {row["level"]: row["count"] for row in rows},
            "total": sum(row["count"] for row in rows),
            "top_metrics": top_metrics
        }

    def get_metric_stats(self, start_time: int, end_time: int,
                         metric: str, source: Optional[str] = None) -> Optional[Dict]:
        sql = """
            SELECT
                COUNT(*) as count,
                MIN(value) as min_val,
                MAX(value) as max_val,
                AVG(value) as avg_val,
                SUM(is_anomaly) as anomaly_count
            FROM metric_data
            WHERE timestamp >= ? AND timestamp <= ? AND metric = ?
        """
        params: List[Any] = [start_time, end_time, metric]

        if source:
            sql += " AND source = ?"
            params.append(source)

        rows = self._query(sql, tuple(params), use_cache=True)
        if not rows or rows[0]["count"] == 0:
            return None

        stats = rows[0]
        count = stats["count"]

        if count <= 10000:
            values_sql = "SELECT value FROM metric_data WHERE timestamp >= ? AND timestamp <= ? AND metric = ?"
            value_params = [start_time, end_time, metric]
            if source:
                values_sql += " AND source = ?"
                value_params.append(source)
            values_sql += " ORDER BY value"
            value_rows = self._query(values_sql, tuple(value_params), use_cache=True)
            values = [r["value"] for r in value_rows]

            def percentile(data: List[float], p: float) -> float:
                if not data:
                    return 0.0
                n = len(data)
                k = (n - 1) * p
                f = int(k)
                c = min(f + 1, n - 1)
                if f == c:
                    return data[f]
                return data[f] + (data[c] - data[f]) * (k - f)

            p50 = percentile(values, 0.5)
            p95 = percentile(values, 0.95)
            p99 = percentile(values, 0.99)
        else:
            sample_sql = """
                SELECT value FROM metric_data
                WHERE timestamp >= ? AND timestamp <= ? AND metric = ?
            """
            sample_params = [start_time, end_time, metric]
            if source:
                sample_sql += " AND source = ?"
                sample_params.append(source)
            sample_sql += " ORDER BY ABS(random()) LIMIT 10000"
            sample_rows = self._query(sample_sql, tuple(sample_params), use_cache=True)
            sample_values = sorted([r["value"] for r in sample_rows])

            def percentile(data: List[float], p: float) -> float:
                if not data:
                    return 0.0
                n = len(data)
                k = (n - 1) * p
                f = int(k)
                c = min(f + 1, n - 1)
                if f == c:
                    return data[f]
                return data[f] + (data[c] - data[f]) * (k - f)

            p50 = percentile(sample_values, 0.5)
            p95 = percentile(sample_values, 0.95)
            p99 = percentile(sample_values, 0.99)

        return {
            "metric": metric,
            "source": source,
            "count": stats["count"],
            "min": stats["min_val"],
            "max": stats["max_val"],
            "avg": stats["avg_val"],
            "p50": p50,
            "p95": p95,
            "p99": p99,
            "anomaly_count": stats["anomaly_count"]
        }


db = Database()
