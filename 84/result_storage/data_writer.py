import asyncio
import zlib
import json
from typing import Optional, List, Dict, Any, TypeVar, Generic, Type, Callable
from datetime import datetime
from queue import Queue
from threading import Thread, Event
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from result_storage.database import DatabaseManager, get_db
from result_storage.repository import (
    TaskResultRepository,
    TemperatureSalinityRepository,
    NodeMetricsRepository,
)
from common.exceptions import DatabaseError, DataValidationError
from common.models import TaskResult, TemperatureSalinity, NodeMetrics, Base

ModelType = TypeVar("ModelType")


class Compression:
    @staticmethod
    def compress(data: bytes, level: int = 6) -> bytes:
        return zlib.compress(data, level)

    @staticmethod
    def decompress(data: bytes) -> bytes:
        return zlib.decompress(data)

    @staticmethod
    def compress_dict(data: Dict[str, Any], level: int = 6) -> bytes:
        json_str = json.dumps(data, default=str)
        return zlib.compress(json_str.encode("utf-8"), level)

    @staticmethod
    def decompress_dict(data: bytes) -> Dict[str, Any]:
        decompressed = zlib.decompress(data).decode("utf-8")
        return json.loads(decompressed)


class BatchWriter:
    def __init__(
        self,
        session: Session,
        batch_size: int = 1000,
        flush_interval: float = 5.0,
        enable_compression: bool = False,
        compression_level: int = 6,
    ) -> None:
        self.session = session
        self.batch_size = batch_size
        self.flush_interval = flush_interval
        self.enable_compression = enable_compression
        self.compression_level = compression_level
        self._batch: List[Base] = []
        self._last_flush: datetime = datetime.utcnow()
        self._total_written: int = 0

    def add(self, instance: Base) -> None:
        if instance is None:
            raise DataValidationError("Instance cannot be None")
        self._batch.append(instance)
        if len(self._batch) >= self.batch_size:
            self.flush()

    def add_many(self, instances: List[Base]) -> None:
        for instance in instances:
            self.add(instance)

    def flush(self) -> int:
        if not self._batch:
            return 0
        try:
            batch_to_write = self._preprocess_batch(self._batch)
            self.session.bulk_save_objects(batch_to_write)
            self.session.flush()
            count = len(self._batch)
            self._total_written += count
            self._batch = []
            self._last_flush = datetime.utcnow()
            return count
        except SQLAlchemyError as e:
            self.session.rollback()
            raise DatabaseError(f"Failed to flush batch: {str(e)}") from e

    def _preprocess_batch(self, batch: List[Base]) -> List[Base]:
        if not self.enable_compression:
            return batch
        for instance in batch:
            self._compress_instance(instance)
        return batch

    def _compress_instance(self, instance: Base) -> None:
        if hasattr(instance, "output_data") and instance.output_data is not None:
            if isinstance(instance.output_data, (dict, list)):
                instance.output_data = Compression.compress_dict(
                    instance.output_data, self.compression_level
                )
        if hasattr(instance, "input_params") and instance.input_params is not None:
            if isinstance(instance.input_params, (dict, list)):
                instance.input_params = Compression.compress_dict(
                    instance.input_params, self.compression_level
                )
        if hasattr(instance, "metadata_") and instance.metadata_ is not None:
            if isinstance(instance.metadata_, (dict, list)):
                instance.metadata_ = Compression.compress_dict(
                    instance.metadata_, self.compression_level
                )
        if hasattr(instance, "tags") and instance.tags is not None:
            if isinstance(instance.tags, (dict, list)):
                instance.tags = Compression.compress_dict(
                    instance.tags, self.compression_level
                )
        if hasattr(instance, "labels") and instance.labels is not None:
            if isinstance(instance.labels, (dict, list)):
                instance.labels = Compression.compress_dict(
                    instance.labels, self.compression_level
                )

    def should_flush(self) -> bool:
        if len(self._batch) >= self.batch_size:
            return True
        elapsed = (datetime.utcnow() - self._last_flush).total_seconds()
        return elapsed >= self.flush_interval

    @property
    def total_written(self) -> int:
        return self._total_written

    @property
    def current_batch_size(self) -> int:
        return len(self._batch)


class DataWriter:
    def __init__(
        self,
        db_manager: Optional[DatabaseManager] = None,
        batch_size: int = 1000,
        flush_interval: float = 5.0,
        enable_compression: bool = False,
        compression_level: int = 6,
    ) -> None:
        self.db_manager = db_manager or get_db()
        self.batch_size = batch_size
        self.flush_interval = flush_interval
        self.enable_compression = enable_compression
        self.compression_level = compression_level
        self._writers: Dict[Type[Base], BatchWriter] = {}

    def _get_writer(self, session: Session, model: Type[Base]) -> BatchWriter:
        if model not in self._writers:
            self._writers[model] = BatchWriter(
                session=session,
                batch_size=self.batch_size,
                flush_interval=self.flush_interval,
                enable_compression=self.enable_compression,
                compression_level=self.compression_level,
            )
        return self._writers[model]

    def write_task_result(self, task_result: TaskResult) -> None:
        with self.db_manager.get_session() as session:
            writer = self._get_writer(session, TaskResult)
            writer.add(task_result)
            writer.flush()

    def write_task_results(self, task_results: List[TaskResult]) -> int:
        if not task_results:
            return 0
        with self.db_manager.get_session() as session:
            writer = self._get_writer(session, TaskResult)
            writer.add_many(task_results)
            return writer.flush()

    def write_temperature_salinity(self, ts: TemperatureSalinity) -> None:
        with self.db_manager.get_session() as session:
            writer = self._get_writer(session, TemperatureSalinity)
            writer.add(ts)
            writer.flush()

    def write_temperature_salinities(self, ts_list: List[TemperatureSalinity]) -> int:
        if not ts_list:
            return 0
        with self.db_manager.get_session() as session:
            writer = self._get_writer(session, TemperatureSalinity)
            writer.add_many(ts_list)
            return writer.flush()

    def write_node_metrics(self, metrics: NodeMetrics) -> None:
        with self.db_manager.get_session() as session:
            writer = self._get_writer(session, NodeMetrics)
            writer.add(metrics)
            writer.flush()

    def write_node_metrics_batch(self, metrics_list: List[NodeMetrics]) -> int:
        if not metrics_list:
            return 0
        with self.db_manager.get_session() as session:
            writer = self._get_writer(session, NodeMetrics)
            writer.add_many(metrics_list)
            return writer.flush()

    def write_mixed(self, instances: List[Base]) -> Dict[Type[Base], int]:
        results: Dict[Type[Base], int] = {}
        grouped: Dict[Type[Base], List[Base]] = {}
        for instance in instances:
            model_type = type(instance)
            if model_type not in grouped:
                grouped[model_type] = []
            grouped[model_type].append(instance)
        with self.db_manager.transaction() as session:
            for model_type, batch in grouped.items():
                writer = self._get_writer(session, model_type)
                writer.add_many(batch)
                results[model_type] = writer.flush()
        return results

    def copy_from_csv(
        self,
        table_name: str,
        file_path: str,
        columns: List[str],
        delimiter: str = ",",
        null_string: str = "",
    ) -> int:
        try:
            with self.db_manager.engine.connect() as conn:
                cursor = conn.connection.cursor()
                with open(file_path, "r", encoding="utf-8") as f:
                    cursor.copy_from(
                        f,
                        table_name,
                        sep=delimiter,
                        columns=columns,
                        null=null_string,
                    )
                conn.commit()
                return cursor.rowcount
        except Exception as e:
            raise DatabaseError(f"Failed to copy from CSV: {str(e)}") from e

    def copy_from_records(
        self,
        table_name: str,
        records: List[Dict[str, Any]],
        columns: List[str],
    ) -> int:
        import io
        try:
            with self.db_manager.engine.connect() as conn:
                cursor = conn.connection.cursor()
                buffer = io.StringIO()
                for record in records:
                    values = [str(record.get(col, "")) for col in columns]
                    buffer.write("\t".join(values) + "\n")
                buffer.seek(0)
                cursor.copy_from(
                    buffer,
                    table_name,
                    sep="\t",
                    columns=columns,
                )
                conn.commit()
                return cursor.rowcount
        except Exception as e:
            raise DatabaseError(f"Failed to copy from records: {str(e)}") from e

    def flush_all(self) -> Dict[Type[Base], int]:
        results: Dict[Type[Base], int] = {}
        for model, writer in self._writers.items():
            results[model] = writer.flush()
        return results


class AsyncDataWriter:
    def __init__(
        self,
        db_manager: Optional[DatabaseManager] = None,
        batch_size: int = 1000,
        flush_interval: float = 5.0,
        max_queue_size: int = 100000,
        enable_compression: bool = False,
        compression_level: int = 6,
        num_workers: int = 2,
    ) -> None:
        self.db_manager = db_manager or get_db()
        self.batch_size = batch_size
        self.flush_interval = flush_interval
        self.max_queue_size = max_queue_size
        self.enable_compression = enable_compression
        self.compression_level = compression_level
        self.num_workers = num_workers
        self._queue: Queue = Queue(maxsize=max_queue_size)
        self._stop_event = Event()
        self._workers: List[Thread] = []
        self._callbacks: List[Callable[[int, int], None]] = []
        self._total_queued: int = 0
        self._total_written: int = 0
        self._total_failed: int = 0
        self._is_running: bool = False

    def start(self) -> None:
        if self._is_running:
            return
        self._stop_event.clear()
        self._is_running = True
        for i in range(self.num_workers):
            worker = Thread(
                target=self._worker_loop,
                name=f"DataWriter-Worker-{i}",
                daemon=True,
            )
            worker.start()
            self._workers.append(worker)

    def stop(self, wait: bool = True) -> None:
        self._stop_event.set()
        if wait:
            for worker in self._workers:
                worker.join(timeout=10.0)
        self._workers = []
        self._is_running = False

    def add_callback(self, callback: Callable[[int, int], None]) -> None:
        self._callbacks.append(callback)

    def _notify_callbacks(self, success: int, failed: int) -> None:
        for callback in self._callbacks:
            try:
                callback(success, failed)
            except Exception:
                pass

    def write(self, instance: Base) -> None:
        if not self._is_running:
            raise DatabaseError("AsyncDataWriter is not running")
        self._queue.put(instance)
        self._total_queued += 1

    def write_many(self, instances: List[Base]) -> None:
        if not self._is_running:
            raise DatabaseError("AsyncDataWriter is not running")
        for instance in instances:
            self._queue.put(instance)
        self._total_queued += len(instances)

    async def write_async(self, instance: Base) -> None:
        await asyncio.to_thread(self.write, instance)

    async def write_many_async(self, instances: List[Base]) -> None:
        await asyncio.to_thread(self.write_many, instances)

    def _worker_loop(self) -> None:
        batch: List[Base] = []
        last_flush = datetime.utcnow()
        while not self._stop_event.is_set():
            try:
                instance = self._queue.get(timeout=0.5)
                batch.append(instance)
                if len(batch) >= self.batch_size:
                    self._flush_batch(batch)
                    batch = []
                    last_flush = datetime.utcnow()
                elif (datetime.utcnow() - last_flush).total_seconds() >= self.flush_interval:
                    if batch:
                        self._flush_batch(batch)
                        batch = []
                        last_flush = datetime.utcnow()
            except Exception:
                if batch:
                    try:
                        self._flush_batch(batch)
                    except Exception:
                        self._total_failed += len(batch)
                    batch = []
                    last_flush = datetime.utcnow()
        if batch:
            try:
                self._flush_batch(batch)
            except Exception:
                self._total_failed += len(batch)

    def _flush_batch(self, batch: List[Base]) -> None:
        grouped: Dict[Type[Base], List[Base]] = {}
        for instance in batch:
            model_type = type(instance)
            if model_type not in grouped:
                grouped[model_type] = []
            grouped[model_type].append(instance)
        try:
            with self.db_manager.transaction() as session:
                for model_type, instances in grouped.items():
                    if self.enable_compression:
                        for instance in instances:
                            self._compress_instance(instance)
                    session.bulk_save_objects(instances)
            self._total_written += len(batch)
            self._notify_callbacks(len(batch), 0)
        except Exception:
            self._total_failed += len(batch)
            self._notify_callbacks(0, len(batch))

    def _compress_instance(self, instance: Base) -> None:
        if hasattr(instance, "output_data") and instance.output_data is not None:
            if isinstance(instance.output_data, (dict, list)):
                instance.output_data = Compression.compress_dict(
                    instance.output_data, self.compression_level
                )
        if hasattr(instance, "input_params") and instance.input_params is not None:
            if isinstance(instance.input_params, (dict, list)):
                instance.input_params = Compression.compress_dict(
                    instance.input_params, self.compression_level
                )
        if hasattr(instance, "metadata_") and instance.metadata_ is not None:
            if isinstance(instance.metadata_, (dict, list)):
                instance.metadata_ = Compression.compress_dict(
                    instance.metadata_, self.compression_level
                )
        if hasattr(instance, "tags") and instance.tags is not None:
            if isinstance(instance.tags, (dict, list)):
                instance.tags = Compression.compress_dict(
                    instance.tags, self.compression_level
                )
        if hasattr(instance, "labels") and instance.labels is not None:
            if isinstance(instance.labels, (dict, list)):
                instance.labels = Compression.compress_dict(
                    instance.labels, self.compression_level
                )

    def wait_until_empty(self, timeout: Optional[float] = None) -> bool:
        start = datetime.utcnow()
        while not self._queue.empty():
            if timeout is not None:
                elapsed = (datetime.utcnow() - start).total_seconds()
                if elapsed >= timeout:
                    return False
            import time
            time.sleep(0.1)
        return True

    @property
    def queue_size(self) -> int:
        return self._queue.qsize()

    @property
    def total_queued(self) -> int:
        return self._total_queued

    @property
    def total_written(self) -> int:
        return self._total_written

    @property
    def total_failed(self) -> int:
        return self._total_failed

    @property
    def is_running(self) -> bool:
        return self._is_running

    def __enter__(self) -> "AsyncDataWriter":
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.stop()
