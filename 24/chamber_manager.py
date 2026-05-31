import time
import threading
import queue
from datetime import datetime
from typing import Dict, List, Optional, Callable, Any
from collections import defaultdict, deque
from dataclasses import dataclass, field
import logging
import psutil
import os

from config import CHAMBER_CONFIG
from database import db

logger = logging.getLogger(__name__)


class CircuitBreaker:
    CLOSED = 'closed'
    OPEN = 'open'
    HALF_OPEN = 'half_open'

    def __init__(self, chamber_id: int, failure_threshold: int = 5,
                 timeout_seconds: int = 30, half_open_limit: int = 3):
        self.chamber_id = chamber_id
        self.failure_threshold = failure_threshold
        self.timeout = timeout_seconds
        self.half_open_limit = half_open_limit

        self.state = self.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.opened_at = 0
        self._lock = threading.Lock()

    def allow_request(self) -> bool:
        with self._lock:
            if self.state == self.CLOSED:
                return True

            if self.state == self.OPEN:
                if time.time() - self.opened_at >= self.timeout:
                    self.state = self.HALF_OPEN
                    self.success_count = 0
                    logger.info(f"Circuit breaker for chamber {self.chamber_id} transitioning to HALF_OPEN")
                    return True
                return False

            if self.state == self.HALF_OPEN:
                return self.success_count < self.half_open_limit

            return True

    def record_success(self) -> None:
        with self._lock:
            self.failure_count = 0
            if self.state == self.HALF_OPEN:
                self.success_count += 1
                if self.success_count >= self.half_open_limit:
                    self.state = self.CLOSED
                    logger.info(f"Circuit breaker for chamber {self.chamber_id} transitioning to CLOSED")
            elif self.state == self.CLOSED:
                self.success_count += 1

    def record_failure(self) -> None:
        with self._lock:
            self.failure_count += 1
            if self.state == self.HALF_OPEN:
                self.state = self.OPEN
                self.opened_at = time.time()
                logger.warning(f"Circuit breaker for chamber {self.chamber_id} transitioning to OPEN from HALF_OPEN")
            elif self.state == self.CLOSED and self.failure_count >= self.failure_threshold:
                self.state = self.OPEN
                self.opened_at = time.time()
                logger.warning(f"Circuit breaker for chamber {self.chamber_id} transitioning to OPEN")

    def get_status(self) -> Dict:
        with self._lock:
            return {
                'chamber_id': self.chamber_id,
                'state': self.state,
                'failure_count': self.failure_count,
                'success_count': self.success_count,
                'opened_at': self.opened_at,
                'remaining_timeout': max(0, self.timeout - (time.time() - self.opened_at)) if self.state == self.OPEN else 0
            }


class TokenBucket:
    def __init__(self, rate: float, capacity: int, enabled: bool = True):
        self.rate = rate
        self.capacity = capacity
        self.enabled = enabled
        self._tokens = capacity
        self._last_update = time.time()
        self._lock = threading.Lock()

    def _refill(self) -> None:
        now = time.time()
        elapsed = now - self._last_update
        new_tokens = elapsed * self.rate
        self._tokens = min(self.capacity, self._tokens + new_tokens)
        self._last_update = now

    def try_consume(self, tokens: int = 1) -> bool:
        if not self.enabled:
            return True

        with self._lock:
            self._refill()
            if self._tokens >= tokens:
                self._tokens -= tokens
                return True
            return False

    def get_tokens(self) -> float:
        with self._lock:
            self._refill()
            return self._tokens


class BackPressureController:
    def __init__(self, high_watermark: float = 0.8, low_watermark: float = 0.3,
                 enabled: bool = True):
        self.high_watermark = high_watermark
        self.low_watermark = low_watermark
        self.enabled = enabled
        self._in_backpressure = False
        self._lock = threading.Lock()

    def check_pressure(self, queue_size: int, max_queue_size: int) -> Dict:
        if not self.enabled or max_queue_size <= 0:
            return {'in_backpressure': False, 'pressure_level': 0.0, 'delay_ms': 0}

        pressure_level = queue_size / max_queue_size

        with self._lock:
            if pressure_level >= self.high_watermark:
                self._in_backpressure = True
            elif pressure_level <= self.low_watermark:
                self._in_backpressure = False

            if self._in_backpressure:
                delay_ms = int((pressure_level - self.low_watermark) * 1000)
            else:
                delay_ms = 0

            return {
                'in_backpressure': self._in_backpressure,
                'pressure_level': pressure_level,
                'delay_ms': delay_ms,
                'high_watermark': self.high_watermark,
                'low_watermark': self.low_watermark
            }


class ChamberResourceMonitor:
    def __init__(self, chamber_id: int, memory_limit_mb: int = 1024, cpu_limit: float = 0.5):
        self.chamber_id = chamber_id
        self.memory_limit_mb = memory_limit_mb
        self.cpu_limit = cpu_limit
        self._process = psutil.Process(os.getpid())
        self._history = deque(maxlen=60)
        self._lock = threading.Lock()

    def get_usage(self) -> Dict:
        with self._lock:
            try:
                memory_mb = self._process.memory_info().rss / (1024 * 1024)
                cpu_percent = self._process.cpu_percent(interval=0.1) / 100.0

                self._history.append({
                    'timestamp': time.time(),
                    'memory_mb': memory_mb,
                    'cpu_percent': cpu_percent
                })

                return {
                    'chamber_id': self.chamber_id,
                    'memory_mb': memory_mb,
                    'memory_limit_mb': self.memory_limit_mb,
                    'memory_usage_percent': (memory_mb / self.memory_limit_mb) * 100 if self.memory_limit_mb > 0 else 0,
                    'cpu_percent': cpu_percent * 100,
                    'cpu_limit_percent': self.cpu_limit * 100,
                    'cpu_usage_percent': (cpu_percent / self.cpu_limit) * 100 if self.cpu_limit > 0 else 0,
                    'memory_exceeded': memory_mb > self.memory_limit_mb,
                    'cpu_exceeded': cpu_percent > self.cpu_limit
                }
            except Exception as e:
                logger.error(f"Error getting resource usage for chamber {self.chamber_id}: {e}")
                return {
                    'chamber_id': self.chamber_id,
                    'error': str(e)
                }

    def check_limits(self) -> Dict:
        usage = self.get_usage()
        return {
            'can_execute': not usage.get('memory_exceeded', False) and not usage.get('cpu_exceeded', False),
            'usage': usage
        }


@dataclass
class Chamber:
    id: int
    name: str
    config: Dict = field(default_factory=dict)
    circuit_breaker: Optional[CircuitBreaker] = None
    rate_limiter: Optional[TokenBucket] = None
    backpressure: Optional[BackPressureController] = None
    resource_monitor: Optional[ChamberResourceMonitor] = None
    task_queue: Optional[queue.Queue] = None
    running_tasks: int = 0
    total_tasks: int = 0
    failed_tasks: int = 0
    max_concurrent: int = 2
    created_at: float = field(default_factory=time.time)


class ChamberManager:
    def __init__(self, config: Dict = None):
        config = config or CHAMBER_CONFIG
        self.config = config
        self._chambers: Dict[int, Chamber] = {}
        self._lock = threading.Lock()
        self._monitor_thread = None
        self._running = False
        self._stop_event = threading.Event()

        self._stats = {
            'total_requests': 0,
            'rejected_requests': 0,
            'backpressure_events': 0,
            'circuit_breaker_ops': 0,
            'memory_limit_violations': 0,
            'cpu_limit_violations': 0
        }
        self._stats_lock = threading.Lock()

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._stop_event.clear()

        self._monitor_thread = threading.Thread(
            target=self._monitor_loop,
            name='ChamberMonitor',
            daemon=True
        )
        self._monitor_thread.start()

        logger.info("Chamber manager started")

    def stop(self) -> None:
        self._running = False
        self._stop_event.set()
        if self._monitor_thread:
            self._monitor_thread.join(timeout=10)
        logger.info("Chamber manager stopped")

    def get_or_create_chamber(self, chamber_id: int) -> Optional[Chamber]:
        with self._lock:
            if chamber_id in self._chambers:
                return self._chambers[chamber_id]

            chamber_info = db.get_chamber(chamber_id)
            if not chamber_info:
                logger.error(f"Chamber {chamber_id} not found in database")
                return None

            chamber = Chamber(
                id=chamber_id,
                name=chamber_info['name'],
                config=chamber_info,
                max_concurrent=chamber_info.get('max_concurrent_tasks',
                                                self.config.get('max_concurrent_tasks_per_chamber', 2))
            )

            if self.config.get('circuit_breaker_enabled', True):
                chamber.circuit_breaker = CircuitBreaker(
                    chamber_id=chamber_id,
                    failure_threshold=self.config.get('circuit_breaker_failure_threshold', 5),
                    timeout_seconds=self.config.get('circuit_breaker_timeout', 30)
                )

            if self.config.get('flow_control_enabled', True):
                chamber.rate_limiter = TokenBucket(
                    rate=10.0,
                    capacity=100,
                    enabled=True
                )

            if self.config.get('backpressure_enabled', True):
                chamber.backpressure = BackPressureController(
                    high_watermark=self.config.get('queue_high_watermark', 0.8),
                    low_watermark=self.config.get('queue_low_watermark', 0.3),
                    enabled=True
                )

            if self.config.get('isolation_enabled', True):
                chamber.resource_monitor = ChamberResourceMonitor(
                    chamber_id=chamber_id,
                    memory_limit_mb=chamber_info.get('memory_limit_mb',
                                                    self.config.get('default_memory_limit_mb', 1024)),
                    cpu_limit=chamber_info.get('cpu_limit',
                                              self.config.get('default_cpu_limit', 0.5))
                )

            chamber.task_queue = queue.Queue(maxsize=1000)
            self._chambers[chamber_id] = chamber

            logger.info(f"Chamber {chamber_id} ({chamber.name}) initialized")
            return chamber

    def submit_task(self, chamber_id: int, task_func: Callable, *args, **kwargs) -> Dict:
        with self._stats_lock:
            self._stats['total_requests'] += 1

        chamber = self.get_or_create_chamber(chamber_id)
        if not chamber:
            return {'success': False, 'reason': 'chamber_not_found'}

        if chamber.circuit_breaker and not chamber.circuit_breaker.allow_request():
            with self._stats_lock:
                self._stats['rejected_requests'] += 1
                self._stats['circuit_breaker_ops'] += 1
            return {
                'success': False,
                'reason': 'circuit_breaker_open',
                'circuit_breaker': chamber.circuit_breaker.get_status()
            }

        if chamber.rate_limiter and not chamber.rate_limiter.try_consume():
            with self._stats_lock:
                self._stats['rejected_requests'] += 1
            return {'success': False, 'reason': 'rate_limit_exceeded'}

        if chamber.backpressure:
            pressure = chamber.backpressure.check_pressure(
                chamber.task_queue.qsize(),
                chamber.task_queue.maxsize
            )
            if pressure['in_backpressure']:
                with self._stats_lock:
                    self._stats['backpressure_events'] += 1
                if pressure['delay_ms'] > 0:
                    time.sleep(pressure['delay_ms'] / 1000)

        if chamber.resource_monitor:
            limits = chamber.resource_monitor.check_limits()
            if not limits['can_execute']:
                with self._stats_lock:
                    self._stats['rejected_requests'] += 1
                    if limits['usage'].get('memory_exceeded'):
                        self._stats['memory_limit_violations'] += 1
                    if limits['usage'].get('cpu_exceeded'):
                        self._stats['cpu_limit_violations'] += 1
                return {
                    'success': False,
                    'reason': 'resource_limit_exceeded',
                    'usage': limits['usage']
                }

        if chamber.running_tasks >= chamber.max_concurrent:
            return {'success': False, 'reason': 'max_concurrent_exceeded'}

        try:
            result = task_func(*args, **kwargs)
            if chamber.circuit_breaker:
                chamber.circuit_breaker.record_success()
            chamber.total_tasks += 1
            db.update_chamber_status(chamber_id, total_tasks=chamber.total_tasks)
            return {'success': True, 'result': result}

        except Exception as e:
            if chamber.circuit_breaker:
                chamber.circuit_breaker.record_failure()
            chamber.failed_tasks += 1
            db.update_chamber_status(chamber_id, failed_tasks=chamber.failed_tasks)
            logger.error(f"Task failed in chamber {chamber_id}: {e}", exc_info=True)
            return {'success': False, 'reason': 'task_failed', 'error': str(e)}

    def get_chamber_status(self, chamber_id: int) -> Optional[Dict]:
        chamber = self.get_or_create_chamber(chamber_id)
        if not chamber:
            return None

        status = {
            'chamber_id': chamber.id,
            'name': chamber.name,
            'running_tasks': chamber.running_tasks,
            'total_tasks': chamber.total_tasks,
            'failed_tasks': chamber.failed_tasks,
            'max_concurrent': chamber.max_concurrent,
            'queue_size': chamber.task_queue.qsize() if chamber.task_queue else 0,
            'circuit_breaker': chamber.circuit_breaker.get_status() if chamber.circuit_breaker else None,
            'rate_limiter_tokens': chamber.rate_limiter.get_tokens() if chamber.rate_limiter else None,
            'resource_usage': chamber.resource_monitor.get_usage() if chamber.resource_monitor else None
        }

        if chamber.backpressure and chamber.task_queue:
            status['backpressure'] = chamber.backpressure.check_pressure(
                chamber.task_queue.qsize(),
                chamber.task_queue.maxsize
            )

        return status

    def get_all_chamber_status(self) -> List[Dict]:
        statuses = []
        for chamber_id in list(self._chambers.keys()):
            status = self.get_chamber_status(chamber_id)
            if status:
                statuses.append(status)
        return statuses

    def get_stats(self) -> Dict:
        with self._stats_lock:
            stats = dict(self._stats)
            stats['active_chambers'] = len(self._chambers)
            if stats['total_requests'] > 0:
                stats['rejection_rate'] = stats['rejected_requests'] / stats['total_requests']
            else:
                stats['rejection_rate'] = 0.0
            return stats

    def _monitor_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                for chamber_id, chamber in list(self._chambers.items()):
                    if chamber.resource_monitor:
                        usage = chamber.resource_monitor.get_usage()
                        db.update_chamber_status(
                            chamber_id,
                            current_memory_mb=usage.get('memory_mb', 0),
                            current_cpu_usage=usage.get('cpu_percent', 0),
                            running_tasks=chamber.running_tasks
                        )

                        if chamber.circuit_breaker:
                            cb_status = chamber.circuit_breaker.get_status()
                            db.update_chamber_status(
                                chamber_id,
                                circuit_breaker_status=cb_status['state'],
                                circuit_breaker_failure_count=cb_status['failure_count'],
                                circuit_breaker_opened_at=datetime.fromtimestamp(
                                    cb_status['opened_at'] / 1000
                                ) if cb_status['opened_at'] > 0 else None
                            )

                        db.insert_system_metric(
                            'memory_usage_mb',
                            usage.get('memory_mb', 0),
                            chamber_id=chamber_id
                        )
                        db.insert_system_metric(
                            'cpu_usage_percent',
                            usage.get('cpu_percent', 0),
                            chamber_id=chamber_id
                        )

                time.sleep(5)

            except Exception as e:
                logger.error(f"Error in chamber monitor: {e}", exc_info=True)


_chamber_manager = None


def get_chamber_manager() -> ChamberManager:
    global _chamber_manager
    if _chamber_manager is None:
        _chamber_manager = ChamberManager()
        _chamber_manager.start()
    return _chamber_manager
