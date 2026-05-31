import json
import time
import threading
from typing import Dict, List, Optional, Tuple, Any
from collections import defaultdict, OrderedDict
from dataclasses import dataclass, field
import logging
import sqlite3
from datetime import datetime

from config import TIMESERIES_CONFIG, TIMESERIES_DB_PATH
from database import Database, db

logger = logging.getLogger(__name__)


class LRUCache:
    def __init__(self, capacity: int = 1000, ttl_seconds: int = 300):
        self.capacity = capacity
        self.ttl = ttl_seconds
        self._cache: OrderedDict[str, Tuple[Any, float]] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            if key not in self._cache:
                return None
            value, timestamp = self._cache[key]
            if time.time() - timestamp > self.ttl:
                del self._cache[key]
                return None
            self._cache.move_to_end(key)
            return value

    def put(self, key: str, value: Any) -> None:
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
            self._cache[key] = (value, time.time())
            if len(self._cache) > self.capacity:
                self._cache.popitem(last=False)

    def invalidate(self, pattern: str = None) -> int:
        with self._lock:
            if pattern is None:
                count = len(self._cache)
                self._cache.clear()
                return count
            keys_to_remove = [k for k in self._cache if pattern in k]
            for k in keys_to_remove:
                del self._cache[k]
            return len(keys_to_remove)

    def size(self) -> int:
        with self._lock:
            return len(self._cache)


@dataclass
class QueryPlan:
    sensor_ids: List[int]
    start_time: int
    end_time: int
    interval: Optional[str] = None
    aggregation: Optional[str] = None
    chamber_id: Optional[int] = None
    use_pre_aggregated: bool = True
    timeout: int = 30
    max_rows: int = 100000


class QueryOptimizer:
    def __init__(self, config: Dict = None):
        config = config or TIMESERIES_CONFIG
        self.query_timeout = config.get('query_timeout', 30)
        self.max_query_rows = config.get('max_query_rows', 100000)
        self.pre_aggregation_enabled = config.get('pre_aggregation_enabled', True)
        self.pre_aggregation_intervals = config.get(
            'pre_aggregation_intervals',
            ['1min', '5min', '15min', '1hour', '1day']
        )
        self._interval_seconds = {
            '1min': 60,
            '5min': 300,
            '15min': 900,
            '1hour': 3600,
            '1day': 86400
        }

    def optimize_query(self, query_plan: QueryPlan) -> Dict:
        query_range = (query_plan.end_time - query_plan.start_time) / 1000

        if self.pre_aggregation_enabled and query_plan.interval:
            query_range_hours = query_range / 3600

            if query_plan.interval in self.pre_aggregation_intervals:
                if query_range_hours >= 1:
                    query_plan.use_pre_aggregated = True
                    logger.debug(f"Using pre-aggregated data for interval {query_plan.interval}")
                else:
                    query_plan.use_pre_aggregated = False
            else:
                query_plan.use_pre_aggregated = False

        return {
            'query_plan': query_plan,
            'estimated_rows': self._estimate_rows(query_plan),
            'use_pre_aggregated': query_plan.use_pre_aggregated
        }

    def _estimate_rows(self, query_plan: QueryPlan) -> int:
        range_ms = query_plan.end_time - query_plan.start_time
        if range_ms <= 0:
            return 0

        num_sensors = len(query_plan.sensor_ids)

        if query_plan.interval and query_plan.use_pre_aggregated:
            interval_sec = self._interval_seconds.get(query_plan.interval, 60)
            estimated = num_sensors * (range_ms / (interval_sec * 1000))
        else:
            estimated = num_sensors * (range_ms / 1000)

        return min(int(estimated), self.max_query_rows)

    def _get_interval_seconds(self, interval: str) -> int:
        return self._interval_seconds.get(interval, 60)


class PartitionManager:
    def __init__(self, db_path: str = None):
        self.db_path = db_path or TIMESERIES_DB_PATH
        self._lock = threading.Lock()

    def get_partition_date(self, timestamp_ms: int) -> str:
        dt = datetime.fromtimestamp(timestamp_ms / 1000)
        return dt.strftime('%Y%m%d')

    def get_partition_range(self, start_time_ms: int, end_time_ms: int) -> List[str]:
        partitions = []
        current = start_time_ms
        while current <= end_time_ms:
            partitions.append(self.get_partition_date(current))
            current += 86400000
        return list(set(partitions))

    def create_partition(self, table_name: str, partition_date: str) -> str:
        partition_name = f"{table_name}_{partition_date}"
        db = Database(self.db_path)
        try:
            conn = db._connect()
            cursor = conn.cursor()
            cursor.execute(f'''
                CREATE TABLE IF NOT EXISTS {partition_name} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sensor_id INTEGER NOT NULL,
                    chamber_id INTEGER,
                    timestamp INTEGER NOT NULL,
                    value REAL NOT NULL,
                    quality INTEGER DEFAULT 1,
                    is_duplicate INTEGER DEFAULT 0,
                    received_at INTEGER NOT NULL
                )
            ''')
            cursor.execute(f'''
                CREATE INDEX IF NOT EXISTS idx_{partition_name}_ts 
                ON {partition_name}(sensor_id, timestamp DESC)
            ''')
            conn.commit()
            conn.close()

            cursor = conn.cursor()
            cursor.execute('''
                INSERT OR IGNORE INTO timeseries_partitions 
                (table_name, partition_date, start_time, end_time, row_count)
                VALUES (?, ?, ?, ?, 0)
            ''', (table_name, partition_date,
                  int(datetime.strptime(partition_date, '%Y%m%d').timestamp() * 1000),
                  int(datetime.strptime(partition_date, '%Y%m%d').timestamp() * 1000) + 86399999))
            conn.commit()
            conn.close()

            return partition_name
        except Exception as e:
            logger.error(f"Failed to create partition {partition_name}: {e}")
            raise e

    def query_partitioned(self, table_name: str, sensor_ids: List[int],
                          start_time: int, end_time: int,
                          columns: str = '*', limit: int = None) -> List[Dict]:
        partitions = self.get_partition_range(start_time, end_time)
        results = []
        db = Database(self.db_path)

        for partition_date in partitions:
            partition_name = f"{table_name}_{partition_date}"
            try:
                query = f'''
                    SELECT {columns} FROM {partition_name}
                    WHERE sensor_id IN ({','.join(map(str, sensor_ids))})
                    AND timestamp >= ? AND timestamp <= ?
                    ORDER BY timestamp DESC
                '''
                if limit:
                    query += f" LIMIT {limit}"

                rows = db.execute_query_with_timeout(
                    query,
                    params=[start_time, end_time],
                    timeout=TIMESERIES_CONFIG.get('query_timeout', 30)
                )
                results.extend(rows)
            except sqlite3.OperationalError:
                continue

        return results


class TimeSeriesQueryEngine:
    def __init__(self, config: Dict = None):
        config = config or TIMESERIES_CONFIG
        self.config = config
        self.optimizer = QueryOptimizer(config)
        self.cache = LRUCache(
            capacity=1000,
            ttl_seconds=300
        )
        self.partition_manager = PartitionManager()
        self._db = Database()
        self._lock = threading.Lock()

        self._stats = {
            'total_queries': 0,
            'cache_hits': 0,
            'cache_misses': 0,
            'pre_aggregated_queries': 0,
            'raw_queries': 0,
            'timeouts': 0,
            'errors': 0,
            'avg_query_time': 0.0,
            'total_query_time': 0.0
        }
        self._stats_lock = threading.Lock()

    def _get_cache_key(self, sensor_ids: List[int], start_time: int, end_time: int,
                      interval: str = None, aggregation: str = None) -> str:
        return f"tsq:{sorted(sensor_ids)}:{start_time}:{end_time}:{interval}:{aggregation}"

    def query_sensor_data(self, sensor_ids: List[int], start_time: int, end_time: int,
                          interval: str = None, aggregation: str = 'avg',
                          chamber_id: int = None) -> Dict:
        query_plan = QueryPlan(
            sensor_ids=sensor_ids,
            start_time=start_time,
            end_time=end_time,
            interval=interval,
            aggregation=aggregation,
            chamber_id=chamber_id
        )

        cache_key = self._get_cache_key(sensor_ids, start_time, end_time, interval, aggregation)
        cached_result = self.cache.get(cache_key)

        if cached_result is not None:
            with self._stats_lock:
                self._stats['cache_hits'] += 1
                self._stats['total_queries'] += 1
            return {
                'data': cached_result,
                'from_cache': True,
                'query_type': 'cache'
            }

        with self._stats_lock:
            self._stats['cache_misses'] += 1

        opt_result = self.optimizer.optimize_query(query_plan)

        start_query_time = time.time()
        try:
            if opt_result['use_pre_aggregated'] and interval:
                data = self._query_pre_aggregated(query_plan)
                query_type = 'pre_aggregated'
                with self._stats_lock:
                    self._stats['pre_aggregated_queries'] += 1
            else:
                data = self._query_raw(query_plan)
                query_type = 'raw'
                with self._stats_lock:
                    self._stats['raw_queries'] += 1

            self.cache.put(cache_key, data)

        except Exception as e:
            with self._stats_lock:
                self._stats['errors'] += 1
                if 'timeout' in str(e).lower():
                    self._stats['timeouts'] += 1
            raise e

        query_time = time.time() - start_query_time
        with self._stats_lock:
            self._stats['total_queries'] += 1
            self._stats['total_query_time'] += query_time
            self._stats['avg_query_time'] = (
                self._stats['total_query_time'] / self._stats['total_queries']
            )

        return {
            'data': data,
            'from_cache': False,
            'query_type': query_type,
            'query_time': query_time,
            'estimated_rows': opt_result['estimated_rows']
        }

    def _query_raw(self, query_plan: QueryPlan) -> Dict:
        if self.config.get('partition_enabled', True):
            rows = self.partition_manager.query_partitioned(
                'sensor_data_raw',
                query_plan.sensor_ids,
                query_plan.start_time,
                query_plan.end_time,
                limit=query_plan.max_rows
            )
        else:
            query = '''
                SELECT sensor_id, timestamp, value, quality, chamber_id
                FROM sensor_data_raw
                WHERE sensor_id IN ({placeholders})
                AND timestamp >= ? AND timestamp <= ?
                ORDER BY timestamp DESC
                LIMIT ?
            '''.format(placeholders=','.join('?' * len(query_plan.sensor_ids)))

            params = list(query_plan.sensor_ids) + [query_plan.start_time,
                                                     query_plan.end_time,
                                                     query_plan.max_rows]
            rows = self._db.execute_query_with_timeout(
                query, params, timeout=query_plan.timeout
            )

        return self._format_result(rows, query_plan)

    def _query_pre_aggregated(self, query_plan: QueryPlan) -> Dict:
        query = '''
            SELECT sensor_id, start_time, end_time, count,
                   min_value, max_value, avg_value, sum_value,
                   std_value, first_value, last_value, quality_avg
            FROM sensor_data_aggregated
            WHERE sensor_id IN ({placeholders})
            AND interval = ?
            AND start_time >= ? AND end_time <= ?
            ORDER BY start_time DESC
        '''.format(placeholders=','.join('?' * len(query_plan.sensor_ids)))

        params = list(query_plan.sensor_ids) + [query_plan.interval,
                                                 query_plan.start_time,
                                                 query_plan.end_time]

        rows = self._db.execute_query_with_timeout(
            query, params, timeout=query_plan.timeout
        )

        return self._format_aggregated_result(rows, query_plan)

    def _format_result(self, rows: List[Dict], query_plan: QueryPlan) -> Dict:
        result = defaultdict(list)
        for row in rows:
            sensor_id = row['sensor_id']
            result[sensor_id].append({
                'timestamp': row['timestamp'],
                'value': row['value'],
                'quality': row.get('quality', 1)
            })
        return dict(result)

    def _format_aggregated_result(self, rows: List[Dict], query_plan: QueryPlan) -> Dict:
        result = defaultdict(list)
        for row in rows:
            sensor_id = row['sensor_id']
            agg_data = {
                'start_time': row['start_time'],
                'end_time': row['end_time'],
                'count': row['count'],
                'min': row['min_value'],
                'max': row['max_value'],
                'avg': row['avg_value'],
                'sum': row['sum_value'],
                'std': row['std_value'],
                'first': row['first_value'],
                'last': row['last_value'],
                'quality_avg': row['quality_avg']
            }
            if query_plan.aggregation in agg_data:
                agg_data['value'] = agg_data[query_plan.aggregation]
            result[sensor_id].append(agg_data)
        return dict(result)

    def get_stats(self) -> Dict:
        with self._stats_lock:
            stats = dict(self._stats)
            stats['cache_size'] = self.cache.size()
            stats['cache_hit_rate'] = (
                stats['cache_hits'] / max(1, stats['total_queries'])
            )
            return stats

    def invalidate_cache(self, sensor_id: int = None) -> int:
        if sensor_id:
            return self.cache.invalidate(f":{sensor_id}:")
        return self.cache.invalidate()


_ts_query_engine = None


def get_ts_query_engine() -> TimeSeriesQueryEngine:
    global _ts_query_engine
    if _ts_query_engine is None:
        _ts_query_engine = TimeSeriesQueryEngine()
    return _ts_query_engine
