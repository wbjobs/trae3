import asyncio
import uuid
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List, Set
from contextlib import contextmanager

from app.push.message_queue import message_queue
from app.push.websocket_manager import websocket_manager
from app.push.bulk_writer import bulk_writer
from app.database import get_message_log_db, get_device_db
from app.message_log.models import MessageLog
from app.device.models import Device
from app.config import settings
from app.middleware.circuit_breaker import push_circuit, message_log_circuit, CircuitBreakerOpenError

logger = logging.getLogger(__name__)


class PushService:
    def __init__(self):
        self._worker_tasks: List[asyncio.Task] = []
        self._running = False
        self._semaphore = asyncio.Semaphore(20)
        self._batch_size = settings.MESSAGE_PUSH_BATCH_SIZE
        self._message_ttl = 3600
        self._db_lock = asyncio.Lock()
        self._recalled_messages: Set[str] = set()
        self._offline_retry_max = 3
        self._offline_check_task: Optional[asyncio.Task] = None

    async def start(self):
        if not self._running:
            self._running = True
            await bulk_writer.start()
            num_workers = max(3, min(10, settings.SCHEDULER_MAX_WORKERS))
            for i in range(num_workers):
                task = asyncio.create_task(self._worker(f"worker-{i}"))
                self._worker_tasks.append(task)
            self._offline_check_task = asyncio.create_task(self._offline_redelivery_loop())
            logger.info(f"PushService started with {num_workers} workers + offline redelivery")

    async def shutdown(self):
        self._running = False
        for task in self._worker_tasks:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._worker_tasks.clear()
        if self._offline_check_task:
            self._offline_check_task.cancel()
            try:
                await self._offline_check_task
            except asyncio.CancelledError:
                pass
        await bulk_writer.shutdown()
        logger.info("PushService shutdown complete")

    @contextmanager
    def _get_db_session(self):
        db = None
        try:
            db = next(get_message_log_db(), None)
            if db is None:
                raise RuntimeError("Failed to get database session")
            yield db
        except Exception as e:
            if db:
                db.rollback()
            logger.error(f"Database session error: {e}")
            raise
        finally:
            if db:
                try:
                    db.close()
                except Exception as e:
                    logger.error(f"Error closing db session: {e}")

    async def _worker(self, worker_name: str):
        logger.info(f"Push worker {worker_name} started")
        while self._running:
            try:
                batch = await self._get_message_batch(self._batch_size)
                if not batch:
                    await asyncio.sleep(0.1)
                    continue

                for message in batch:
                    if self._is_message_expired(message):
                        logger.warning(f"Message {message.message_id} expired, skipping")
                        await self._update_message_log(message.message_id, "expired")
                        continue

                    if message.message_id in self._recalled_messages:
                        self._recalled_messages.discard(message.message_id)
                        await self._update_message_log(message.message_id, "recalled")
                        logger.info(f"Message {message.message_id} recalled, skipping")
                        continue

                    async with self._semaphore:
                        await self._process_message(message)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Worker {worker_name} error: {e}", exc_info=True)
                await asyncio.sleep(1)

        logger.info(f"Push worker {worker_name} stopped")

    async def _get_message_batch(self, batch_size: int) -> List:
        messages = []
        for _ in range(batch_size):
            try:
                message = await message_queue.get(timeout=0.01)
                if message:
                    messages.append(message)
                else:
                    break
            except asyncio.TimeoutError:
                break
            except Exception as e:
                logger.error(f"Error getting message from queue: {e}")
                break
        return messages

    def _is_message_expired(self, message) -> bool:
        if not message.created_at:
            return False
        age = (datetime.now() - message.created_at).total_seconds()
        return age > self._message_ttl

    async def _process_message(self, message):
        try:
            if not message.tenant_id:
                logger.error(f"Message {message.message_id} has no tenant_id, discarding")
                await self._update_message_log(message.message_id, "failed", "No tenant_id")
                return

            ws_message = {
                "message_id": message.message_id,
                "type": message.message_type,
                "payload": message.payload,
                "timestamp": message.created_at.isoformat() if message.created_at else datetime.now().isoformat()
            }

            success = False
            try:
                if message.target_client_id:
                    success = await push_circuit.call(
                        websocket_manager.send_personal_message,
                        message.tenant_id,
                        message.target_client_id,
                        ws_message
                    )
                else:
                    sent, failed = await push_circuit.call(
                        websocket_manager.send_to_tenant,
                        message.tenant_id,
                        ws_message
                    )
                    success = sent > 0
            except CircuitBreakerOpenError:
                logger.warning(f"Push circuit open, message {message.message_id} will retry later")
                await self._update_message_log(message.message_id, "pending", "Circuit breaker open")
                await message_queue.put(
                    tenant_id=message.tenant_id,
                    message_type=message.message_type,
                    payload=message.payload,
                    priority=message.priority,
                    target_client_id=message.target_client_id
                )
                return

            if success:
                await self._update_message_log(message.message_id, "sent")
            else:
                await self._handle_send_failure(message)

        except Exception as e:
            logger.error(f"Error processing message {message.message_id}: {e}", exc_info=True)
            await self._update_message_log(message.message_id, "failed", str(e))

    async def _handle_send_failure(self, message):
        with self._get_db_session() as db:
            log = db.query(MessageLog).filter(MessageLog.message_id == message.message_id).first()
            if log and log.retry_count < self._offline_retry_max:
                log.retry_count += 1
                log.status = "pending"
                db.commit()
                logger.info(f"Message {message.message_id} retry #{log.retry_count}")
            else:
                await self._update_message_log(
                    message.message_id,
                    "failed",
                    "No active connections, max retries exceeded"
                )

    async def push_message(
        self,
        tenant_id: str,
        message_type: str,
        payload: Dict[str, Any],
        priority: int = 0,
        target_client_id: Optional[str] = None,
        channel: str = "websocket",
        device_id: Optional[str] = None
    ) -> str:
        if not tenant_id:
            raise ValueError("tenant_id is required")

        try:
            message_id = await message_queue.put(
                tenant_id=tenant_id,
                message_type=message_type,
                payload=payload,
                priority=priority,
                target_client_id=target_client_id
            )

            log_data = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "message_id": message_id,
                "message_type": message_type,
                "priority": priority,
                "channel": channel,
                "payload": payload,
                "status": "pending",
                "device_id": device_id,
                "recipient": target_client_id
            }
            await bulk_writer.enqueue(log_data)
            return message_id
        except Exception as e:
            logger.error(f"Error queuing message for tenant {tenant_id}: {e}", exc_info=True)
            raise

    async def recall_message(self, tenant_id: str, message_id: str) -> bool:
        self._recalled_messages.add(message_id)

        try:
            with self._get_db_session() as db:
                log = db.query(MessageLog).filter(
                    MessageLog.message_id == message_id,
                    MessageLog.tenant_id == tenant_id
                ).first()

                if not log:
                    self._recalled_messages.discard(message_id)
                    return False

                if log.status not in ("pending", "sent"):
                    self._recalled_messages.discard(message_id)
                    return False

                log.status = "recalled"
                db.commit()

            await websocket_manager.send_to_tenant(
                tenant_id,
                {
                    "type": "message_recalled",
                    "message_id": message_id,
                    "timestamp": datetime.now().isoformat()
                }
            )

            logger.info(f"Message {message_id} recalled for tenant {tenant_id}")
            return True
        except Exception as e:
            self._recalled_messages.discard(message_id)
            logger.error(f"Error recalling message {message_id}: {e}", exc_info=True)
            return False

    async def redeliver_offline_messages(self, tenant_id: str, device_id: Optional[str] = None) -> int:
        redelivered = 0
        try:
            with self._get_db_session() as db:
                query = db.query(MessageLog).filter(
                    MessageLog.tenant_id == tenant_id,
                    MessageLog.status.in_(["pending", "failed"]),
                    MessageLog.created_at >= datetime.now() - timedelta(hours=24)
                )

                if device_id:
                    query = query.filter(MessageLog.device_id == device_id)

                pending_messages = query.order_by(MessageLog.priority.desc()).limit(200).all()

                for log in pending_messages:
                    if not websocket_manager.get_tenant_connections_count(tenant_id):
                        break

                    log_id = await message_queue.put(
                        tenant_id=log.tenant_id,
                        message_type=log.message_type,
                        payload=log.payload or {},
                        priority=log.priority,
                        target_client_id=log.recipient
                    )

                    if log_id:
                        log.status = "pending"
                        log.retry_count += 1
                        redelivered += 1

                db.commit()

            logger.info(f"Redelivered {redelivered} offline messages for tenant {tenant_id}")
            return redelivered
        except Exception as e:
            logger.error(f"Error redelivering offline messages: {e}", exc_info=True)
            return redelivered

    async def _offline_redelivery_loop(self):
        logger.info("Offline redelivery loop started")
        while self._running:
            try:
                await asyncio.sleep(60)
                if not self._running:
                    break

                for tenant_id, conns in list(websocket_manager.active_connections.items()):
                    if not conns:
                        continue

                    try:
                        count = await self.redeliver_offline_messages(tenant_id)
                        if count > 0:
                            logger.info(f"Auto-redelivered {count} messages for tenant {tenant_id}")
                    except Exception as e:
                        logger.error(f"Auto-redelivery error for tenant {tenant_id}: {e}")

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Offline redelivery loop error: {e}", exc_info=True)
                await asyncio.sleep(30)

    async def _update_message_log(self, message_id: str, status: str, error_message: Optional[str] = None):
        if not message_id:
            return

        async with self._db_lock:
            try:
                with self._get_db_session() as db:
                    log = db.query(MessageLog).filter(
                        MessageLog.message_id == message_id
                    ).first()

                    if log:
                        log.status = status
                        now = datetime.now()
                        if status == "sent":
                            log.sent_at = now
                        elif status in ("failed", "expired"):
                            log.failed_at = now
                            if error_message:
                                log.error_message = error_message[:500] if len(error_message) > 500 else error_message
                        elif status == "recalled":
                            log.failed_at = now
                            log.error_message = "Message recalled by sender"
                        db.commit()
            except Exception as e:
                logger.error(f"Error updating message log {message_id}: {e}", exc_info=True)

    def get_queue_stats(self, tenant_id: Optional[str] = None) -> Dict[str, Any]:
        try:
            queue_size = message_queue.size()
            ws_stats = websocket_manager.get_connection_stats()
            bw_stats = bulk_writer.get_stats()

            stats = {
                "total_queue_size": queue_size,
                "active_workers": sum(1 for t in self._worker_tasks if not t.done()),
                "bulk_writer": bw_stats,
                **ws_stats
            }

            if tenant_id:
                stats["tenant_queue_size"] = message_queue.tenant_queue_size(tenant_id)
                stats["tenant_connections"] = websocket_manager.get_tenant_connections_count(tenant_id)

            if queue_size > settings.MESSAGE_QUEUE_MAX_SIZE * 0.8:
                stats["warning"] = "Queue is nearing capacity, consider increasing workers"
                logger.warning(f"Message queue at {queue_size}/{settings.MESSAGE_QUEUE_MAX_SIZE}")

            return stats
        except Exception as e:
            logger.error(f"Error getting queue stats: {e}")
            return {"error": str(e)}


push_service = PushService()
