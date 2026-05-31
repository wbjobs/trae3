import threading
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Callable
from collections import defaultdict

from common.models import ComputeNode, NodeStatus, Heartbeat, ResourceUsage
from common.exceptions import (
    NodeNotFoundException,
    NodeAlreadyRegisteredException,
    HeartbeatTimeoutException,
    NodeIsolationException,
)


class NodeRegistry:
    def __init__(self, heartbeat_timeout: int = 30, max_heartbeat_failures: int = 3):
        self._nodes: Dict[str, ComputeNode] = {}
        self._lock = threading.RLock()
        self._heartbeat_timeout = heartbeat_timeout
        self._max_heartbeat_failures = max_heartbeat_failures
        self._node_event_callbacks: List[Callable[[str, str], None]] = []

    def register_node(self, node: ComputeNode) -> ComputeNode:
        with self._lock:
            if node.node_id in self._nodes:
                raise NodeAlreadyRegisteredException(node.node_id)
            node.status = NodeStatus.ONLINE
            node.registered_at = datetime.now()
            node.heartbeat_timeout = self._heartbeat_timeout
            node.max_heartbeat_failures = self._max_heartbeat_failures
            self._nodes[node.node_id] = node
            self._notify_callbacks(node.node_id, "registered")
            return node

    def unregister_node(self, node_id: str) -> None:
        with self._lock:
            if node_id not in self._nodes:
                raise NodeNotFoundException(node_id)
            node = self._nodes[node_id]
            node.status = NodeStatus.OFFLINE
            del self._nodes[node_id]
            self._notify_callbacks(node_id, "unregistered")

    def update_heartbeat(self, heartbeat: Heartbeat) -> None:
        with self._lock:
            if heartbeat.node_id not in self._nodes:
                raise NodeNotFoundException(heartbeat.node_id)
            node = self._nodes[heartbeat.node_id]
            if node.status == NodeStatus.ISOLATED:
                raise NodeIsolationException(node.node_id, "Node is isolated")
            node.last_heartbeat = heartbeat.timestamp
            node.resource_usage = heartbeat.resource_usage
            node.status = heartbeat.status
            node.active_tasks = heartbeat.active_tasks
            node.load_score = heartbeat.load_score
            node.consecutive_heartbeat_failures = 0

    def get_node(self, node_id: str) -> ComputeNode:
        with self._lock:
            if node_id not in self._nodes:
                raise NodeNotFoundException(node_id)
            return self._nodes[node_id]

    def get_all_nodes(self) -> List[ComputeNode]:
        with self._lock:
            return list(self._nodes.values())

    def get_online_nodes(self) -> List[ComputeNode]:
        with self._lock:
            return [
                node for node in self._nodes.values()
                if node.status in (NodeStatus.ONLINE, NodeStatus.IDLE, NodeStatus.BUSY)
            ]

    def get_nodes_by_status(self, status: NodeStatus) -> List[ComputeNode]:
        with self._lock:
            return [node for node in self._nodes.values() if node.status == status]

    def check_heartbeats(self) -> List[str]:
        timed_out_nodes: List[str] = []
        with self._lock:
            now = datetime.now()
            for node_id, node in self._nodes.items():
                if node.status == NodeStatus.ISOLATED:
                    continue
                if node.last_heartbeat is None:
                    node.consecutive_heartbeat_failures += 1
                else:
                    time_since_heartbeat = (now - node.last_heartbeat).total_seconds()
                    if time_since_heartbeat > self._heartbeat_timeout:
                        node.consecutive_heartbeat_failures += 1
                if node.consecutive_heartbeat_failures >= self._max_heartbeat_failures:
                    node.status = NodeStatus.OFFLINE
                    timed_out_nodes.append(node_id)
                    self._notify_callbacks(node_id, "timed_out")
        return timed_out_nodes

    def isolate_node(self, node_id: str, reason: str) -> None:
        with self._lock:
            if node_id not in self._nodes:
                raise NodeNotFoundException(node_id)
            node = self._nodes[node_id]
            node.status = NodeStatus.ISOLATED
            self._notify_callbacks(node_id, f"isolated: {reason}")

    def rejoin_node(self, node_id: str) -> None:
        with self._lock:
            if node_id not in self._nodes:
                raise NodeNotFoundException(node_id)
            node = self._nodes[node_id]
            node.status = NodeStatus.ONLINE
            node.consecutive_heartbeat_failures = 0
            self._notify_callbacks(node_id, "rejoined")

    def get_available_nodes(self, cpu_required: float = 0, memory_required: int = 0,
                            gpu_required: float = 0) -> List[ComputeNode]:
        with self._lock:
            available_nodes = []
            for node in self._nodes.values():
                if node.status not in (NodeStatus.ONLINE, NodeStatus.IDLE):
                    continue
                available_cpu = 100.0 - node.resource_usage.cpu_usage
                available_memory = node.resource_usage.memory_total - node.resource_usage.memory_used
                available_gpu = 100.0 - node.resource_usage.gpu_usage
                if (available_cpu >= cpu_required and
                        available_memory >= memory_required and
                        available_gpu >= gpu_required):
                    available_nodes.append(node)
            available_nodes.sort(key=lambda n: n.load_score)
            return available_nodes

    def get_cluster_resource_summary(self) -> Dict[str, float]:
        with self._lock:
            summary = defaultdict(float)
            online_nodes = self.get_online_nodes()
            summary["total_nodes"] = len(self._nodes)
            summary["online_nodes"] = len(online_nodes)
            summary["offline_nodes"] = len(self.get_nodes_by_status(NodeStatus.OFFLINE))
            summary["isolated_nodes"] = len(self.get_nodes_by_status(NodeStatus.ISOLATED))
            for node in online_nodes:
                summary["total_cpu"] += 100.0
                summary["used_cpu"] += node.resource_usage.cpu_usage
                summary["total_memory"] += node.resource_usage.memory_total
                summary["used_memory"] += node.resource_usage.memory_used
                summary["total_gpu"] += 100.0
                summary["used_gpu"] += node.resource_usage.gpu_usage
                summary["total_network_bandwidth"] += node.resource_usage.network_bandwidth
            if summary["total_cpu"] > 0:
                summary["avg_cpu_usage"] = summary["used_cpu"] / len(online_nodes)
            if summary["total_memory"] > 0:
                summary["avg_memory_usage"] = (summary["used_memory"] / summary["total_memory"]) * 100
            if summary["total_gpu"] > 0:
                summary["avg_gpu_usage"] = summary["used_gpu"] / len(online_nodes)
            return dict(summary)

    def add_event_callback(self, callback: Callable[[str, str], None]) -> None:
        self._node_event_callbacks.append(callback)

    def remove_event_callback(self, callback: Callable[[str, str], None]) -> None:
        if callback in self._node_event_callbacks:
            self._node_event_callbacks.remove(callback)

    def _notify_callbacks(self, node_id: str, event: str) -> None:
        for callback in self._node_event_callbacks:
            try:
                callback(node_id, event)
            except Exception:
                pass
