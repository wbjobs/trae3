import json
import time
import os
import uuid
import threading
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Optional, Callable, Iterator
from datetime import datetime
from enum import Enum
from pathlib import Path

from ..common import get_logger
from ..msg_cluster import KafkaClient, RedisClient


class ReplayStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class ReplayProgress:
    task_id: str
    total_messages: int = 0
    processed_messages: int = 0
    replayed_messages: int = 0
    failed_messages: int = 0
    skipped_messages: int = 0
    current_index: int = 0
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    last_updated: Optional[datetime] = None
    status: ReplayStatus = ReplayStatus.PENDING
    errors: List[str] = field(default_factory=list)

    @property
    def percentage(self) -> float:
        if self.total_messages == 0:
            return 0.0
        return (self.processed_messages / self.total_messages) * 100

    @property
    def elapsed_seconds(self) -> float:
        if not self.start_time:
            return 0.0
        end = self.end_time or datetime.now()
        return (end - self.start_time).total_seconds()

    @property
    def messages_per_second(self) -> float:
        elapsed = self.elapsed_seconds
        if elapsed == 0:
            return 0.0
        return self.processed_messages / elapsed

    @property
    def estimated_remaining_seconds(self) -> Optional[float]:
        mps = self.messages_per_second
        if mps == 0:
            return None
        remaining = self.total_messages - self.processed_messages
        return remaining / mps

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "total_messages": self.total_messages,
            "processed_messages": self.processed_messages,
            "replayed_messages": self.replayed_messages,
            "failed_messages": self.failed_messages,
            "skipped_messages": self.skipped_messages,
            "current_index": self.current_index,
            "percentage": round(self.percentage, 2),
            "messages_per_second": round(self.messages_per_second, 2),
            "elapsed_seconds": round(self.elapsed_seconds, 2),
            "estimated_remaining_seconds": round(self.estimated_remaining_seconds, 2) if self.estimated_remaining_seconds else None,
            "status": self.status.value,
            "errors": self.errors[-10:],
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "last_updated": self.last_updated.isoformat() if self.last_updated else None,
        }


@dataclass
class ReplayConfig:
    source_topic: str
    target_topic: str
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    max_messages: int = 0
    speed_factor: float = 1.0
    filter_expression: Optional[str] = None
    transform_script: Optional[str] = None
    dry_run: bool = False
    output_file: Optional[str] = None
    batch_size: int = 100
    checkpoint_interval: int = 1000
    resume: bool = False
    checkpoint_path: Optional[str] = None


@dataclass
class ReplayResult:
    task_id: str
    total_messages: int = 0
    replayed_messages: int = 0
    skipped_messages: int = 0
    failed_messages: int = 0
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "total_messages": self.total_messages,
            "replayed_messages": self.replayed_messages,
            "skipped_messages": self.skipped_messages,
            "failed_messages": self.failed_messages,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "duration_seconds": (self.end_time - self.start_time).total_seconds()
                if self.start_time and self.end_time else None,
            "errors": self.errors,
        }


class BatchReplayManager:
    def __init__(self, checkpoint_dir: str = "./checkpoints"):
        self.logger = get_logger("BatchReplayManager")
        self.checkpoint_dir = Path(checkpoint_dir)
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)
        self._tasks: Dict[str, ReplayProgress] = {}
        self._lock = threading.Lock()

    def create_task(self, total_messages: int, checkpoint_path: Optional[str] = None) -> str:
        task_id = str(uuid.uuid4())[:8]
        progress = ReplayProgress(
            task_id=task_id,
            total_messages=total_messages,
            start_time=datetime.now(),
            status=ReplayStatus.PENDING,
        )
        
        if not checkpoint_path:
            checkpoint_path = str(self.checkpoint_dir / f"replay_{task_id}.json")
        progress.task_id = task_id
        
        with self._lock:
            self._tasks[task_id] = progress
        
        self.logger.info(f"Created replay task: {task_id}")
        return task_id

    def load_checkpoint(self, task_id: str) -> Optional[ReplayProgress]:
        checkpoint_file = self.checkpoint_dir / f"replay_{task_id}.json"
        if checkpoint_file.exists():
            try:
                with open(checkpoint_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    progress = ReplayProgress(
                        task_id=task_id,
                        total_messages=data.get("total_messages", 0),
                        processed_messages=data.get("processed_messages", 0),
                        replayed_messages=data.get("replayed_messages", 0),
                        failed_messages=data.get("failed_messages", 0),
                        skipped_messages=data.get("skipped_messages", 0),
                        current_index=data.get("current_index", 0),
                        status=ReplayStatus(data.get("status", "pending")),
                        errors=data.get("errors", []),
                    )
                    self._tasks[task_id] = progress
                    self.logger.info(f"Loaded checkpoint for task {task_id}: {progress.current_index} messages processed")
                    return progress
            except Exception as e:
                self.logger.warning(f"Failed to load checkpoint: {e}")
        return None

    def save_checkpoint(self, task_id: str):
        with self._lock:
            if task_id not in self._tasks:
                return
            progress = self._tasks[task_id]
            progress.last_updated = datetime.now()

        checkpoint_file = self.checkpoint_dir / f"replay_{task_id}.json"
        try:
            temp_file = str(checkpoint_file) + ".tmp"
            with open(temp_file, 'w', encoding='utf-8') as f:
                json.dump(progress.to_dict(), f, indent=2)
            os.replace(temp_file, checkpoint_file)
        except Exception as e:
            self.logger.warning(f"Failed to save checkpoint: {e}")

    def update_progress(self, task_id: str, processed: int = 0, replayed: int = 0, 
                       failed: int = 0, skipped: int = 0, error: Optional[str] = None):
        with self._lock:
            if task_id not in self._tasks:
                return
            progress = self._tasks[task_id]
            progress.processed_messages += processed
            progress.replayed_messages += replayed
            progress.failed_messages += failed
            progress.skipped_messages += skipped
            progress.current_index += processed
            if error:
                progress.errors.append(error)

    def set_status(self, task_id: str, status: ReplayStatus):
        with self._lock:
            if task_id not in self._tasks:
                return
            self._tasks[task_id].status = status
            if status in [ReplayStatus.COMPLETED, ReplayStatus.FAILED, ReplayStatus.CANCELLED]:
                self._tasks[task_id].end_time = datetime.now()

    def get_progress(self, task_id: str) -> Optional[ReplayProgress]:
        with self._lock:
            return self._tasks.get(task_id)

    def list_tasks(self) -> List[Dict[str, Any]]:
        with self._lock:
            return [p.to_dict() for p in self._tasks.values()]

    def cleanup_old_checkpoints(self, days: int = 7):
        cutoff = time.time() - (days * 86400)
        for checkpoint_file in self.checkpoint_dir.glob("replay_*.json"):
            if checkpoint_file.stat().st_mtime < cutoff:
                try:
                    checkpoint_file.unlink()
                    self.logger.info(f"Deleted old checkpoint: {checkpoint_file}")
                except Exception as e:
                    self.logger.warning(f"Failed to delete checkpoint: {e}")


class MessageReplayer:
    def __init__(self, checkpoint_dir: str = "./checkpoints"):
        self.logger = get_logger("MessageReplayer")
        self.kafka_client = KafkaClient()
        self.redis_client = RedisClient()
        self._collected_messages: List[Dict[str, Any]] = []
        self.batch_manager = BatchReplayManager(checkpoint_dir)
        self._pause_event = threading.Event()
        self._cancel_event = threading.Event()

    def collect_messages(self, source_topic: str, max_messages: int = 1000,
                         timeout_ms: int = 60000, seek_to_beginning: bool = True,
                         progress_callback: Optional[Callable[[int, int], None]] = None) -> List[Dict[str, Any]]:
        self.logger.info(f"Collecting messages from {source_topic} (max: {max_messages})")
        messages: List[Dict[str, Any]] = []
        failed_count = 0

        def callback(message: Dict[str, Any], metadata: Dict[str, Any]):
            try:
                messages.append({
                    "data": message,
                    "metadata": metadata,
                    "collected_at": datetime.now().isoformat(),
                })
                if len(messages) % 100 == 0:
                    self.logger.info(f"Collected {len(messages)} messages...")
                    if progress_callback:
                        progress_callback(len(messages), max_messages)
            except Exception as e:
                nonlocal failed_count
                failed_count += 1
                self.logger.warning(f"Failed to collect message: {e}")

        if seek_to_beginning:
            self.kafka_client.seek_to_beginning(source_topic)

        actual_count = self.kafka_client.consume_messages(
            source_topic,
            callback,
            max_messages=max_messages,
            timeout_ms=timeout_ms,
            include_metadata=True,
        )

        self._collected_messages = messages
        
        if failed_count > 0:
            self.logger.warning(f"Collected {len(messages)} messages, {failed_count} failed")
        else:
            self.logger.info(f"Collected {len(messages)} messages from {source_topic}")
        
        return messages

    def load_messages_from_file(self, file_path: str, batch_size: int = 10000) -> Iterator[Dict[str, Any]]:
        self.logger.info(f"Loading messages from file: {file_path}")
        
        failed_lines = 0
        line_num = 0
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                if file_path.endswith('.json'):
                    try:
                        content = f.read()
                        if not content.strip():
                            self.logger.warning(f"File {file_path} is empty")
                            return
                        messages = json.loads(content)
                        for msg in messages:
                            yield msg
                        self.logger.info(f"Loaded {len(messages)} messages from JSON file")
                        return
                    except json.JSONDecodeError:
                        self.logger.info("Falling back to line-by-line parsing...")
                        f.seek(0)
                
                for line in f:
                    line_num += 1
                    if not line.strip():
                        continue
                    try:
                        yield json.loads(line)
                    except json.JSONDecodeError:
                        failed_lines += 1
                        if failed_lines % 100 == 0:
                            self.logger.warning(f"Failed to parse {failed_lines} lines...")
                
            if failed_lines > 0:
                self.logger.warning(f"Loaded with {failed_lines} failed lines")
            
        except FileNotFoundError:
            self.logger.error(f"File not found: {file_path}")
            raise

    def save_messages_to_file(self, messages: List[Dict[str, Any]], file_path: str):
        self.logger.info(f"Saving {len(messages)} messages to {file_path}")
        
        temp_path = f"{file_path}.tmp"
        
        try:
            with open(temp_path, 'w', encoding='utf-8') as f:
                if file_path.endswith('.json'):
                    json.dump(messages, f, indent=2, ensure_ascii=False)
                else:
                    for msg in messages:
                        f.write(json.dumps(msg, ensure_ascii=False) + '\n')
            
            if os.path.exists(file_path):
                os.replace(temp_path, file_path)
            else:
                os.rename(temp_path, file_path)
            
            self.logger.info(f"Messages saved to {file_path}")
        except Exception as e:
            self.logger.error(f"Failed to save messages to file: {e}")
            if os.path.exists(temp_path):
                os.remove(temp_path)
            raise

    def filter_messages(self, messages: List[Dict[str, Any]], 
                        filter_func: Optional[Callable[[Dict[str, Any]], bool]] = None) -> List[Dict[str, Any]]:
        if not filter_func:
            return messages
        
        self.logger.info("Filtering messages...")
        filtered = [msg for msg in messages if filter_func(msg)]
        self.logger.info(f"Filtered to {len(filtered)} messages (from {len(messages)})")
        return filtered

    def transform_messages(self, messages: List[Dict[str, Any]],
                           transform_func: Optional[Callable[[Dict[str, Any]], Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
        if not transform_func:
            return messages
        
        self.logger.info("Transforming messages...")
        transformed = []
        for msg in messages:
            try:
                transformed.append(transform_func(msg))
            except Exception as e:
                self.logger.warning(f"Transform error: {e}")
                transformed.append(msg)
        
        return transformed

    def _apply_filter_expression(self, messages: List[Dict[str, Any]], 
                                  expression: str) -> List[Dict[str, Any]]:
        self.logger.info(f"Applying filter expression: {expression}")
        
        try:
            def filter_func(msg):
                data = msg.get("data", msg) if isinstance(msg, dict) else msg
                return eval(expression, {"msg": data, "json": json})
            
            return self.filter_messages(messages, filter_func)
        except Exception as e:
            self.logger.error(f"Filter expression error: {e}")
            return messages

    def _apply_transform_script(self, messages: List[Dict[str, Any]],
                                 script_path: str) -> List[Dict[str, Any]]:
        self.logger.info(f"Applying transform script: {script_path}")
        
        try:
            with open(script_path, 'r', encoding='utf-8') as f:
                script_code = f.read()
            
            namespace = {}
            exec(script_code, namespace)
            transform_func = namespace.get("transform")
            
            if not callable(transform_func):
                self.logger.warning("No 'transform' function found in script")
                return messages
            
            return self.transform_messages(messages, transform_func)
        except Exception as e:
            self.logger.error(f"Transform script error: {e}")
            return messages

    def replay(self, config: ReplayConfig, 
               progress_callback: Optional[Callable[[ReplayProgress], None]] = None) -> ReplayResult:
        start_index = 0
        
        if config.resume and config.checkpoint_path:
            task_id = os.path.basename(config.checkpoint_path).replace("replay_", "").replace(".json", "")
            checkpoint = self.batch_manager.load_checkpoint(task_id)
            if checkpoint:
                start_index = checkpoint.current_index
                self.logger.info(f"Resuming replay from message {start_index}")

        if not self._collected_messages and config.source_topic != "file":
            self.collect_messages(
                config.source_topic,
                max_messages=config.max_messages,
            )

        messages = self._collected_messages
        total_messages = len(messages)

        task_id = self.batch_manager.create_task(total_messages)
        result = ReplayResult(task_id=task_id, start_time=datetime.now(), total_messages=total_messages)
        self.batch_manager.set_status(task_id, ReplayStatus.RUNNING)

        self.logger.info(f"Starting replay task {task_id}: {config.source_topic} -> {config.target_topic}")

        if config.filter_expression:
            messages = self._apply_filter_expression(messages, config.filter_expression)

        if config.transform_script:
            messages = self._apply_transform_script(messages, config.transform_script)

        for i in range(start_index, len(messages)):
            if self._cancel_event.is_set():
                self.batch_manager.set_status(task_id, ReplayStatus.CANCELLED)
                break

            while self._pause_event.is_set():
                self.batch_manager.set_status(task_id, ReplayStatus.PAUSED)
                time.sleep(0.1)
            
            if self.batch_manager.get_progress(task_id):
                self.batch_manager.set_status(task_id, ReplayStatus.RUNNING)

            msg = messages[i]
            try:
                msg_data = msg.get("data", msg) if isinstance(msg, dict) else msg
                
                if not isinstance(msg_data, dict):
                    msg_data = {"value": msg_data}
                
                if config.dry_run:
                    result.replayed_messages += 1
                else:
                    success = self.kafka_client.send_message(config.target_topic, msg_data)
                    if success:
                        result.replayed_messages += 1
                    else:
                        result.failed_messages += 1
                        error_msg = f"Message {i}: Send failed after retries"
                        result.errors.append(error_msg)
                        self.batch_manager.update_progress(task_id, processed=1, failed=1, error=error_msg)
                        continue

                if config.speed_factor > 0 and not config.dry_run:
                    time.sleep(1.0 / config.speed_factor)

                self.batch_manager.update_progress(task_id, processed=1, replayed=1)

                if (i + 1) % config.checkpoint_interval == 0:
                    self.batch_manager.save_checkpoint(task_id)

                if progress_callback:
                    progress = self.batch_manager.get_progress(task_id)
                    if progress:
                        progress_callback(progress)

                if (i + 1) % 1000 == 0:
                    self.logger.info(f"Replayed {i+1}/{len(messages)} messages ({(i+1)/len(messages)*100:.1f}%)")

            except Exception as e:
                result.failed_messages += 1
                error_msg = f"Message {i}: {str(e)}"
                result.errors.append(error_msg)
                self.batch_manager.update_progress(task_id, processed=1, failed=1, error=error_msg)

        result.end_time = datetime.now()
        self.batch_manager.set_status(task_id, ReplayStatus.COMPLETED)
        self.batch_manager.save_checkpoint(task_id)

        duration = (result.end_time - result.start_time).total_seconds()
        
        self.logger.info(
            f"Replay task {task_id} complete: {result.replayed_messages} replayed, "
            f"{result.skipped_messages} skipped, {result.failed_messages} failed, "
            f"duration: {duration:.2f}s"
        )

        return result

    def pause(self, task_id: str):
        self._pause_event.set()
        self.logger.info(f"Paused replay task: {task_id}")

    def resume(self, task_id: str):
        self._pause_event.clear()
        self.logger.info(f"Resumed replay task: {task_id}")

    def cancel(self, task_id: str):
        self._cancel_event.set()
        self.logger.info(f"Cancelled replay task: {task_id}")

    def replay_from_redis_list(self, list_key: str, target_topic: str,
                                max_messages: int = 0, speed_factor: float = 1.0) -> ReplayResult:
        task_id = self.batch_manager.create_task(0)
        result = ReplayResult(task_id=task_id, start_time=datetime.now())
        
        self.logger.info(f"Replaying from Redis list {list_key} to {target_topic}")
        
        total_count = self.redis_client.llen(list_key)
        result.total_messages = min(total_count, max_messages) if max_messages > 0 else total_count
        self.batch_manager._tasks[task_id].total_messages = result.total_messages
        self.batch_manager.set_status(task_id, ReplayStatus.RUNNING)
        
        count = 0
        while True:
            if max_messages > 0 and count >= max_messages:
                break
            
            msg = self.redis_client.rpop(list_key)
            if msg is None:
                break
            
            try:
                self.kafka_client.send_message(target_topic, msg)
                result.replayed_messages += 1
                self.batch_manager.update_progress(task_id, processed=1, replayed=1)
                count += 1
                
                if speed_factor > 0:
                    time.sleep(1.0 / speed_factor)
                    
            except Exception as e:
                result.failed_messages += 1
                result.errors.append(str(e))
                self.batch_manager.update_progress(task_id, processed=1, failed=1, error=str(e))
        
        result.end_time = datetime.now()
        self.batch_manager.set_status(task_id, ReplayStatus.COMPLETED)
        self.logger.info(f"Redis replay complete: {result.replayed_messages} messages")
        return result

    def replay_from_file(self, file_path: str, target_topic: str,
                         config: Optional[ReplayConfig] = None) -> ReplayResult:
        if config is None:
            config = ReplayConfig(
                source_topic="file",
                target_topic=target_topic,
            )
        
        config.source_topic = file_path
        config.target_topic = target_topic
        
        self._collected_messages = list(self.load_messages_from_file(file_path))
        
        return self.replay(config)

    def compare_topics(self, topic_a: str, topic_b: str, 
                       max_messages: int = 1000) -> Dict[str, Any]:
        self.logger.info(f"Comparing topics: {topic_a} vs {topic_b}")
        
        messages_a = self.collect_messages(topic_a, max_messages)
        messages_b = self.collect_messages(topic_b, max_messages)
        
        return {
            "topic_a_count": len(messages_a),
            "topic_b_count": len(messages_b),
            "difference": abs(len(messages_a) - len(messages_b)),
            "topics_match": len(messages_a) == len(messages_b),
        }

    def get_progress(self, task_id: str) -> Optional[Dict[str, Any]]:
        progress = self.batch_manager.get_progress(task_id)
        return progress.to_dict() if progress else None

    def list_tasks(self) -> List[Dict[str, Any]]:
        return self.batch_manager.list_tasks()

    def close(self):
        self.kafka_client.close()
        self.redis_client.close()
