import time
import threading
from typing import Optional, List, Callable, Dict, Set
from collections import defaultdict
from datetime import datetime, timedelta
from cache_toolkit.core.cache_client import CacheClient
from cache_toolkit.utils.logger import get_logger

logger = get_logger()


class TTLMonitor:
    def __init__(
        self,
        client: CacheClient,
        check_interval: int = 60,
        warning_threshold: int = 300,
        critical_threshold: int = 60,
    ):
        self._client = client
        self._check_interval = check_interval
        self._warning_threshold = warning_threshold
        self._critical_threshold = critical_threshold
        self._patterns: List[str] = ["*"]
        self._callbacks: Dict[str, List[Callable]] = defaultdict(list)
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._stats: Dict[str, int] = defaultdict(int)
        self._expiring_keys: List[dict] = []
        self._seen_keys: Set[str] = set()

    def add_pattern(self, pattern: str):
        if pattern not in self._patterns:
            self._patterns.append(pattern)
            logger.info(f"TTL monitor pattern added: {pattern}")

    def remove_pattern(self, pattern: str):
        if pattern in self._patterns:
            self._patterns.remove(pattern)
            logger.info(f"TTL monitor pattern removed: {pattern}")

    def on_warning(self, callback: Callable):
        self._callbacks["warning"].append(callback)

    def on_critical(self, callback: Callable):
        self._callbacks["critical"].append(callback)

    def on_expired(self, callback: Callable):
        self._callbacks["expired"].append(callback)

    def _trigger(self, event: str, data: dict):
        for callback in self._callbacks[event]:
            try:
                callback(data)
            except Exception as e:
                logger.error(f"TTL monitor callback error: {e}")

    def check_once(self, pattern: Optional[str] = None) -> dict:
        patterns = [pattern] if pattern else self._patterns
        warning_keys = []
        critical_keys = []
        expired_keys = []
        scanned = 0

        for p in patterns:
            try:
                keys = self._client.scan_keys(pattern=p, count=200)
                for key in keys:
                    scanned += 1
                    try:
                        info = self._client.get_key_info(key)
                        ttl = info["ttl"]

                        if ttl == -2:
                            if key not in self._seen_keys:
                                expired_keys.append(info)
                                self._seen_keys.add(key)
                        elif ttl > 0:
                            key_data = {
                                "key": key,
                                "ttl": ttl,
                                "type": info["type"],
                                "size": info["size"],
                                "checked_at": datetime.now().isoformat(),
                            }
                            if ttl <= self._critical_threshold:
                                critical_keys.append(key_data)
                            elif ttl <= self._warning_threshold:
                                warning_keys.append(key_data)
                    except Exception:
                        pass
            except Exception as e:
                logger.warning(f"TTL check failed for pattern {p}: {e}")

        for key_data in warning_keys:
            self._trigger("warning", key_data)
        for key_data in critical_keys:
            self._trigger("critical", key_data)
        for info in expired_keys:
            self._trigger("expired", info)

        self._stats["checks"] += 1
        self._stats["scanned"] += scanned
        self._stats["warning"] += len(warning_keys)
        self._stats["critical"] += len(critical_keys)
        self._stats["expired"] += len(expired_keys)

        self._expiring_keys = critical_keys[:100]

        return {
            "scanned": scanned,
            "warning_count": len(warning_keys),
            "critical_count": len(critical_keys),
            "expired_count": len(expired_keys),
            "warning_keys": warning_keys[:50],
            "critical_keys": critical_keys[:50],
            "warning_threshold": self._warning_threshold,
            "critical_threshold": self._critical_threshold,
        }

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._monitor_loop, daemon=True, name="TTLMonitor"
        )
        self._thread.start()
        logger.info("TTL monitor started")

    def stop(self):
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=2)
        logger.info("TTL monitor stopped")

    def _monitor_loop(self):
        while not self._stop_event.is_set():
            try:
                self.check_once()
            except Exception as e:
                logger.error(f"TTL monitor loop error: {e}")

            for _ in range(int(self._check_interval / 0.5)):
                if self._stop_event.is_set():
                    break
                time.sleep(0.5)

    @property
    def stats(self) -> dict:
        return dict(self._stats)

    @property
    def expiring_keys(self) -> List[dict]:
        return list(self._expiring_keys)

    @property
    def running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()


class TTLAlertManager:
    def __init__(self, monitor: TTLMonitor):
        self._monitor = monitor
        self._alerts: List[dict] = []
        self._max_alerts = 1000

        self._monitor.on_warning(self._record_alert)
        self._monitor.on_critical(self._record_alert)
        self._monitor.on_expired(self._record_alert)

    def _record_alert(self, data: dict):
        alert = {
            "timestamp": datetime.now().isoformat(),
            "level": "expired" if "ttl" not in data else (
                "critical" if data["ttl"] <= self._monitor._critical_threshold else "warning"
            ),
            "data": data,
        }
        self._alerts.append(alert)
        if len(self._alerts) > self._max_alerts:
            self._alerts = self._alerts[-self._max_alerts:]

    def get_alerts(
        self,
        level: Optional[str] = None,
        limit: int = 100,
    ) -> List[dict]:
        alerts = reversed(self._alerts)
        if level:
            alerts = [a for a in alerts if a["level"] == level]
        return list(alerts)[:limit]

    @property
    def alert_count(self) -> dict:
        return {
            "warning": sum(1 for a in self._alerts if a["level"] == "warning"),
            "critical": sum(1 for a in self._alerts if a["level"] == "critical"),
            "expired": sum(1 for a in self._alerts if a["level"] == "expired"),
            "total": len(self._alerts),
        }
