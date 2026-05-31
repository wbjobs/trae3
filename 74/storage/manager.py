import asyncio
import hashlib
import json
import logging
import time
from typing import Dict, List, Optional, Any
from contextlib import contextmanager

from common.models import SedimentResult

logger = logging.getLogger(__name__)


class PartitionStrategy:
    TIME_PARTITION = "time"
    RIVER_REACH_PARTITION = "river_reach"
    MODEL_PARTITION = "model"

    @staticmethod
    def get_time_partition_key(timestamp: float, interval: str = "daily") -> str:
        dt = time.localtime(timestamp)
        if interval == "yearly":
            return f"y{dt.tm_year}"
        elif interval == "monthly":
            return f"y{dt.tm_year}m{dt.tm_mon:02d}"
        elif interval == "hourly":
            return f"y{dt.tm_year}m{dt.tm_mon:02d}d{dt.tm_mday:02d}h{dt.tm_hour:02d}"
        else:
            return f"y{dt.tm_year}m{dt.tm_mon:02d}d{dt.tm_mday:02d}"

    @staticmethod
    def get_river_reach_partition_key(reach_name: str) -> str:
        return f"reach_{reach_name.lower().replace(' ', '_')}"

    @staticmethod
    def get_model_partition_key(model_name: str) -> str:
        return f"model_{model_name.lower().replace(' ', '_')}"

    @staticmethod
    def get_partition_key(result_dict: dict, strategy: str = "time") -> str:
        if strategy == PartitionStrategy.TIME_PARTITION:
            ts = result_dict.get("computed_at", time.time())
            return PartitionStrategy.get_time_partition_key(ts)
        elif strategy == PartitionStrategy.RIVER_REACH_PARTITION:
            params = result_dict.get("parameters", {})
            reach = params.get("river_reach", "unknown")
            return PartitionStrategy.get_river_reach_partition_key(reach)
        elif strategy == PartitionStrategy.MODEL_PARTITION:
            model = result_dict.get("model_name", "unknown")
            return PartitionStrategy.get_model_partition_key(model)
        else:
            return "default"


class SnapshotManager:
    def __init__(self):
        self._snapshots: Dict[str, dict] = {}

    def save_snapshot(self, task_id: str, step: int, state: dict, hydraulic: dict) -> str:
        snapshot_id = hashlib.sha256(f"{task_id}-{step}-{time.time()}".encode()).hexdigest()[:16]
        snapshot = {
            "snapshot_id": snapshot_id,
            "task_id": task_id,
            "step": step,
            "timestamp": time.time(),
            "state": dict(state),
            "hydraulic": dict(hydraulic),
        }
        self._snapshots[snapshot_id] = snapshot
        return snapshot_id

    def get_snapshot(self, snapshot_id: str) -> Optional[dict]:
        return self._snapshots.get(snapshot_id)

    def get_snapshots_by_task(self, task_id: str) -> List[dict]:
        return [s for s in self._snapshots.values() if s["task_id"] == task_id]

    def list_snapshots(self) -> List[str]:
        return list(self._snapshots.keys())

    def cleanup_old_snapshots(self, max_age_seconds: int = 86400):
        now = time.time()
        to_remove = [
            sid for sid, s in self._snapshots.items()
            if now - s["timestamp"] > max_age_seconds
        ]
        for sid in to_remove:
            self._snapshots.pop(sid, None)
        logger.info(f"Cleaned up {len(to_remove)} old snapshots")


class ResultComparator:
    @staticmethod
    def compare_results(result_a: dict, result_b: dict, metrics: List[str] = None) -> dict:
        if metrics is None:
            metrics = ["concentration", "transport_rate", "depth", "bed_elevation"]

        ts_a = result_a.get("time_series", [])
        ts_b = result_b.get("time_series", [])

        if not ts_a or not ts_b:
            return {"error": "One or both results have empty time series"}

        min_len = min(len(ts_a), len(ts_b))
        max_len = max(len(ts_a), len(ts_b))

        comparisons = {}
        for metric in metrics:
            values_a = [ts.get(metric, 0) for ts in ts_a[:min_len]]
            values_b = [ts.get(metric, 0) for ts in ts_b[:min_len]]

            if not values_a or not values_b:
                comparisons[metric] = {"error": "No data for metric"}
                continue

            differences = [abs(a - b) for a, b in zip(values_a, values_b)]
            relative_diffs = []
            for a, b in zip(values_a, values_b):
                if abs(b) > 1e-10:
                    relative_diffs.append(abs(a - b) / abs(b))
                else:
                    relative_diffs.append(abs(a - b) if abs(a) > 1e-10 else 0)

            rmse = (sum(d ** 2 for d in differences) / min_len) ** 0.5
            mae = sum(differences) / min_len
            max_ae = max(differences) if differences else 0
            mare = sum(relative_diffs) / len(relative_diffs) if relative_diffs else 0

            final_a = values_a[-1]
            final_b = values_b[-1]
            final_diff = abs(final_a - final_b)
            final_rel_diff = final_diff / abs(final_b) if abs(final_b) > 1e-10 else final_diff

            comparisons[metric] = {
                "rmse": rmse,
                "mae": mae,
                "max_ae": max_ae,
                "mare": mare,
                "final_value_a": final_a,
                "final_value_b": final_b,
                "final_diff": final_diff,
                "final_rel_diff": final_rel_diff,
                "length_a": len(values_a),
                "length_b": len(values_b),
            }

        stats_a = result_a.get("statistics", {})
        stats_b = result_b.get("statistics", {})
        stat_comparison = {}
        for key in set(stats_a.keys()) | set(stats_b.keys()):
            va = stats_a.get(key)
            vb = stats_b.get(key)
            if isinstance(va, (int, float)) and isinstance(vb, (int, float)):
                diff = abs(va - vb)
                rel_diff = diff / abs(vb) if abs(vb) > 1e-10 else diff
                stat_comparison[key] = {
                    "value_a": va,
                    "value_b": vb,
                    "diff": diff,
                    "rel_diff": rel_diff,
                }

        return {
            "metrics": comparisons,
            "statistics": stat_comparison,
            "length_mismatch": min_len != max_len,
            "length_a": len(ts_a),
            "length_b": len(ts_b),
            "summary": ResultComparator._generate_summary(comparisons),
        }

    @staticmethod
    def _generate_summary(comparisons: dict) -> dict:
        mare_values = []
        final_diff_values = []
        for metric, data in comparisons.items():
            if "mare" in data:
                mare_values.append(data["mare"])
            if "final_rel_diff" in data:
                final_diff_values.append(data["final_rel_diff"])

        avg_mare = sum(mare_values) / len(mare_values) if mare_values else 0
        avg_final_diff = sum(final_diff_values) / len(final_diff_values) if final_diff_values else 0

        if avg_mare < 0.01 and avg_final_diff < 0.01:
            agreement = "excellent"
        elif avg_mare < 0.05 and avg_final_diff < 0.05:
            agreement = "good"
        elif avg_mare < 0.15 and avg_final_diff < 0.15:
            agreement = "fair"
        else:
            agreement = "poor"

        return {
            "avg_mare": avg_mare,
            "avg_final_rel_diff": avg_final_diff,
            "agreement_level": agreement,
        }


class DatabaseConnectionPool:
    def __init__(self, config=None):
        self._config = config
        self._pool_size = config.get("storage", "pool_size") if config else 10
        self._db_type = config.get("storage", "db_type") if config else "postgresql"
        self._db_host = config.get("storage", "db_host") if config else "localhost"
        self._db_port = config.get("storage", "db_port") if config else 5432
        self._db_name = config.get("storage", "db_name") if config else "sediment_db"
        self._db_user = config.get("storage", "db_user") if config else "sediment_admin"
        self._db_password = config.get("storage", "db_password") if config else ""
        self._connections: List[Any] = []
        self._available: List[int] = []
        self._in_use: set = set()
        self._initialized = False

    def initialize(self):
        if self._initialized:
            return
        logger.info(
            f"Initializing connection pool: {self._db_type}://"
            f"{self._db_host}:{self._db_port}/{self._db_name} "
            f"pool_size={self._pool_size}"
        )
        for i in range(self._pool_size):
            conn = self._create_connection(i)
            self._connections.append(conn)
            self._available.append(i)
        self._initialized = True
        logger.info(f"Connection pool initialized with {self._pool_size} connections")

    def _create_connection(self, index: int) -> dict:
        return {
            "index": index,
            "host": self._db_host,
            "port": self._db_port,
            "database": self._db_name,
            "user": self._db_user,
            "connected_at": time.time(),
        }

    @contextmanager
    def acquire(self):
        if not self._initialized:
            self.initialize()
        if not self._available:
            logger.warning("No available connections, waiting...")
        conn_idx = self._available.pop(0) if self._available else None
        if conn_idx is not None:
            self._in_use.add(conn_idx)
            try:
                yield self._connections[conn_idx]
            finally:
                self._in_use.discard(conn_idx)
                self._available.append(conn_idx)
        else:
            yield None

    def close_all(self):
        self._connections.clear()
        self._available.clear()
        self._in_use.clear()
        self._initialized = False
        logger.info("All database connections closed")

    @property
    def available_count(self) -> int:
        return len(self._available)

    @property
    def in_use_count(self) -> int:
        return len(self._in_use)


CREATE_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS sediment_results (
    result_id VARCHAR(32) PRIMARY KEY,
    task_id VARCHAR(32) NOT NULL,
    node_id VARCHAR(32) NOT NULL,
    model_name VARCHAR(64) NOT NULL,
    river_reach VARCHAR(128),
    parameters JSONB,
    time_series JSONB,
    statistics JSONB,
    snapshots JSONB,
    computed_at DOUBLE PRECISION,
    converged BOOLEAN DEFAULT FALSE,
    total_compute_time DOUBLE PRECISION,
    partition_key VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_task_id (task_id),
    INDEX idx_model_name (model_name),
    INDEX idx_river_reach (river_reach),
    INDEX idx_computed_at (computed_at),
    INDEX idx_partition (partition_key)
);

CREATE TABLE IF NOT EXISTS task_history (
    task_id VARCHAR(32) PRIMARY KEY,
    task_type VARCHAR(64) NOT NULL,
    priority INTEGER DEFAULT 2,
    status VARCHAR(16) NOT NULL,
    payload JSONB,
    assigned_node VARCHAR(32),
    created_at DOUBLE PRECISION,
    started_at DOUBLE PRECISION,
    finished_at DOUBLE PRECISION,
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,
    result_id VARCHAR(32)
);

CREATE TABLE IF NOT EXISTS node_history (
    node_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    cpu_cores INTEGER,
    memory_gb DOUBLE PRECISION,
    current_load DOUBLE PRECISION,
    task_count INTEGER,
    recorded_at DOUBLE PRECISION,
    PRIMARY KEY (node_id, recorded_at)
);

CREATE TABLE IF NOT EXISTS computation_snapshots (
    snapshot_id VARCHAR(32) PRIMARY KEY,
    task_id VARCHAR(32) NOT NULL,
    step INTEGER NOT NULL,
    state JSONB,
    hydraulic JSONB,
    created_at DOUBLE PRECISION,
    INDEX idx_snapshot_task (task_id)
);
"""


class ResultWriter:
    def __init__(self, pool: DatabaseConnectionPool, config=None):
        self._pool = pool
        self._config = config
        self._batch_size = (
            config.get("storage", "batch_insert_size") if config else 500
        )
        self._partition_strategy = (
            config.get("storage", "partition_strategy") if config else "time"
        )
        self._buffer: List[SedimentResult] = []
        self._pending_retry: List[SedimentResult] = []
        self._flush_count = 0
        self._total_written = 0
        self._total_failed = 0
        self._partitions: set = set()

    async def write(self, result: SedimentResult):
        self._buffer.append(result)
        logger.debug(
            f"Result buffered: {result.result_id} task={result.task_id} "
            f"buffer_size={len(self._buffer)}"
        )
        if len(self._buffer) >= self._batch_size:
            await self.flush()

    async def write_batch(self, results: List[SedimentResult]):
        self._buffer.extend(results)
        if len(self._buffer) >= self._batch_size:
            await self.flush()

    async def flush(self):
        if not self._buffer:
            return
        batch = list(self._buffer)
        self._buffer.clear()

        if self._pending_retry:
            batch = self._pending_retry + batch
            self._pending_retry.clear()

        with self._pool.acquire() as conn:
            if conn is None:
                self._pending_retry.extend(batch)
                logger.error(
                    f"No database connection available, {len(batch)} results "
                    f"held in retry buffer (retry_buffer={len(self._pending_retry)})"
                )
                return

            failed_in_batch = []
            for result in batch:
                try:
                    self._insert_result(conn, result)
                    self._partitions.add(
                        PartitionStrategy.get_partition_key(
                            result.to_dict(), self._partition_strategy
                        )
                    )
                except Exception as e:
                    logger.error(f"Failed to insert result {result.result_id}: {e}")
                    failed_in_batch.append(result)

            written = len(batch) - len(failed_in_batch)
            self._total_written += written
            self._flush_count += 1

            if failed_in_batch:
                self._pending_retry.extend(failed_in_batch)
                self._total_failed += len(failed_in_batch)
                logger.warning(
                    f"Flush partially failed: {written}/{len(batch)} written, "
                    f"{len(failed_in_batch)} held in retry buffer"
                )
            else:
                logger.info(
                    f"Flushed {len(batch)} results to database "
                    f"(flush #{self._flush_count}, total_written={self._total_written}, "
                    f"partitions={len(self._partitions)})"
                )

    def _insert_result(self, conn: dict, result: SedimentResult):
        data = result.to_dict()
        data["partition_key"] = PartitionStrategy.get_partition_key(
            data, self._partition_strategy
        )
        logger.debug(
            f"Inserted result {data['result_id']} for task {data['task_id']} "
            f"partition={data['partition_key']} via connection {conn.get('index', '?')}"
        )

    async def close(self):
        max_attempts = 3
        for attempt in range(max_attempts):
            if not self._buffer and not self._pending_retry:
                break
            try:
                await self.flush()
            except Exception as e:
                logger.error(f"Close flush attempt {attempt + 1} failed: {e}")
                if attempt < max_attempts - 1:
                    await asyncio.sleep(1.0)
        remaining = len(self._buffer) + len(self._pending_retry)
        if remaining:
            logger.error(f"Result writer closed with {remaining} unwritten results")
        else:
            logger.info(
                f"Result writer closed. Total flushes: {self._flush_count}, "
                f"total_written: {self._total_written}, total_failed: {self._total_failed}"
            )

    @property
    def pending_count(self) -> int:
        return len(self._buffer) + len(self._pending_retry)

    def get_partition_info(self) -> dict:
        return {
            "strategy": self._partition_strategy,
            "active_partitions": sorted(list(self._partitions)),
            "partition_count": len(self._partitions),
        }


class ResultQuerier:
    def __init__(self, pool: DatabaseConnectionPool):
        self._pool = pool
        self._comparator = ResultComparator()

    def query_by_task(self, task_id: str) -> Optional[dict]:
        with self._pool.acquire() as conn:
            if conn is None:
                return None
            logger.debug(f"Querying result for task {task_id}")
            return {"task_id": task_id, "status": "found", "connection": conn.get("index")}

    def query_by_model(self, model_name: str, limit: int = 100) -> List[dict]:
        with self._pool.acquire() as conn:
            if conn is None:
                return []
            logger.debug(f"Querying results for model {model_name}, limit={limit}")
            return []

    def query_by_river_reach(self, river_reach: str, limit: int = 100) -> List[dict]:
        with self._pool.acquire() as conn:
            if conn is None:
                return []
            logger.debug(f"Querying results for river reach {river_reach}")
            return []

    def query_by_time_range(self, start_time: float, end_time: float) -> List[dict]:
        with self._pool.acquire() as conn:
            if conn is None:
                return []
            logger.debug(f"Querying results between {start_time} and {end_time}")
            return []

    def query_by_partition(self, partition_key: str) -> List[dict]:
        with self._pool.acquire() as conn:
            if conn is None:
                return []
            logger.debug(f"Querying results for partition {partition_key}")
            return []

    def compare_results(self, task_id_a: str, task_id_b: str, metrics: List[str] = None) -> dict:
        result_a = self.query_by_task(task_id_a)
        result_b = self.query_by_task(task_id_b)
        if not result_a or not result_b:
            return {"error": "One or both tasks not found"}
        return self._comparator.compare_results(result_a, result_b, metrics)

    def query_statistics(self, model_name: str = None, river_reach: str = None) -> dict:
        with self._pool.acquire() as conn:
            if conn is None:
                return {}
            return {
                "model_name": model_name,
                "river_reach": river_reach,
                "total_results": 0,
                "avg_concentration": 0.0,
                "avg_transport_rate": 0.0,
            }


class TaskHistoryWriter:
    def __init__(self, pool: DatabaseConnectionPool):
        self._pool = pool

    def record_task(self, task_dict: dict):
        with self._pool.acquire() as conn:
            if conn is None:
                logger.warning("Cannot record task history: no connection")
                return
            logger.debug(f"Task history recorded: {task_dict.get('task_id')}")

    def query_task(self, task_id: str) -> Optional[dict]:
        with self._pool.acquire() as conn:
            if conn is None:
                return None
            return {"task_id": task_id}


class StorageManager:
    def __init__(self, config=None):
        self._config = config
        self._pool = DatabaseConnectionPool(config)
        self._result_writer: Optional[ResultWriter] = None
        self._result_querier: Optional[ResultQuerier] = None
        self._task_writer: Optional[TaskHistoryWriter] = None
        self._snapshot_manager: Optional[SnapshotManager] = None
        self._periodic_flush_interval = 30
        self._flush_task: Optional[asyncio.Task] = None
        self._active = False

    async def initialize(self):
        self._pool.initialize()
        self._result_writer = ResultWriter(self._pool, self._config)
        self._result_querier = ResultQuerier(self._pool)
        self._task_writer = TaskHistoryWriter(self._pool)
        self._snapshot_manager = SnapshotManager()
        self._active = True
        self._flush_task = asyncio.create_task(self._periodic_flush_loop())
        logger.info("Storage manager initialized")

    async def _periodic_flush_loop(self):
        while self._active:
            await asyncio.sleep(self._periodic_flush_interval)
            if self._result_writer and self._result_writer.pending_count > 0:
                try:
                    await self._result_writer.flush()
                    logger.debug("Periodic flush executed")
                except Exception as e:
                    logger.error(f"Periodic flush failed: {e}")

    async def save_result(self, result: SedimentResult):
        await self._result_writer.write(result)

    async def save_results(self, results: List[SedimentResult]):
        await self._result_writer.write_batch(results)

    def query_result(self, task_id: str) -> Optional[dict]:
        return self._result_querier.query_by_task(task_id)

    def query_results_by_model(self, model_name: str, limit: int = 100) -> List[dict]:
        return self._result_querier.query_by_model(model_name, limit)

    def query_results_by_river_reach(self, river_reach: str, limit: int = 100) -> List[dict]:
        return self._result_querier.query_by_river_reach(river_reach, limit)

    def query_results_by_time(self, start_time: float, end_time: float) -> List[dict]:
        return self._result_querier.query_by_time_range(start_time, end_time)

    def query_results_by_partition(self, partition_key: str) -> List[dict]:
        return self._result_querier.query_by_partition(partition_key)

    def compare_results(self, task_id_a: str, task_id_b: str, metrics: List[str] = None) -> dict:
        return self._result_querier.compare_results(task_id_a, task_id_b, metrics)

    def save_snapshot(self, task_id: str, step: int, state: dict, hydraulic: dict) -> str:
        return self._snapshot_manager.save_snapshot(task_id, step, state, hydraulic)

    def get_snapshot(self, snapshot_id: str) -> Optional[dict]:
        return self._snapshot_manager.get_snapshot(snapshot_id)

    def get_snapshots_by_task(self, task_id: str) -> List[dict]:
        return self._snapshot_manager.get_snapshots_by_task(task_id)

    def record_task_history(self, task_dict: dict):
        self._task_writer.record_task(task_dict)

    async def flush(self):
        if self._result_writer:
            await self._result_writer.flush()

    async def close(self):
        self._active = False
        if self._flush_task:
            self._flush_task.cancel()
            try:
                await self._flush_task
            except asyncio.CancelledError:
                pass
        if self._result_writer:
            await self._result_writer.close()
        self._pool.close_all()
        logger.info("Storage manager closed")

    def get_pool_status(self) -> dict:
        return {
            "pool_size": self._pool._pool_size,
            "available_connections": self._pool.available_count,
            "in_use_connections": self._pool.in_use_count,
            "buffered_results": self._result_writer.pending_count if self._result_writer else 0,
            "partition_info": self._result_writer.get_partition_info() if self._result_writer else {},
        }

    def get_snapshot_count(self) -> int:
        return len(self._snapshot_manager._snapshots) if self._snapshot_manager else 0
