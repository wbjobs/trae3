import asyncio
import threading
import time
from collections import deque, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, List, Callable, Optional, Any
from enum import Enum
import numpy as np
import pandas as pd


class WindowType(Enum):
    TUMBLING = "tumbling"
    SLIDING = "sliding"
    SESSION = "session"


class AggregationType(Enum):
    MEAN = "mean"
    SUM = "sum"
    MIN = "min"
    MAX = "max"
    STD = "std"
    RMS = "rms"
    PEAK = "peak"
    KURTOSIS = "kurtosis"
    CREST = "crest"
    COUNT = "count"
    PERCENTILE = "percentile"


@dataclass
class StreamWindow:
    window_id: str
    device_code: str
    start_time: datetime
    end_time: datetime
    data_points: List[Dict] = field(default_factory=list)
    aggregation_results: Dict[str, Any] = field(default_factory=dict)
    is_closed: bool = False

    def size(self) -> int:
        return len(self.data_points)

    def add_point(self, point: Dict):
        self.data_points.append(point)

    def get_values(self, field: str) -> np.ndarray:
        return np.array([p.get(field, 0) for p in self.data_points if p.get(field) is not None])


class IncrementalAggregator:
    def __init__(self):
        self.n = 0
        self.mean = 0.0
        self.M2 = 0.0
        self.min_val = float('inf')
        self.max_val = float('-inf')
        self.sum_val = 0.0
        self.sum_sq = 0.0

    def add(self, value: float):
        self.n += 1
        self.sum_val += value
        self.sum_sq += value * value

        delta = value - self.mean
        self.mean += delta / self.n
        delta2 = value - self.mean
        self.M2 += delta * delta2

        if value < self.min_val:
            self.min_val = value
        if value > self.max_val:
            self.max_val = value

    def add_batch(self, values: np.ndarray):
        for v in values:
            if not np.isnan(v):
                self.add(v)

    def get_mean(self) -> float:
        return self.mean if self.n > 0 else 0.0

    def get_std(self) -> float:
        return np.sqrt(self.M2 / self.n) if self.n > 1 else 0.0

    def get_rms(self) -> float:
        return np.sqrt(self.sum_sq / self.n) if self.n > 0 else 0.0

    def get_peak(self) -> float:
        return max(abs(self.max_val), abs(self.min_val)) if self.n > 0 else 0.0

    def get_crest(self) -> float:
        rms = self.get_rms()
        return self.get_peak() / rms if rms > 0 else 0.0

    def get_results(self) -> Dict[str, float]:
        return {
            'count': self.n,
            'mean': self.get_mean(),
            'std': self.get_std(),
            'min': self.min_val if self.n > 0 else 0.0,
            'max': self.max_val if self.n > 0 else 0.0,
            'sum': self.sum_val,
            'rms': self.get_rms(),
            'peak': self.get_peak(),
            'crest': self.get_crest()
        }


class SlidingWindowManager:
    def __init__(self, window_duration: timedelta, slide_duration: timedelta,
                 aggregations: List[AggregationType]):
        self.window_duration = window_duration
        self.slide_duration = slide_duration
        self.aggregations = aggregations
        self.windows: deque = deque()
        self.device_aggregators: Dict[str, Dict[str, IncrementalAggregator]] = defaultdict(
            lambda: defaultdict(IncrementalAggregator)
        )
        self.window_callbacks: List[Callable[[StreamWindow], None]] = []

    def add_data_point(self, point: Dict) -> List[StreamWindow]:
        device_code = point.get('device_code')
        timestamp = point.get('timestamp', datetime.now())
        closed_windows = []

        if not self.windows or timestamp >= self.windows[-1].end_time:
            window_start = self._align_window_start(timestamp)
            window_end = window_start + self.window_duration
            new_window = StreamWindow(
                window_id=f"{device_code}_{window_start.isoformat()}",
                device_code=device_code,
                start_time=window_start,
                end_time=window_end
            )
            self.windows.append(new_window)

        for window in self.windows:
            if window.start_time <= timestamp < window.end_time:
                window.add_point(point)

                if device_code:
                    for field in ['rms_value', 'peak_value', 'temperature', 'speed']:
                        value = point.get(field)
                        if value is not None and isinstance(value, (int, float)):
                            agg_key = f"{device_code}_{window.window_id}_{field}"
                            self.device_aggregators[device_code][agg_key].add(float(value))

        while self.windows and timestamp >= self.windows[0].end_time + self.slide_duration:
            closed_window = self.windows.popleft()
            self._finalize_window(closed_window)
            closed_windows.append(closed_window)
            self._trigger_callbacks(closed_window)

        return closed_windows

    def add_data_batch(self, points: List[Dict]) -> List[StreamWindow]:
        all_closed = []
        for point in sorted(points, key=lambda p: p.get('timestamp', datetime.now())):
            closed = self.add_data_point(point)
            all_closed.extend(closed)
        return all_closed

    def _align_window_start(self, timestamp: datetime) -> datetime:
        window_seconds = int(self.window_duration.total_seconds())
        epoch_seconds = int(timestamp.timestamp())
        aligned_seconds = (epoch_seconds // window_seconds) * window_seconds
        return datetime.fromtimestamp(aligned_seconds)

    def _finalize_window(self, window: StreamWindow):
        window.is_closed = True
        device_code = window.device_code

        for field in ['rms_value', 'peak_value', 'temperature', 'speed']:
            agg_key = f"{device_code}_{window.window_id}_{field}"
            if agg_key in self.device_aggregators.get(device_code, {}):
                agg = self.device_aggregators[device_code][agg_key]
                window.aggregation_results[field] = agg.get_results()

                if AggregationType.KURTOSIS in self.aggregations:
                    values = window.get_values(field)
                    if len(values) >= 4:
                        window.aggregation_results[field]['kurtosis'] = float(pd.Series(values).kurtosis())

                if AggregationType.PERCENTILE in self.aggregations:
                    values = window.get_values(field)
                    if len(values) > 0:
                        window.aggregation_results[field]['p50'] = float(np.percentile(values, 50))
                        window.aggregation_results[field]['p95'] = float(np.percentile(values, 95))
                        window.aggregation_results[field]['p99'] = float(np.percentile(values, 99))

                del self.device_aggregators[device_code][agg_key]

    def _trigger_callbacks(self, window: StreamWindow):
        for callback in self.window_callbacks:
            try:
                callback(window)
            except Exception as e:
                print(f"Window callback error: {e}")

    def add_window_callback(self, callback: Callable[[StreamWindow], None]):
        self.window_callbacks.append(callback)

    def get_active_windows(self) -> List[StreamWindow]:
        return list(self.windows)

    def clear(self):
        self.windows.clear()
        self.device_aggregators.clear()
        self.window_callbacks.clear()


class AsyncTaskQueue:
    def __init__(self, max_workers: int = 4, queue_size: int = 1000):
        self.max_workers = max_workers
        self.queue: asyncio.Queue = asyncio.Queue(maxsize=queue_size)
        self.workers: List[asyncio.Task] = []
        self.is_running = False
        self.task_handlers: Dict[str, Callable] = {}
        self.completed_tasks = 0
        self.failed_tasks = 0
        self._lock = threading.Lock()

    def register_handler(self, task_type: str, handler: Callable):
        self.task_handlers[task_type] = handler

    async def start(self):
        if self.is_running:
            return
        self.is_running = True
        self.workers = [
            asyncio.create_task(self._worker(i))
            for i in range(self.max_workers)
        ]

    async def stop(self):
        self.is_running = False
        for worker in self.workers:
            worker.cancel()
        await asyncio.gather(*self.workers, return_exceptions=True)
        self.workers.clear()

    async def submit(self, task_type: str, data: Any, priority: int = 0) -> bool:
        try:
            await self.queue.put((priority, task_type, data, time.time()))
            return True
        except asyncio.QueueFull:
            return False

    def submit_sync(self, task_type: str, data: Any, priority: int = 0) -> bool:
        try:
            self.queue.put_nowait((priority, task_type, data, time.time()))
            return True
        except asyncio.QueueFull:
            return False

    async def _worker(self, worker_id: int):
        while self.is_running:
            try:
                priority, task_type, data, submit_time = await self.queue.get()
                handler = self.task_handlers.get(task_type)

                if handler:
                    try:
                        if asyncio.iscoroutinefunction(handler):
                            await handler(data)
                        else:
                            handler(data)
                        with self._lock:
                            self.completed_tasks += 1
                    except Exception as e:
                        print(f"Task {task_type} failed: {e}")
                        with self._lock:
                            self.failed_tasks += 1
                else:
                    print(f"No handler for task type: {task_type}")

                self.queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Worker {worker_id} error: {e}")
                await asyncio.sleep(0.1)

    def get_stats(self) -> Dict[str, int]:
        with self._lock:
            return {
                'queue_size': self.queue.qsize(),
                'completed': self.completed_tasks,
                'failed': self.failed_tasks,
                'active_workers': len([w for w in self.workers if not w.done()]),
                'is_running': self.is_running
            }


class StreamingProcessor:
    def __init__(self, db_session=None):
        self.db_session = db_session
        self.window_managers: Dict[str, SlidingWindowManager] = {}
        self.task_queue = AsyncTaskQueue(max_workers=4, queue_size=1000)
        self._processors: Dict[str, Callable] = {}
        self._is_initialized = False

    async def initialize(self):
        if self._is_initialized:
            return

        self.window_managers = {
            '1min': SlidingWindowManager(
                window_duration=timedelta(minutes=1),
                slide_duration=timedelta(seconds=10),
                aggregations=[
                    AggregationType.MEAN, AggregationType.STD,
                    AggregationType.RMS, AggregationType.PEAK,
                    AggregationType.CREST, AggregationType.COUNT,
                    AggregationType.PERCENTILE
                ]
            ),
            '5min': SlidingWindowManager(
                window_duration=timedelta(minutes=5),
                slide_duration=timedelta(minutes=1),
                aggregations=[
                    AggregationType.MEAN, AggregationType.STD,
                    AggregationType.MIN, AggregationType.MAX,
                    AggregationType.RMS, AggregationType.PEAK,
                    AggregationType.KURTOSIS, AggregationType.PERCENTILE
                ]
            ),
            '15min': SlidingWindowManager(
                window_duration=timedelta(minutes=15),
                slide_duration=timedelta(minutes=5),
                aggregations=[
                    AggregationType.MEAN, AggregationType.STD,
                    AggregationType.MIN, AggregationType.MAX,
                    AggregationType.RMS, AggregationType.PEAK,
                    AggregationType.KURTOSIS, AggregationType.PERCENTILE
                ]
            )
        }

        self.task_queue.register_handler('process_window', self._handle_window_processed)
        self.task_queue.register_handler('detect_anomaly', self._handle_anomaly_detection)
        self.task_queue.register_handler('update_aggregation', self._handle_aggregation_update)

        for wm in self.window_managers.values():
            wm.add_window_callback(self._on_window_closed)

        await self.task_queue.start()
        self._is_initialized = True

    async def process_data_point(self, point: Dict):
        if not self._is_initialized:
            await self.initialize()

        closed_windows = []
        for wm in self.window_managers.values():
            closed = wm.add_data_point(point)
            closed_windows.extend(closed)

        return closed_windows

    async def process_data_batch(self, points: List[Dict]):
        if not self._is_initialized:
            await self.initialize()

        all_closed = []
        for wm in self.window_managers.values():
            closed = wm.add_data_batch(points)
            all_closed.extend(closed)

        return all_closed

    def _on_window_closed(self, window: StreamWindow):
        self.task_queue.submit_sync('process_window', {
            'window': window,
            'processed_at': datetime.now().isoformat()
        })

    def _handle_window_processed(self, data: Dict):
        window: StreamWindow = data.get('window')
        if not window or not self.db_session:
            return

        try:
            from app.models import VibrationAggregation
            for field, results in window.aggregation_results.items():
                agg = VibrationAggregation(
                    device_code=window.device_code,
                    time_bucket=window.start_time,
                    window_size=window.end_time - window.start_time,
                    metric_name=field,
                    mean_value=results.get('mean'),
                    max_value=results.get('max'),
                    min_value=results.get('min'),
                    std_value=results.get('std'),
                    count=results.get('count'),
                    rms_value=results.get('rms'),
                    peak_value=results.get('peak'),
                    crest_factor=results.get('crest'),
                    kurtosis=results.get('kurtosis'),
                    p50=results.get('p50'),
                    p95=results.get('p95'),
                    p99=results.get('p99'),
                    created_at=datetime.now()
                )
                self.db_session.add(agg)
            self.db_session.commit()

            self.task_queue.submit_sync('detect_anomaly', {
                'window': window,
                'aggregations': window.aggregation_results
            })
        except Exception as e:
            print(f"Error saving window aggregation: {e}")
            self.db_session.rollback()

    def _handle_anomaly_detection(self, data: Dict):
        try:
            from app.services.anomaly_detector import anomaly_detector
            window = data.get('window')
            aggregations = data.get('aggregations')

            if window and aggregations:
                features = []
                for field, results in aggregations.items():
                    if field == 'rms_value' and results.get('rms'):
                        features.append({
                            'timestamp': window.start_time,
                            'rms': results['rms'],
                            'peak': results.get('peak', 0),
                            'kurtosis': results.get('kurtosis', 0),
                            'crest': results.get('crest', 0)
                        })

                if features:
                    anomalies = anomaly_detector.detect_threshold_anomalies(
                        features,
                        device_code=window.device_code,
                        vibration_data=[{
                            'timestamp': f['timestamp'],
                            'rms_value': f['rms'],
                            'peak_value': f['peak'],
                            'temperature': 25.0,
                            'speed': 3000
                        } for f in features]
                    )
        except Exception as e:
            print(f"Error in streaming anomaly detection: {e}")

    def _handle_aggregation_update(self, data: Dict):
        pass

    def get_stats(self) -> Dict:
        return {
            'task_queue': self.task_queue.get_stats(),
            'window_managers': {
                key: {
                    'active_windows': len(wm.get_active_windows()),
                    'callbacks': len(wm.window_callbacks)
                }
                for key, wm in self.window_managers.items()
            },
            'is_initialized': self._is_initialized
        }

    async def shutdown(self):
        await self.task_queue.stop()
        for wm in self.window_managers.values():
            wm.clear()
        self._is_initialized = False


_global_streaming_processor: Optional[StreamingProcessor] = None


def get_streaming_processor(db_session=None) -> StreamingProcessor:
    global _global_streaming_processor
    if _global_streaming_processor is None:
        _global_streaming_processor = StreamingProcessor(db_session)
    return _global_streaming_processor
