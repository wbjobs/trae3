import json
import logging
import sqlite3
import hashlib
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from datetime import datetime
import threading

logger = logging.getLogger(__name__)


class OperationType(Enum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    MIGRATE = "migrate"
    BACKUP = "backup"
    RESTORE = "restore"
    VALIDATE = "validate"
    CANARY_START = "canary_start"
    CANARY_PAUSE = "canary_pause"
    CANARY_COMPLETE = "canary_complete"
    CANARY_CANCEL = "canary_cancel"


@dataclass
class AuditLogEntry:
    operation: OperationType
    operator: str
    cluster: str
    namespace: str = ""
    group_name: str = ""
    data_id: str = ""
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    status: str = "success"
    error_message: str = ""
    created_at: datetime = field(default_factory=datetime.now)
    log_id: str = ""
    
    def __post_init__(self):
        if not self.log_id:
            raw = f"{self.operation.value}-{self.operator}-{datetime.now().timestamp()}"
            self.log_id = hashlib.md5(raw.encode()).hexdigest()[:16]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "log_id": self.log_id,
            "operation": self.operation.value,
            "operator": self.operator,
            "cluster": self.cluster,
            "namespace": self.namespace,
            "group_name": self.group_name,
            "data_id": self.data_id,
            "old_value": self.old_value,
            "new_value": self.new_value,
            "metadata": self.metadata,
            "status": self.status,
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat()
        }


class AuditLogger:
    def __init__(self, db_path: str = "./logs/audit.db"):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._init_db()
    
    def _init_db(self):
        conn = sqlite3.connect(str(self.db_path))
        conn.execute("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                log_id TEXT PRIMARY KEY,
                operation TEXT NOT NULL,
                operator TEXT NOT NULL,
                cluster TEXT NOT NULL,
                namespace TEXT,
                group_name TEXT,
                data_id TEXT,
                old_value TEXT,
                new_value TEXT,
                metadata TEXT,
                status TEXT,
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_audit_cluster ON audit_logs(cluster)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_audit_operation ON audit_logs(operation)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at)
        """)
        conn.commit()
        conn.close()
    
    def log(self, entry: AuditLogEntry):
        with self._lock:
            conn = sqlite3.connect(str(self.db_path))
            conn.execute(
                """
                INSERT INTO audit_logs 
                (log_id, operation, operator, cluster, namespace, group_name, data_id, 
                 old_value, new_value, metadata, status, error_message, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    entry.log_id,
                    entry.operation.value,
                    entry.operator,
                    entry.cluster,
                    entry.namespace,
                    entry.group_name,
                    entry.data_id,
                    entry.old_value,
                    entry.new_value,
                    json.dumps(entry.metadata, ensure_ascii=False) if entry.metadata else None,
                    entry.status,
                    entry.error_message,
                    entry.created_at.isoformat()
                )
            )
            conn.commit()
            conn.close()
        
        logger.info(f"审计日志已记录: {entry.log_id} - {entry.operation.value}")
    
    def query(
        self,
        cluster: Optional[str] = None,
        operation: Optional[OperationType] = None,
        data_id: Optional[str] = None,
        operator: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        with self._lock:
            conn = sqlite3.connect(str(self.db_path))
            
            query = "SELECT * FROM audit_logs WHERE 1=1"
            params = []
            
            if cluster:
                query += " AND cluster = ?"
                params.append(cluster)
            
            if operation:
                query += " AND operation = ?"
                params.append(operation.value)
            
            if data_id:
                query += " AND data_id = ?"
                params.append(data_id)
            
            if operator:
                query += " AND operator = ?"
                params.append(operator)
            
            if start_time:
                query += " AND created_at >= ?"
                params.append(start_time.isoformat())
            
            if end_time:
                query += " AND created_at <= ?"
                params.append(end_time.isoformat())
            
            query += " ORDER BY created_at DESC LIMIT ?"
            params.append(limit)
            
            cursor = conn.execute(query, params)
            rows = cursor.fetchall()
            conn.close()
            
            return [
                {
                    "log_id": row[0],
                    "operation": row[1],
                    "operator": row[2],
                    "cluster": row[3],
                    "namespace": row[4],
                    "group_name": row[5],
                    "data_id": row[6],
                    "old_value": row[7],
                    "new_value": row[8],
                    "metadata": json.loads(row[9]) if row[9] else {},
                    "status": row[10],
                    "error_message": row[11],
                    "created_at": row[12]
                }
                for row in rows
            ]
    
    def get_config_history(
        self,
        cluster: str,
        namespace: str,
        group_name: str,
        data_id: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        return self.query(
            cluster=cluster,
            data_id=data_id,
            limit=limit
        )
    
    def replay_operation(self, log_id: str) -> bool:
        logs = self.query(limit=1)
        if not logs:
            return False
        
        log_entry = logs[0]
        logger.info(f"操作回放: {log_id} - {log_entry['operation']}")
        
        return True
    
    def export_logs(
        self,
        output_path: str,
        cluster: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None
    ):
        logs = self.query(cluster=cluster, start_time=start_time, end_time=end_time, limit=10000)
        
        output = Path(output_path)
        output.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output, 'w', encoding='utf-8') as f:
            json.dump(logs, f, indent=2, ensure_ascii=False)
        
        logger.info(f"审计日志已导出: {output_path}, 共 {len(logs)} 条")


_global_audit_logger: Optional[AuditLogger] = None


def get_audit_logger(db_path: str = "./logs/audit.db") -> AuditLogger:
    global _global_audit_logger
    if _global_audit_logger is None:
        _global_audit_logger = AuditLogger(db_path)
    return _global_audit_logger


def audit_operation(
    operation: OperationType,
    operator: str = "system",
    cluster: str = "default"
):
    def decorator(func):
        def wrapper(*args, **kwargs):
            entry = AuditLogEntry(
                operation=operation,
                operator=operator,
                cluster=cluster
            )
            
            try:
                result = func(*args, **kwargs)
                entry.status = "success"
                return result
            except Exception as e:
                entry.status = "failed"
                entry.error_message = str(e)
                raise
            finally:
                get_audit_logger().log(entry)
        
        return wrapper
    return decorator
