import json
import time
import threading
from typing import Dict, List, Set
from collections import defaultdict
import logging
from datetime import datetime

try:
    from flask import Flask, render_template, jsonify, request
    from flask_socketio import SocketIO, emit, join_room, leave_room
    FLASK_AVAILABLE = True
except ImportError:
    FLASK_AVAILABLE = False

from config import WEBSOCKET_CONFIG
from database import db
from sensor_processor import get_sensor_processor
from timeseries_engine import get_ts_query_engine
from chamber_manager import get_chamber_manager
from task_scheduler import scheduler

logger = logging.getLogger(__name__)


class DashboardComponent:
    def __init__(self, component_id: str, refresh_interval: int = 1000):
        self.component_id = component_id
        self.refresh_interval = refresh_interval
        self.last_refresh = 0
        self._subscribers: Set[str] = set()
        self._lock = threading.Lock()

    def should_refresh(self) -> bool:
        return time.time() * 1000 - self.last_refresh >= self.refresh_interval

    def get_data(self) -> Dict:
        raise NotImplementedError

    def add_subscriber(self, sid: str) -> None:
        with self._lock:
            self._subscribers.add(sid)

    def remove_subscriber(self, sid: str) -> None:
        with self._lock:
            self._subscribers.discard(sid)

    def get_subscribers(self) -> Set[str]:
        with self._lock:
            return set(self._subscribers)


class SystemOverviewComponent(DashboardComponent):
    def __init__(self):
        super().__init__('system_overview', refresh_interval=5000)

    def get_data(self) -> Dict:
        try:
            chambers = db.get_all_chambers()
            tasks = db.get_all_tasks()
            grids = db.get_all_grids()

            sensor_processor = get_sensor_processor()
            ts_engine = get_ts_query_engine()
            chamber_manager = get_chamber_manager()

            return {
                'timestamp': int(time.time() * 1000),
                'component_id': self.component_id,
                'chambers': {
                    'total': len(chambers),
                    'active': sum(1 for c in chambers if c.get('is_active', 1)),
                },
                'tasks': {
                    'total': len(tasks),
                    'running': sum(1 for t in tasks if t['status'] == 'running'),
                    'pending': sum(1 for t in tasks if t['status'] == 'pending'),
                    'completed': sum(1 for t in tasks if t['status'] == 'completed'),
                    'failed': sum(1 for t in tasks if t['status'] == 'failed'),
                    'active': scheduler.get_active_tasks_count(),
                    'queued': scheduler.get_queue_size()
                },
                'grids': {
                    'total': len(grids)
                },
                'sensor_processor': sensor_processor.get_stats(),
                'timeseries': ts_engine.get_stats(),
                'chamber_manager': chamber_manager.get_stats()
            }
        except Exception as e:
            logger.error(f"Error getting system overview data: {e}")
            return {
                'timestamp': int(time.time() * 1000),
                'component_id': self.component_id,
                'error': str(e)
            }


class ChamberStatusComponent(DashboardComponent):
    def __init__(self, chamber_id: int = None):
        super().__init__(
            f'chamber_status_{chamber_id or "all"}',
            refresh_interval=3000
        )
        self.chamber_id = chamber_id

    def get_data(self) -> Dict:
        try:
            chamber_manager = get_chamber_manager()

            if self.chamber_id:
                status = chamber_manager.get_chamber_status(self.chamber_id)
                data = {
                    'timestamp': int(time.time() * 1000),
                    'component_id': self.component_id,
                    'chamber_id': self.chamber_id,
                    'status': status
                }
            else:
                statuses = chamber_manager.get_all_chamber_status()
                data = {
                    'timestamp': int(time.time() * 1000),
                    'component_id': self.component_id,
                    'chambers': statuses
                }

            return data
        except Exception as e:
            logger.error(f"Error getting chamber status data: {e}")
            return {
                'timestamp': int(time.time() * 1000),
                'component_id': self.component_id,
                'error': str(e)
            }


class SensorChartComponent(DashboardComponent):
    def __init__(self, sensor_id: int, interval: str = '1min',
                 time_range_ms: int = 3600000):
        super().__init__(
            f'sensor_chart_{sensor_id}_{interval}',
            refresh_interval=2000
        )
        self.sensor_id = sensor_id
        self.interval = interval
        self.time_range_ms = time_range_ms

    def get_data(self) -> Dict:
        try:
            ts_engine = get_ts_query_engine()
            end_time = int(time.time() * 1000)
            start_time = end_time - self.time_range_ms

            result = ts_engine.query_sensor_data(
                sensor_ids=[self.sensor_id],
                start_time=start_time,
                end_time=end_time,
                interval=self.interval
            )

            data_points = []
            sensor_data = result.get('data', {}).get(self.sensor_id, [])
            for point in sensor_data:
                if 'timestamp' in point:
                    data_points.append({
                        't': point['timestamp'],
                        'v': point['value']
                    })
                elif 'start_time' in point:
                    data_points.append({
                        't': point['start_time'],
                        'v': point.get('avg', point.get('value', 0))
                    })

            return {
                'timestamp': int(time.time() * 1000),
                'component_id': self.component_id,
                'sensor_id': self.sensor_id,
                'interval': self.interval,
                'data_points': data_points,
                'query_type': result.get('query_type'),
                'from_cache': result.get('from_cache'),
                'query_time': result.get('query_time', 0)
            }
        except Exception as e:
            logger.error(f"Error getting sensor chart data: {e}")
            return {
                'timestamp': int(time.time() * 1000),
                'component_id': self.component_id,
                'error': str(e)
            }


class TaskProgressComponent(DashboardComponent):
    def __init__(self):
        super().__init__('task_progress', refresh_interval=1000)

    def get_data(self) -> Dict:
        try:
            tasks = scheduler.get_all_tasks()

            active_tasks = [t for t in tasks if t.status == 'running']
            recent_tasks = sorted(
                tasks,
                key=lambda t: t.created_at if t.created_at else '',
                reverse=True
            )[:10]

            return {
                'timestamp': int(time.time() * 1000),
                'component_id': self.component_id,
                'active_tasks': [
                    {
                        'id': t.task_id,
                        'name': t.name,
                        'status': t.status,
                        'progress': t.progress,
                        'grid_id': t.grid_id,
                        'started_at': t.started_at
                    }
                    for t in active_tasks
                ],
                'recent_tasks': [
                    {
                        'id': t.task_id,
                        'name': t.name,
                        'status': t.status,
                        'progress': t.progress,
                        'created_at': t.created_at,
                        'completed_at': t.completed_at
                    }
                    for t in recent_tasks
                ],
                'queue_size': scheduler.get_queue_size(),
                'active_count': scheduler.get_active_tasks_count()
            }
        except Exception as e:
            logger.error(f"Error getting task progress data: {e}")
            return {
                'timestamp': int(time.time() * 1000),
                'component_id': self.component_id,
                'error': str(e)
            }


class DashboardServer:
    def __init__(self, config: Dict = None):
        self.config = config or WEBSOCKET_CONFIG
        self.partial_refresh_enabled = self.config.get('partial_refresh_enabled', True)
        self.refresh_interval = self.config.get('refresh_interval', 1000) / 1000
        self.max_connections = self.config.get('max_connections', 100)

        self._components: Dict[str, DashboardComponent] = {}
        self._lock = threading.Lock()

        self._server_thread = None
        self._refresh_thread = None
        self._running = False
        self._stop_event = threading.Event()

        self._connected_clients: Set[str] = set()

        self._register_default_components()

        if FLASK_AVAILABLE:
            self.app = Flask(__name__)
            self.app.config['SECRET_KEY'] = 'groundwater-dashboard-secret'
            self.socketio = SocketIO(
                self.app,
                cors_allowed_origins="*",
                async_mode='threading',
                max_http_buffer_size=self.config.get('max_message_size', 10485760)
            )
            self._setup_routes()
            self._setup_socket_events()
        else:
            self.app = None
            self.socketio = None
            logger.warning("Flask not available, dashboard server disabled")

    def _register_default_components(self) -> None:
        self._components['system_overview'] = SystemOverviewComponent()
        self._components['task_progress'] = TaskProgressComponent()
        self._components['chamber_status_all'] = ChamberStatusComponent()

    def register_component(self, component: DashboardComponent) -> None:
        with self._lock:
            self._components[component.component_id] = component

    def get_component(self, component_id: str) -> DashboardComponent:
        return self._components.get(component_id)

    def _setup_routes(self) -> None:
        if not self.app:
            return

        @self.app.route('/')
        def index():
            return render_template('dashboard.html')

        @self.app.route('/api/chambers')
        def api_chambers():
            chambers = db.get_all_chambers()
            return jsonify(chambers)

        @self.app.route('/api/chamber/<int:chamber_id>')
        def api_chamber(chamber_id):
            chamber = db.get_chamber(chamber_id)
            if not chamber:
                return jsonify({'error': 'not found'}), 404
            return jsonify(chamber)

        @self.app.route('/api/sensors')
        def api_sensors():
            chamber_id = request.args.get('chamber_id', type=int)
            if chamber_id:
                sensors = db.get_sensors_by_chamber(chamber_id)
            else:
                sensors = []
            return jsonify(sensors)

        @self.app.route('/api/component/<component_id>')
        def api_component(component_id):
            component = self.get_component(component_id)
            if not component:
                return jsonify({'error': 'component not found'}), 404
            return jsonify(component.get_data())

        @self.app.route('/api/sensor/<int:sensor_id>/data')
        def api_sensor_data(sensor_id):
            interval = request.args.get('interval', '1min')
            hours = request.args.get('hours', 1, type=int)

            end_time = int(time.time() * 1000)
            start_time = end_time - hours * 3600000

            ts_engine = get_ts_query_engine()
            result = ts_engine.query_sensor_data(
                sensor_ids=[sensor_id],
                start_time=start_time,
                end_time=end_time,
                interval=interval
            )
            return jsonify(result)

        @self.app.route('/api/system/status')
        def api_system_status():
            return jsonify({
                'connected_clients': len(self._connected_clients),
                'components': list(self._components.keys()),
                'partial_refresh_enabled': self.partial_refresh_enabled,
                'refresh_interval_ms': int(self.refresh_interval * 1000)
            })

    def _setup_socket_events(self) -> None:
        if not self.socketio:
            return

        @self.socketio.on('connect')
        def handle_connect():
            sid = request.sid
            if len(self._connected_clients) >= self.max_connections:
                logger.warning(f"Max connections reached, rejecting {sid}")
                return False

            self._connected_clients.add(sid)
            logger.info(f"Client connected: {sid}, total: {len(self._connected_clients)}")
            emit('connected', {
                'sid': sid,
                'components': list(self._components.keys()),
                'partial_refresh_enabled': self.partial_refresh_enabled
            })

        @self.socketio.on('disconnect')
        def handle_disconnect():
            sid = request.sid
            self._connected_clients.discard(sid)
            for component in self._components.values():
                component.remove_subscriber(sid)
            logger.info(f"Client disconnected: {sid}, total: {len(self._connected_clients)}")

        @self.socketio.on('subscribe')
        def handle_subscribe(data):
            sid = request.sid
            component_ids = data.get('components', [])
            for component_id in component_ids:
                component = self.get_component(component_id)
                if component:
                    component.add_subscriber(sid)
                    join_room(sid)
                    emit('subscribed', {'component_id': component_id}, to=sid)
                    initial_data = component.get_data()
                    emit('component_update', initial_data, to=sid)
                    logger.info(f"Client {sid} subscribed to {component_id}")

        @self.socketio.on('unsubscribe')
        def handle_unsubscribe(data):
            sid = request.sid
            component_id = data.get('component_id')
            component = self.get_component(component_id)
            if component:
                component.remove_subscriber(sid)
                emit('unsubscribed', {'component_id': component_id}, to=sid)
                logger.info(f"Client {sid} unsubscribed from {component_id}")

        @self.socketio.on('request_component')
        def handle_request_component(data):
            sid = request.sid
            component_id = data.get('component_id')
            component = self.get_component(component_id)
            if component:
                data = component.get_data()
                emit('component_update', data, to=sid)

        @self.socketio.on('pong')
        def handle_pong():
            pass

    def _refresh_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                if not self.partial_refresh_enabled:
                    time.sleep(self.refresh_interval)
                    continue

                with self._lock:
                    components = list(self._components.values())

                for component in components:
                    if not component.should_refresh():
                        continue

                    subscribers = component.get_subscribers()
                    if not subscribers:
                        continue

                    try:
                        data = component.get_data()
                        component.last_refresh = time.time() * 1000

                        if self.socketio:
                            for sid in subscribers:
                                self.socketio.emit('component_update', data, to=sid)
                    except Exception as e:
                        logger.error(f"Error refreshing component {component.component_id}: {e}")

                time.sleep(self.refresh_interval)

            except Exception as e:
                logger.error(f"Error in refresh loop: {e}", exc_info=True)
                time.sleep(1)

    def _heartbeat_loop(self) -> None:
        interval = self.config.get('heartbeat_interval', 30)
        while not self._stop_event.is_set():
            try:
                if self.socketio and self._connected_clients:
                    self.socketio.emit('ping', {'timestamp': int(time.time() * 1000)})
                time.sleep(interval)
            except Exception as e:
                logger.error(f"Error in heartbeat: {e}")
                time.sleep(interval)

    def start(self) -> None:
        if self._running or not self.app:
            return
        self._running = True
        self._stop_event.clear()

        self._refresh_thread = threading.Thread(
            target=self._refresh_loop,
            name='DashboardRefresh',
            daemon=True
        )
        self._refresh_thread.start()

        self._heartbeat_thread = threading.Thread(
            target=self._heartbeat_loop,
            name='DashboardHeartbeat',
            daemon=True
        )
        self._heartbeat_thread.start()

        host = self.config.get('host', '0.0.0.0')
        port = self.config.get('port', 5000)

        logger.info(f"Starting dashboard server on {host}:{port}")
        self._server_thread = threading.Thread(
            target=lambda: self.socketio.run(
                self.app,
                host=host,
                port=port,
                debug=False,
                use_reloader=False
            ),
            name='DashboardServer',
            daemon=True
        )
        self._server_thread.start()

    def stop(self) -> None:
        self._running = False
        self._stop_event.set()

        if self._refresh_thread:
            self._refresh_thread.join(timeout=5)
        if self._heartbeat_thread:
            self._heartbeat_thread.join(timeout=5)

        logger.info("Dashboard server stopped")

    def get_status(self) -> Dict:
        return {
            'running': self._running,
            'connected_clients': len(self._connected_clients),
            'components': list(self._components.keys()),
            'partial_refresh_enabled': self.partial_refresh_enabled,
            'refresh_interval_ms': int(self.refresh_interval * 1000)
        }


_dashboard_server = None


def get_dashboard_server() -> DashboardServer:
    global _dashboard_server
    if _dashboard_server is None:
        _dashboard_server = DashboardServer()
    return _dashboard_server
