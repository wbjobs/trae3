import time
import os
import shutil
import sqlite3
import asyncio
from typing import Dict, Optional, Tuple
from pathlib import Path
from datetime import datetime, timedelta

from ..core.config import settings
from ..db.database import db


class DataArchiver:
    def __init__(self):
        self.hot_threshold_hours = 24
        self.warm_threshold_days = 7
        self.archive_dir = Path("data/archive")
        self.archive_dir.mkdir(parents=True, exist_ok=True)
        self.last_archived_at = 0
        self._lock = asyncio.Lock()

        self._init_archive_db()

    def _init_archive_db(self):
        warm_db = self.archive_dir / "warm_data.db"
        cold_db = self.archive_dir / "cold_data.db"

        for db_path in [warm_db, cold_db]:
            if not db_path.exists():
                conn = sqlite3.connect(db_path)
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS metric_data (
                        id INTEGER PRIMARY KEY,
                        timestamp INTEGER NOT NULL,
                        metric TEXT NOT NULL,
                        value REAL NOT NULL,
                        source TEXT NOT NULL,
                        tags TEXT,
                        is_anomaly INTEGER DEFAULT 0,
                        created_at INTEGER
                    )
                """)
                conn.execute("CREATE INDEX IF NOT EXISTS idx_archive_time ON metric_data(timestamp DESC)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_archive_metric ON metric_data(metric, timestamp DESC)")
                conn.execute("PRAGMA journal_mode = WAL")
                conn.execute("PRAGMA synchronous = OFF")
                conn.commit()
                conn.close()

    def _get_time_bounds(self) -> Tuple[int, int]:
        now = int(time.time() * 1000)
        hot_cutoff = now - self.hot_threshold_hours * 3600 * 1000
        warm_cutoff = now - self.warm_threshold_days * 24 * 3600 * 1000
        return hot_cutoff, warm_cutoff

    def _get_archive_db_path(self, tier: str) -> Path:
        if tier == "warm":
            return self.archive_dir / "warm_data.db"
        elif tier == "cold":
            return self.archive_dir / "cold_data.db"
        raise ValueError(f"Invalid tier: {tier}")

    def _get_connection(self, tier: str) -> sqlite3.Connection:
        db_path = self._get_archive_db_path(tier)
        conn = sqlite3.connect(db_path, isolation_level=None)
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = OFF")
        conn.execute("PRAGMA cache_size = -32000")
        conn.row_factory = sqlite3.Row
        return conn

    async def archive_data(self) -> Dict:
        async with self._lock:
            hot_cutoff, warm_cutoff = self._get_time_bounds()

            hot_to_warm_count = await self._move_hot_to_warm(hot_cutoff)
            warm_to_cold_count = await self._move_warm_to_cold(warm_cutoff)
            purged_count = await self._purge_old_cold_data()

            self.last_archived_at = int(time.time() * 1000)

            stats = await self.get_archive_stats()
            stats.update({
                "hot_to_warm_count": hot_to_warm_count,
                "warm_to_cold_count": warm_to_cold_count,
                "purged_count": purged_count,
                "last_archived_at": self.last_archived_at
            })

            return stats

    async def _move_hot_to_warm(self, cutoff: int) -> int:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._move_hot_to_warm_sync, cutoff)

    def _move_hot_to_warm_sync(self, cutoff: int) -> int:
        moved = 0
        try:
            with db._get_conn() as hot_conn:
                hot_conn.row_factory = sqlite3.Row
                rows = hot_conn.execute("""
                    SELECT id, timestamp, metric, value, source, tags, is_anomaly, created_at
                    FROM metric_data
                    WHERE timestamp < ? AND timestamp >= ?
                    ORDER BY timestamp DESC
                    LIMIT 50000
                """, (cutoff, cutoff - self.warm_threshold_days * 24 * 3600 * 1000)).fetchall()

                if not rows:
                    return 0

                warm_conn = self._get_connection("warm")
                try:
                    warm_conn.execute("BEGIN")
                    for row in rows:
                        warm_conn.execute("""
                            INSERT OR IGNORE INTO metric_data
                            (id, timestamp, metric, value, source, tags, is_anomaly, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            row["id"], row["timestamp"], row["metric"], row["value"],
                            row["source"], row["tags"], row["is_anomaly"], row["created_at"]
                        ))
                    warm_conn.execute("COMMIT")
                    moved = len(rows)

                    hot_conn.execute("BEGIN")
                    ids = [row["id"] for row in rows]
                    placeholders = ",".join(["?"] * len(ids))
                    hot_conn.execute(f"DELETE FROM metric_data WHERE id IN ({placeholders})", ids)
                    hot_conn.execute("COMMIT")
                finally:
                    warm_conn.close()
        except Exception as e:
            print(f"Error moving hot to warm: {e}")

        return moved

    async def _move_warm_to_cold(self, cutoff: int) -> int:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._move_warm_to_cold_sync, cutoff)

    def _move_warm_to_cold_sync(self, cutoff: int) -> int:
        moved = 0
        try:
            warm_conn = self._get_connection("warm")
            try:
                rows = warm_conn.execute("""
                    SELECT id, timestamp, metric, value, source, tags, is_anomaly, created_at
                    FROM metric_data
                    WHERE timestamp < ?
                    ORDER BY timestamp DESC
                    LIMIT 50000
                """, (cutoff,)).fetchall()

                if not rows:
                    return 0

                cold_conn = self._get_connection("cold")
                try:
                    cold_conn.execute("BEGIN")
                    for row in rows:
                        cold_conn.execute("""
                            INSERT OR IGNORE INTO metric_data
                            (id, timestamp, metric, value, source, tags, is_anomaly, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            row["id"], row["timestamp"], row["metric"], row["value"],
                            row["source"], row["tags"], row["is_anomaly"], row["created_at"]
                        ))
                    cold_conn.execute("COMMIT")
                    moved = len(rows)

                    warm_conn.execute("BEGIN")
                    ids = [row["id"] for row in rows]
                    placeholders = ",".join(["?"] * len(ids))
                    warm_conn.execute(f"DELETE FROM metric_data WHERE id IN ({placeholders})", ids)
                    warm_conn.execute("COMMIT")
                finally:
                    cold_conn.close()
            finally:
                warm_conn.close()
        except Exception as e:
            print(f"Error moving warm to cold: {e}")

        return moved

    async def _purge_old_cold_data(self) -> int:
        cutoff = int(time.time() * 1000) - 90 * 24 * 3600 * 1000
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._purge_old_cold_sync, cutoff)

    def _purge_old_cold_sync(self, cutoff: int) -> int:
        purged = 0
        try:
            cold_conn = self._get_connection("cold")
            try:
                cursor = cold_conn.execute("DELETE FROM metric_data WHERE timestamp < ?", (cutoff,))
                purged = cursor.rowcount
            finally:
                cold_conn.close()
        except Exception as e:
            print(f"Error purging cold data: {e}")

        return purged

    async def get_archive_stats(self) -> Dict:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._get_archive_stats_sync)

    def _get_archive_stats_sync(self) -> Dict:
        stats = {
            "hot_data_count": 0,
            "warm_data_count": 0,
            "cold_data_count": 0,
            "total_size_mb": 0,
            "last_archived_at": self.last_archived_at
        }

        try:
            with db._get_conn() as conn:
                result = conn.execute("SELECT COUNT(*) as cnt FROM metric_data").fetchone()
                stats["hot_data_count"] = result["cnt"] if result else 0

            for tier in ["warm", "cold"]:
                conn = self._get_connection(tier)
                try:
                    result = conn.execute("SELECT COUNT(*) as cnt FROM metric_data").fetchone()
                    stats[f"{tier}_data_count"] = result["cnt"] if result else 0
                finally:
                    conn.close()

            total_size = 0
            main_db = Path("data/monitoring.db")
            if main_db.exists():
                total_size += main_db.stat().st_size

            for tier in ["warm", "cold"]:
                db_path = self._get_archive_db_path(tier)
                if db_path.exists():
                    total_size += db_path.stat().st_size

            stats["total_size_mb"] = total_size / (1024 * 1024)
        except Exception as e:
            print(f"Error getting archive stats: {e}")

        return stats

    def query_archive_data(self, tier: str, start_time: int, end_time: int,
                           metrics: Optional[list] = None,
                           sources: Optional[list] = None,
                           limit: int = 5000) -> list:
        if tier == "hot":
            return db.query_metric_data(start_time, end_time, metrics, sources, limit=limit)

        conn = self._get_connection(tier)
        try:
            sql_parts = [
                "SELECT timestamp, metric, value, source, tags, is_anomaly",
                "FROM metric_data",
                "WHERE timestamp >= ? AND timestamp <= ?"
            ]
            params = [start_time, end_time]

            if metrics:
                placeholders = ",".join(["?"] * len(metrics))
                sql_parts.append(f" AND metric IN ({placeholders})")
                params.extend(metrics)

            if sources:
                placeholders = ",".join(["?"] * len(sources))
                sql_parts.append(f" AND source IN ({placeholders})")
                params.extend(sources)

            sql_parts.append(" ORDER BY timestamp DESC LIMIT ?")
            params.append(limit)

            sql = " ".join(sql_parts)
            rows = conn.execute(sql, params).fetchall()

            result = []
            import json
            for row in rows:
                row_dict = dict(row)
                if row_dict.get("tags") and isinstance(row_dict["tags"], str):
                    row_dict["tags"] = json.loads(row_dict["tags"])
                result.append(row_dict)

            return result
        finally:
            conn.close()

    def query_archive_aggregated(self, tier: str, start_time: int, end_time: int,
                                 metric: str, aggregation: str = "5m") -> list:
        if tier == "hot":
            return db.query_aggregated_data(start_time, end_time, metric, aggregation)

        agg_ms = {
            "1m": 60 * 1000,
            "5m": 5 * 60 * 1000,
            "15m": 15 * 60 * 1000,
            "1h": 60 * 60 * 1000,
        }.get(aggregation, 5 * 60 * 1000)

        conn = self._get_connection(tier)
        try:
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
                GROUP BY time_bucket ORDER BY time_bucket ASC LIMIT 2000
            """
            rows = conn.execute(sql, (agg_ms, agg_ms, start_time, end_time, metric)).fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()


data_archiver = DataArchiver()
