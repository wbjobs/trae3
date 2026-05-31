import sys
import os
import queue
import threading
import logging
from collections import defaultdict, deque
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Callable

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from storage import Database, Node, Metric, Alert


logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('DataAggregator')


SEVERITY_MAP = {
    ('info', 1): 1,
    ('warning', 1): 1,
    ('warning', 2): 2,
    ('critical', 1): 2,
    ('critical', 2): 3,
    ('critical', 3): 3,
}


def calculate_severity(alert_level: str, node_priority: int = 2, escalation_count: int = 0) -> int:
    base = 1
    if alert_level == 'warning':
        base = 1
    elif alert_level == 'critical':
        base = 2
    priority_bonus = max(0, 2 - node_priority)
    escalation_bonus = min(escalation_count, 1)
    return min(base + priority_bonus + escalation_bonus, 3)


class AnomalyDetector:
    def __init__(self):
        self.thresholds = {
            'cpu': {'warning': 80, 'critical': 95},
            'memory': {'warning': 85, 'critical': 95},
            'disk': {'warning': 90, 'critical': 98},
        }
        self.history: Dict[str, Dict[str, deque]] = defaultdict(
            lambda: {'cpu': deque(maxlen=5), 'memory': deque(maxlen=5), 'disk': deque(maxlen=5)}
        )
        self.active_alerts: Dict[str, Dict[str, Alert]] = defaultdict(dict)
        self.alert_timestamps: Dict[str, Dict[str, datetime]] = defaultdict(dict)
        self.node_priorities: Dict[str, int] = {}
        self._lock = threading.Lock()

    def set_node_priority(self, node_id: str, priority: int):
        with self._lock:
            self.node_priorities[node_id] = priority

    def get_node_priority(self, node_id: str) -> int:
        return self.node_priorities.get(node_id, 2)

    def detect(self, node_id: str, metrics: Dict[str, Any]) -> List[Alert]:
        alerts = []
        node_priority = self.get_node_priority(node_id)
        with self._lock:
            for metric_type in ['cpu', 'memory', 'disk']:
                value = metrics.get(metric_type)
                if value is None:
                    continue

                self.history[node_id][metric_type].append(value)
                history = self.history[node_id][metric_type]

                thresholds = self.thresholds[metric_type]
                consecutive_high = sum(1 for v in history if v > thresholds['warning'])
                needs_check = metric_type in ['cpu', 'memory']

                alert_key = f"{metric_type}_warning"
                critical_key = f"{metric_type}_critical"

                if value > thresholds['critical']:
                    if critical_key not in self.active_alerts[node_id]:
                        severity = calculate_severity('critical', node_priority, 0)
                        alert = Alert(
                            id=None,
                            node_id=node_id,
                            alert_type=metric_type,
                            alert_level='critical',
                            message=f'{metric_type.upper()} 使用率严重过高: {value}%',
                            severity=severity,
                            escalation_count=0
                        )
                        alerts.append(alert)
                        self.active_alerts[node_id][critical_key] = alert
                        self.alert_timestamps[node_id][critical_key] = datetime.now()
                        if alert_key in self.active_alerts[node_id]:
                            del self.active_alerts[node_id][alert_key]
                            if alert_key in self.alert_timestamps[node_id]:
                                del self.alert_timestamps[node_id][alert_key]
                elif value > thresholds['warning']:
                    if (needs_check and consecutive_high >= 3) or (not needs_check):
                        if alert_key not in self.active_alerts[node_id] and critical_key not in self.active_alerts[node_id]:
                            severity = calculate_severity('warning', node_priority, 0)
                            alert = Alert(
                                id=None,
                                node_id=node_id,
                                alert_type=metric_type,
                                alert_level='warning',
                                message=f'{metric_type.upper()} 使用率过高: {value}%',
                                severity=severity,
                                escalation_count=0
                            )
                            alerts.append(alert)
                            self.active_alerts[node_id][alert_key] = alert
                            self.alert_timestamps[node_id][alert_key] = datetime.now()
                else:
                    if alert_key in self.active_alerts[node_id]:
                        del self.active_alerts[node_id][alert_key]
                        if alert_key in self.alert_timestamps[node_id]:
                            del self.alert_timestamps[node_id][alert_key]
                    if critical_key in self.active_alerts[node_id]:
                        del self.active_alerts[node_id][critical_key]
                        if critical_key in self.alert_timestamps[node_id]:
                            del self.alert_timestamps[node_id][critical_key]

        return alerts

    def check_offline(self, node_id: str) -> Optional[Alert]:
        node_priority = self.get_node_priority(node_id)
        with self._lock:
            alert_key = 'offline_critical'
            if alert_key not in self.active_alerts[node_id]:
                severity = calculate_severity('critical', node_priority, 0)
                alert = Alert(
                    id=None,
                    node_id=node_id,
                    alert_type='heartbeat',
                    alert_level='critical',
                    message='节点心跳超时，已离线',
                    severity=severity,
                    escalation_count=0
                )
                self.active_alerts[node_id][alert_key] = alert
                self.alert_timestamps[node_id][alert_key] = datetime.now()
                return alert
        return None

    def check_escalation(self) -> List[Alert]:
        escalated = []
        now = datetime.now()
        with self._lock:
            for node_id, alerts_dict in self.active_alerts.items():
                for alert_key, alert in list(alerts_dict.items()):
                    if not alert.id:
                        continue
                    created_at = self.alert_timestamps[node_id].get(alert_key, now)
                    age = (now - created_at).total_seconds()
                    if age > 300 and alert.escalation_count < 2:
                        node_priority = self.get_node_priority(node_id)
                        new_severity = calculate_severity(alert.alert_level, node_priority, alert.escalation_count + 1)
                        if new_severity > alert.severity:
                            alert.severity = new_severity
                            alert.escalation_count += 1
                            self.alert_timestamps[node_id][alert_key] = now
                            escalated.append(alert)
                            logger.warning(f'告警升级 node={node_id} type={alert.alert_type} severity={alert.severity}')
        return escalated

    def clear_node_alerts(self, node_id: str):
        with self._lock:
            self.active_alerts.pop(node_id, None)
            self.alert_timestamps.pop(node_id, None)
            self.history.pop(node_id, None)


class EventBus:
    def __init__(self):
        self._subscribers: Dict[str, List[Callable]] = defaultdict(list)
        self._lock = threading.Lock()

    def subscribe(self, event_type: str, callback: Callable):
        with self._lock:
            self._subscribers[event_type].append(callback)

    def unsubscribe(self, event_type: str, callback: Callable):
        with self._lock:
            if callback in self._subscribers[event_type]:
                self._subscribers[event_type].remove(callback)

    def publish(self, event_type: str, data: Any):
        with self._lock:
            callbacks = list(self._subscribers.get(event_type, []))
        for callback in callbacks:
            try:
                callback(data)
            except Exception as e:
                logger.error(f'事件处理异常: {e}')


class DataAggregator:
    def __init__(self):
        self.db = Database()
        self.data_queue: queue.Queue = queue.Queue()
        self.event_bus = EventBus()
        self.anomaly_detector = AnomalyDetector()
        self.running = False
        self._worker_thread: Optional[threading.Thread] = None
        self._offline_check_thread: Optional[threading.Thread] = None
        self._escalation_thread: Optional[threading.Thread] = None
        self.connected_nodes: Dict[str, Dict[str, Any]] = {}
        self._nodes_lock = threading.Lock()
        self._recent_metrics: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        self._metrics_lock = threading.Lock()
        self.logs: deque = deque(maxlen=200)

    def start(self):
        self.running = True
        self._worker_thread = threading.Thread(target=self._process_queue, daemon=True)
        self._worker_thread.start()
        self._offline_check_thread = threading.Thread(target=self._offline_check_loop, daemon=True)
        self._offline_check_thread.start()
        self._escalation_thread = threading.Thread(target=self._escalation_loop, daemon=True)
        self._escalation_thread.start()
        logger.info('数据聚合器已启动 (含告警升级机制)')

    def stop(self):
        self.running = False
        if self._worker_thread:
            self._worker_thread.join(timeout=5)
        if self._offline_check_thread:
            self._offline_check_thread.join(timeout=5)
        if self._escalation_thread:
            self._escalation_thread.join(timeout=5)
        logger.info('数据聚合器已停止')

    def enqueue_data(self, data: Dict[str, Any]):
        self.data_queue.put(data)

    def _process_queue(self):
        while self.running:
            try:
                data = self.data_queue.get(timeout=1)
                self._process_data(data)
                self.data_queue.task_done()
            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f'处理队列数据异常: {e}')

    def _process_data(self, data: Dict[str, Any]):
        packet_type = data.get('type')
        node_id = data.get('node_id')
        timestamp = data.get('timestamp')
        payload = data.get('data', {})

        if not node_id:
            return

        log_time = datetime.fromtimestamp(timestamp) if timestamp else datetime.now()
        log_entry = {
            'timestamp': log_time.isoformat(),
            'node_id': node_id,
            'type': packet_type,
            'level': 'info',
            'message': ''
        }

        if packet_type == 'register':
            self._handle_register(node_id, payload, log_entry)
        elif packet_type == 'report':
            self._handle_report(node_id, payload, timestamp, log_entry)
        elif packet_type == 'heartbeat':
            self._handle_heartbeat(node_id, log_entry)
        elif packet_type == 'alert':
            self._handle_alert(node_id, payload, timestamp, log_entry)
        elif packet_type == 'disconnect':
            self._handle_disconnect(node_id, log_entry)

        if log_entry['message']:
            self.logs.appendleft(log_entry)
            self.event_bus.publish('log', log_entry)

    def _handle_register(self, node_id: str, payload: Dict[str, Any], log_entry: Dict[str, Any]):
        now = datetime.now()
        node = Node(
            node_id=node_id,
            node_name=payload.get('node_name', node_id),
            ip_address=payload.get('ip_address', 'unknown'),
            location=payload.get('location', ''),
            version=payload.get('version', ''),
            status='online',
            last_report=now
        )
        self.db.upsert_node(node, '节点注册上线')
        with self._nodes_lock:
            self.connected_nodes[node_id] = {'connected': True, 'last_seen': now}
        self.anomaly_detector.set_node_priority(node_id, node.priority)
        self.anomaly_detector.clear_node_alerts(node_id)

        log_entry['message'] = f'节点 {node.node_name} 已注册上线 (P{node.priority})'
        log_entry['level'] = 'info'

        full_node = self.db.get_node(node_id)
        if full_node:
            self.event_bus.publish('node_status', full_node.to_dict())

    def _handle_report(self, node_id: str, payload: Dict[str, Any], timestamp: int, log_entry: Dict[str, Any]):
        now = datetime.fromtimestamp(timestamp) if timestamp else datetime.now()

        with self._nodes_lock:
            if node_id not in self.connected_nodes:
                self.connected_nodes[node_id] = {'connected': True, 'last_seen': now}
            self.connected_nodes[node_id]['last_seen'] = now

        metric = Metric(
            id=None,
            node_id=node_id,
            cpu_usage=payload.get('cpu', 0),
            memory_usage=payload.get('memory', 0),
            disk_usage=payload.get('disk', 0),
            network_in=payload.get('network_in', 0),
            network_out=payload.get('network_out', 0),
            process_count=payload.get('processes', 0),
            created_at=now
        )
        self.db.insert_metric(metric)

        alerts = self.anomaly_detector.detect(node_id, payload)
        node_status = 'online'
        if alerts:
            node_status = 'abnormal'
            for alert in alerts:
                alert.created_at = now
                alert.id = self.db.insert_alert(alert)
                self.event_bus.publish('alert', alert.to_dict())
                log_entry['level'] = 'warning' if alert.alert_level == 'warning' else 'error'
                logger.warning(f'产生告警 node={node_id} severity={alert.severity} type={alert.alert_type}')

        self.db.update_node_status_and_metrics(
            node_id, node_status,
            metric.cpu_usage, metric.memory_usage, metric.disk_usage, now
        )

        self._add_recent_metric(node_id, metric)
        self.event_bus.publish('metric', metric.to_dict())

        full_node = self.db.get_node(node_id)
        if full_node:
            self.event_bus.publish('node_status', full_node.to_dict())

        log_entry['message'] = f'指标上报: CPU={metric.cpu_usage}%, MEM={metric.memory_usage}%, DISK={metric.disk_usage}%'

    def _handle_heartbeat(self, node_id: str, log_entry: Dict[str, Any]):
        now = datetime.now()
        with self._nodes_lock:
            if node_id in self.connected_nodes:
                self.connected_nodes[node_id]['last_seen'] = now
        self.db.update_node_last_report(node_id, now)
        log_entry['message'] = '心跳'
        log_entry['level'] = 'debug'

    def _handle_alert(self, node_id: str, payload: Dict[str, Any], timestamp: int, log_entry: Dict[str, Any]):
        now = datetime.fromtimestamp(timestamp) if timestamp else datetime.now()
        node_priority = self.anomaly_detector.get_node_priority(node_id)
        severity = calculate_severity(payload.get('alert_level', 'warning'), node_priority, 0)
        alert = Alert(
            id=None,
            node_id=node_id,
            alert_type=payload.get('alert_type', 'custom'),
            alert_level=payload.get('alert_level', 'warning'),
            message=payload.get('message', ''),
            severity=severity,
            escalation_count=0,
            created_at=now
        )
        alert.id = self.db.insert_alert(alert)
        self.db.update_node_status(node_id, 'abnormal', '节点主动告警', now)
        self.event_bus.publish('alert', alert.to_dict())

        full_node = self.db.get_node(node_id)
        if full_node:
            self.event_bus.publish('node_status', full_node.to_dict())

        log_entry['message'] = f'主动告警: P{alert.severity} {alert.alert_level} - {alert.message}'
        log_entry['level'] = 'warning' if alert.alert_level == 'warning' else 'error'

    def _handle_disconnect(self, node_id: str, log_entry: Dict[str, Any]):
        now = datetime.now()
        with self._nodes_lock:
            self.connected_nodes.pop(node_id, None)
        self.db.update_node_status(node_id, 'offline', '节点主动断开', now)

        full_node = self.db.get_node(node_id)
        if full_node:
            self.event_bus.publish('node_status', full_node.to_dict())

        log_entry['message'] = '节点主动断开连接'
        log_entry['level'] = 'warning'

    def _offline_check_loop(self):
        while self.running:
            try:
                with self._nodes_lock:
                    stale_nodes = []
                    for node_id, info in list(self.connected_nodes.items()):
                        if (datetime.now() - info['last_seen']).total_seconds() > 60:
                            stale_nodes.append(node_id)

                for node_id in stale_nodes:
                    with self._nodes_lock:
                        self.connected_nodes.pop(node_id, None)
                    self.db.update_node_status(node_id, 'offline', '心跳超时')
                    alert = self.anomaly_detector.check_offline(node_id)
                    if alert:
                        alert.id = self.db.insert_alert(alert)
                        self.event_bus.publish('alert', alert.to_dict())
                        log_entry = {
                            'timestamp': datetime.now().isoformat(),
                            'node_id': node_id,
                            'type': 'system',
                            'level': 'error',
                            'message': f'节点 {node_id} 心跳超时，已标记为离线 (P{alert.severity})'
                        }
                        self.logs.appendleft(log_entry)
                        self.event_bus.publish('log', log_entry)

                    full_node = self.db.get_node(node_id)
                    if full_node:
                        self.event_bus.publish('node_status', full_node.to_dict())
            except Exception as e:
                logger.error(f'离线检查异常: {e}')
            threading.Event().wait(10)

    def _escalation_loop(self):
        while self.running:
            try:
                escalated = self.anomaly_detector.check_escalation()
                for alert in escalated:
                    if alert.id:
                        updated = self.db.escalate_alert(alert.id)
                        if updated:
                            self.event_bus.publish('alert_escalated', updated.to_dict())
                            self.event_bus.publish('alert', updated.to_dict())
                            log_entry = {
                                'timestamp': datetime.now().isoformat(),
                                'node_id': alert.node_id,
                                'type': 'alert_escalation',
                                'level': 'error',
                                'message': f'告警升级: P{alert.severity} {alert.alert_type} - {alert.message}'
                            }
                            self.logs.appendleft(log_entry)
                            self.event_bus.publish('log', log_entry)
            except Exception as e:
                logger.error(f'告警升级检查异常: {e}')
            threading.Event().wait(60)

    def _add_recent_metric(self, node_id: str, metric: Metric):
        with self._metrics_lock:
            self._recent_metrics[node_id].append({
                'timestamp': metric.created_at.isoformat() if metric.created_at else datetime.now().isoformat(),
                'cpu_usage': metric.cpu_usage,
                'memory_usage': metric.memory_usage,
                'disk_usage': metric.disk_usage,
            })
            if len(self._recent_metrics[node_id]) > 60:
                self._recent_metrics[node_id] = self._recent_metrics[node_id][-60:]

    def get_recent_metrics(self, node_id: Optional[str] = None) -> Dict[str, Any]:
        with self._metrics_lock:
            if node_id:
                return {node_id: list(self._recent_metrics.get(node_id, []))}
            return {k: list(v) for k, v in self._recent_metrics.items()}

    def get_logs(self) -> List[Dict[str, Any]]:
        return list(self.logs)


_aggregator_instance = None
_instance_lock = threading.Lock()


def get_aggregator() -> DataAggregator:
    global _aggregator_instance
    if _aggregator_instance is None:
        with _instance_lock:
            if _aggregator_instance is None:
                _aggregator_instance = DataAggregator()
    return _aggregator_instance
