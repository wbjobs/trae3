import asyncio
import os
import time
import aiosqlite
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any, Tuple
from functools import lru_cache

from backend.config import (
    DB_BACKEND, INFLUXDB_URL, INFLUXDB_TOKEN,
    INFLUXDB_ORG, INFLUXDB_BUCKET, SQLITE_PATH
)
from backend.models.schemas import SensorData, DataQuery


QUERY_TIMEOUT_SECONDS = 5
MAX_QUERY_LIMIT = 5000
CACHE_TTL_SECONDS = 2


class TSDBService:
    def __init__(self):
        self._influx_client = None
        self._write_api = None
        self._query_api = None
        self._db_backend = DB_BACKEND
        self._write_batch: List[SensorData] = []
        self._write_lock = asyncio.Lock()
        self._write_last_flush = 0.0
        self._cache: Dict[str, Tuple[float, Any]] = {}

    async def initialize(self):
        if self._db_backend == "influxdb":
            self._init_influxdb()
        else:
            await self._init_sqlite()

    def _init_influxdb(self):
        try:
            from influxdb_client import InfluxDBClient
            self._influx_client = InfluxDBClient(
                url=INFLUXDB_URL, token=INFLUXDB_TOKEN, org=INFLUXDB_ORG
            )
            self._write_api = self._influx_client.write_api()
            self._query_api = self._influx_client.query_api()
            print("[TSDB] InfluxDB client initialized")
        except Exception as e:
            print(f"[TSDB] InfluxDB init failed: {e}, falling back to SQLite")
            self._db_backend = "sqlite"
            asyncio.get_event_loop().run_until_complete(self._init_sqlite())

    async def _init_sqlite(self):
        db_dir = os.path.dirname(SQLITE_PATH)
        if db_dir:
            os.makedirs(db_dir, exist_ok=True)
        self._conn = await aiosqlite.connect(SQLITE_PATH)

        await self._conn.execute("PRAGMA journal_mode = WAL")
        await self._conn.execute("PRAGMA synchronous = NORMAL")
        await self._conn.execute("PRAGMA cache_size = -64000")
        await self._conn.execute("PRAGMA temp_store = MEMORY")
        await self._conn.execute("PRAGMA mmap_size = 2147483648")
        await self._conn.execute("PRAGMA busy_timeout = 3000")

        await self._conn.execute("""
            CREATE TABLE IF NOT EXISTS sensor_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                device_id TEXT NOT NULL,
                temperature REAL,
                vibration REAL,
                pressure REAL,
                rpm REAL,
                current REAL
            )
        """)

        await self._conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_device_time_desc
            ON sensor_data(device_id, timestamp DESC)
        """)
        await self._conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_time_desc
            ON sensor_data(timestamp DESC)
        """)
        await self._conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_device_id
            ON sensor_data(device_id)
        """)

        await self._conn.commit()
        print("[TSDB] SQLite initialized with WAL mode and indexes")

    async def write(self, data: SensorData):
        ts = data.timestamp or datetime.utcnow().isoformat()
        if self._db_backend == "influxdb" and self._write_api:
            self._write_influxdb(data, ts)
        else:
            async with self._write_lock:
                self._write_batch.append(data)
                self._write_batch[-1].timestamp = ts
                now = time.time()
                if len(self._write_batch) >= 50 or (now - self._write_last_flush) > 1.0:
                    await self._flush_batch()
                    self._write_last_flush = now

    async def _flush_batch(self):
        if not self._write_batch:
            return
        try:
            values = [
                (d.timestamp, d.device_id, d.temperature, d.vibration, d.pressure, d.rpm, d.current)
                for d in self._write_batch
            ]
            await self._conn.executemany(
                "INSERT INTO sensor_data (timestamp, device_id, temperature, vibration, pressure, rpm, current) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                values
            )
            await self._conn.commit()
            self._cache.clear()
        except Exception as e:
            print(f"[TSDB] Batch flush error: {e}")
        finally:
            self._write_batch.clear()

    def _write_influxdb(self, data: SensorData, ts: str):
        from influxdb_client import Point
        point = (
            Point("sensor_data")
            .tag("device_id", data.device_id)
            .field("temperature", data.temperature)
            .field("vibration", data.vibration)
            .field("pressure", data.pressure)
            .field("rpm", data.rpm)
            .field("current", data.current)
            .time(ts)
        )
        self._write_api.write(bucket=INFLUXDB_BUCKET, org=INFLUXDB_ORG, record=point)

    async def write_batch(self, data_list: List[SensorData]):
        for data in data_list:
            await self.write(data)
        await self._flush_batch()

    def _get_cache(self, key: str) -> Optional[Any]:
        entry = self._cache.get(key)
        if entry is None:
            return None
        ts, value = entry
        if time.time() - ts < CACHE_TTL_SECONDS:
            return value
        del self._cache[key]
        return None

    def _set_cache(self, key: str, value: Any):
        self._cache[key] = (time.time(), value)

    async def query(self, query: DataQuery) -> List[Dict[str, Any]]:
        cache_key = f"q:{query.model_dump_json()}"
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        try:
            async with asyncio.timeout(QUERY_TIMEOUT_SECONDS):
                if self._db_backend == "influxdb" and self._query_api:
                    result = self._query_influxdb(query)
                else:
                    result = await self._query_sqlite(query)
                self._set_cache(cache_key, result)
                return result
        except asyncio.TimeoutError:
            print(f"[TSDB] Query timed out after {QUERY_TIMEOUT_SECONDS}s")
            return []
        except Exception as e:
            print(f"[TSDB] Query error: {e}")
            return []

    def _query_influxdb(self, query: DataQuery) -> List[Dict[str, Any]]:
        start = query.start_time or (datetime.utcnow() - timedelta(hours=1)).isoformat() + "Z"
        stop = query.end_time or datetime.utcnow().isoformat() + "Z"
        limit = min(query.limit, MAX_QUERY_LIMIT)
        flux = (
            f'from(bucket: "{INFLUXDB_BUCKET}")'
            f" |> range(start: {start}, stop: {stop})"
        )
        if query.device_id:
            flux += f' |> filter(fn: (r) => r.device_id == "{query.device_id}")'
        flux += f" |> limit(n: {limit})"
        tables = self._query_api.query(flux, org=INFLUXDB_ORG)
        results = []
        for table in tables:
            for record in table.records:
                results.append({
                    "timestamp": record.get_time().isoformat(),
                    "device_id": record.values.get("device_id", ""),
                    "parameter": record.get_field(),
                    "value": record.get_value(),
                })
        return results

    async def _query_sqlite(self, query: DataQuery) -> List[Dict[str, Any]]:
        limit = min(query.limit, MAX_QUERY_LIMIT)
        conditions = []
        params: list = []
        if query.device_id:
            conditions.append("device_id = ?")
            params.append(query.device_id)
        if query.start_time:
            conditions.append("timestamp >= ?")
            params.append(query.start_time)
        if query.end_time:
            conditions.append("timestamp <= ?")
            params.append(query.end_time)

        select_fields = ["timestamp", "device_id"]
        param_fields = query.parameters or ["temperature", "vibration", "pressure", "rpm", "current"]
        select_fields.extend(param_fields)

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        sql = f"SELECT {', '.join(select_fields)} FROM sensor_data {where} ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)

        async with self._conn.execute(sql, params) as cursor:
            rows = await cursor.fetchall()
            columns = [desc[0] for desc in cursor.description]

        results = []
        for row in rows:
            row_dict = dict(zip(columns, row))
            for p in param_fields:
                val = row_dict.get(p)
                if val is not None:
                    results.append({
                        "timestamp": row_dict["timestamp"],
                        "device_id": row_dict["device_id"],
                        "parameter": p,
                        "value": val,
                    })
        return results

    async def get_latest(self, device_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        cache_key = f"latest:{device_id}:{limit}"
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        try:
            async with asyncio.timeout(QUERY_TIMEOUT_SECONDS):
                if self._db_backend == "influxdb" and self._query_api:
                    q = DataQuery(device_id=device_id, limit=limit)
                    result = self._query_influxdb(q)
                else:
                    limit = min(limit, MAX_QUERY_LIMIT)
                    async with self._conn.execute(
                        "SELECT timestamp, device_id, temperature, vibration, pressure, rpm, current "
                        "FROM sensor_data WHERE device_id = ? ORDER BY timestamp DESC LIMIT ?",
                        (device_id, limit)
                    ) as cursor:
                        rows = await cursor.fetchall()
                        columns = [desc[0] for desc in cursor.description]
                    result = [dict(zip(columns, row)) for row in rows]
                self._set_cache(cache_key, result)
                return result
        except asyncio.TimeoutError:
            print(f"[TSDB] Latest query timed out")
            return []
        except Exception as e:
            print(f"[TSDB] Latest query error: {e}")
            return []

    async def close(self):
        await self._flush_batch()
        if self._db_backend == "influxdb" and self._influx_client:
            self._influx_client.close()
        if hasattr(self, "_conn"):
            await self._conn.close()


tsdb_service = TSDBService()
