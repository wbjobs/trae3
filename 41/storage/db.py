import sqlite3
import os
import threading
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any

from .models import Node, Metric, Alert, StatusHistory


DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'monitor.db')
INIT_SQL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'init.sql')


class Database:
    _instance = None
    _init_lock = threading.Lock()

    def __new__(cls):
        with cls._init_lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        self._local = threading.local()
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        if not hasattr(self._local, 'conn') or self._local.conn is None:
            self._local.conn = sqlite3.connect(DB_PATH, check_same_thread=False)
            self._local.conn.row_factory = sqlite3.Row
            self._local.conn.execute('PRAGMA journal_mode=WAL')
            self._local.conn.execute('PRAGMA synchronous=NORMAL')
        return self._local.conn

    def _init_db(self):
        conn = self._get_connection()
        with open(INIT_SQL_PATH, 'r', encoding='utf-8') as f:
            sql = f.read()
        conn.executescript(sql)
        conn.commit()

    def close(self):
        if hasattr(self._local, 'conn') and self._local.conn:
            self._local.conn.close()
            self._local.conn = None

    def _get_current_status(self, node_id: str) -> Optional[str]:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT status FROM nodes WHERE node_id = ?', (node_id,))
        row = cursor.fetchone()
        return row['status'] if row else None

    def _insert_status_history(self, node_id: str, new_status: str, reason: Optional[str] = None, changed_by: str = 'system'):
        old_status = self._get_current_status(node_id)
        if old_status == new_status:
            return
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO status_history (node_id, status, old_status, changed_by, reason)
            VALUES (?, ?, ?, ?, ?)
        ''', (node_id, new_status, old_status, changed_by, reason))

    def upsert_node(self, node: Node, reason: str = None) -> None:
        conn = self._get_connection()
        cursor = conn.cursor()
        old_status = self._get_current_status(node.node_id)
        if old_status and old_status != node.status:
            self._insert_status_history(node.node_id, node.status, reason or '节点状态变更', 'system')
        cursor.execute('''
            INSERT INTO nodes (node_id, node_name, ip_address, location, version, priority, status, last_report)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(node_id) DO UPDATE SET
                node_name=excluded.node_name,
                ip_address=excluded.ip_address,
                location=COALESCE(excluded.location, nodes.location),
                version=COALESCE(excluded.version, nodes.version),
                priority=COALESCE(excluded.priority, nodes.priority),
                status=excluded.status,
                last_report=excluded.last_report
        ''', (
            node.node_id, node.node_name, node.ip_address,
            node.location, node.version, node.priority, node.status,
            node.last_report or datetime.now()
        ))
        conn.commit()

    def update_node_status(self, node_id: str, status: str, reason: str = None, last_report: Optional[datetime] = None) -> None:
        old_status = self._get_current_status(node_id)
        if old_status == status:
            return
        conn = self._get_connection()
        cursor = conn.cursor()
        self._insert_status_history(node_id, status, reason, 'system')
        cursor.execute('''
            UPDATE nodes SET status = ?, last_report = COALESCE(?, last_report)
            WHERE node_id = ?
        ''', (status, last_report or datetime.now(), node_id))
        conn.commit()

    def update_node_status_and_metrics(self, node_id: str, status: str,
                                        cpu: float, memory: float, disk: float,
                                        last_report: Optional[datetime] = None) -> None:
        old_status = self._get_current_status(node_id)
        conn = self._get_connection()
        cursor = conn.cursor()
        if old_status and old_status != status:
            self._insert_status_history(node_id, status, '指标异常检测', 'system')
        now = last_report or datetime.now()
        cursor.execute('''
            UPDATE nodes SET status = ?, last_report = ?
            WHERE node_id = ?
        ''', (status, now, node_id))
        conn.commit()

    def update_node_last_report(self, node_id: str, last_report: Optional[datetime] = None) -> None:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE nodes SET last_report = ?
            WHERE node_id = ?
        ''', (last_report or datetime.now(), node_id))
        conn.commit()

    def update_node_metrics(self, node_id: str, cpu: float, memory: float, disk: float,
                            last_report: Optional[datetime] = None) -> None:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE nodes SET last_report = COALESCE(?, last_report)
            WHERE node_id = ?
        ''', (last_report or datetime.now(), node_id))
        conn.commit()

    def get_node(self, node_id: str) -> Optional[Node]:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT n.*,
                   (SELECT cpu_usage FROM metrics m WHERE m.node_id = n.node_id ORDER BY created_at DESC LIMIT 1) as cpu_usage,
                   (SELECT memory_usage FROM metrics m WHERE m.node_id = n.node_id ORDER BY created_at DESC LIMIT 1) as memory_usage,
                   (SELECT disk_usage FROM metrics m WHERE m.node_id = n.node_id ORDER BY created_at DESC LIMIT 1) as disk_usage
            FROM nodes n WHERE n.node_id = ?
        ''', (node_id,))
        row = cursor.fetchone()
        if row:
            return self._row_to_node(row)
        return None

    def get_all_nodes(self) -> List[Node]:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT n.*,
                   (SELECT cpu_usage FROM metrics m WHERE m.node_id = n.node_id ORDER BY created_at DESC LIMIT 1) as cpu_usage,
                   (SELECT memory_usage FROM metrics m WHERE m.node_id = n.node_id ORDER BY created_at DESC LIMIT 1) as memory_usage,
                   (SELECT disk_usage FROM metrics m WHERE m.node_id = n.node_id ORDER BY created_at DESC LIMIT 1) as disk_usage
            FROM nodes n ORDER BY n.priority ASC, n.node_id
        ''')
        rows = cursor.fetchall()
        return [self._row_to_node(row) for row in rows]

    def get_nodes_by_status(self, status: str) -> List[Node]:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT n.*,
                   (SELECT cpu_usage FROM metrics m WHERE m.node_id = n.node_id ORDER BY created_at DESC LIMIT 1) as cpu_usage,
                   (SELECT memory_usage FROM metrics m WHERE m.node_id = n.node_id ORDER BY created_at DESC LIMIT 1) as memory_usage,
                   (SELECT disk_usage FROM metrics m WHERE m.node_id = n.node_id ORDER BY created_at DESC LIMIT 1) as disk_usage
            FROM nodes n WHERE n.status = ? ORDER BY n.priority ASC, n.node_id
        ''', (status,))
        rows = cursor.fetchall()
        return [self._row_to_node(row) for row in rows]

    def _row_to_node(self, row: sqlite3.Row) -> Node:
        return Node(
            node_id=row['node_id'],
            node_name=row['node_name'],
            ip_address=row['ip_address'],
            location=row['location'],
            version=row['version'],
            priority=row['priority'],
            status=row['status'],
            registered_at=datetime.fromisoformat(row['registered_at']) if row['registered_at'] else None,
            last_report=datetime.fromisoformat(row['last_report']) if row['last_report'] else None,
            cpu_usage=row['cpu_usage'] if 'cpu_usage' in row.keys() else None,
            memory_usage=row['memory_usage'] if 'memory_usage' in row.keys() else None,
            disk_usage=row['disk_usage'] if 'disk_usage' in row.keys() else None,
        )

    def insert_metric(self, metric: Metric) -> int:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO metrics (node_id, cpu_usage, memory_usage, disk_usage, network_in, network_out, process_count, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        ''', (
            metric.node_id, metric.cpu_usage, metric.memory_usage, metric.disk_usage,
            metric.network_in, metric.network_out, metric.process_count, metric.created_at
        ))
        conn.commit()
        return cursor.lastrowid

    def get_node_metrics(self, node_id: str, start_time: Optional[datetime] = None,
                         end_time: Optional[datetime] = None, limit: int = 100) -> List[Metric]:
        conn = self._get_connection()
        cursor = conn.cursor()
        query = 'SELECT * FROM metrics WHERE node_id = ?'
        params = [node_id]
        if start_time:
            query += ' AND created_at >= ?'
            params.append(start_time.isoformat())
        if end_time:
            query += ' AND created_at <= ?'
            params.append(end_time.isoformat())
        query += ' ORDER BY created_at DESC LIMIT ?'
        params.append(limit)
        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [self._row_to_metric(row) for row in reversed(rows)]

    def get_metrics_range(self, start_time: datetime, end_time: Optional[datetime] = None) -> List[Metric]:
        conn = self._get_connection()
        cursor = conn.cursor()
        query = 'SELECT * FROM metrics WHERE created_at >= ?'
        params = [start_time.isoformat()]
        if end_time:
            query += ' AND created_at <= ?'
            params.append(end_time.isoformat())
        query += ' ORDER BY created_at ASC'
        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [self._row_to_metric(row) for row in rows]

    def get_recent_metrics(self, minutes: int = 5) -> List[Metric]:
        conn = self._get_connection()
        cursor = conn.cursor()
        start_time = datetime.now() - timedelta(minutes=minutes)
        cursor.execute('''
            SELECT * FROM metrics WHERE created_at >= ? ORDER BY created_at DESC
        ''', (start_time.isoformat(),))
        rows = cursor.fetchall()
        return [self._row_to_metric(row) for row in rows]

    def _row_to_metric(self, row: sqlite3.Row) -> Metric:
        return Metric(
            id=row['id'],
            node_id=row['node_id'],
            cpu_usage=row['cpu_usage'],
            memory_usage=row['memory_usage'],
            disk_usage=row['disk_usage'],
            network_in=row['network_in'],
            network_out=row['network_out'],
            process_count=row['process_count'],
            created_at=datetime.fromisoformat(row['created_at']) if row['created_at'] else None,
        )

    def insert_alert(self, alert: Alert) -> int:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO alerts (node_id, alert_type, alert_level, message, severity, created_at)
            VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        ''', (alert.node_id, alert.alert_type, alert.alert_level, alert.message, alert.severity, alert.created_at))
        conn.commit()
        return cursor.lastrowid

    def escalate_alert(self, alert_id: int) -> Optional[Alert]:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE alerts SET
                severity = MIN(severity + 1, 3),
                escalation_count = escalation_count + 1
            WHERE id = ? AND resolved = FALSE
        ''', (alert_id,))
        conn.commit()
        if cursor.rowcount > 0:
            return self._get_alert_by_id(alert_id)
        return None

    def _get_alert_by_id(self, alert_id: int) -> Optional[Alert]:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM alerts WHERE id = ?', (alert_id,))
        row = cursor.fetchone()
        return self._row_to_alert(row) if row else None

    def resolve_alert(self, alert_id: int) -> bool:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE alerts SET resolved = TRUE, resolved_at = CURRENT_TIMESTAMP
            WHERE id = ? AND resolved = FALSE
        ''', (alert_id,))
        conn.commit()
        return cursor.rowcount > 0

    def get_alerts(self, resolved: Optional[bool] = None, limit: int = 100, min_severity: int = 1) -> List[Alert]:
        conn = self._get_connection()
        cursor = conn.cursor()
        query = 'SELECT * FROM alerts WHERE severity >= ?'
        params = [min_severity]
        if resolved is not None:
            query += ' AND resolved = ?'
            params.append(1 if resolved else 0)
        query += ' ORDER BY severity DESC, created_at DESC LIMIT ?'
        params.append(limit)
        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [self._row_to_alert(row) for row in rows]

    def get_active_alerts(self, min_severity: int = 1) -> List[Alert]:
        return self.get_alerts(resolved=False, min_severity=min_severity)

    def get_node_alerts(self, node_id: str, resolved: Optional[bool] = None, limit: int = 50) -> List[Alert]:
        conn = self._get_connection()
        cursor = conn.cursor()
        query = 'SELECT * FROM alerts WHERE node_id = ?'
        params = [node_id]
        if resolved is not None:
            query += ' AND resolved = ?'
            params.append(1 if resolved else 0)
        query += ' ORDER BY severity DESC, created_at DESC LIMIT ?'
        params.append(limit)
        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [self._row_to_alert(row) for row in rows]

    def _row_to_alert(self, row: sqlite3.Row) -> Alert:
        return Alert(
            id=row['id'],
            node_id=row['node_id'],
            alert_type=row['alert_type'],
            alert_level=row['alert_level'],
            message=row['message'],
            severity=row['severity'],
            escalation_count=row['escalation_count'],
            resolved=bool(row['resolved']),
            created_at=datetime.fromisoformat(row['created_at']) if row['created_at'] else None,
            resolved_at=datetime.fromisoformat(row['resolved_at']) if row['resolved_at'] else None,
        )

    def get_status_history(self, node_id: Optional[str] = None, limit: int = 100) -> List[StatusHistory]:
        conn = self._get_connection()
        cursor = conn.cursor()
        if node_id:
            cursor.execute('''
                SELECT * FROM status_history WHERE node_id = ? ORDER BY created_at DESC LIMIT ?
            ''', (node_id, limit))
        else:
            cursor.execute('''
                SELECT * FROM status_history ORDER BY created_at DESC LIMIT ?
            ''', (limit,))
        rows = cursor.fetchall()
        return [self._row_to_status_history(row) for row in rows]

    def get_status_history_range(self, start_time: datetime, end_time: Optional[datetime] = None) -> List[StatusHistory]:
        conn = self._get_connection()
        cursor = conn.cursor()
        query = 'SELECT * FROM status_history WHERE created_at >= ?'
        params = [start_time.isoformat()]
        if end_time:
            query += ' AND created_at <= ?'
            params.append(end_time.isoformat())
        query += ' ORDER BY created_at ASC'
        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [self._row_to_status_history(row) for row in rows]

    def _row_to_status_history(self, row: sqlite3.Row) -> StatusHistory:
        return StatusHistory(
            id=row['id'],
            node_id=row['node_id'],
            status=row['status'],
            old_status=row['old_status'],
            changed_by=row['changed_by'],
            reason=row['reason'],
            created_at=datetime.fromisoformat(row['created_at']) if row['created_at'] else None,
        )

    def get_stats_summary(self) -> Dict[str, Any]:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online,
                SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as offline,
                SUM(CASE WHEN status = 'abnormal' THEN 1 ELSE 0 END) as abnormal,
                SUM(CASE WHEN priority = 1 THEN 1 ELSE 0 END) as p1_count,
                SUM(CASE WHEN priority = 2 THEN 1 ELSE 0 END) as p2_count,
                SUM(CASE WHEN priority = 3 THEN 1 ELSE 0 END) as p3_count
            FROM nodes
        ''')
        row = cursor.fetchone()
        cursor.execute('''
            SELECT
                COUNT(*) as total_alerts,
                SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END) as active_alerts,
                SUM(CASE WHEN severity >= 2 AND resolved = 0 THEN 1 ELSE 0 END) as high_severity_alerts
            FROM alerts
        ''')
        alert_row = cursor.fetchone()
        return {
            'total': row['total'],
            'online': row['online'] or 0,
            'offline': row['offline'] or 0,
            'abnormal': row['abnormal'] or 0,
            'p1_count': row['p1_count'] or 0,
            'p2_count': row['p2_count'] or 0,
            'p3_count': row['p3_count'] or 0,
            'total_alerts': alert_row['total_alerts'] or 0,
            'active_alerts': alert_row['active_alerts'] or 0,
            'high_severity_alerts': alert_row['high_severity_alerts'] or 0,
        }

    def check_offline_nodes(self, timeout_seconds: int = 60) -> List[str]:
        conn = self._get_connection()
        cursor = conn.cursor()
        cutoff_time = datetime.now() - timedelta(seconds=timeout_seconds)
        cursor.execute('''
            SELECT node_id FROM nodes
            WHERE status != 'offline' AND last_report < ?
        ''', (cutoff_time.isoformat(),))
        rows = cursor.fetchall()
        return [row['node_id'] for row in rows]
