import math
import time
from collections import deque
from typing import Dict, Optional, List, Deque, Tuple
import numpy as np

from ..core.config import settings
from ..db.database import db
from ..schemas.models import AnomalyResult


class AnomalyDetector:
    def __init__(self, window_size: int = 200):
        self.window_size = window_size
        self.data_windows: Dict[str, Deque[float]] = {}
        self.last_values: Dict[str, float] = {}
        self.last_alert_time: Dict[str, float] = {}
        self.alert_cooldown = 5.0
        self.z_score_threshold = settings.Z_SCORE_THRESHOLD
        self.iqr_multiplier = settings.IQR_MULTIPLIER
        self.enabled = settings.ANOMALY_DETECTION_ENABLED
        self.min_data_points = 30
        self.consecutive_anomalies: Dict[str, int] = {}
        self.required_consecutive = 2

    def _get_window(self, key: str) -> Deque[float]:
        if key not in self.data_windows:
            self.data_windows[key] = deque(maxlen=self.window_size)
        return self.data_windows[key]

    def _in_cooldown(self, key: str) -> bool:
        last_time = self.last_alert_time.get(key, 0)
        return (time.time() - last_time) < self.alert_cooldown

    def _update_cooldown(self, key: str) -> None:
        self.last_alert_time[key] = time.time()

    def _check_threshold(self, value: float, metric: str) -> Optional[AnomalyResult]:
        metric_def = db.get_metric_definition(metric)
        if not metric_def:
            return None

        crit_threshold = metric_def.get("crit_threshold")
        warn_threshold = metric_def.get("warn_threshold")

        if crit_threshold is not None and value >= crit_threshold:
            return AnomalyResult(
                is_anomaly=True,
                level="critical",
                alert_type="threshold_exceeded",
                threshold=crit_threshold,
                description=f"{metric_def.get('display_name', metric)} 超过临界阈值 {crit_threshold}{metric_def.get('unit', '')}",
                score=abs(value - crit_threshold) / max(crit_threshold, 1)
            )

        if warn_threshold is not None and value >= warn_threshold:
            return AnomalyResult(
                is_anomaly=True,
                level="warning",
                alert_type="threshold_warning",
                threshold=warn_threshold,
                description=f"{metric_def.get('display_name', metric)} 接近警告阈值 {warn_threshold}{metric_def.get('unit', '')}",
                score=abs(value - warn_threshold) / max(warn_threshold, 1)
            )

        return None

    def _check_z_score(self, value: float, key: str, window: Deque[float]) -> Optional[AnomalyResult]:
        if len(window) < self.min_data_points:
            return None

        values = list(window)
        mean = np.mean(values)
        std = np.std(values)

        if std == 0 or mean == 0:
            return None

        z_score = abs((value - mean) / std)
        relative_diff = abs(value - mean) / mean

        if z_score >= self.z_score_threshold and relative_diff > 0.1:
            level = "critical" if z_score >= self.z_score_threshold * 1.5 else "warning"
            return AnomalyResult(
                is_anomaly=True,
                level=level,
                alert_type="z_score_anomaly",
                threshold=float(mean + self.z_score_threshold * std),
                description=f"统计异常: Z分数={z_score:.2f}, 均值={mean:.2f}, 标准差={std:.2f}",
                score=float(z_score)
            )

        return None

    def _check_iqr(self, value: float, key: str, window: Deque[float]) -> Optional[AnomalyResult]:
        if len(window) < self.min_data_points:
            return None

        values = list(window)
        q1 = np.percentile(values, 25)
        q3 = np.percentile(values, 75)
        iqr = q3 - q1
        median = np.median(values)

        if iqr == 0 or median == 0:
            return None

        lower_bound = q1 - self.iqr_multiplier * iqr
        upper_bound = q3 + self.iqr_multiplier * iqr

        relative_diff = abs(value - median) / median

        if (value < lower_bound or value > upper_bound) and relative_diff > 0.15:
            level = "warning"
            bound = upper_bound if value > upper_bound else lower_bound
            return AnomalyResult(
                is_anomaly=True,
                level=level,
                alert_type="iqr_outlier",
                threshold=float(bound),
                description=f"IQR离群点: 值={value:.2f}, 范围=[{lower_bound:.2f}, {upper_bound:.2f}]",
                score=abs(value - bound) / max(abs(bound), 1)
            )

        return None

    def _check_rate_of_change(self, value: float, key: str, prev_value: float) -> Optional[AnomalyResult]:
        if prev_value is None:
            return None

        metric_name = key.split(':')[0]
        metric_def = db.get_metric_definition(metric_name)
        unit = metric_def.get('unit', '') if metric_def else ''

        abs_change = abs(value - prev_value)
        if abs_change < 0.5:
            return None

        if prev_value == 0:
            if abs_change > 5:
                return AnomalyResult(
                    is_anomaly=True,
                    level="warning",
                    alert_type="rate_spike",
                    threshold=5.0,
                    description=f"突变异常: 从0突变为{value:.2f}{unit}",
                    score=abs_change
                )
            return None

        change_rate = abs((value - prev_value) / prev_value) * 100

        rate_threshold = 100.0
        if metric_def:
            crit = metric_def.get('crit_threshold', 100)
            rate_threshold = max(50.0, crit * 0.5)

        if change_rate >= rate_threshold and abs_change > 1.0:
            level = "critical" if change_rate >= rate_threshold * 2 else "warning"
            return AnomalyResult(
                is_anomaly=True,
                level=level,
                alert_type="rate_spike",
                threshold=rate_threshold,
                description=f"突变异常: 变化率={change_rate:.1f}%, 前值={prev_value:.2f}, 当前={value:.2f}",
                score=min(change_rate, 200)
            )

        return None

    def detect(self, timestamp: int, metric: str, value: float, source: str) -> AnomalyResult:
        if not self.enabled:
            return AnomalyResult(is_anomaly=False)

        key = f"{metric}:{source}"
        window = self._get_window(key)
        prev_value = self.last_values.get(key)

        threshold_result = self._check_threshold(value, metric)

        if threshold_result and threshold_result.level == "critical":
            self._update_cooldown(key)
            self.last_values[key] = value
            if len(window) >= self.min_data_points:
                window.append(value)
            return threshold_result

        if len(window) < self.min_data_points:
            window.append(value)
            self.last_values[key] = value
            return AnomalyResult(is_anomaly=False)

        checks = [
            self._check_rate_of_change(value, key, prev_value),
            self._check_z_score(value, key, window),
            self._check_iqr(value, key, window),
        ]

        if threshold_result:
            checks.append(threshold_result)

        anomalies = [c for c in checks if c is not None and c.is_anomaly]

        window.append(value)
        self.last_values[key] = value

        if not anomalies:
            self.consecutive_anomalies[key] = 0
            return AnomalyResult(is_anomaly=False)

        if self._in_cooldown(key):
            return AnomalyResult(is_anomaly=False)

        critical_count = sum(1 for a in anomalies if a.level == "critical")
        warning_count = sum(1 for a in anomalies if a.level == "warning")

        if critical_count == 0 and warning_count < 2:
            self.consecutive_anomalies[key] = self.consecutive_anomalies.get(key, 0) + 1
            if self.consecutive_anomalies[key] < self.required_consecutive:
                return AnomalyResult(is_anomaly=False)

        anomalies.sort(key=lambda x: {"critical": 0, "warning": 1, "info": 2}.get(x.level, 3))
        result = anomalies[0]

        if len(anomalies) > 1:
            types = [a.alert_type for a in anomalies]
            result.description = f"{result.description} (同时检测到: {', '.join(types)})"

        self._update_cooldown(key)
        self.consecutive_anomalies[key] = 0

        return result


anomaly_detector = AnomalyDetector()
