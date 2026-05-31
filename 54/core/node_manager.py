import asyncio
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Callable
from collections import defaultdict

from config.settings import get_settings
from models.models import NodeInfo, NodeStatus, InterpolationTask
from utils.logger import get_logger
from utils.helpers import retry_with_backoff

logger = get_logger(__name__)


class NodeManager:
    def __init__(self, heartbeat_timeout: int = 60):
        settings = get_settings()
        self._nodes: Dict[str, NodeInfo] = {}
        self._heartbeat_timeout = heartbeat_timeout
        self._max_nodes = settings.cluster.max_nodes

        self._node_tasks: Dict[str, str] = {}
        self._task_nodes: Dict[str, str] = {}

        self._health_check_task: Optional[asyncio.Task] = None
        self._running = False

        self._node_status_callbacks: List[Callable[[NodeInfo, NodeStatus], None]] = []
        self._node_register_callbacks: List[Callable[[NodeInfo], None]] = []
        self._node_unregister_callbacks: List[Callable[[NodeInfo], None]] = []
        self._node_failure_callbacks: List[Callable[[str], None]] = []

        self._load_history: Dict[str, List[float]] = defaultdict(list)

        logger.info(f"NodeManager initialized - max_nodes: {self._max_nodes}")

    async def start(self) -> None:
        if self._running:
            logger.warning("NodeManager is already running")
            return

        self._running = True
        self._health_check_task = asyncio.create_task(self._health_check_loop())
        logger.info("NodeManager started")

    async def stop(self) -> None:
        self._running = False
        if self._health_check_task:
            self._health_check_task.cancel()
            try:
                await self._health_check_task
            except asyncio.CancelledError:
                pass

        for node in self._nodes.values():
            node.status = NodeStatus.OFFLINE

        logger.info("NodeManager stopped")

    def register_node(self, node: NodeInfo) -> bool:
        if len(self._nodes) >= self._max_nodes:
            logger.warning(
                f"Cannot register node {node.node_id}: max nodes limit reached "
                f"({len(self._nodes)}/{self._max_nodes})"
            )
            return False

        if node.node_id in self._nodes:
            logger.info(f"Node {node.node_id} re-registered")
            node.registered_at = self._nodes[node.node_id].registered_at

        self._nodes[node.node_id] = node
        logger.info(
            f"Node {node.node_id} registered - host: {node.host}:{node.port}, "
            f"cores: {node.cpu_cores}, memory: {node.memory_gb}GB"
        )

        for callback in self._node_register_callbacks:
            try:
                callback(node)
            except Exception as e:
                logger.error(f"Error in node register callback: {e}", exc_info=True)

        return True

    def unregister_node(self, node_id: str) -> bool:
        if node_id not in self._nodes:
            logger.warning(f"Node {node_id} not found for unregistering")
            return False

        node = self._nodes.pop(node_id)
        node.status = NodeStatus.OFFLINE

        if node_id in self._node_tasks:
            task_id = self._node_tasks.pop(node_id)
            self._task_nodes.pop(task_id, None)
            logger.warning(f"Node {node_id} unregistered while running task {task_id}")

        logger.info(f"Node {node_id} unregistered")

        for callback in self._node_unregister_callbacks:
            try:
                callback(node)
            except Exception as e:
                logger.error(f"Error in node unregister callback: {e}", exc_info=True)

        return True

    def heartbeat(self, node_id: str, status: Optional[NodeStatus] = None) -> bool:
        if node_id not in self._nodes:
            logger.warning(f"Heartbeat from unknown node: {node_id}")
            return False

        node = self._nodes[node_id]
        node.last_heartbeat = datetime.utcnow()

        if status and status != node.status:
            old_status = node.status
            node.status = status

            for callback in self._node_status_callbacks:
                try:
                    callback(node, old_status)
                except Exception as e:
                    logger.error(f"Error in node status callback: {e}", exc_info=True)

            logger.info(f"Node {node_id} status changed: {old_status} -> {status}")

        return True

    def get_node(self, node_id: str) -> Optional[NodeInfo]:
        return self._nodes.get(node_id)

    def get_all_nodes(self) -> List[NodeInfo]:
        return list(self._nodes.values())

    def get_nodes_by_status(self, status: NodeStatus) -> List[NodeInfo]:
        return [node for node in self._nodes.values() if node.status == status]

    def get_available_nodes(self) -> List[NodeInfo]:
        return [
            node
            for node in self._nodes.values()
            if node.status == NodeStatus.IDLE
        ]

    def assign_task_to_node(self, task: InterpolationTask) -> Optional[str]:
        available_nodes = self.get_available_nodes()
        if not available_nodes:
            logger.debug("No available nodes for task assignment")
            return None

        best_node = self._select_best_node(available_nodes, task)
        if best_node is None:
            return None

        best_node.status = NodeStatus.BUSY
        best_node.current_task = task.task_id
        self._node_tasks[best_node.node_id] = task.task_id
        self._task_nodes[task.task_id] = best_node.node_id

        logger.info(f"Task {task.task_id} assigned to node {best_node.node_id}")
        return best_node.node_id

    def _select_best_node(
        self, nodes: List[NodeInfo], task: InterpolationTask
    ) -> Optional[NodeInfo]:
        if not nodes:
            return None

        scored_nodes = []
        for node in nodes:
            score = self._calculate_node_score(node, task)
            scored_nodes.append((score, node))

        scored_nodes.sort(key=lambda x: x[0], reverse=True)
        return scored_nodes[0][1]

    def _calculate_node_score(self, node: NodeInfo, task: InterpolationTask) -> float:
        score = 0.0

        score += node.cpu_cores * 10.0
        score += node.memory_gb * 2.0

        if node.gpu_available and task.metadata.get("requires_gpu", False):
            score += 50.0

        if task.metadata.get("required_capabilities"):
            required = set(task.metadata["required_capabilities"])
            available = set(node.capabilities)
            if required.issubset(available):
                score += 30.0

        if node.tasks_completed > 0:
            success_rate = node.tasks_completed / (node.tasks_completed + node.tasks_failed)
            score += success_rate * 20.0

        avg_load = self._get_average_load(node.node_id)
        if avg_load is not None:
            score += (1.0 - avg_load) * 10.0

        return score

    def complete_task(self, node_id: str, task_id: str, success: bool = True) -> bool:
        if node_id not in self._nodes:
            logger.warning(f"Node {node_id} not found for task completion")
            return False

        node = self._nodes[node_id]

        if node_id in self._node_tasks:
            current_task = self._node_tasks.pop(node_id)
            if current_task != task_id:
                logger.warning(
                    f"Task mismatch: expected {current_task}, got {task_id}"
                )
            self._task_nodes.pop(current_task, None)

        node.current_task = None
        node.status = NodeStatus.IDLE

        if success:
            node.tasks_completed += 1
        else:
            node.tasks_failed += 1

        logger.info(
            f"Node {node_id} completed task {task_id} "
            f"({'success' if success else 'failed'})"
        )

        return True

    def report_load(self, node_id: str, load: float) -> None:
        if node_id not in self._nodes:
            return

        self._load_history[node_id].append(load)
        if len(self._load_history[node_id]) > 100:
            self._load_history[node_id] = self._load_history[node_id][-100:]

    def _get_average_load(self, node_id: str) -> Optional[float]:
        history = self._load_history.get(node_id, [])
        if not history:
            return None
        return sum(history) / len(history)

    async def _health_check_loop(self) -> None:
        while self._running:
            try:
                await self._check_node_health()
                await asyncio.sleep(10.0)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Health check loop error: {e}", exc_info=True)
                await asyncio.sleep(1.0)

    async def _check_node_health(self) -> None:
        now = datetime.utcnow()
        timeout = timedelta(seconds=self._heartbeat_timeout)

        for node_id, node in list(self._nodes.items()):
            time_since_heartbeat = now - node.last_heartbeat

            if time_since_heartbeat > timeout:
                if node.status != NodeStatus.OFFLINE:
                    logger.warning(
                        f"Node {node_id} heartbeat timeout "
                        f"({time_since_heartbeat.total_seconds():.1f}s)"
                    )

                    if node.current_task:
                        task_id = node.current_task
                        if node_id in self._node_tasks:
                            self._node_tasks.pop(node_id)
                        self._task_nodes.pop(task_id, None)
                        node.current_task = None

                    old_status = node.status
                    node.status = NodeStatus.OFFLINE

                    for callback in self._node_status_callbacks:
                        try:
                            callback(node, old_status)
                        except Exception as e:
                            logger.error(f"Error in node status callback: {e}", exc_info=True)

                    for callback in self._node_failure_callbacks:
                        try:
                            callback(node_id)
                        except Exception as e:
                            logger.error(f"Error in node failure callback: {e}", exc_info=True)

    def get_task_node(self, task_id: str) -> Optional[str]:
        return self._task_nodes.get(task_id)

    def get_node_task(self, node_id: str) -> Optional[str]:
        return self._node_tasks.get(node_id)

    def get_statistics(self) -> Dict[str, int]:
        stats = {
            "total": len(self._nodes),
            "idle": len(self.get_nodes_by_status(NodeStatus.IDLE)),
            "busy": len(self.get_nodes_by_status(NodeStatus.BUSY)),
            "offline": len(self.get_nodes_by_status(NodeStatus.OFFLINE)),
            "maintenance": len(self.get_nodes_by_status(NodeStatus.MAINTENANCE)),
            "error": len(self.get_nodes_by_status(NodeStatus.ERROR)),
        }

        total_completed = sum(n.tasks_completed for n in self._nodes.values())
        total_failed = sum(n.tasks_failed for n in self._nodes.values())
        stats["total_completed"] = total_completed
        stats["total_failed"] = total_failed

        return stats

    def add_node_status_callback(
        self, callback: Callable[[NodeInfo, NodeStatus], None]
    ) -> None:
        self._node_status_callbacks.append(callback)

    def add_node_register_callback(self, callback: Callable[[NodeInfo], None]) -> None:
        self._node_register_callbacks.append(callback)

    def add_node_unregister_callback(self, callback: Callable[[NodeInfo], None]) -> None:
        self._node_unregister_callbacks.append(callback)

    def add_node_failure_callback(self, callback: Callable[[str], None]) -> None:
        self._node_failure_callbacks.append(callback)

    def set_node_maintenance(self, node_id: str, maintenance: bool) -> bool:
        node = self.get_node(node_id)
        if not node:
            return False

        old_status = node.status
        node.status = NodeStatus.MAINTENANCE if maintenance else NodeStatus.IDLE

        if old_status != node.status:
            for callback in self._node_status_callbacks:
                try:
                    callback(node, old_status)
                except Exception as e:
                    logger.error(f"Error in node status callback: {e}", exc_info=True)

        logger.info(
            f"Node {node_id} {'entered' if maintenance else 'exited'} maintenance mode"
        )
        return True
