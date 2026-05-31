import asyncio
import hashlib
import logging
import time
import bisect
from typing import Dict, List, Optional, Tuple
from collections import defaultdict

from common.models import ComputeNode, NodeStatus

logger = logging.getLogger(__name__)


class NodeRegistry:
    def __init__(self, config=None):
        self._config = config
        self._nodes: Dict[str, ComputeNode] = {}
        self._node_timeout = (
            config.get("cluster", "node_timeout") if config else 30
        )
        self._heartbeat_interval = (
            config.get("cluster", "heartbeat_interval") if config else 10
        )
        self._performance_stats: Dict[str, Dict] = defaultdict(lambda: {
            "total_tasks": 0,
            "success_count": 0,
            "avg_execution_time": 0.0,
            "history": [],
        })

    def register(self, node: ComputeNode) -> str:
        if node.node_id in self._nodes:
            logger.warning(f"Node {node.node_id} re-registering, updating info")
        node.last_heartbeat = time.time()
        node.status = NodeStatus.ONLINE
        self._nodes[node.node_id] = node
        logger.info(
            f"Node registered: {node.node_id} host={node.host}:{node.port} "
            f"cores={node.cpu_cores} mem={node.memory_gb}GB"
        )
        return node.node_id

    def unregister(self, node_id: str) -> bool:
        node = self._nodes.pop(node_id, None)
        if node:
            self._performance_stats.pop(node_id, None)
            logger.info(f"Node unregistered: {node_id}")
            return True
        logger.warning(f"Unregister failed: node {node_id} not found")
        return False

    def heartbeat(self, node_id: str, load: float = 0.0, task_count: int = 0) -> bool:
        node = self._nodes.get(node_id)
        if not node:
            logger.warning(f"Heartbeat from unknown node: {node_id}")
            return False
        node.last_heartbeat = time.time()
        node.current_load = load
        node.task_count = task_count
        if load > 0.8:
            node.status = NodeStatus.BUSY
        elif node.status != NodeStatus.ERROR:
            node.status = NodeStatus.ONLINE
        return True

    def record_task_result(self, node_id: str, success: bool, execution_time: float):
        stats = self._performance_stats[node_id]
        stats["total_tasks"] += 1
        if success:
            stats["success_count"] += 1
        stats["avg_execution_time"] = (
            stats["avg_execution_time"] * (stats["total_tasks"] - 1) + execution_time
        ) / stats["total_tasks"]
        stats["history"].append({
            "time": time.time(),
            "success": success,
            "duration": execution_time,
        })
        if len(stats["history"]) > 1000:
            stats["history"].pop(0)

    def get_node_performance(self, node_id: str) -> Optional[dict]:
        stats = self._performance_stats.get(node_id)
        if not stats:
            return None
        total = stats["total_tasks"]
        success_rate = stats["success_count"] / total if total > 0 else 1.0
        return {
            "total_tasks": total,
            "success_rate": success_rate,
            "avg_execution_time": stats["avg_execution_time"],
        }

    def report_error(self, node_id: str, error: str = ""):
        node = self._nodes.get(node_id)
        if node:
            node.status = NodeStatus.ERROR
            logger.error(f"Node {node_id} reported error: {error}")

    def get_node(self, node_id: str) -> Optional[ComputeNode]:
        return self._nodes.get(node_id)

    def list_nodes(self, status: NodeStatus = None) -> List[ComputeNode]:
        nodes = list(self._nodes.values())
        if status:
            nodes = [n for n in nodes if n.status == status]
        return nodes

    def get_available_nodes(self) -> List[ComputeNode]:
        return [n for n in self._nodes.values() if n.is_available]

    def check_timeouts(self) -> List[str]:
        now = time.time()
        timed_out = []
        for node_id, node in list(self._nodes.items()):
            if node.status == NodeStatus.OFFLINE:
                continue
            if now - node.last_heartbeat > self._node_timeout:
                node.status = NodeStatus.OFFLINE
                timed_out.append(node_id)
                logger.warning(
                    f"Node {node_id} timed out (last heartbeat "
                    f"{now - node.last_heartbeat:.0f}s ago)"
                )
        return timed_out

    @property
    def node_count(self) -> int:
        return len(self._nodes)

    @property
    def online_count(self) -> int:
        return len([n for n in self._nodes.values() if n.status != NodeStatus.OFFLINE])


class ConsistentHash:
    def __init__(self, nodes: List[ComputeNode] = None, replicas: int = 100):
        self._replicas = replicas
        self._ring: List[int] = []
        self._nodes: Dict[int, ComputeNode] = {}
        if nodes:
            for node in nodes:
                self.add_node(node)

    def _hash(self, key: str) -> int:
        return int(hashlib.md5(key.encode()).hexdigest(), 16)

    def add_node(self, node: ComputeNode):
        for i in range(self._replicas):
            h = self._hash(f"{node.node_id}-{i}")
            self._nodes[h] = node
            bisect.insort(self._ring, h)

    def remove_node(self, node: ComputeNode):
        for i in range(self._replicas):
            h = self._hash(f"{node.node_id}-{i}")
            self._nodes.pop(h, None)
            idx = bisect.bisect_left(self._ring, h)
            if idx < len(self._ring) and self._ring[idx] == h:
                self._ring.pop(idx)

    def get_node(self, key: str) -> Optional[ComputeNode]:
        if not self._ring:
            return None
        h = self._hash(key)
        idx = bisect.bisect_left(self._ring, h)
        if idx >= len(self._ring):
            idx = 0
        return self._nodes.get(self._ring[idx])


class LoadBalancer:
    def __init__(self, registry: NodeRegistry, strategy: str = "weighted_score"):
        self._registry = registry
        self._strategy = strategy
        self._rr_counter = 0
        self._weight_rr_index: Dict[str, int] = {}
        self._consistent_hash = ConsistentHash()
        self._task_assignment_cache: Dict[str, str] = {}

    def set_strategy(self, strategy: str):
        self._strategy = strategy
        logger.info(f"Load balancer strategy changed to: {strategy}")

    def select_node(self, task_requirements: dict = None) -> Optional[ComputeNode]:
        available = self._registry.get_available_nodes()
        if not available:
            return None

        if task_requirements:
            available = self._filter_by_requirements(available, task_requirements)
            if not available:
                logger.warning("No nodes meet task requirements")
                return None

        if self._strategy == "round_robin":
            return self._round_robin(available)
        elif self._strategy == "weighted_round_robin":
            return self._weighted_round_robin(available)
        elif self._strategy == "least_load":
            return self._least_load(available)
        elif self._strategy == "weighted_score":
            return self._weighted_score(available)
        elif self._strategy == "consistent_hash":
            task_id = task_requirements.get("task_id", str(time.time())) if task_requirements else str(time.time())
            return self._consistent_hash_selection(available, task_id)
        else:
            return self._weighted_score(available)

    def _calculate_node_weight(self, node: ComputeNode) -> float:
        perf = self._registry.get_node_performance(node.node_id) or {}
        success_rate = perf.get("success_rate", 1.0)
        avg_time = perf.get("avg_execution_time", 1.0)

        core_score = node.cpu_cores * 0.4
        mem_score = min(node.memory_gb / 16.0, 2.0) * 0.25
        perf_score = success_rate * 0.25
        time_score = (1.0 / max(avg_time, 1.0)) * 0.1

        return core_score + mem_score + perf_score + time_score

    def _weighted_score(self, nodes: List[ComputeNode]) -> ComputeNode:
        scored = []
        for node in nodes:
            weight = self._calculate_node_weight(node)
            load_penalty = node.current_load * 2.0
            task_penalty = node.task_count * 0.1
            final_score = weight - load_penalty - task_penalty
            scored.append((final_score, node))

        scored.sort(key=lambda x: x[0], reverse=True)
        return scored[0][1]

    def _least_load(self, nodes: List[ComputeNode]) -> ComputeNode:
        return min(nodes, key=lambda n: (n.current_load, n.task_count))

    def _round_robin(self, nodes: List[ComputeNode]) -> ComputeNode:
        self._rr_counter = self._rr_counter % len(nodes)
        node = nodes[self._rr_counter]
        self._rr_counter += 1
        return node

    def _weighted_round_robin(self, nodes: List[ComputeNode]) -> ComputeNode:
        weights = [self._calculate_node_weight(n) for n in nodes]
        max_weight = max(weights) if weights else 1.0
        if max_weight <= 0:
            return self._round_robin(nodes)

        for i in range(len(nodes)):
            idx = (self._rr_counter + i) % len(nodes)
            normalized = weights[idx] / max_weight
            if normalized > 0.5 or self._weight_rr_index.get(nodes[idx].node_id, 0) < 3:
                self._weight_rr_index[nodes[idx].node_id] = self._weight_rr_index.get(nodes[idx].node_id, 0) + 1
                self._rr_counter = (idx + 1) % len(nodes)
                return nodes[idx]

        self._weight_rr_index.clear()
        return self._round_robin(nodes)

    def _consistent_hash_selection(self, nodes: List[ComputeNode], task_key: str) -> Optional[ComputeNode]:
        current_nodes = set(n.node_id for n in nodes)
        hash_nodes = set(n.node_id for n in self._consistent_hash._nodes.values()) if hasattr(self._consistent_hash, '_nodes') else set()

        if current_nodes != hash_nodes:
            self._consistent_hash = ConsistentHash(nodes)

        node = self._consistent_hash.get_node(task_key)
        if node and node.node_id in current_nodes:
            return node
        return self._weighted_score(nodes)

    @staticmethod
    def _filter_by_requirements(nodes: List[ComputeNode], reqs: dict) -> List[ComputeNode]:
        filtered = nodes
        min_cores = reqs.get("min_cpu_cores", 0)
        min_mem = reqs.get("min_memory_gb", 0)
        required_caps = reqs.get("required_capabilities", [])
        prefer_nodes = reqs.get("prefer_nodes", [])

        filtered = [n for n in filtered if n.cpu_cores >= min_cores]
        filtered = [n for n in filtered if n.memory_gb >= min_mem]
        if required_caps:
            filtered = [
                n for n in filtered
                if all(cap in n.capabilities for cap in required_caps)
            ]

        if prefer_nodes:
            prefer_filtered = [n for n in filtered if n.node_id in prefer_nodes]
            if prefer_filtered:
                return prefer_filtered

        return filtered

    def get_strategy_status(self) -> dict:
        return {
            "current_strategy": self._strategy,
            "available_strategies": [
                "round_robin",
                "weighted_round_robin",
                "least_load",
                "weighted_score",
                "consistent_hash",
            ],
        }


class NodeManager:
    def __init__(self, config=None):
        self._config = config
        self._registry = NodeRegistry(config)
        self._balancer = LoadBalancer(self._registry, "weighted_score")
        self._running = False
        self._monitor_task: Optional[asyncio.Task] = None

    @property
    def registry(self) -> NodeRegistry:
        return self._registry

    @property
    def balancer(self) -> LoadBalancer:
        return self._balancer

    def register_node(self, node: ComputeNode) -> str:
        return self._registry.register(node)

    def unregister_node(self, node_id: str) -> bool:
        return self._registry.unregister(node_id)

    def update_heartbeat(self, node_id: str, load: float = 0.0, task_count: int = 0) -> bool:
        return self._registry.heartbeat(node_id, load, task_count)

    def select_node_for_task(self, requirements: dict = None) -> Optional[ComputeNode]:
        return self._balancer.select_node(requirements)

    async def _monitor_loop(self):
        while self._running:
            timed_out = self._registry.check_timeouts()
            if timed_out:
                logger.warning(f"Nodes timed out: {timed_out}")
            await asyncio.sleep(self._registry._heartbeat_interval)

    async def start(self):
        self._running = True
        self._monitor_task = asyncio.create_task(self._monitor_loop())
        logger.info("Node manager started")

    async def stop(self):
        self._running = False
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
        logger.info("Node manager stopped")

    def get_cluster_status(self) -> dict:
        nodes = self._registry.list_nodes()
        online = [n for n in nodes if n.status != NodeStatus.OFFLINE]
        total_load = sum(n.current_load for n in online) if online else 0
        total_tasks = sum(n.task_count for n in online) if online else 0
        total_cores = sum(n.cpu_cores for n in online) if online else 0

        return {
            "total_nodes": len(nodes),
            "online_nodes": len(online),
            "offline_nodes": len(nodes) - len(online),
            "total_cpu_cores": total_cores,
            "average_load": total_load / len(online) if online else 0,
            "total_running_tasks": total_tasks,
            "nodes": [n.to_dict() for n in nodes],
        }
