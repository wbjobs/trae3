import json
import time
import threading
import queue
from collections import defaultdict, deque
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field
import logging
import numpy as np

from config import SENSOR_CONFIG
from database import db, Database
from task_scheduler import db_pool

logger = logging.getLogger(__name__)


@dataclass
class SensorData:
    sensor_id: int
    timestamp: int
    value: float
    chamber_id: Optional[int] = None
    quality: int = 1
    received_at: int = field(default_factory=lambda: int(time.time() * 1000))
    is_duplicate: int = 0


class DuplicateFilter:
    def __init__(self, time_window_ms: int = 1000, max_cache_size: int = 10000):
        self.time_window = time_window_ms
        self.max_cache_size = max_cache_size
        self._cache: Dict[int, deque] = defaultdict(lambda: deque(maxlen=100))
        self._lock = threading.Lock()

    def is_duplicate(self, sensor_id: int, timestamp: int, value: float) -> bool:
        with self._lock:
            cache = self._cache[sensor_id]
            for (ts, val) in cache:
                if abs(timestamp - ts) <= self.time_window and abs(value - val) < 1e-10:
                    return True
            cache.append((timestamp, value))
            if len(cache) > self.max_cache_size:
                cache.popleft()
            return False


class DataAggregator:
    def __init__(self, intervals: List[str] = None):
        self.intervals = intervals or ['1min', '5min', '15min', '1hour', '1day']
        self._interval_seconds = {
            '1min': 60,
            '5min': 300,
            '15min': 900,
            '1hour': 3600,
            '1day': 86400
        }
        self._buffers: Dict[Tuple[int, str], List[SensorData]] = defaultdict(list)
        self._last_aggregation: Dict[Tuple[int, str], int] = {}
        self._lock = threading.Lock()

    def get_interval_seconds(self, interval: str) -> int:
        return self._interval_seconds.get(interval, 60)

    def add_data(self, data: SensorData) -> None:
        with self._lock:
            for interval in self.intervals:
                key = (data.sensor_id, interval)
                self._buffers[key].append(data)

    def aggregate(self, force: bool = False) -> List[Dict]:
        results = []
        now_ms = int(time.time() * 1000)
        now_s = now_ms // 1000

        with self._lock:
            for (sensor_id, interval), buffer in list(self._buffers.items()):
                if not buffer:
                    continue

                interval_sec = self.get_interval_seconds(interval)
                last_agg = self._last_aggregation.get((sensor_id, interval), 0)
                interval_ms = interval_sec * 1000

                if not force and now_s - last_agg < interval_sec:
                    continue

                values = [d.value for d in buffer]
                qualities = [d.quality for d in buffer]
                timestamps = [d.timestamp for d in buffer]

                if not values:
                    continue

                start_time = (min(timestamps) // interval_ms) * interval_ms
                end_time = start_time + interval_ms

                agg_data = {
                    'sensor_id': sensor_id,
                    'chamber_id': buffer[0].chamber_id,
                    'interval': interval,
                    'start_time': start_time,
                    'end_time': end_time,
                    'count': len(values),
                    'min_value': float(np.min(values)),
                    'max_value': float(np.max(values)),
                    'avg_value': float(np.mean(values)),
                    'sum_value': float(np.sum(values)),
                    'std_value': float(np.std(values)) if len(values) > 1 else 0.0,
                    'first_value': values[0],
                    'last_value': values[-1],
                    'quality_avg': float(np.mean(qualities))
                }

                results.append(agg_data)

                self._last_aggregation[(sensor_id, interval)] = now_s
                self._buffers[(sensor_id, interval)] = []

        return results


class BatchWriter:
    def __init__(self, batch_size: int = 1000, flush_interval: float = 5.0):
        self.batch_size = batch_size
        self.flush_interval = flush_interval
        self._buffer: List[SensorData] = []
        self._agg_buffer: List[Dict] = []
        self._lock = threading.Lock()
        self._last_flush = time.time()
        self._db = Database()

    def add_data(self, data: SensorData) -> int:
        with self._lock:
            self._buffer.append(data)
            return len(self._buffer)

    def add_aggregated(self, data: Dict) -> None:
        with self._lock:
            self._agg_buffer.append(data)

    def should_flush(self) -> bool:
        with self._lock:
            return (len(self._buffer) >= self.batch_size or
                    len(self._agg_buffer) >= self.batch_size or
                    time.time() - self._last_flush >= self.flush_interval)

    def flush(self) -> Tuple[int, int]:
        with self._lock:
            raw_count = 0
            agg_count = 0

            if self._buffer:
                raw_data = [
                    {
                        'sensor_id': d.sensor_id,
                        'chamber_id': d.chamber_id,
                        'timestamp': d.timestamp,
                        'value': d.value,
                        'quality': d.quality,
                        'is_duplicate': d.is_duplicate,
                        'received_at': d.received_at
                    }
                    for d in self._buffer
                ]
                raw_count = self._db.insert_sensor_data_batch(raw_data)
                self._buffer = []

            if self._agg_buffer:
                agg_count = self._db.insert_sensor_aggregated_batch(self._agg_buffer)
                self._agg_buffer = []

            self._last_flush = time.time()
            return raw_count, agg_count


class SensorDataProcessor:
    def __init__(self, config: Dict = None):
        config = config or SENSOR_CONFIG
        self.batch_size = config.get('batch_size', 1000)
        self.max_queue_size = config.get('max_queue_size', 100000)
        self.enable_duplicate_filter = config.get('enable_duplicate_filter', True)
        self.aggregation_enabled = config.get('aggregation_enabled', True)

        self._data_queue = queue.Queue(maxsize=self.max_queue_size)
        self._duplicate_filter = DuplicateFilter(
            time_window_ms=config.get('duplicate_time_window', 1000)
        )
        self._aggregator = DataAggregator(
            intervals=config.get('aggregation_intervals', ['1min', '5min', '15min', '1hour', '1day'])
        )
        self._batch_writer = BatchWriter(
            batch_size=self.batch_size,
            flush_interval=config.get('flush_interval', 5.0)
        )

        self._processing_thread = None
        self._aggregation_thread = None
        self._running = False
        self._stop_event = threading.Event()

        self._stats = {
            'received': 0,
            'duplicates': 0,
            'written': 0,
            'aggregated': 0,
            'errors': 0,
            'dropped': 0,
            'queue_size': 0,
            'write_rate': 0.0,
            'last_write_time': 0
        }
        self._stats_lock = threading.Lock()

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._stop_event.clear()

        self._processing_thread = threading.Thread(
            target=self._process_loop,
            name='SensorDataProcessor',
            daemon=True
        )
        self._processing_thread.start()

        if self.aggregation_enabled:
            self._aggregation_thread = threading.Thread(
                target=self._aggregation_loop,
                name='SensorDataAggregator',
                daemon=True
            )
            self._aggregation_thread.start()

        logger.info("Sensor data processor started")

    def stop(self) -> None:
        self._running = False
        self._stop_event.set()

        if self._processing_thread:
            self._processing_thread.join(timeout=10)

        if self._aggregation_thread:
            self._aggregation_thread.join(timeout=10)

        self._batch_writer.flush()
        logger.info("Sensor data processor stopped")

    def process_data(self, sensor_id: int, timestamp: int, value: float,
                     chamber_id: int = None, quality: int = 1) -> bool:
        data = SensorData(
            sensor_id=sensor_id,
            timestamp=timestamp,
            value=value,
            chamber_id=chamber_id,
            quality=quality
        )

        if self.enable_duplicate_filter:
            if self._duplicate_filter.is_duplicate(sensor_id, timestamp, value):
                with self._stats_lock:
                    self._stats['duplicates'] += 1
                return False

        try:
            self._data_queue.put_nowait(data)
            with self._stats_lock:
                self._stats['received'] += 1
                self._stats['queue_size'] = self._data_queue.qsize()
            return True
        except queue.Full:
            with self._stats_lock:
                self._stats['dropped'] += 1
            logger.warning(f"Data queue full, dropping data for sensor {sensor_id}")
            return False

    def process_batch(self, data_list: List[Dict]) -> int:
        success_count = 0
        for data in data_list:
            if self.process_data(
                sensor_id=data['sensor_id'],
                timestamp=data['timestamp'],
                value=data['value'],
                chamber_id=data.get('chamber_id'),
                quality=data.get('quality', 1)
            ):
                success_count += 1
        return success_count

    def _process_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                batch_data = []
                try:
                    for _ in range(min(self.batch_size, self._data_queue.qsize() + 1)):
                        data = self._data_queue.get(timeout=0.01)
                        batch_data.append(data)
                except queue.Empty:
                    pass

                if batch_data:
                    for data in batch_data:
                        if self.aggregation_enabled:
                            self._aggregator.add_data(data)

                        self._batch_writer.add_data(data)

                    if self._batch_writer.should_flush():
                        raw_count, _ = self._batch_writer.flush()
                        with self._stats_lock:
                            self._stats['written'] += raw_count
                            self._stats['last_write_time'] = time.time()
                            self._stats['queue_size'] = self._data_queue.qsize()

                else:
                    time.sleep(0.01)

            except Exception as e:
                logger.error(f"Error in sensor data processing: {e}", exc_info=True)
                with self._stats_lock:
                    self._stats['errors'] += 1

    def _aggregation_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                agg_data = self._aggregator.aggregate(force=False)

                if agg_data:
                    for data in agg_data:
                        self._batch_writer.add_aggregated(data)

                    _, agg_count = self._batch_writer.flush()
                    with self._stats_lock:
                        self._stats['aggregated'] += agg_count

                else:
                    agg_data = self._aggregator.aggregate(force=True)
                    if agg_data:
                        for data in agg_data:
                            self._batch_writer.add_aggregated(data)
                        _, agg_count = self._batch_writer.flush()
                        with self._stats_lock:
                            self._stats['aggregated'] += agg_count

                time.sleep(self._aggregator.get_interval_seconds('1min') / 2)

            except Exception as e:
                logger.error(f"Error in data aggregation: {e}", exc_info=True)
                with self._stats_lock:
                    self._stats['errors'] += 1

    def get_stats(self) -> Dict:
        with self._stats_lock:
            stats = dict(self._stats)
            stats['queue_size'] = self._data_queue.qsize()

            if time.time() - self._stats['last_write_time'] > 0:
                stats['write_rate'] = self._stats['written'] / max(
                    1, time.time() - self._stats['last_write_time']
                )

            return stats

    def get_sensor_data(self, sensor_id: int, start_time: int = None,
                        end_time: int = None, limit: int = 1000) -> List[Dict]:
        return db.get_sensor_data(sensor_id, start_time, end_time, limit)

    def get_aggregated_data(self, sensor_id: int, interval: str,
                            start_time: int = None, end_time: int = None) -> List[Dict]:
        return db.get_sensor_aggregated_data(sensor_id, interval, start_time, end_time)


_sensor_processor = None


def get_sensor_processor() -> SensorDataProcessor:
    global _sensor_processor
    if _sensor_processor is None:
        _sensor_processor = SensorDataProcessor()
        _sensor_processor.start()
    return _sensor_processor
