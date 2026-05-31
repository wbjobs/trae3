from typing import Dict, List, Optional, Callable, Any, Set
from enum import Enum
from datetime import datetime
import re
import json
import threading
import fnmatch

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.logger import get_logger
from protocols.models import ProtocolMessage, ProtocolType, MessageType

logger = get_logger(__name__)


class MatchType(str, Enum):
    EXACT = "exact"
    REGEX = "regex"
    GLOB = "glob"
    PREFIX = "prefix"
    PAYLOAD_FIELD = "payload_field"


class DynamicRouteCondition:
    def __init__(
        self,
        field: str,
        match_type: MatchType = MatchType.EXACT,
        pattern: Optional[str] = None,
        values: Optional[List[str]] = None
    ):
        self.field = field
        self.match_type = match_type
        self.pattern = pattern
        self.values = set(values) if values else set()
        self._compiled_regex = re.compile(pattern) if pattern and match_type == MatchType.REGEX else None

    def matches(self, message: ProtocolMessage) -> bool:
        value = self._extract_field_value(message)
        if value is None:
            return False

        str_value = str(value)

        if self.match_type == MatchType.EXACT:
            return str_value in self.values if self.values else str_value == self.pattern

        elif self.match_type == MatchType.REGEX:
            if self._compiled_regex:
                return bool(self._compiled_regex.search(str_value))
            return False

        elif self.match_type == MatchType.GLOB:
            if self.pattern:
                return fnmatch.fnmatch(str_value, self.pattern)
            return any(fnmatch.fnmatch(str_value, v) for v in self.values)

        elif self.match_type == MatchType.PREFIX:
            if self.pattern:
                return str_value.startswith(self.pattern)
            return any(str_value.startswith(v) for v in self.values)

        elif self.match_type == MatchType.PAYLOAD_FIELD:
            payload = message.payload
            keys = self.field.split(".")
            current = payload
            for key in keys:
                if isinstance(current, dict):
                    current = current.get(key)
                else:
                    return False
            if current is None:
                return False
            return str(current) in self.values if self.values else str(current) == self.pattern

        return False

    def _extract_field_value(self, message: ProtocolMessage) -> Optional[Any]:
        field_map = {
            "protocol": message.protocol.value if hasattr(message.protocol, 'value') else str(message.protocol),
            "source": message.source,
            "target": message.target,
            "topic": message.topic,
            "message_type": message.message_type.value if hasattr(message.message_type, 'value') else str(message.message_type),
            "message_id": message.message_id,
        }
        if self.field in field_map:
            return field_map[self.field]
        if self.field.startswith("payload."):
            key = self.field[8:]
            return message.payload.get(key)
        if self.field.startswith("header."):
            key = self.field[7:]
            return message.headers.get(key)
        return None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "field": self.field,
            "match_type": self.match_type.value,
            "pattern": self.pattern,
            "values": list(self.values) if self.values else None
        }


class DynamicRouteRule:
    def __init__(
        self,
        name: str,
        conditions: List[DynamicRouteCondition],
        targets: List[str],
        strategy: str = "direct",
        priority: int = 0,
        enabled: bool = True,
        metadata: Optional[Dict[str, Any]] = None
    ):
        self.name = name
        self.conditions = conditions
        self.targets = targets
        self.strategy = strategy
        self.priority = priority
        self.enabled = enabled
        self.metadata = metadata or {}
        self.created_at = datetime.now()
        self.updated_at = datetime.now()
        self.match_count = 0
        self._lock = threading.Lock()
        self._round_robin_index = 0

    def matches(self, message: ProtocolMessage) -> bool:
        if not self.enabled:
            return False
        return all(cond.matches(message) for cond in self.conditions)

    def get_targets(self) -> List[str]:
        if not self.targets:
            return []

        if self.strategy == "broadcast":
            return list(self.targets)
        elif self.strategy == "round_robin":
            with self._lock:
                idx = self._round_robin_index % len(self.targets)
                self._round_robin_index = (self._round_robin_index + 1) % len(self.targets)
                return [self.targets[idx]]
        elif self.strategy == "weighted":
            return list(self.targets)
        else:
            return [self.targets[0]]

    def record_match(self) -> None:
        with self._lock:
            self.match_count += 1
            self.updated_at = datetime.now()

    def update_targets(self, targets: List[str]) -> None:
        with self._lock:
            self.targets = targets
            self._round_robin_index = 0
            self.updated_at = datetime.now()

    def update_conditions(self, conditions: List[DynamicRouteCondition]) -> None:
        with self._lock:
            self.conditions = conditions
            self.updated_at = datetime.now()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "conditions": [c.to_dict() for c in self.conditions],
            "targets": self.targets,
            "strategy": self.strategy,
            "priority": self.priority,
            "enabled": self.enabled,
            "metadata": self.metadata,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "match_count": self.match_count
        }


class DynamicRouter:
    def __init__(self):
        self._rules: List[DynamicRouteRule] = []
        self._handlers: Dict[str, Callable] = {}
        self._lock = threading.RLock()

    def add_rule(self, rule: DynamicRouteRule) -> None:
        with self._lock:
            for i, existing in enumerate(self._rules):
                if existing.name == rule.name:
                    self._rules[i] = rule
                    logger.info(f"Dynamic route updated: {rule.name}")
                    self._sort_rules()
                    return
            self._rules.append(rule)
            self._sort_rules()
            logger.info(f"Dynamic route added: {rule.name} (priority={rule.priority})")

    def remove_rule(self, name: str) -> bool:
        with self._lock:
            for i, rule in enumerate(self._rules):
                if rule.name == name:
                    del self._rules[i]
                    logger.info(f"Dynamic route removed: {name}")
                    return True
        return False

    def _sort_rules(self) -> None:
        self._rules.sort(key=lambda r: r.priority, reverse=True)

    def register_handler(self, name: str, handler: Callable) -> None:
        with self._lock:
            self._handlers[name] = handler
            logger.info(f"Dynamic route handler registered: {name}")

    def unregister_handler(self, name: str) -> bool:
        with self._lock:
            if name in self._handlers:
                del self._handlers[name]
                return True
        return False

    async def route(self, message: ProtocolMessage) -> Dict[str, bool]:
        results = {}

        with self._lock:
            rules_snapshot = list(self._rules)
            handlers_snapshot = dict(self._handlers)

        for rule in rules_snapshot:
            try:
                if rule.matches(message):
                    rule.record_match()
                    targets = rule.get_targets()
                    for target in targets:
                        handler = handlers_snapshot.get(target)
                        if handler:
                            try:
                                import asyncio
                                if asyncio.iscoroutinefunction(handler):
                                    result = await handler(message)
                                else:
                                    result = handler(message)
                                results[f"{rule.name}:{target}"] = bool(result)
                            except Exception as e:
                                logger.error(f"Dynamic route handler error for {target}: {e}")
                                results[f"{rule.name}:{target}"] = False
                        else:
                            logger.warning(f"Dynamic route handler not found: {target}")
                            results[f"{rule.name}:{target}"] = False
            except Exception as e:
                logger.error(f"Dynamic route rule {rule.name} error: {e}")

        return results

    def get_rules(self) -> List[DynamicRouteRule]:
        with self._lock:
            return list(self._rules)

    def get_rule(self, name: str) -> Optional[DynamicRouteRule]:
        with self._lock:
            for rule in self._rules:
                if rule.name == name:
                    return rule
        return None

    def enable_rule(self, name: str) -> bool:
        with self._lock:
            for rule in self._rules:
                if rule.name == name:
                    rule.enabled = True
                    return True
        return False

    def disable_rule(self, name: str) -> bool:
        with self._lock:
            for rule in self._rules:
                if rule.name == name:
                    rule.enabled = False
                    return True
        return False

    def update_rule_targets(self, name: str, targets: List[str]) -> bool:
        with self._lock:
            for rule in self._rules:
                if rule.name == name:
                    rule.update_targets(targets)
                    logger.info(f"Dynamic route {name} targets updated: {targets}")
                    return True
        return False

    def get_stats(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "total_rules": len(self._rules),
                "enabled_rules": sum(1 for r in self._rules if r.enabled),
                "total_handlers": len(self._handlers),
                "rules": [r.to_dict() for r in self._rules]
            }
