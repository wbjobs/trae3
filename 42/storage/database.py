from datetime import datetime
from typing import List, Dict, Any, Optional
from contextlib import asynccontextmanager
import threading
import time
from queue import Queue, Empty

from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    DateTime,
    Text,
    JSON,
    BigInteger
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.sql import func

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.logger import get_logger
from core.config import get_config
from protocols.models import ProtocolMessage

logger = get_logger(__name__)
Base = declarative_base()


class MessageRecord(Base):
    __tablename__ = "message_records"

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(String(255), index=True)
    protocol = Column(String(50), index=True)
    message_type = Column(String(50), index=True)
    source = Column(String(255), index=True)
    target = Column(String(255), index=True, nullable=True)
    topic = Column(String(500), index=True, nullable=True)
    payload = Column(JSON)
    raw_data = Column(Text, nullable=True)
    headers = Column(JSON, nullable=True)
    timestamp = Column(DateTime, index=True, default=datetime.now)
    created_at = Column(DateTime, default=datetime.now)


class TrafficLog(Base):
    __tablename__ = "traffic_logs"

    id = Column(Integer, primary_key=True, index=True)
    protocol = Column(String(50), index=True)
    source = Column(String(255), index=True)
    bytes_count = Column(BigInteger, default=0)
    message_count = Column(Integer, default=0)
    timestamp = Column(DateTime, index=True, default=datetime.now)


class BufferedWriter:
    def __init__(
        self,
        storage: 'DataStorage',
        batch_size: int = 100,
        flush_interval: float = 5.0,
        max_queue_size: int = 10000
    ):
        self._storage = storage
        self._batch_size = batch_size
        self._flush_interval = flush_interval
        self._queue: Queue = Queue(maxsize=max_queue_size)
        self._running = False
        self._flush_thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        self._stats = {
            "total_enqueued": 0,
            "total_flushed": 0,
            "total_failed": 0,
            "last_flush_time": None,
            "current_queue_size": 0
        }

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._flush_thread = threading.Thread(target=self._flush_loop, daemon=True)
        self._flush_thread.start()
        logger.info(f"BufferedWriter started (batch_size={self._batch_size}, flush_interval={self._flush_interval}s)")

    def stop(self) -> None:
        self._running = False
        self.flush()
        if self._flush_thread:
            self._flush_thread.join(timeout=10)
        logger.info("BufferedWriter stopped")

    def enqueue_message(self, message: ProtocolMessage) -> bool:
        try:
            record_data = {
                "message_id": message.message_id,
                "protocol": message.protocol.value if hasattr(message.protocol, 'value') else str(message.protocol),
                "message_type": message.message_type.value if hasattr(message.message_type, 'value') else str(message.message_type),
                "source": message.source,
                "target": message.target,
                "topic": message.topic,
                "payload": message.payload,
                "raw_data": message.raw_data,
                "headers": message.headers,
                "timestamp": message.timestamp
            }
            self._queue.put_nowait(record_data)
            with self._lock:
                self._stats["total_enqueued"] += 1
                self._stats["current_queue_size"] = self._queue.qsize()
            return True
        except Exception as e:
            logger.error(f"BufferedWriter enqueue error: {e}")
            with self._lock:
                self._stats["total_failed"] += 1
            return False

    def enqueue_traffic(self, protocol: str, source: str, bytes_count: int, message_count: int = 1) -> bool:
        try:
            traffic_data = {
                "_type": "traffic",
                "protocol": protocol,
                "source": source,
                "bytes_count": bytes_count,
                "message_count": message_count
            }
            self._queue.put_nowait(traffic_data)
            with self._lock:
                self._stats["total_enqueued"] += 1
            return True
        except Exception as e:
            logger.error(f"BufferedWriter enqueue traffic error: {e}")
            return False

    def flush(self) -> int:
        batch = []
        while not self._queue.empty() and len(batch) < self._batch_size:
            try:
                item = self._queue.get_nowait()
                batch.append(item)
            except Empty:
                break

        if not batch:
            return 0

        message_records = []
        traffic_records = []

        for item in batch:
            if item.get("_type") == "traffic":
                traffic_records.append(item)
            else:
                message_records.append(item)

        flushed = 0

        if message_records:
            flushed += self._batch_insert_messages(message_records)

        if traffic_records:
            flushed += self._batch_insert_traffic(traffic_records)

        with self._lock:
            self._stats["total_flushed"] += flushed
            self._stats["last_flush_time"] = datetime.now().isoformat()
            self._stats["current_queue_size"] = self._queue.qsize()

        return flushed

    def _batch_insert_messages(self, records: List[Dict]) -> int:
        session = self._storage.get_session()
        try:
            for record_data in records:
                record = MessageRecord(**{k: v for k, v in record_data.items() if k != "_type"})
                session.add(record)
            session.commit()
            logger.debug(f"Batch inserted {len(records)} message records")
            return len(records)
        except Exception as e:
            session.rollback()
            logger.error(f"Batch insert messages error: {e}")
            for record_data in records:
                try:
                    self._single_insert_message(record_data)
                except Exception:
                    pass
            return 0
        finally:
            session.close()

    def _single_insert_message(self, record_data: Dict) -> bool:
        session = self._storage.get_session()
        try:
            record = MessageRecord(**{k: v for k, v in record_data.items() if k != "_type"})
            session.add(record)
            session.commit()
            return True
        except Exception as e:
            session.rollback()
            with self._lock:
                self._stats["total_failed"] += 1
            return False
        finally:
            session.close()

    def _batch_insert_traffic(self, records: List[Dict]) -> int:
        session = self._storage.get_session()
        try:
            for record_data in records:
                clean_data = {k: v for k, v in record_data.items() if k != "_type"}
                log = TrafficLog(**clean_data)
                session.add(log)
            session.commit()
            return len(records)
        except Exception as e:
            session.rollback()
            logger.error(f"Batch insert traffic error: {e}")
            return 0
        finally:
            session.close()

    def _flush_loop(self) -> None:
        while self._running:
            try:
                time.sleep(self._flush_interval)
                if not self._queue.empty():
                    self.flush()
            except Exception as e:
                logger.error(f"Flush loop error: {e}")

    def get_stats(self) -> Dict[str, Any]:
        with self._lock:
            return dict(self._stats)


class DataStorage:
    def __init__(self, use_buffered_writer: bool = True, batch_size: int = 100, flush_interval: float = 5.0):
        self.config = get_config()
        self._engine = None
        self._SessionLocal = None
        self._buffered_writer: Optional[BufferedWriter] = None
        self._use_buffered = use_buffered_writer
        self._initialize()
        if self._use_buffered:
            self._buffered_writer = BufferedWriter(
                storage=self,
                batch_size=batch_size,
                flush_interval=flush_interval
            )
            self._buffered_writer.start()

    def _initialize(self) -> None:
        try:
            self._engine = create_engine(
                self.config.database.url,
                echo=self.config.database.echo,
                connect_args={"check_same_thread": False}
                if "sqlite" in self.config.database.url else {},
                pool_size=10,
                max_overflow=20,
                pool_pre_ping=True,
                pool_recycle=3600
            )
            self._SessionLocal = sessionmaker(
                autocommit=False,
                autoflush=False,
                bind=self._engine
            )
            Base.metadata.create_all(bind=self._engine)
            logger.info("Database initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")
            raise

    def get_session(self) -> Session:
        return self._SessionLocal()

    @asynccontextmanager
    async def get_session_async(self):
        session = self._SessionLocal()
        try:
            yield session
        finally:
            session.close()

    def save_message(self, message: ProtocolMessage) -> bool:
        if self._buffered_writer:
            return self._buffered_writer.enqueue_message(message)
        return self._save_message_direct(message)

    def _save_message_direct(self, message: ProtocolMessage) -> bool:
        try:
            session = self.get_session()
            record = MessageRecord(
                message_id=message.message_id,
                protocol=message.protocol.value if hasattr(message.protocol, 'value') else str(message.protocol),
                message_type=message.message_type.value if hasattr(message.message_type, 'value') else str(message.message_type),
                source=message.source,
                target=message.target,
                topic=message.topic,
                payload=message.payload,
                raw_data=message.raw_data,
                headers=message.headers,
                timestamp=message.timestamp
            )
            session.add(record)
            session.commit()
            session.close()
            return True
        except Exception as e:
            logger.error(f"Failed to save message: {e}")
            return False

    def save_messages_batch(self, messages: List[ProtocolMessage]) -> int:
        session = self.get_session()
        try:
            for message in messages:
                record = MessageRecord(
                    message_id=message.message_id,
                    protocol=message.protocol.value if hasattr(message.protocol, 'value') else str(message.protocol),
                    message_type=message.message_type.value if hasattr(message.message_type, 'value') else str(message.message_type),
                    source=message.source,
                    target=message.target,
                    topic=message.topic,
                    payload=message.payload,
                    raw_data=message.raw_data,
                    headers=message.headers,
                    timestamp=message.timestamp
                )
                session.add(record)
            session.commit()
            logger.info(f"Batch saved {len(messages)} messages")
            return len(messages)
        except Exception as e:
            session.rollback()
            logger.error(f"Batch save messages error: {e}")
            return 0
        finally:
            session.close()

    def get_messages(
        self,
        protocol: Optional[str] = None,
        source: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        try:
            session = self.get_session()
            query = session.query(MessageRecord)

            if protocol:
                query = query.filter(MessageRecord.protocol == protocol)
            if source:
                query = query.filter(MessageRecord.source == source)
            if start_time:
                query = query.filter(MessageRecord.timestamp >= start_time)
            if end_time:
                query = query.filter(MessageRecord.timestamp <= end_time)

            records = query.order_by(MessageRecord.timestamp.desc())\
                .offset(offset).limit(limit).all()

            result = []
            for record in records:
                result.append({
                    "id": record.id,
                    "message_id": record.message_id,
                    "protocol": record.protocol,
                    "message_type": record.message_type,
                    "source": record.source,
                    "target": record.target,
                    "topic": record.topic,
                    "payload": record.payload,
                    "headers": record.headers,
                    "timestamp": record.timestamp.isoformat() if record.timestamp else None
                })

            session.close()
            return result
        except Exception as e:
            logger.error(f"Failed to get messages: {e}")
            return []

    def get_message_count(
        self,
        protocol: Optional[str] = None,
        source: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None
    ) -> int:
        try:
            session = self.get_session()
            query = session.query(func.count(MessageRecord.id))

            if protocol:
                query = query.filter(MessageRecord.protocol == protocol)
            if source:
                query = query.filter(MessageRecord.source == source)
            if start_time:
                query = query.filter(MessageRecord.timestamp >= start_time)
            if end_time:
                query = query.filter(MessageRecord.timestamp <= end_time)

            count = query.scalar()
            session.close()
            return count or 0
        except Exception as e:
            logger.error(f"Failed to get message count: {e}")
            return 0

    def record_traffic(
        self,
        protocol: str,
        source: str,
        bytes_count: int,
        message_count: int = 1
    ) -> bool:
        if self._buffered_writer:
            return self._buffered_writer.enqueue_traffic(protocol, source, bytes_count, message_count)
        return self._record_traffic_direct(protocol, source, bytes_count, message_count)

    def _record_traffic_direct(
        self,
        protocol: str,
        source: str,
        bytes_count: int,
        message_count: int = 1
    ) -> bool:
        try:
            session = self.get_session()
            log = TrafficLog(
                protocol=protocol,
                source=source,
                bytes_count=bytes_count,
                message_count=message_count
            )
            session.add(log)
            session.commit()
            session.close()
            return True
        except Exception as e:
            logger.error(f"Failed to record traffic: {e}")
            return False

    def get_traffic_summary(
        self,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None
    ) -> Dict[str, Any]:
        try:
            session = self.get_session()
            query = session.query(
                TrafficLog.protocol,
                func.sum(TrafficLog.bytes_count).label('total_bytes'),
                func.sum(TrafficLog.message_count).label('total_messages')
            )

            if start_time:
                query = query.filter(TrafficLog.timestamp >= start_time)
            if end_time:
                query = query.filter(TrafficLog.timestamp <= end_time)

            results = query.group_by(TrafficLog.protocol).all()

            summary = {
                "total_bytes": 0,
                "total_messages": 0,
                "by_protocol": {}
            }

            for protocol, total_bytes, total_messages in results:
                summary["by_protocol"][protocol] = {
                    "total_bytes": total_bytes or 0,
                    "total_messages": total_messages or 0
                }
                summary["total_bytes"] += total_bytes or 0
                summary["total_messages"] += total_messages or 0

            session.close()
            return summary
        except Exception as e:
            logger.error(f"Failed to get traffic summary: {e}")
            return {"total_bytes": 0, "total_messages": 0, "by_protocol": {}}

    def get_writer_stats(self) -> Dict[str, Any]:
        if self._buffered_writer:
            return self._buffered_writer.get_stats()
        return {"mode": "direct", "buffered": False}

    def flush(self) -> int:
        if self._buffered_writer:
            return self._buffered_writer.flush()
        return 0

    def close(self) -> None:
        if self._buffered_writer:
            self._buffered_writer.stop()
        if self._engine:
            self._engine.dispose()
            logger.info("Database connection closed")
