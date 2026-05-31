from typing import List, Dict, Optional
from collections import defaultdict
import threading
import random

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.logger import get_logger
from cluster.discovery import ServiceNode

logger = get_logger(__name__)


class LoadBalanceStrategy:
    ROUND_ROBIN = "round_robin"
    RANDOM = "random"
    LEAST_CONNECTIONS = "least_connections"
    WEIGHTED_ROUND_ROBIN = "weighted_round_robin"


class LoadBalancer:
    def __init__(self, strategy: str = LoadBalanceStrategy.ROUND_ROBIN):
        self._strategy = strategy
        self._nodes: List[ServiceNode] = []
        self._lock = threading.Lock()
        self._rr_index = 0
        self._connection_counts: Dict[str, int] = defaultdict(int)
        self._weights: Dict[str, int] = defaultdict(lambda: 1)

    def set_strategy(self, strategy: str) -> None:
        self._strategy = strategy
        logger.info(f"Load balancer strategy set to: {strategy}")

    def update_nodes(self, nodes: List[ServiceNode]) -> None:
        with self._lock:
            self._nodes = [n for n in nodes if n.status == "active"]
            self._rr_index = 0
            logger.info(f"Load balancer updated with {len(self._nodes)} active nodes")

    def get_next_node(self) -> Optional[ServiceNode]:
        with self._lock:
            if not self._nodes:
                return None

            if self._strategy == LoadBalanceStrategy.RANDOM:
                return self._random_select()
            elif self._strategy == LoadBalanceStrategy.LEAST_CONNECTIONS:
                return self._least_connections_select()
            elif self._strategy == LoadBalanceStrategy.WEIGHTED_ROUND_ROBIN:
                return self._weighted_round_robin_select()
            else:
                return self._round_robin_select()

    def _round_robin_select(self) -> Optional[ServiceNode]:
        if not self._nodes:
            return None

        node = self._nodes[self._rr_index]
        self._rr_index = (self._rr_index + 1) % len(self._nodes)
        return node

    def _random_select(self) -> Optional[ServiceNode]:
        if not self._nodes:
            return None

        return random.choice(self._nodes)

    def _least_connections_select(self) -> Optional[ServiceNode]:
        if not self._nodes:
            return None

        return min(
            self._nodes,
            key=lambda n: self._connection_counts.get(n.node_id, 0)
        )

    def _weighted_round_robin_select(self) -> Optional[ServiceNode]:
        if not self._nodes:
            return None

        weighted_nodes = []
        for node in self._nodes:
            weight = self._weights.get(node.node_id, 1)
            weighted_nodes.extend([node] * weight)

        if not weighted_nodes:
            return None

        node = weighted_nodes[self._rr_index % len(weighted_nodes)]
        self._rr_index = (self._rr_index + 1) % len(self._nodes)
        return node

    def increment_connection(self, node_id: str) -> None:
        with self._lock:
            self._connection_counts[node_id] += 1

    def decrement_connection(self, node_id: str) -> None:
        with self._lock:
            if self._connection_counts[node_id] > 0:
                self._connection_counts[node_id] -= 1

    def set_node_weight(self, node_id: str, weight: int) -> None:
        with self._lock:
            self._weights[node_id] = max(1, weight)
            logger.info(f"Node {node_id} weight set to: {weight}")

    def get_node_stats(self) -> Dict[str, Dict]:
        with self._lock:
            stats = {}
            for node in self._nodes:
                stats[node.node_id] = {
                    "address": f"{node.address}:{node.port}",
                    "connections": self._connection_counts.get(node.node_id, 0),
                    "weight": self._weights.get(node.node_id, 1),
                    "status": node.status
                }
            return stats

    def get_all_nodes(self) -> List[ServiceNode]:
        with self._lock:
            return list(self._nodes)
