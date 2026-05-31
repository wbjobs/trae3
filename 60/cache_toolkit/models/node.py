from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


class NodeRole(Enum):
    MASTER = "master"
    SLAVE = "slave"


class NodeStatus(Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    UNKNOWN = "unknown"


@dataclass
class CacheNode:
    node_id: str
    host: str
    port: int
    role: NodeRole = NodeRole.MASTER
    status: NodeStatus = NodeStatus.UNKNOWN
    password: Optional[str] = None
    db: int = 0
    slots: list = field(default_factory=list)
    memory_used: Optional[int] = None
    memory_total: Optional[int] = None
    keys_count: Optional[int] = None

    @property
    def address(self) -> str:
        return f"{self.host}:{self.port}"

    @property
    def memory_usage_ratio(self) -> Optional[float]:
        if self.memory_used is not None and self.memory_total and self.memory_total > 0:
            return round(self.memory_used / self.memory_total, 4)
        return None

    def to_dict(self) -> dict:
        return {
            "node_id": self.node_id,
            "host": self.host,
            "port": self.port,
            "role": self.role.value,
            "status": self.status.value,
            "address": self.address,
            "slots": self.slots,
            "memory_used": self.memory_used,
            "memory_total": self.memory_total,
            "keys_count": self.keys_count,
            "memory_usage_ratio": self.memory_usage_ratio,
        }


@dataclass
class ClusterInfo:
    cluster_name: str
    nodes: list = field(default_factory=list)
    slots_total: int = 16384
    slots_assigned: int = 0
    status: str = "unknown"

    def get_node_by_id(self, node_id: str) -> Optional[CacheNode]:
        for node in self.nodes:
            if node.node_id == node_id:
                return node
        return None

    def get_masters(self) -> list:
        return [n for n in self.nodes if n.role == NodeRole.MASTER]

    def get_slaves(self) -> list:
        return [n for n in self.nodes if n.role == NodeRole.SLAVE]

    def to_dict(self) -> dict:
        return {
            "cluster_name": self.cluster_name,
            "status": self.status,
            "slots_total": self.slots_total,
            "slots_assigned": self.slots_assigned,
            "nodes": [n.to_dict() for n in self.nodes],
            "masters_count": len(self.get_masters()),
            "slaves_count": len(self.get_slaves()),
        }


@dataclass
class KeyInfo:
    key: str
    type: str
    ttl: int = -1
    size: int = 0
    node_id: Optional[str] = None
    slot: Optional[int] = None

    def to_dict(self) -> dict:
        return {
            "key": self.key,
            "type": self.type,
            "ttl": self.ttl,
            "size": self.size,
            "node_id": self.node_id,
            "slot": self.slot,
        }


@dataclass
class MigrationTask:
    task_id: str
    source_node: str
    target_node: str
    keys_pattern: str = "*"
    status: str = "pending"
    total_keys: int = 0
    migrated_keys: int = 0
    failed_keys: int = 0
    error_message: Optional[str] = None

    @property
    def progress(self) -> float:
        if self.total_keys == 0:
            return 0.0
        return round(self.migrated_keys / self.total_keys, 4)

    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "source_node": self.source_node,
            "target_node": self.target_node,
            "keys_pattern": self.keys_pattern,
            "status": self.status,
            "total_keys": self.total_keys,
            "migrated_keys": self.migrated_keys,
            "failed_keys": self.failed_keys,
            "progress": self.progress,
            "error_message": self.error_message,
        }
