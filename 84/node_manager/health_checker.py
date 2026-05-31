import threading
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Callable
from collections import defaultdict

from common.models import ComputeNode, NodeStatus, Task, TaskStatus
from common.exceptions import NodeNotFoundException


class HealthChecker:
    def __init__(self, node_registry, check_interval: int = 10,
                 unhealthy_threshold: int = 3, task_timeout: int = 300):
        self._node_registry = node_registry
        self._check_interval = check_interval
        self._unhealthy_threshold = unhealthy_threshold
        self._task_timeout = task_timeout
        self._running = False
        self._check_thread: Optional[threading.Thread] = None
        self._lock = threading.RLock()
        self._task_registry: Dict[str, Task] = {}
        self._unhealthy_counts: Dict[str, int] = defaultdict(int)
        self._health_callbacks: List[Callable[[str, str, str], None]] = []

    def start(self) -> None:
        with self._lock:
            if self._running:
                return
            self._running = True
            self._check_thread = threading.Thread(target=self._check_loop, daemon=True)
            self._check_thread.start()

    def stop(self) -> None:
        with self._lock:
            self._running = False
            if self._check_thread:
                self._check_thread.join(timeout=5)
                self._check_thread = None

    def register_task(self, task: Task) -> None:
        with self._lock:
            self._task_registry[task.task_id] = task

    def unregister_task(self, task_id: str) -> None:
        with self._lock:
            if task_id in self._task_registry:
                del self._task_registry[task_id]

    def update_task(self, task: Task) -> None:
        with self._lock:
            self._task_registry[task.task_id] = task

    def check_node_health(self, node_id: str) -> bool:
        try:
            node = self._node_registry.get_node(node_id)
        except NodeNotFoundException:
            return False
        if node.status == NodeStatus.ISOLATED:
            return False
        if node.last_heartbeat is None:
            self._unhealthy_counts[node_id] += 1
            return False
        time_since_heartbeat = (datetime.now() - node.last_heartbeat).total_seconds()
        if time_since_heartbeat > node.heartbeat_timeout:
            self._unhealthy_counts[node_id] += 1
            if self._unhealthy_counts[node_id] >= self._unhealthy_threshold:
                self._node_registry.isolate_node(node_id, "Heartbeat timeout exceeded")
                self._notify_callbacks(node_id, "unhealthy", "Heartbeat timeout")
                return False
            return False
        if node.resource_usage.cpu_usage >= 95 or node.resource_usage.memory_usage >= 95:
            self._unhealthy_counts[node_id] += 1
            if self._unhealthy_counts[node_id] >= self._unhealthy_threshold:
                node.status = NodeStatus.UNHEALTHY
                self._notify_callbacks(node_id, "unhealthy", "Resource usage too high")
                return False
            return True
        self._unhealthy_counts[node_id] = 0
        return True

    def check_task_health(self, task_id: str) -> bool:
        with self._lock:
            if task_id not in self._task_registry:
                return False
            task = self._task_registry[task_id]
        if task.status != TaskStatus.RUNNING:
            return True
        if task.started_at is None:
            return True
        time_running = (datetime.now() - task.started_at).total_seconds()
        if time_running > self._task_timeout:
            task.status = TaskStatus.FAILED
            task.error = f"Task timed out after {time_running}s"
            task.completed_at = datetime.now()
            self._notify_callbacks(task.node_id or "unknown", "task_timeout", task_id)
            return False
        return True

    def check_all_nodes(self) -> Dict[str, bool]:
        results: Dict[str, bool] = {}
        nodes = self._node_registry.get_all_nodes()
        for node in nodes:
            results[node.node_id] = self.check_node_health(node.node_id)
        return results

    def check_all_tasks(self) -> Dict[str, bool]:
        results: Dict[str, bool] = {}
        with self._lock:
            task_ids = list(self._task_registry.keys())
        for task_id in task_ids:
            results[task_id] = self.check_task_health(task_id)
        return results

    def get_unhealthy_nodes(self) -> List[str]:
        unhealthy = []
        nodes = self._node_registry.get_all_nodes()
        for node in nodes:
            if node.status in (NodeStatus.UNHEALTHY, NodeStatus.OFFLINE):
                unhealthy.append(node.node_id)
            elif not self.check_node_health(node.node_id):
                unhealthy.append(node.node_id)
        return unhealthy

    def get_stalled_tasks(self) -> List[str]:
        stalled = []
        with self._lock:
            tasks = list(self._task_registry.values())
        for task in tasks:
            if task.status == TaskStatus.RUNNING:
                if not self.check_task_health(task.task_id):
                    stalled.append(task.task_id)
        return stalled

    def auto_isolate_unhealthy_nodes(self) -> List[str]:
        isolated = []
        for node_id in self.get_unhealthy_nodes():
            try:
                node = self._node_registry.get_node(node_id)
                if node.status != NodeStatus.ISOLATED:
                    self._node_registry.isolate_node(node_id, "Auto-isolated due to health check failure")
                    isolated.append(node_id)
                    self._notify_callbacks(node_id, "auto_isolated", "Health check failure")
            except NodeNotFoundException:
                pass
        return isolated

    def recover_node(self, node_id: str) -> bool:
        try:
            self._node_registry.rejoin_node(node_id)
            self._unhealthy_counts[node_id] = 0
            self._notify_callbacks(node_id, "recovered", "Manual recovery")
            return True
        except NodeNotFoundException:
            return False

    def get_health_summary(self) -> Dict[str, int]:
        nodes = self._node_registry.get_all_nodes()
        online = len([n for n in nodes if n.status in (NodeStatus.ONLINE, NodeStatus.IDLE, NodeStatus.BUSY)])
        offline = len([n for n in nodes if n.status == NodeStatus.OFFLINE])
        unhealthy = len([n for n in nodes if n.status == NodeStatus.UNHEALTHY])
        isolated = len([n for n in nodes if n.status == NodeStatus.ISOLATED])
        with self._lock:
            running_tasks = len([t for t in self._task_registry.values() if t.status == TaskStatus.RUNNING])
            pending_tasks = len([t for t in self._task_registry.values() if t.status == TaskStatus.PENDING])
            completed_tasks = len([t for t in self._task_registry.values() if t.status == TaskStatus.COMPLETED])
            failed_tasks = len([t for t in self._task_registry.values() if t.status == TaskStatus.FAILED])
        return {
            "total_nodes": len(nodes),
            "online_nodes": online,
            "offline_nodes": offline,
            "unhealthy_nodes": unhealthy,
            "isolated_nodes": isolated,
            "running_tasks": running_tasks,
            "pending_tasks": pending_tasks,
            "completed_tasks": completed_tasks,
            "failed_tasks": failed_tasks,
        }

    def add_health_callback(self, callback: Callable[[str, str, str], None]) -> None:
        self._health_callbacks.append(callback)

    def remove_health_callback(self, callback: Callable[[str, str, str], None]) -> None:
        if callback in self._health_callbacks:
            self._health_callbacks.remove(callback)

    def _check_loop(self) -> None:
        while self._running:
            try:
                self._node_registry.check_heartbeats()
                self.check_all_nodes()
                self.check_all_tasks()
                self.auto_isolate_unhealthy_nodes()
            except Exception:
                pass
            time.sleep(self._check_interval)

    def _notify_callbacks(self, node_id: str, event: str, detail: str) -> None:
        for callback in self._health_callbacks:
            try:
                callback(node_id, event, detail)
            except Exception:
                pass
