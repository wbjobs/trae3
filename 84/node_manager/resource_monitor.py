import threading
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Callable
from collections import deque, defaultdict

from common.models import ResourceUsage, ComputeNode
from common.exceptions import NodeNotFoundException


class ResourceMonitor:
    def __init__(self, history_size: int = 100, alert_threshold: float = 80.0):
        self._resource_history: Dict[str, deque] = defaultdict(
            lambda: deque(maxlen=history_size)
        )
        self._lock = threading.RLock()
        self._history_size = history_size
        self._alert_threshold = alert_threshold
        self._alert_callbacks: List[Callable[[str, str, float, float], None]] = []

    def record_usage(self, node_id: str, usage: ResourceUsage) -> None:
        with self._lock:
            self._resource_history[node_id].append(usage)
            self._check_alerts(node_id, usage)

    def get_current_usage(self, node_id: str) -> Optional[ResourceUsage]:
        with self._lock:
            if node_id not in self._resource_history or not self._resource_history[node_id]:
                return None
            return self._resource_history[node_id][-1]

    def get_usage_history(self, node_id: str, limit: Optional[int] = None) -> List[ResourceUsage]:
        with self._lock:
            if node_id not in self._resource_history:
                return []
            history = list(self._resource_history[node_id])
            if limit is not None:
                history = history[-limit:]
            return history

    def get_average_usage(self, node_id: str, window_seconds: int = 60) -> Optional[ResourceUsage]:
        with self._lock:
            if node_id not in self._resource_history or not self._resource_history[node_id]:
                return None
            now = datetime.now()
            window_start = now - timedelta(seconds=window_seconds)
            recent_usage = [
                u for u in self._resource_history[node_id]
                if u.timestamp >= window_start
            ]
            if not recent_usage:
                return None
            count = len(recent_usage)
            avg = ResourceUsage()
            avg.cpu_usage = sum(u.cpu_usage for u in recent_usage) / count
            avg.memory_usage = sum(u.memory_usage for u in recent_usage) / count
            avg.memory_total = recent_usage[-1].memory_total
            avg.memory_used = recent_usage[-1].memory_used
            avg.gpu_usage = sum(u.gpu_usage for u in recent_usage) / count
            avg.gpu_memory_usage = sum(u.gpu_memory_usage for u in recent_usage) / count
            avg.network_bandwidth = sum(u.network_bandwidth for u in recent_usage) / count
            avg.network_in = sum(u.network_in for u in recent_usage) / count
            avg.network_out = sum(u.network_out for u in recent_usage) / count
            avg.disk_usage = sum(u.disk_usage for u in recent_usage) / count
            avg.timestamp = now
            return avg

    def get_cluster_usage(self, nodes: List[ComputeNode]) -> Dict[str, float]:
        with self._lock:
            if not nodes:
                return {}
            total_cpu = 0.0
            total_memory = 0
            total_gpu = 0.0
            used_cpu = 0.0
            used_memory = 0
            used_gpu = 0.0
            for node in nodes:
                usage = self.get_current_usage(node.node_id) or node.resource_usage
                total_cpu += 100.0
                total_memory += node.resource_usage.memory_total
                total_gpu += 100.0
                used_cpu += usage.cpu_usage
                used_memory += usage.memory_used
                used_gpu += usage.gpu_usage
            return {
                "cpu_usage": (used_cpu / total_cpu) * 100 if total_cpu > 0 else 0,
                "memory_usage": (used_memory / total_memory) * 100 if total_memory > 0 else 0,
                "gpu_usage": (used_gpu / total_gpu) * 100 if total_gpu > 0 else 0,
                "total_nodes": len(nodes),
            }

    def get_nodes_by_resource_usage(self, nodes: List[ComputeNode],
                                     resource_type: str, threshold: float,
                                     above: bool = True) -> List[str]:
        with self._lock:
            result = []
            for node in nodes:
                usage = self.get_current_usage(node.node_id) or node.resource_usage
                value = getattr(usage, resource_type, 0.0)
                if above and value >= threshold:
                    result.append(node.node_id)
                elif not above and value < threshold:
                    result.append(node.node_id)
            return result

    def get_resource_trend(self, node_id: str, resource_type: str,
                            points: int = 10) -> List[Tuple[datetime, float]]:
        with self._lock:
            if node_id not in self._resource_history:
                return []
            history = list(self._resource_history[node_id])[-points:]
            return [(u.timestamp, getattr(u, resource_type, 0.0)) for u in history]

    def calculate_load_score(self, node_id: str, weights: Optional[Dict[str, float]] = None) -> float:
        weights = weights or {
            "cpu_usage": 0.4,
            "memory_usage": 0.3,
            "gpu_usage": 0.2,
            "network_bandwidth": 0.1,
        }
        usage = self.get_current_usage(node_id)
        if usage is None:
            return 0.0
        score = 0.0
        for key, weight in weights.items():
            value = getattr(usage, key, 0.0)
            score += value * weight
        return min(score, 100.0)

    def predict_usage(self, node_id: str, resource_type: str,
                       steps: int = 5) -> List[float]:
        with self._lock:
            history = self.get_resource_trend(node_id, resource_type, points=20)
            if len(history) < 5:
                return []
            values = [v for _, v in history]
            n = len(values)
            if n < 2:
                return values[-steps:] if len(values) >= steps else values
            x = list(range(n))
            mean_x = sum(x) / n
            mean_y = sum(values) / n
            numerator = sum((xi - mean_x) * (yi - mean_y) for xi, yi in zip(x, values))
            denominator = sum((xi - mean_x) ** 2 for xi in x)
            if denominator == 0:
                return [values[-1]] * steps
            slope = numerator / denominator
            intercept = mean_y - slope * mean_x
            predictions = []
            for i in range(1, steps + 1):
                pred = slope * (n + i - 1) + intercept
                predictions.append(max(0.0, min(100.0, pred)))
            return predictions

    def _check_alerts(self, node_id: str, usage: ResourceUsage) -> None:
        metrics = [
            ("cpu_usage", usage.cpu_usage),
            ("memory_usage", usage.memory_usage),
            ("gpu_usage", usage.gpu_usage),
            ("disk_usage", usage.disk_usage),
        ]
        for metric, value in metrics:
            if value >= self._alert_threshold:
                for callback in self._alert_callbacks:
                    try:
                        callback(node_id, metric, value, self._alert_threshold)
                    except Exception:
                        pass

    def add_alert_callback(self, callback: Callable[[str, str, float, float], None]) -> None:
        self._alert_callbacks.append(callback)

    def remove_alert_callback(self, callback: Callable[[str, str, float, float], None]) -> None:
        if callback in self._alert_callbacks:
            self._alert_callbacks.remove(callback)

    def clear_history(self, node_id: Optional[str] = None) -> None:
        with self._lock:
            if node_id is None:
                self._resource_history.clear()
            elif node_id in self._resource_history:
                del self._resource_history[node_id]
