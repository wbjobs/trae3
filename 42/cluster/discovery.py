from typing import List, Dict, Optional, Callable
from datetime import datetime
import threading
import time
import json

try:
    import consul
    CONSUL_AVAILABLE = True
except ImportError:
    CONSUL_AVAILABLE = False

import redis

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.logger import get_logger
from core.config import get_config

logger = get_logger(__name__)


class ServiceNode:
    def __init__(
        self,
        node_id: str,
        address: str,
        port: int,
        service_name: str,
        metadata: Optional[Dict] = None
    ):
        self.node_id = node_id
        self.address = address
        self.port = port
        self.service_name = service_name
        self.metadata = metadata or {}
        self.last_heartbeat = datetime.now()
        self.status = "active"

    def to_dict(self) -> Dict:
        return {
            "node_id": self.node_id,
            "address": self.address,
            "port": self.port,
            "service_name": self.service_name,
            "metadata": self.metadata,
            "last_heartbeat": self.last_heartbeat.isoformat(),
            "status": self.status
        }


class ServiceDiscovery:
    def __init__(self):
        self.config = get_config()
        self._nodes: Dict[str, ServiceNode] = {}
        self._running = False
        self._lock = threading.Lock()
        self._consul_client = None
        self._redis_client = None
        self._watchers: List[Callable] = []

    async def initialize(self) -> bool:
        if not self.config.cluster.enabled:
            logger.info("Cluster mode is disabled")
            return True

        try:
            if CONSUL_AVAILABLE:
                self._consul_client = consul.Consul(
                    host=self.config.cluster.consul_host,
                    port=self.config.cluster.consul_port
                )
                logger.info("Consul service discovery initialized")
                return True
            else:
                self._redis_client = redis.Redis(
                    host=self.config.redis.host,
                    port=self.config.redis.port,
                    db=self.config.redis.db,
                    password=self.config.redis.password,
                    decode_responses=True
                )
                self._redis_client.ping()
                logger.info("Redis service discovery initialized")
                return True
        except Exception as e:
            logger.warning(f"Service discovery initialization failed: {e}, running in standalone mode")
            return False

    async def register(self) -> bool:
        if not self.config.cluster.enabled:
            return True

        node = ServiceNode(
            node_id=self.config.cluster.node_id,
            address=self.config.server.host,
            port=self.config.server.port,
            service_name=self.config.cluster.service_name,
            metadata={
                "workers": self.config.server.workers,
                "started_at": datetime.now().isoformat()
            }
        )

        try:
            if self._consul_client:
                self._consul_client.agent.service.register(
                    name=node.service_name,
                    service_id=node.node_id,
                    address=node.address,
                    port=node.port,
                    check=consul.Check().tcp(
                        node.address,
                        node.port,
                        "10s",
                        "30s"
                    )
                )
                logger.info(f"Node {node.node_id} registered with Consul")
            elif self._redis_client:
                key = f"service:{node.service_name}:{node.node_id}"
                self._redis_client.hset(key, mapping=node.to_dict())
                self._redis_client.expire(key, 30)
                logger.info(f"Node {node.node_id} registered with Redis")

            with self._lock:
                self._nodes[node.node_id] = node

            return True
        except Exception as e:
            logger.error(f"Failed to register node: {e}")
            return False

    async def deregister(self) -> None:
        if not self.config.cluster.enabled:
            return

        node_id = self.config.cluster.node_id

        try:
            if self._consul_client:
                self._consul_client.agent.service.deregister(node_id)
                logger.info(f"Node {node_id} deregistered from Consul")
            elif self._redis_client:
                key = f"service:{self.config.cluster.service_name}:{node_id}"
                self._redis_client.delete(key)
                logger.info(f"Node {node_id} deregistered from Redis")

            with self._lock:
                if node_id in self._nodes:
                    del self._nodes[node_id]
        except Exception as e:
            logger.error(f"Failed to deregister node: {e}")

    async def discover(self) -> List[ServiceNode]:
        if not self.config.cluster.enabled:
            return list(self._nodes.values())

        nodes = []
        try:
            if self._consul_client:
                _, services = self._consul_client.catalog.service(
                    self.config.cluster.service_name
                )
                for svc in services:
                    node = ServiceNode(
                        node_id=svc["ServiceID"],
                        address=svc["ServiceAddress"] or svc["Address"],
                        port=svc["ServicePort"],
                        service_name=svc["ServiceName"]
                    )
                    nodes.append(node)
            elif self._redis_client:
                pattern = f"service:{self.config.cluster.service_name}:*"
                keys = self._redis_client.keys(pattern)
                for key in keys:
                    data = self._redis_client.hgetall(key)
                    if data:
                        node = ServiceNode(
                            node_id=data.get("node_id", ""),
                            address=data.get("address", ""),
                            port=int(data.get("port", 0)),
                            service_name=data.get("service_name", "")
                        )
                        node.last_heartbeat = datetime.fromisoformat(
                            data.get("last_heartbeat", datetime.now().isoformat())
                        )
                        node.status = data.get("status", "unknown")
                        nodes.append(node)

            with self._lock:
                self._nodes = {n.node_id: n for n in nodes}

            self._notify_watchers(nodes)

        except Exception as e:
            logger.error(f"Service discovery failed: {e}")

        return nodes

    def add_watcher(self, callback: Callable[[List[ServiceNode]], None]) -> None:
        self._watchers.append(callback)

    def _notify_watchers(self, nodes: List[ServiceNode]) -> None:
        for callback in self._watchers:
            try:
                callback(nodes)
            except Exception as e:
                logger.error(f"Watcher callback error: {e}")

    def get_nodes(self) -> List[ServiceNode]:
        with self._lock:
            return list(self._nodes.values())

    def get_node_count(self) -> int:
        with self._lock:
            return len(self._nodes)

    async def heartbeat(self) -> None:
        if not self.config.cluster.enabled:
            return

        node_id = self.config.cluster.node_id

        try:
            if self._redis_client:
                key = f"service:{self.config.cluster.service_name}:{node_id}"
                self._redis_client.hset(
                    key,
                    "last_heartbeat",
                    datetime.now().isoformat()
                )
                self._redis_client.expire(key, 30)
        except Exception as e:
            logger.error(f"Heartbeat error: {e}")

    async def start_heartbeat(self) -> None:
        if not self.config.cluster.enabled:
            return

        async def heartbeat_loop():
            while self._running:
                await self.heartbeat()
                await asyncio.sleep(10)

        self._running = True
        import asyncio
        asyncio.create_task(heartbeat_loop())

    async def stop(self) -> None:
        self._running = False
        await self.deregister()

        if self._redis_client:
            self._redis_client.close()

        logger.info("Service discovery stopped")
