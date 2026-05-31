import asyncio
import logging
import uuid
import time
from datetime import datetime
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field
from collections import deque

from app.database import get_message_log_db
from app.message_log.models import MessageLog

logger = logging.getLogger(__name__)


@dataclass
class WriteItem:
    data: dict
    created_at: float = field(default_factory=time.time)


class BulkWriter:
    def __init__(
        self,
        max_batch_size: int = 200,
        flush_interval: float = 0.5,
        max_queue_size: int = 5000
    ):
        self._max_batch_size = max_batch_size
        self._flush_interval = flush_interval
        self._max_queue_size = max_queue_size
        self._queue: deque = deque(maxlen=max_queue_size)
        self._lock = asyncio.Lock()
        self._running = False
        self._flush_task: Optional[asyncio.Task] = None
        self._total_written = 0
        self._total_failed = 0
        self._total_batches = 0

    async def start(self):
        if not self._running:
            self._running = True
            self._flush_task = asyncio.create_task(self._periodic_flush())
            logger.info(f"BulkWriter started (batch={self._max_batch_size}, interval={self._flush_interval}s)")

    async def shutdown(self):
        self._running = False
        if self._flush_task:
            self._flush_task.cancel()
            try:
                await self._flush_task
            except asyncio.CancelledError:
                pass
        await self.flush()
        logger.info(f"BulkWriter shutdown: written={self._total_written}, failed={self._total_failed}")

    async def enqueue(self, data: dict) -> bool:
        if len(self._queue) >= self._max_queue_size:
            logger.warning("BulkWriter queue full, forcing flush")
            await self.flush()

        async with self._lock:
            self._queue.append(WriteItem(data=data))

        if len(self._queue) >= self._max_batch_size:
            await self.flush()

        return True

    async def flush(self) -> int:
        items_to_write: List[dict] = []
        async with self._lock:
            while self._queue:
                items_to_write.append(self._queue.popleft().data)

        if not items_to_write:
            return 0

        written = await self._do_bulk_write(items_to_write)
        return written

    async def _do_bulk_write(self, items: List[dict]) -> int:
        if not items:
            return 0

        db = None
        try:
            db = next(get_message_log_db(), None)
            if not db:
                self._total_failed += len(items)
                logger.error("BulkWriter: failed to get DB session")
                return 0

            objects = [MessageLog(**data) for data in items]
            db.bulk_save_objects(objects)
            db.commit()

            self._total_written += len(items)
            self._total_batches += 1
            logger.debug(f"BulkWriter: wrote {len(items)} records (batch #{self._total_batches})")
            return len(items)

        except Exception as e:
            if db:
                db.rollback()
            self._total_failed += len(items)
            logger.error(f"BulkWriter bulk write error: {e}", exc_info=True)
            return 0
        finally:
            if db:
                try:
                    db.close()
                except Exception:
                    pass

    async def _periodic_flush(self):
        while self._running:
            try:
                await asyncio.sleep(self._flush_interval)
                if self._queue:
                    await self.flush()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"BulkWriter periodic flush error: {e}", exc_info=True)

    def get_stats(self) -> Dict[str, Any]:
        return {
            "queue_size": len(self._queue),
            "max_batch_size": self._max_batch_size,
            "flush_interval": self._flush_interval,
            "total_written": self._total_written,
            "total_failed": self._total_failed,
            "total_batches": self._total_batches
        }


bulk_writer = BulkWriter()
