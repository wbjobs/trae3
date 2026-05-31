from typing import Dict, List, Optional, Callable
from enum import Enum
import re
import threading
from functools import lru_cache

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.logger import get_logger
from protocols.models import ProtocolMessage, ProtocolType

logger = get_logger(__name__)


class RouteStrategy(str, Enum):
    DIRECT = "direct"
    BROADCAST = "broadcast"
    ROUND_ROBIN = "round_robin"
    CONDITIONAL = "conditional"


class RouteRule:
    def __init__(
        self,
        name: str,
        source: str,
        targets: List[str],
        strategy: RouteStrategy = RouteStrategy.DIRECT,
        condition: Optional[str] = None,
        enabled: bool = True
    ):
        self.name = name
        self.source = source
        self.targets = targets
        self.strategy = strategy
        self.condition = condition
        self.enabled = enabled
        self._round_robin_index = 0
        self._lock = threading.Lock()
        self._compiled_condition = re.compile(condition) if condition else None

    def matches(self, message: ProtocolMessage) -> bool:
        if not self.enabled:
            return False
        
        if self.source != "*" and message.source != self.source:
            return False
        
        if self._compiled_condition:
            return self._evaluate_condition(message)
        
        return True

    def _evaluate_condition(self, message: ProtocolMessage) -> bool:
        try:
            import json
            payload_str = json.dumps(message.payload, ensure_ascii=False)
            return bool(self._compiled_condition.search(payload_str))
        except Exception as e:
            logger.error(f"Condition evaluation error: {e}")
            return False

    def get_targets(self, message: ProtocolMessage) -> List[str]:
        if not self.targets:
            logger.warning(f"Route rule {self.name} has no targets")
            return []
            
        if self.strategy == RouteStrategy.BROADCAST:
            return list(self.targets)
        elif self.strategy == RouteStrategy.ROUND_ROBIN:
            with self._lock:
                if len(self.targets) == 0:
                    return []
                target = self.targets[self._round_robin_index % len(self.targets)]
                self._round_robin_index = (self._round_robin_index + 1) % len(self.targets)
                return [target]
        else:
            return [self.targets[0]] if self.targets else []


class MessageRouter:
    def __init__(self):
        self._rules: List[RouteRule] = []
        self._target_handlers: Dict[str, Callable[[ProtocolMessage], bool]] = {}
        self._lock = threading.Lock()
        self._rule_lock = threading.RLock()

    def add_rule(self, rule: RouteRule) -> None:
        with self._rule_lock:
            for existing_rule in self._rules:
                if existing_rule.name == rule.name:
                    logger.warning(f"Route rule {rule.name} already exists, updating")
                    self._rules.remove(existing_rule)
                    break
            self._rules.append(rule)
            logger.info(f"Added route rule: {rule.name}")

    def remove_rule(self, rule_name: str) -> bool:
        with self._rule_lock:
            for i, rule in enumerate(self._rules):
                if rule.name == rule_name:
                    del self._rules[i]
                    logger.info(f"Removed route rule: {rule_name}")
                    return True
        return False

    def register_target_handler(
        self,
        target_name: str,
        handler: Callable[[ProtocolMessage], bool]
    ) -> None:
        with self._lock:
            self._target_handlers[target_name] = handler
            logger.info(f"Registered target handler: {target_name}")

    def unregister_target_handler(self, target_name: str) -> bool:
        with self._lock:
            if target_name in self._target_handlers:
                del self._target_handlers[target_name]
                logger.info(f"Unregistered target handler: {target_name}")
                return True
        return False

    async def route(self, message: ProtocolMessage) -> Dict[str, bool]:
        results = {}
        
        with self._rule_lock:
            rules_copy = list(self._rules)
        
        for rule in rules_copy:
            try:
                if not rule or not rule.enabled:
                    continue
                    
                if rule.matches(message):
                    targets = rule.get_targets(message)
                    for target in targets:
                        if not target:
                            continue
                            
                        handler_exists = False
                        with self._lock:
                            handler_exists = target in self._target_handlers
                        
                        if handler_exists:
                            try:
                                result = await self._call_handler(target, message)
                                results[f"{rule.name}:{target}"] = result
                            except Exception as e:
                                logger.error(f"Route error for {target}: {e}")
                                results[f"{rule.name}:{target}"] = False
                        else:
                            logger.warning(f"Target handler not found: {target}")
                            results[f"{rule.name}:{target}"] = False
            except Exception as e:
                logger.error(f"Rule {rule.name} processing error: {e}")
                continue
        
        return results

    async def _call_handler(self, target: str, message: ProtocolMessage) -> bool:
        with self._lock:
            handler = self._target_handlers.get(target)
        
        if handler:
            try:
                import asyncio
                if asyncio.iscoroutinefunction(handler):
                    return await handler(message)
                else:
                    return handler(message)
            except Exception as e:
                logger.error(f"Handler error for {target}: {e}")
                return False
        return False

    def get_rules(self) -> List[RouteRule]:
        with self._rule_lock:
            return list(self._rules)

    def enable_rule(self, rule_name: str) -> bool:
        with self._rule_lock:
            for rule in self._rules:
                if rule.name == rule_name:
                    rule.enabled = True
                    logger.info(f"Route rule enabled: {rule_name}")
                    return True
        return False

    def disable_rule(self, rule_name: str) -> bool:
        with self._rule_lock:
            for rule in self._rules:
                if rule.name == rule_name:
                    rule.enabled = False
                    logger.info(f"Route rule disabled: {rule_name}")
                    return True
        return False
