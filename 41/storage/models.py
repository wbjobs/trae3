from dataclasses import dataclass
from typing import Optional
from datetime import datetime


@dataclass
class Node:
    node_id: str
    node_name: str
    ip_address: str
    location: Optional[str] = None
    version: Optional[str] = None
    priority: int = 2
    status: str = 'offline'
    registered_at: Optional[datetime] = None
    last_report: Optional[datetime] = None
    cpu_usage: Optional[float] = None
    memory_usage: Optional[float] = None
    disk_usage: Optional[float] = None

    def to_dict(self):
        return {
            'node_id': self.node_id,
            'node_name': self.node_name,
            'ip_address': self.ip_address,
            'location': self.location,
            'version': self.version,
            'priority': self.priority,
            'status': self.status,
            'registered_at': self.registered_at.isoformat() if self.registered_at else None,
            'last_report': self.last_report.isoformat() if self.last_report else None,
            'cpu_usage': self.cpu_usage,
            'memory_usage': self.memory_usage,
            'disk_usage': self.disk_usage,
        }


@dataclass
class Metric:
    id: Optional[int]
    node_id: str
    cpu_usage: float
    memory_usage: float
    disk_usage: float
    network_in: float = 0.0
    network_out: float = 0.0
    process_count: int = 0
    created_at: Optional[datetime] = None

    def to_dict(self):
        return {
            'id': self.id,
            'node_id': self.node_id,
            'cpu_usage': self.cpu_usage,
            'memory_usage': self.memory_usage,
            'disk_usage': self.disk_usage,
            'network_in': self.network_in,
            'network_out': self.network_out,
            'process_count': self.process_count,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


@dataclass
class Alert:
    id: Optional[int]
    node_id: str
    alert_type: str
    alert_level: str
    message: str
    severity: int = 1
    escalation_count: int = 0
    resolved: bool = False
    created_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None

    def to_dict(self):
        return {
            'id': self.id,
            'node_id': self.node_id,
            'alert_type': self.alert_type,
            'alert_level': self.alert_level,
            'message': self.message,
            'severity': self.severity,
            'escalation_count': self.escalation_count,
            'resolved': self.resolved,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'resolved_at': self.resolved_at.isoformat() if self.resolved_at else None,
        }


@dataclass
class StatusHistory:
    id: Optional[int]
    node_id: str
    status: str
    old_status: Optional[str] = None
    changed_by: str = 'system'
    reason: Optional[str] = None
    created_at: Optional[datetime] = None

    def to_dict(self):
        return {
            'id': self.id,
            'node_id': self.node_id,
            'status': self.status,
            'old_status': self.old_status,
            'changed_by': self.changed_by,
            'reason': self.reason,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
