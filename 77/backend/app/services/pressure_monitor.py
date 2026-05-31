import time
import uuid
import asyncio
from collections import deque
from typing import Dict, List, Optional, Tuple
import numpy as np

from ..db.database import db
from ..schemas.models import AlertEvent, PressureAnalysisResult


class PressureMonitor:
    def __init__(self):
        self.pressure_history: Dict[str, deque] = {}
        self.flow_history: Dict[str, deque] = {}
        self.max_history = 200

        self.pressure_thresholds = {
            "normal": {"min": 0.3, "max": 0.8},
            "warning": {"min": 0.2, "max": 1.0},
            "critical": {"min": 0.1, "max": 1.2}
        }

        self.drop_rate_warning = -0.05
        self.drop_rate_critical = -0.15
        self.surge_rate_warning = 0.05
        self.surge_rate_critical = 0.15

        self.stagnation_window = 30
        self.stagnation_variance_threshold = 0.001

        self.leak_detection_window = 60
        self.leak_correlation_threshold = -0.7

        self.region_pipelines = {
            "东区": ["PL-001", "PL-002"],
            "西区": ["PL-003", "PL-004"],
            "南区": ["PL-005"],
            "北区": ["PL-006"],
        }

        self.region_boundaries = {
            "东区": {"x": [0, 50], "y": [0, 50]},
            "西区": {"x": [50, 100], "y": [0, 50]},
            "南区": {"x": [0, 100], "y": [50, 100]},
            "北区": {"x": [0, 100], "y": [-50, 0]},
        }

        self.pipeline_coordinates = {
            "PL-001": [20, 25],
            "PL-002": [30, 35],
            "PL-003": [70, 25],
            "PL-004": [80, 35],
            "PL-005": [50, 75],
            "PL-006": [50, 25],
        }

        self.pipeline_names = {
            "PL-001": "输水主管-1号",
            "PL-002": "输水主管-2号",
            "PL-003": "配水主管-3号",
            "PL-004": "配水主管-4号",
            "PL-005": "环网主管-5号",
            "PL-006": "加压主管-6号",
        }

    def _get_pressure_history(self, pipeline: str) -> deque:
        if pipeline not in self.pressure_history:
            self.pressure_history[pipeline] = deque(maxlen=self.max_history)
        return self.pressure_history[pipeline]

    def _get_flow_history(self, pipeline: str) -> deque:
        if pipeline not in self.flow_history:
            self.flow_history[pipeline] = deque(maxlen=self.max_history)
        return self.flow_history[pipeline]

    def update(self, pipeline: str, pressure: float, flow_rate: float,
               timestamp: Optional[int] = None) -> PressureAnalysisResult:
        ts = timestamp or int(time.time() * 1000)

        pressure_hist = self._get_pressure_history(pipeline)
        flow_hist = self._get_flow_history(pipeline)

        pressure_hist.append({"timestamp": ts, "value": pressure})
        flow_hist.append({"timestamp": ts, "value": flow_rate})

        return self._analyze(pipeline, pressure, flow_rate, ts)

    def _analyze(self, pipeline: str, pressure: float, flow_rate: float,
                 timestamp: int) -> PressureAnalysisResult:
        result = {
            "is_anomaly": False,
            "level": "info",
            "type": "normal",
            "drop_rate": 0.0,
            "duration_minutes": 0,
            "affected_region": self._get_region(pipeline),
            "confidence": 0.0,
            "recommended_action": "系统运行正常"
        }

        if len(self._get_pressure_history(pipeline)) < 10:
            return PressureAnalysisResult(**result)

        pressure_list = [p["value"] for p in self._get_pressure_history(pipeline)]
        flow_list = [f["value"] for f in self._get_flow_history(pipeline)]

        drop_rate = self._calculate_drop_rate(pressure_list)
        result["drop_rate"] = drop_rate

        stagnation = self._detect_stagnation(pressure_list)
        leak = self._detect_leak(pressure_list, flow_list)
        surge = self._detect_surge(drop_rate)
        rapid_drop = self._detect_rapid_drop(drop_rate)
        threshold_breach = self._check_thresholds(pressure)

        detected = []
        if threshold_breach["is_anomaly"]:
            detected.append(threshold_breach)
        if rapid_drop["is_anomaly"]:
            detected.append(rapid_drop)
        if surge["is_anomaly"]:
            detected.append(surge)
        if stagnation["is_anomaly"]:
            detected.append(stagnation)
        if leak["is_anomaly"]:
            detected.append(leak)

        if detected:
            detected.sort(key=lambda x: {"critical": 0, "warning": 1, "info": 2}[x["level"]])
            primary = detected[0]

            result["is_anomaly"] = True
            result["level"] = primary["level"]
            result["type"] = primary["type"]
            result["confidence"] = primary["confidence"]
            result["recommended_action"] = primary["recommended_action"]
            result["duration_minutes"] = primary.get("duration_minutes", 0)

            if len(detected) > 1:
                types = [d["type"] for d in detected]
                result["recommended_action"] += f" (同时检测到: {', '.join(types)})"

        return PressureAnalysisResult(**result)

    def _calculate_drop_rate(self, values: List[float]) -> float:
        if len(values) < 5:
            return 0.0

        recent = values[-10:]
        if len(recent) < 2:
            return 0.0

        x = np.arange(len(recent))
        slope, _ = np.polyfit(x, recent, 1)
        return float(slope)

    def _check_thresholds(self, pressure: float) -> Dict:
        if pressure < self.pressure_thresholds["critical"]["min"]:
            return {
                "is_anomaly": True,
                "level": "critical",
                "type": "pressure_drop",
                "confidence": 0.95,
                "recommended_action": "压力严重偏低，请立即检查管道泄漏或阀门状态"
            }
        elif pressure > self.pressure_thresholds["critical"]["max"]:
            return {
                "is_anomaly": True,
                "level": "critical",
                "type": "pressure_surge",
                "confidence": 0.95,
                "recommended_action": "压力严重偏高，请立即检查泵站运行状态"
            }
        elif pressure < self.pressure_thresholds["warning"]["min"]:
            return {
                "is_anomaly": True,
                "level": "warning",
                "type": "pressure_drop",
                "confidence": 0.7,
                "recommended_action": "压力偏低，建议监测管道压力变化"
            }
        elif pressure > self.pressure_thresholds["warning"]["max"]:
            return {
                "is_anomaly": True,
                "level": "warning",
                "type": "pressure_surge",
                "confidence": 0.7,
                "recommended_action": "压力偏高，建议检查压力调节阀"
            }

        return {"is_anomaly": False}

    def _detect_rapid_drop(self, drop_rate: float) -> Dict:
        if drop_rate < self.drop_rate_critical:
            return {
                "is_anomaly": True,
                "level": "critical",
                "type": "pressure_drop",
                "confidence": 0.9,
                "recommended_action": "压力快速下降，可能存在管道爆裂，请立即处置"
            }
        elif drop_rate < self.drop_rate_warning:
            return {
                "is_anomaly": True,
                "level": "warning",
                "type": "pressure_drop",
                "confidence": 0.6,
                "recommended_action": "压力持续下降，建议检查泄漏点"
            }
        return {"is_anomaly": False}

    def _detect_surge(self, drop_rate: float) -> Dict:
        if drop_rate > self.surge_rate_critical:
            return {
                "is_anomaly": True,
                "level": "critical",
                "type": "pressure_surge",
                "confidence": 0.9,
                "recommended_action": "压力快速升高，可能存在阀门关闭或泵故障"
            }
        elif drop_rate > self.surge_rate_warning:
            return {
                "is_anomaly": True,
                "level": "warning",
                "type": "pressure_surge",
                "confidence": 0.6,
                "recommended_action": "压力持续升高，建议检查下游用水情况"
            }
        return {"is_anomaly": False}

    def _detect_stagnation(self, values: List[float]) -> Dict:
        if len(values) < self.stagnation_window:
            return {"is_anomaly": False}

        recent = values[-self.stagnation_window:]
        variance = np.var(recent)

        if variance < self.stagnation_variance_threshold and np.mean(recent) < 0.1:
            return {
                "is_anomaly": True,
                "level": "warning",
                "type": "pressure_stagnation",
                "confidence": 0.8,
                "duration_minutes": self.stagnation_window,
                "recommended_action": "压力长期停滞偏低，可能存在断供情况"
            }
        return {"is_anomaly": False}

    def _detect_leak(self, pressure_values: List[float], flow_values: List[float]) -> Dict:
        if len(pressure_values) < self.leak_detection_window or len(flow_values) < self.leak_detection_window:
            return {"is_anomaly": False}

        pressure_recent = pressure_values[-self.leak_detection_window:]
        flow_recent = flow_values[-self.leak_detection_window:]

        if len(pressure_recent) != len(flow_recent) or len(pressure_recent) < 10:
            return {"is_anomaly": False}

        correlation = np.corrcoef(pressure_recent, flow_recent)[0, 1]

        if (not np.isnan(correlation) and correlation < self.leak_correlation_threshold
                and np.mean(flow_recent) > np.mean(flow_values[:-self.leak_detection_window]) * 1.2):
            return {
                "is_anomaly": True,
                "level": "critical",
                "type": "pressure_leak",
                "confidence": min(abs(correlation), 0.95),
                "recommended_action": "检测到压力-流量异常关联，可能存在泄漏点"
            }
        return {"is_anomaly": False}

    def _get_region(self, pipeline: str) -> str:
        for region, pipelines in self.region_pipelines.items():
            if pipeline in pipelines:
                return region
        return "unknown"

    def get_pipeline_status(self, pipeline: str) -> Dict:
        pressure_hist = self._get_pressure_history(pipeline)
        flow_hist = self._get_flow_history(pipeline)

        status = "normal"
        pressure = 0.5
        flow_rate = 120.0
        temperature = 20.0
        last_update = int(time.time() * 1000)

        if pressure_hist:
            pressure_values = [p["value"] for p in pressure_hist]
            flow_values = [f["value"] for f in flow_hist]
            pressure = pressure_values[-1]
            flow_rate = flow_values[-1] if flow_values else 120.0
            last_update = pressure_hist[-1]["timestamp"]
            status = self._get_status(pressure_values[-1])

        result = {
            "id": pipeline,
            "name": self.pipeline_names.get(pipeline, pipeline),
            "region": self._get_region(pipeline),
            "pressure": pressure,
            "flow_rate": flow_rate,
            "temperature": temperature,
            "status": status,
            "last_update": last_update,
            "coordinates": self.pipeline_coordinates.get(pipeline, [0, 0]),
        }

        return result

    def _get_status(self, pressure: float) -> str:
        if (pressure < self.pressure_thresholds["critical"]["min"]
                or pressure > self.pressure_thresholds["critical"]["max"]):
            return "critical"
        elif (pressure < self.pressure_thresholds["warning"]["min"]
                or pressure > self.pressure_thresholds["warning"]["max"]):
            return "warning"
        return "normal"

    def get_all_pipelines(self) -> List[Dict]:
        pipelines = set()
        for region_pipes in self.region_pipelines.values():
            pipelines.update(region_pipes)
        return [self.get_pipeline_status(p) for p in sorted(pipelines)]

    def get_region_summary(self, region: str) -> Dict:
        pipelines = self.region_pipelines.get(region, [])
        pipeline_statuses = [self.get_pipeline_status(p) for p in pipelines]

        if not pipeline_statuses:
            return {
                "id": region,
                "name": region,
                "pipelines": [],
                "avg_pressure": 0,
                "avg_flow_rate": 0,
                "avg_temperature": 20,
                "pressure_drop_rate": 0,
                "warning_count": 0,
                "critical_count": 0,
                "alert_count": 0,
                "pipeline_count": 0,
                "status": "unknown",
                "color": "#64748b",
            }

        pressures = [s["pressure"] for s in pipeline_statuses]
        flows = [s["flow_rate"] for s in pipeline_statuses]
        statuses = [s["status"] for s in pipeline_statuses]

        if "critical" in statuses:
            overall_status = "critical"
        elif "warning" in statuses:
            overall_status = "warning"
        else:
            overall_status = "normal"

        warning_count = sum(1 for s in statuses if s == "warning")
        critical_count = sum(1 for s in statuses if s == "critical")
        alert_count = warning_count + critical_count

        return {
            "id": region,
            "name": region,
            "pipelines": pipelines,
            "avg_pressure": float(np.mean(pressures)),
            "avg_flow_rate": float(np.mean(flows)),
            "avg_temperature": 20.0,
            "pressure_drop_rate": float(self._calculate_drop_rate(pressures)),
            "warning_count": warning_count,
            "critical_count": critical_count,
            "alert_count": alert_count,
            "pipeline_count": len(pipelines),
            "status": overall_status,
            "color": self._get_region_color(overall_status),
        }

    def _get_region_color(self, status: str) -> str:
        return {
            "normal": "#10b981",
            "warning": "#f59e0b",
            "critical": "#ef4444"
        }.get(status, "#64748b")

    def get_all_regions(self) -> List[Dict]:
        return [self.get_region_summary(r) for r in self.region_pipelines.keys()]

    def get_heatmap_data(self, metric: str = "pressure") -> List[Dict]:
        heatmap = []
        for region in self.region_pipelines.keys():
            summary = self.get_region_summary(region)
            bounds = self.region_boundaries.get(region, {"x": [0, 100], "y": [0, 100]})

            if metric == "pressure":
                value = summary.get("avg_pressure", 0)
            elif metric == "flow_rate":
                value = summary.get("avg_flow_rate", 0)
            else:
                value = summary.get("alert_count", 0)

            for x in range(int(bounds["x"][0]), int(bounds["x"][1]), 10):
                for y in range(int(bounds["y"][0]), int(bounds["y"][1]), 10):
                    heatmap.append({
                        "x": x,
                        "y": y,
                        "value": float(value),
                        "region": region,
                        "metric": metric
                    })

        return heatmap

    def get_correlation_analysis(self, pipeline_a: str, pipeline_b: str) -> Dict:
        pressure_a = [p["value"] for p in self._get_pressure_history(pipeline_a)]
        pressure_b = [p["value"] for p in self._get_pressure_history(pipeline_b)]

        min_len = min(len(pressure_a), len(pressure_b))
        if min_len < 20:
            return {"error": "Insufficient data"}

        pressure_a = pressure_a[-min_len:]
        pressure_b = pressure_b[-min_len:]

        correlation = np.corrcoef(pressure_a, pressure_b)[0, 1]
        lag = self._find_lag(pressure_a, pressure_b)

        significance = "high" if abs(correlation) > 0.7 else "medium" if abs(correlation) > 0.4 else "low"

        correlation_val = float(correlation) if not np.isnan(correlation) else 0
        interpretation = self._interpret_correlation(correlation_val, lag)

        return {
            "metric_a": pipeline_a,
            "metric_b": pipeline_b,
            "correlation": correlation_val,
            "lag": lag,
            "lag_minutes": float(abs(lag)),
            "p_value": 0.05,
            "significance": significance,
            "interpretation": interpretation,
        }

    def _find_lag(self, series_a: List[float], series_b: List[float]) -> int:
        if len(series_a) < 20 or len(series_b) < 20:
            return 0

        correlations = []
        for lag in range(-10, 11):
            if lag >= 0:
                a = series_a[lag:]
                b = series_b[:len(series_b) - lag] if lag > 0 else series_b
            else:
                a = series_a[:len(series_a) + lag]
                b = series_b[-lag:]

            min_len = min(len(a), len(b))
            if min_len < 10:
                correlations.append(0)
                continue

            corr = np.corrcoef(a[:min_len], b[:min_len])[0, 1]
            correlations.append(corr if not np.isnan(corr) else 0)

        max_idx = np.argmax(np.abs(correlations))
        return max_idx - 10

    def _interpret_correlation(self, correlation: float, lag: int) -> str:
        if abs(correlation) >= 0.7:
            strength = "强"
        elif abs(correlation) >= 0.4:
            strength = "中等"
        else:
            strength = "弱"

        if correlation > 0:
            direction = "正相关"
        else:
            direction = "负相关"

        if lag == 0:
            return f"检测到{strength}{direction}，两个区域压力变化同步"
        elif lag > 0:
            return f"检测到{strength}{direction}，{self._get_region('PL-001')}滞后约{lag}分钟"
        else:
            return f"检测到{strength}{direction}，{self._get_region('PL-003')}滞后约{abs(lag)}分钟"

    def create_alert(self, pipeline: str, analysis: PressureAnalysisResult,
                     value: float) -> Optional[AlertEvent]:
        if not analysis.is_anomaly:
            return None

        alert_id = str(uuid.uuid4())
        return AlertEvent(
            id=alert_id,
            timestamp=int(time.time() * 1000),
            metric=f"pressure_{analysis.type}",
            source=pipeline,
            level=analysis.level,
            alert_type=analysis.type,
            value=value,
            threshold=self.pressure_thresholds["warning"]["min"],
            description=analysis.recommended_action,
            tags={
                "pipeline": pipeline,
                "region": analysis.affected_region,
                "confidence": analysis.confidence,
                "drop_rate": analysis.drop_rate
            }
        )


pressure_monitor = PressureMonitor()
