import numpy as np
from scipy import stats as scipy_stats
from datetime import datetime
from typing import List, Dict, Any

from backend.models.schemas import MetricResult
from backend.config import METRICS_WINDOW_SECONDS


class MetricsCalculator:
    def __init__(self, window_seconds: int = METRICS_WINDOW_SECONDS):
        self.window_seconds = window_seconds
        self._buffers: Dict[str, List[Dict[str, Any]]] = {}

    def add_data(self, device_id: str, data: Dict[str, Any]):
        if device_id not in self._buffers:
            self._buffers[device_id] = []
        self._buffers[device_id].append(data)
        cutoff = (datetime.utcnow().timestamp() - self.window_seconds) * 1000
        self._buffers[device_id] = [
            d for d in self._buffers[device_id]
            if self._parse_ts(d.get("timestamp", "")) > cutoff
        ]

    @staticmethod
    def _parse_ts(ts_str: str) -> float:
        try:
            from dateutil import parser
            return parser.parse(ts_str).timestamp() * 1000
        except Exception:
            return 0.0

    def compute_metrics(self, device_id: str) -> List[MetricResult]:
        buffer = self._buffers.get(device_id, [])
        if len(buffer) < 2:
            return []
        results = []
        parameters = ["temperature", "vibration", "pressure", "rpm", "current"]
        for param in parameters:
            values = [d[param] for d in buffer if param in d and d[param] is not None]
            if len(values) < 2:
                continue
            arr = np.array(values, dtype=float)
            mean_val = float(np.mean(arr))
            std_val = float(np.std(arr, ddof=1)) if len(arr) > 1 else 0.0
            min_val = float(np.min(arr))
            max_val = float(np.max(arr))
            trend = self._compute_trend(arr)
            zscore_anomalies = self._count_zscore_anomalies(arr)
            results.append(MetricResult(
                device_id=device_id,
                parameter=param,
                mean=round(mean_val, 4),
                std=round(std_val, 4),
                min_val=round(min_val, 4),
                max_val=round(max_val, 4),
                trend=trend,
                zscore_anomalies=zscore_anomalies,
                window_seconds=self.window_seconds,
                computed_at=datetime.utcnow().isoformat(),
            ))
        return results

    @staticmethod
    def _compute_trend(arr: np.ndarray) -> str:
        if len(arr) < 3:
            return "stable"
        n = len(arr)
        x = np.arange(n, dtype=float)
        slope, _, r_value, _, _ = scipy_stats.linregress(x, arr)
        r_squared = r_value ** 2
        if r_squared < 0.3:
            return "stable"
        if slope > 0:
            return "rising"
        return "falling"

    @staticmethod
    def _count_zscore_anomalies(arr: np.ndarray, threshold: float = 2.5) -> int:
        if len(arr) < 3:
            return 0
        mean = np.mean(arr)
        std = np.std(arr, ddof=1)
        if std == 0:
            return 0
        z_scores = np.abs((arr - mean) / std)
        return int(np.sum(z_scores > threshold))

    def get_buffer_size(self, device_id: str) -> int:
        return len(self._buffers.get(device_id, []))


metrics_calculator = MetricsCalculator()
