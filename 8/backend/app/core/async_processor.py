import asyncio
import logging
import threading
from typing import Callable, List, Any, Dict
from queue import Queue, Empty
from app.config import REQUEST_BATCH_SIZE, ASYNC_PROCESSING_ENABLED

logger = logging.getLogger(__name__)


class BatchProcessor:
    def __init__(self, batch_size: int = REQUEST_BATCH_SIZE, max_delay: float = 0.1):
        self.batch_size = batch_size
        self.max_delay = max_delay
        self.queue: Queue = Queue()
        self.results: Dict[str, Any] = {}
        self._lock = threading.Lock()
        self._event = threading.Event()
        self._running = False
        self._thread: threading.Thread | None = None

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._process_loop, daemon=True)
        self._thread.start()
        logger.info(f"BatchProcessor started (batch_size={self.batch_size})")

    def stop(self):
        self._running = False
        self._event.set()
        if self._thread:
            self._thread.join()
        logger.info("BatchProcessor stopped")

    def submit(self, func: Callable, *args, **kwargs) -> asyncio.Future:
        future = asyncio.Future()
        item_id = id(future)
        self.queue.put((item_id, func, args, kwargs, future))
        self._event.set()
        return future

    def _process_loop(self):
        while self._running:
            try:
                batch: List[tuple] = []
                while len(batch) < self.batch_size:
                    try:
                        item = self.queue.get(timeout=self.max_delay)
                        batch.append(item)
                    except Empty:
                        if batch:
                            break
                        self._event.wait(timeout=self.max_delay)
                        self._event.clear()
                        if not self._running:
                            break
                if batch:
                    self._process_batch(batch)
            except Exception as e:
                logger.error(f"BatchProcessor loop error: {e}")

    def _process_batch(self, batch: List[tuple]):
        logger.debug(f"Processing batch of {len(batch)} items")
        for item_id, func, args, kwargs, future in batch:
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                result = loop.run_until_complete(func(*args, **kwargs))
                loop.close()
                if not future.done():
                    future.set_result(result)
            except Exception as e:
                if not future.done():
                    future.set_exception(e)


_batch_processor: BatchProcessor | None = None


def get_batch_processor() -> BatchProcessor:
    global _batch_processor
    if _batch_processor is None:
        _batch_processor = BatchProcessor()
        if ASYNC_PROCESSING_ENABLED:
            _batch_processor.start()
    return _batch_processor


async def process_batched(func: Callable, items: List[Any], batch_size: int = REQUEST_BATCH_SIZE) -> List[Any]:
    if not ASYNC_PROCESSING_ENABLED or len(items) <= batch_size:
        return await asyncio.gather(*[func(item) for item in items])

    results: List[Any] = []
    for i in range(0, len(items), batch_size):
        batch = items[i:i + batch_size]
        batch_results = await asyncio.gather(*[func(item) for item in batch])
        results.extend(batch_results)
        await asyncio.sleep(0.01)

    return results
