import asyncio
import heapq
import uuid
import logging
from collections import defaultdict, deque
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Deque
from dataclasses import dataclass, field

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass(order=True)
class PriorityMessage:
    priority: int
    timestamp: float
    message_id: str = field(compare=False)
    tenant_id: str = field(compare=False)
    message_type: str = field(compare=False)
    payload: Dict[str, Any] = field(compare=False)
    target_client_id: Optional[str] = field(compare=False, default=None)
    created_at: datetime = field(compare=False, default_factory=datetime.now)
    ttl: int = field(compare=False, default=3600)

    def is_expired(self) -> bool:
        if self.ttl <= 0:
            return False
        age = (datetime.now() - self.created_at).total_seconds()
        return age > self.ttl


@dataclass
class QueueStats:
    total_size: int
    max_size: int
    dead_letter_count: int
    tenant_queues: Dict[str, int]
    high_watermark: float
    utilization: float


class PriorityMessageQueue:
    def __init__(self, max_size: int = 1000):
        self._queue: List[PriorityMessage] = []
        self._max_size = max_size
        self._lock = asyncio.Lock()
        self._not_empty = asyncio.Condition()
        self._dead_letter_queue: Deque[PriorityMessage] = deque(maxlen=1000)
        self._tenant_message_counts: Dict[str, int] = defaultdict(int)
        self._tenant_max_messages = 200
        self._fairness_threshold = 10
        self._high_watermark = max_size * 0.8
        self._last_eviction_warning = 0

    def _get_tenant_priority_bonus(self, tenant_id: str) -> int:
        count = self._tenant_message_counts.get(tenant_id, 0)
        if count > self._fairness_threshold:
            return 1
        return 0

    def _is_queue_full(self) -> bool:
        return len(self._queue) >= self._max_size

    def _is_tenant_over_limit(self, tenant_id: str) -> bool:
        return self._tenant_message_counts.get(tenant_id, 0) >= self._tenant_max_messages

    def _evict_low_priority(self) -> Optional[PriorityMessage]:
        if not self._queue:
            return None

        evicted = self._queue.pop()
        self._tenant_message_counts[evicted.tenant_id] -= 1
        self._dead_letter_queue.append(evicted)

        now = datetime.now().timestamp()
        if now - self._last_eviction_warning > 60:
            logger.warning(
                f"Queue full, evicted message {evicted.message_id} "
                f"from tenant {evicted.tenant_id} (priority: {evicted.priority})"
            )
            self._last_eviction_warning = now

        return evicted

    async def put(self, tenant_id: str, message_type: str, payload: Dict[str, Any],
                  priority: int = 0, target_client_id: Optional[str] = None,
                  ttl: int = 3600) -> Optional[str]:
        if not tenant_id:
            logger.error("Attempted to put message without tenant_id")
            return None

        if self._is_tenant_over_limit(tenant_id):
            logger.warning(
                f"Tenant {tenant_id} exceeded message limit {self._tenant_max_messages}, "
                f"rejecting message"
            )
            return None

        message_id = str(uuid.uuid4())

        async with self._lock:
            while self._is_queue_full():
                evicted = self._evict_low_priority()
                if not evicted:
                    logger.error("Failed to evict messages, queue is still full")
                    return None

            fairness_bonus = self._get_tenant_priority_bonus(tenant_id)
            adjusted_priority = -(priority + fairness_bonus)

            message = PriorityMessage(
                priority=adjusted_priority,
                timestamp=datetime.now().timestamp(),
                message_id=message_id,
                tenant_id=tenant_id,
                message_type=message_type,
                payload=payload,
                target_client_id=target_client_id,
                ttl=ttl
            )

            heapq.heappush(self._queue, message)
            self._tenant_message_counts[tenant_id] += 1

            current_size = len(self._queue)
            if current_size >= self._high_watermark:
                logger.warning(
                    f"Queue reaching capacity: {current_size}/{self._max_size} "
                    f"({current_size/self._max_size*100:.1f}%)"
                )

        async with self._not_empty:
            self._not_empty.notify()

        return message_id

    async def get(self, timeout: Optional[float] = None) -> Optional[PriorityMessage]:
        async with self._not_empty:
            while not self._queue:
                try:
                    await asyncio.wait_for(self._not_empty.wait(), timeout=timeout)
                except asyncio.TimeoutError:
                    return None

            async with self._lock:
                while self._queue:
                    message = heapq.heappop(self._queue)
                    self._tenant_message_counts[message.tenant_id] -= 1

                    if message.is_expired():
                        self._dead_letter_queue.append(message)
                        logger.debug(
                            f"Message {message.message_id} expired, "
                            f"age: {(datetime.now() - message.created_at).total_seconds():.1f}s"
                        )
                        continue

                    return message

                return None

    async def get_batch(self, batch_size: int, timeout: float = 0.1) -> List[PriorityMessage]:
        messages = []
        end_time = datetime.now().timestamp() + timeout

        while len(messages) < batch_size:
            remaining = end_time - datetime.now().timestamp()
            if remaining <= 0:
                break

            message = await self.get(timeout=remaining)
            if message is None:
                break
            messages.append(message)

        return messages

    async def get_all_for_tenant(self, tenant_id: str) -> List[PriorityMessage]:
        async with self._lock:
            messages = [m for m in self._queue if m.tenant_id == tenant_id]
            return sorted(messages, key=lambda x: (x.priority, x.timestamp))

    async def clear_expired_messages(self) -> int:
        cleared_count = 0
        async with self._lock:
            new_queue = []
            for msg in self._queue:
                if msg.is_expired():
                    self._dead_letter_queue.append(msg)
                    cleared_count += 1
                    self._tenant_message_counts[msg.tenant_id] -= 1
                else:
                    new_queue.append(msg)

            if cleared_count > 0:
                self._queue = new_queue
                heapq.heapify(self._queue)
                logger.info(f"Cleared {cleared_count} expired messages from queue")

            return cleared_count

    def size(self) -> int:
        return len(self._queue)

    def tenant_queue_size(self, tenant_id: str) -> int:
        return self._tenant_message_counts.get(tenant_id, 0)

    def get_stats(self) -> QueueStats:
        total_size = len(self._queue)
        return QueueStats(
            total_size=total_size,
            max_size=self._max_size,
            dead_letter_count=len(self._dead_letter_queue),
            tenant_queues=dict(self._tenant_message_counts),
            high_watermark=self._high_watermark,
            utilization=total_size / self._max_size if self._max_size > 0 else 0
        )

    def get_dead_letters(self, limit: int = 100) -> List[PriorityMessage]:
        return list(self._dead_letter_queue)[-limit:]

    async def clear_dead_letters(self) -> int:
        count = len(self._dead_letter_queue)
        self._dead_letter_queue.clear()
        if count > 0:
            logger.info(f"Cleared {count} dead letter messages")
        return count


message_queue = PriorityMessageQueue(max_size=settings.MESSAGE_QUEUE_MAX_SIZE)
