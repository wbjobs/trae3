from typing import Dict, List, Optional
from datetime import datetime, timedelta
from collections import defaultdict, deque
import asyncio
import threading

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.logger import get_logger
from core.config import get_config
from protocols.models import ProtocolMessage, ProtocolType

logger = get_logger(__name__)


class TrafficStats:
    def __init__(self):
        self._total_messages: int = 0
        self._total_bytes: int = 0
        self._messages_by_protocol: Dict[str, int] = defaultdict(int)
        self._bytes_by_protocol: Dict[str, int] = defaultdict(int)
        self._messages_by_source: Dict[str, int] = defaultdict(int)
        self._messages_by_type: Dict[str, int] = defaultdict(int)
        self._error_count: int = 0
        self._success_count: int = 0
        self._start_time: datetime = datetime.now()
        self._message_history: deque = deque(maxlen=1000)
        self._lock = threading.Lock()

    def record_message(self, message: ProtocolMessage, success: bool = True) -> None:
        with self._lock:
            self._total_messages += 1
            self._messages_by_protocol[message.protocol.value if hasattr(message.protocol, 'value') else str(message.protocol)] += 1
            self._messages_by_source[message.source] += 1
            self._messages_by_type[message.message_type.value if hasattr(message.message_type, 'value') else str(message.message_type)] += 1

            if message.raw_data:
                bytes_count = len(message.raw_data.encode('utf-8'))
                self._total_bytes += bytes_count
                self._bytes_by_protocol[message.protocol.value if hasattr(message.protocol, 'value') else str(message.protocol)] += bytes_count

            if success:
                self._success_count += 1
            else:
                self._error_count += 1

            self._message_history.append({
                "timestamp": datetime.now(),
                "protocol": message.protocol.value if hasattr(message.protocol, 'value') else str(message.protocol),
                "source": message.source,
                "message_type": message.message_type.value if hasattr(message.message_type, 'value') else str(message.message_type),
                "success": success
            })

    def record_bytes(self, protocol: str, bytes_count: int) -> None:
        with self._lock:
            self._total_bytes += bytes_count
            self._bytes_by_protocol[protocol] += bytes_count

    def record_error(self) -> None:
        with self._lock:
            self._error_count += 1

    def get_summary(self) -> Dict:
        with self._lock:
            uptime = (datetime.now() - self._start_time).total_seconds()
            msg_rate = self._total_messages / uptime if uptime > 0 else 0
            byte_rate = self._total_bytes / uptime if uptime > 0 else 0

            return {
                "total_messages": self._total_messages,
                "total_bytes": self._total_bytes,
                "success_count": self._success_count,
                "error_count": self._error_count,
                "uptime_seconds": int(uptime),
                "messages_per_second": round(msg_rate, 2),
                "bytes_per_second": round(byte_rate, 2),
                "messages_by_protocol": dict(self._messages_by_protocol),
                "bytes_by_protocol": dict(self._bytes_by_protocol),
                "messages_by_source": dict(self._messages_by_source),
                "messages_by_type": dict(self._messages_by_type)
            }

    def get_recent_messages(self, limit: int = 100) -> List[Dict]:
        with self._lock:
            return list(self._message_history)[-limit:]

    def reset(self) -> None:
        with self._lock:
            self._total_messages = 0
            self._total_bytes = 0
            self._messages_by_protocol.clear()
            self._bytes_by_protocol.clear()
            self._messages_by_source.clear()
            self._messages_by_type.clear()
            self._error_count = 0
            self._success_count = 0
            self._start_time = datetime.now()
            self._message_history.clear()


class TrafficMonitor:
    def __init__(self):
        self.config = get_config()
        self._stats = TrafficStats()
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._interval_stats: deque = deque(maxlen=self.config.traffic.max_history)

    async def start(self) -> None:
        if self.config.traffic.enable_statistics:
            self._running = True
            self._task = asyncio.create_task(self._periodic_stats())
            logger.info("Traffic monitor started")

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Traffic monitor stopped")

    async def _periodic_stats(self) -> None:
        while self._running:
            try:
                stats = self._stats.get_summary()
                self._interval_stats.append({
                    "timestamp": datetime.now(),
                    "stats": stats
                })
                await asyncio.sleep(self.config.traffic.statistics_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Periodic stats error: {e}")
                await asyncio.sleep(1)

    def record_message(self, message: ProtocolMessage, success: bool = True) -> None:
        self._stats.record_message(message, success)

    def record_bytes(self, protocol: str, bytes_count: int) -> None:
        self._stats.record_bytes(protocol, bytes_count)

    def record_error(self) -> None:
        self._stats.record_error()

    def get_current_stats(self) -> Dict:
        return self._stats.get_summary()

    def get_recent_messages(self, limit: int = 100) -> List[Dict]:
        return self._stats.get_recent_messages(limit)

    def get_history(self, limit: int = 100) -> List[Dict]:
        return list(self._interval_stats)[-limit:]

    def reset_stats(self) -> None:
        self._stats.reset()
        self._interval_stats.clear()
        logger.info("Traffic statistics reset")
