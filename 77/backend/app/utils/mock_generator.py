import time
import random
import math
import asyncio
from typing import List, Dict, Generator
import numpy as np

from ..schemas.models import MetricData


class MockDataGenerator:
    def __init__(self):
        self.metrics = [
            {"name": "cpu_usage", "base": 45, "amplitude": 25, "unit": "%"},
            {"name": "memory_usage", "base": 60, "amplitude": 20, "unit": "%"},
            {"name": "disk_io", "base": 50, "amplitude": 40, "unit": "MB/s"},
            {"name": "network_latency", "base": 30, "amplitude": 20, "unit": "ms"},
            {"name": "temperature", "base": 55, "amplitude": 15, "unit": "°C"},
            {"name": "error_rate", "base": 1, "amplitude": 2, "unit": "%"},
            {"name": "pressure", "base": 0.5, "amplitude": 0.2, "unit": "MPa"},
            {"name": "flow_rate", "base": 120, "amplitude": 50, "unit": "m³/h"},
        ]
        self.sources = [
            "server_01", "server_02", "db_01", "gateway_01",
            "PL-001", "PL-002", "PL-003",
            "PL-004", "PL-005", "PL-006"
        ]
        self.pipeline_sources = ["PL-001", "PL-002", "PL-003", "PL-004", "PL-005", "PL-006"]
        self.t = 0
        self.anomaly_chance = 0.05
        self.spike_chance = 0.02

    def _generate_value(self, metric_config: Dict, source: str) -> float:
        self.t += 0.01
        source_offset = hash(source) % 10
        base = metric_config["base"] + source_offset * 0.5
        amplitude = metric_config["amplitude"]

        noise = random.gauss(0, amplitude * 0.1)
        trend = math.sin(self.t) * amplitude * 0.3
        seasonal = math.sin(self.t * 0.3) * amplitude * 0.2

        value = base + trend + seasonal + noise

        if random.random() < self.spike_chance:
            spike = random.choice([1, -1]) * random.uniform(amplitude, amplitude * 3)
            value += spike

        if random.random() < self.anomaly_chance:
            anomaly_factor = random.uniform(1.5, 3.0)
            value = base + amplitude * anomaly_factor * random.choice([0.8, 1.2])

        return max(0, min(999, value))

    def generate_single(self) -> MetricData:
        metric_config = random.choice(self.metrics)
        source = random.choice(self.sources)
        value = self._generate_value(metric_config, source)
        timestamp = int(time.time() * 1000)

        return MetricData(
            timestamp=timestamp,
            metric=metric_config["name"],
            value=round(value, 2),
            source=source,
            tags={"env": "production", "metric_type": metric_config["name"].split("_")[0]}
        )

    def generate_batch(self, count: int = 10) -> List[MetricData]:
        batch = []
        timestamp = int(time.time() * 1000)
        for i in range(count):
            for metric_config in self.metrics:
                for source in self.sources:
                    value = self._generate_value(metric_config, source)
                    batch.append(MetricData(
                        timestamp=timestamp - (count - i) * 1000,
                        metric=metric_config["name"],
                        value=round(value, 2),
                        source=source,
                        tags={"env": "production"}
                    ))
        return batch

    def generate_historical(self, hours: int = 1, interval_seconds: int = 10) -> List[MetricData]:
        batch = []
        now = int(time.time() * 1000)
        total_points = int(hours * 3600 / interval_seconds)
        t_start = self.t

        for i in range(total_points):
            timestamp = now - (total_points - i) * interval_seconds * 1000
            self.t = t_start + i * 0.01
            for metric_config in self.metrics:
                for source in self.sources:
                    value = self._generate_value(metric_config, source)
                    batch.append({
                        "timestamp": timestamp,
                        "metric": metric_config["name"],
                        "value": round(value, 2),
                        "source": source,
                        "tags": {"env": "production"},
                        "is_anomaly": 0
                    })

        self.t = t_start
        return batch

    async def generate_stream(self, interval: float = 1.0):
        while True:
            yield self.generate_single()
            await asyncio.sleep(interval)


mock_generator = MockDataGenerator()
