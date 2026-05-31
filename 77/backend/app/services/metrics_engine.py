import time
import uuid
import asyncio
from collections import deque
from typing import Dict, List, Optional, Deque, Callable, Any
from dataclasses import dataclass, field
import numpy as np

from ..db.database import db
from .anomaly_detector import anomaly_detector
from .pressure_monitor import pressure_monitor
from ..schemas.models import MetricData, AlertEvent


@dataclass
class StreamMetrics:
    processed_count: int = 0
    dropped_count: int = 0
    error_count: int = 0
    avg_processing_time: float = 0.0
    queue_size: int = 0


class AsyncStreamProcessor:
    def __init__(self, max_queue_size: int = 10000, batch_size: int = 100,
                 batch_timeout: float = 0.5):
        self.max_queue_size = max_queue_size
        self.batch_size = batch_size
        self.batch_timeout = batch_timeout

        self.queue: asyncio.Queue = asyncio.Queue(maxsize=max_queue_size)
        self.processors: List[Callable] = []
        self.batch_processors: List[Callable] = []
        self.metrics = StreamMetrics()
        self._is_running = False
        self._process_task: Optional[asyncio.Task] = None
        self._batch_buffer: List[Any] = []
        self._last_batch_time: float = 0.0

    def add_processor(self, processor: Callable):
        self.processors.append(processor)

    def add_batch_processor(self, processor: Callable):
        self.batch_processors.append(processor)

    async def submit(self, data: Any) -> bool:
        if self.queue.qsize() >= self.max_queue_size:
            self.metrics.dropped_count += 1
            return False

        try:
            self.queue.put_nowait(data)
            return True
        except asyncio.QueueFull:
            self.metrics.dropped_count += 1
            return False

    async def start(self):
        if self._is_running:
            return
        self._is_running = True
        self._process_task = asyncio.create_task(self._process_loop())

    async def stop(self):
        self._is_running = False
        if self._process_task:
            self._process_task.cancel()
            try:
                await self._process_task
            except asyncio.CancelledError:
                pass

    async def _process_loop(self):
        while self._is_running:
            try:
                self.metrics.queue_size = self.queue.qsize()

                batch_data = await self._collect_batch()
                if batch_data:
                    await self._process_batch(batch_data)

            except asyncio.CancelledError:
                break
            except Exception as e:
                self.metrics.error_count += 1
                print(f"Stream processor error: {e}")
                await asyncio.sleep(0.1)

    async def _collect_batch(self) -> List[Any]:
        self._batch_buffer = []
        self._last_batch_time = time.time()

        try:
            while len(self._batch_buffer) < self.batch_size:
                timeout = self.batch_timeout - (time.time() - self._last_batch_time)
                if timeout <= 0:
                    break

                try:
                    data = await asyncio.wait_for(self.queue.get(), timeout=timeout)
                    self._batch_buffer.append(data)
                except asyncio.TimeoutError:
                    break
                except asyncio.CancelledError:
                    break

        except Exception as e:
            print(f"Batch collection error: {e}")

        return self._batch_buffer

    async def _process_batch(self, batch: List[Any]):
        t0 = time.time()

        for data in batch:
            for processor in self.processors:
                try:
                    if asyncio.iscoroutinefunction(processor):
                        await processor(data)
                    else:
                        processor(data)
                except Exception as e:
                    self.metrics.error_count += 1
                    print(f"Processor error: {e}")

        if self.batch_processors and batch:
            for batch_processor in self.batch_processors:
                try:
                    if asyncio.iscoroutinefunction(batch_processor):
                        await batch_processor(batch)
                    else:
                        batch_processor(batch)
                except Exception as e:
                    self.metrics.error_count += 1
                    print(f"Batch processor error: {e}")

        processing_time = (time.time() - t0) * 1000 / max(len(batch), 1)
        self.metrics.processed_count += len(batch)
        alpha = 0.1
        self.metrics.avg_processing_time = (
            alpha * processing_time + (1 - alpha) * self.metrics.avg_processing_time
        )

    def get_metrics(self) -> Dict:
        return {
            "processed_count": self.metrics.processed_count,
            "dropped_count": self.metrics.dropped_count,
            "error_count": self.metrics.error_count,
            "avg_processing_time_ms": self.metrics.avg_processing_time,
            "current_queue_size": self.queue.qsize(),
            "max_queue_size": self.max_queue_size,
            "backpressure_level": self._get_backpressure_level()
        }

    def _get_backpressure_level(self) -> str:
        ratio = self.queue.qsize() / self.max_queue_size
        if ratio < 0.5:
            return "normal"
        elif ratio < 0.8:
            return "warning"
        else:
            return "critical"


class MetricsEngine:
    def __init__(self):
        self.recent_data: Dict[str, Deque[Dict]] = {}
        self.running_metrics: Dict[str, Dict] = {}
        self.alert_cooldown: Dict[str, float] = {}
        self.cooldown_period = 60.0

        self.stream_processor = AsyncStreamProcessor(
            max_queue_size=20000,
            batch_size=200,
            batch_timeout=0.3
        )

        self.stream_processor.add_processor(self._process_single)
        self.stream_processor.add_batch_processor(self._persist_batch)

        self._init_mock_data()

    def _init_mock_data(self):
        self.pipeline_regions = {
            "PL-001": "东区",
            "PL-002": "东区",
            "PL-003": "西区",
            "PL-004": "西区",
            "PL-005": "南区",
            "PL-006": "北区",
        }

        self.region_boundaries = {
            "东区": {"x": [0, 40], "y": [0, 50]},
            "西区": {"x": [60, 100], "y": [0, 50]},
            "南区": {"x": [40, 60], "y": [50, 100]},
            "北区": {"x": [40, 60], "y": [0, 50]},
        }

    async def start(self):
        await self.stream_processor.start()

    async def stop(self):
        await self.stream_processor.stop()

    def get_stream_metrics(self) -> Dict:
        return self.stream_processor.get_metrics()

    def _get_recent_queue(self, key: str) -> Deque[Dict]:
        if key not in self.recent_data:
            self.recent_data[key] = deque(maxlen=1000)
        return self.recent_data[key]

    def _should_alert(self, metric: str, source: str) -> bool:
        key = f"{metric}:{source}"
        now = time.time() * 1000
        last_alert = self.alert_cooldown.get(key, 0)
        if now - last_alert < self.cooldown_period * 1000:
            return False
        self.alert_cooldown[key] = now
        return True

    async def process_data_async(self, data: MetricData) -> bool:
        return await self.stream_processor.submit(data)

    def process_data(self, data: MetricData) -> Dict:
        return self._process_single(data)

    def _process_single(self, data: MetricData) -> Dict:
        t0 = time.time()

        key = f"{data.metric}:{data.source}"
        queue = self._get_recent_queue(key)

        anomaly_result = anomaly_detector.detect(
            data.timestamp, data.metric, data.value, data.source
        )

        data.is_anomaly = 1 if anomaly_result.is_anomaly else 0

        queue.append({
            "timestamp": data.timestamp,
            "value": data.value,
            "is_anomaly": data.is_anomaly,
            "process_time": time.time() - t0
        })

        if data.metric == "pressure" and data.source.startswith("PL-"):
            try:
                flow_key = f"flow_rate:{data.source}"
                flow_metrics = self.running_metrics.get(flow_key, {})
                flow_rate = flow_metrics.get("last_value", 120.0)
                pressure_monitor.update(data.source, data.value, flow_rate, data.timestamp)
            except Exception as e:
                print(f"Pressure monitor update error: {e}")

        alert = None
        if anomaly_result.is_anomaly and self._should_alert(data.metric, data.source):
            alert_id = str(uuid.uuid4())
            alert = AlertEvent(
                id=alert_id,
                timestamp=data.timestamp,
                metric=data.metric,
                source=data.source,
                level=anomaly_result.level or "warning",
                alert_type=anomaly_result.alert_type or "unknown",
                value=data.value,
                threshold=anomaly_result.threshold or 0,
                description=anomaly_result.description or ""
            )

            try:
                db.insert_alert(alert.model_dump())
            except Exception as e:
                print(f"Alert insert error: {e}")

        self._update_running_metrics(key, data)

        return {
            "data": data.model_dump(),
            "anomaly": anomaly_result.model_dump(),
            "alert": alert.model_dump() if alert else None
        }

    async def _persist_batch(self, batch: List[MetricData]):
        if not batch:
            return

        db_data = []
        for data in batch:
            db_data.append(data.model_dump())

        if db_data:
            try:
                db.insert_metric_batch(db_data)
            except Exception as e:
                print(f"Batch persist error: {e}")

    def process_batch(self, batch: List[MetricData]) -> List[Dict]:
        results = []
        db_data = []

        for data in batch:
            result = self._process_single(data)
            results.append(result)
            db_data.append(data.model_dump())

        if db_data:
            try:
                db.insert_metric_batch(db_data)
            except Exception as e:
                print(f"Process batch persist error: {e}")

        return results

    def _update_running_metrics(self, key: str, data: MetricData):
        if key not in self.running_metrics:
            self.running_metrics[key] = {
                "count": 0,
                "sum": 0.0,
                "min": float("inf"),
                "max": float("-inf"),
                "last_value": data.value,
                "last_timestamp": data.timestamp,
                "anomaly_count": 0,
                "ema": data.value
            }

        m = self.running_metrics[key]
        m["count"] += 1
        m["sum"] += data.value
        m["min"] = min(m["min"], data.value)
        m["max"] = max(m["max"], data.value)
        m["last_value"] = data.value
        m["last_timestamp"] = data.timestamp
        m["ema"] = 0.9 * m["ema"] + 0.1 * data.value
        if data.is_anomaly:
            m["anomaly_count"] += 1

    def get_latest_values(self) -> List[Dict]:
        results = []
        for key, m in self.running_metrics.items():
            metric, source = key.split(":", 1)
            avg = m["sum"] / m["count"] if m["count"] > 0 else 0
            results.append({
                "metric": metric,
                "source": source,
                "value": m["last_value"],
                "timestamp": m["last_timestamp"],
                "avg": avg,
                "ema": m.get("ema", avg),
                "min": m["min"] if m["min"] != float("inf") else 0,
                "max": m["max"] if m["max"] != float("-inf") else 0,
                "count": m["count"],
                "anomaly_count": m["anomaly_count"]
            })
        return results

    def get_metric_summary(self, metric: str, source: Optional[str] = None) -> Optional[Dict]:
        key = f"{metric}:{source}" if source else None
        if key and key in self.running_metrics:
            m = self.running_metrics[key]
            avg = m["sum"] / m["count"] if m["count"] > 0 else 0
            return {
                "metric": metric,
                "source": source,
                "value": m["last_value"],
                "timestamp": m["last_timestamp"],
                "avg": avg,
                "ema": m.get("ema", avg),
                "min": m["min"] if m["min"] != float("inf") else 0,
                "max": m["max"] if m["max"] != float("-inf") else 0,
                "count": m["count"],
                "anomaly_count": m["anomaly_count"]
            }
        return None

    def get_region_data(self, region: str) -> Dict:
        region_pipelines = [
            pl for pl, reg in self.pipeline_regions.items() if reg == region
        ]

        region_metrics = []
        for key, m in self.running_metrics.items():
            metric, source = key.split(":", 1)
            if source in region_pipelines:
                region_metrics.append({
                    "metric": metric,
                    "source": source,
                    "value": m["last_value"],
                    "timestamp": m["last_timestamp"],
                    "ema": m.get("ema", m["sum"] / max(m["count"], 1))
                })

        pressure_metrics = [m for m in region_metrics if m["metric"] == "pressure"]
        flow_metrics = [m for m in region_metrics if m["metric"] == "flow_rate"]

        bounds = self.region_boundaries.get(region, {"x": [0, 100], "y": [0, 100]})

        return {
            "region": region,
            "pipelines": region_pipelines,
            "metrics": region_metrics,
            "avg_pressure": np.mean([m["value"] for m in pressure_metrics]) if pressure_metrics else 0,
            "avg_flow": np.mean([m["value"] for m in flow_metrics]) if flow_metrics else 0,
            "bounds": bounds,
            "status": self._calculate_region_status(region_metrics)
        }

    def _calculate_region_status(self, metrics: List[Dict]) -> str:
        anomaly_count = sum(1 for m in metrics if m.get("anomaly_count", 0) > 0)
        if anomaly_count > len(metrics) * 0.3:
            return "critical"
        elif anomaly_count > 0:
            return "warning"
        return "normal"

    def get_all_regions(self) -> List[Dict]:
        return [self.get_region_data(region) for region in self.region_boundaries.keys()]


metrics_engine = MetricsEngine()
