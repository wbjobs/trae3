import uuid
import time
from typing import Optional, List, Callable, Tuple
from cache_toolkit.core.cache_client import CacheClient, CacheClientError
from cache_toolkit.models.node import MigrationTask
from cache_toolkit.utils.logger import get_logger
from cache_toolkit.utils.progress import ProgressTracker

logger = get_logger()


class MigrationError(Exception):
    pass


class Migrator:
    def __init__(
        self,
        client: CacheClient,
        batch_size: int = 500,
        preserve_ttl: bool = True,
        verify_after_migrate: bool = True,
        max_retry: int = 3,
        retry_delay: float = 1.0,
    ):
        self._client = client
        self._batch_size = batch_size
        self._preserve_ttl = preserve_ttl
        self._verify_after_migrate = verify_after_migrate
        self._max_retry = max_retry
        self._retry_delay = retry_delay
        self._tasks: dict = {}
        self._on_progress: Optional[Callable] = None
        self._failed_keys: List[Tuple[str, str]] = []

    @property
    def failed_keys_details(self) -> List[Tuple[str, str]]:
        return list(self._failed_keys)

    def set_progress_callback(self, callback: Callable):
        self._on_progress = callback

    def create_task(self, source_node: str, target_node: str, keys_pattern: str = "*") -> MigrationTask:
        task_id = str(uuid.uuid4())[:8]
        task = MigrationTask(
            task_id=task_id,
            source_node=source_node,
            target_node=target_node,
            keys_pattern=keys_pattern,
        )
        self._tasks[task_id] = task
        return task

    def get_task(self, task_id: str) -> Optional[MigrationTask]:
        return self._tasks.get(task_id)

    def list_tasks(self) -> List[MigrationTask]:
        return list(self._tasks.values())

    def execute_migration(self, task: MigrationTask) -> MigrationTask:
        logger.info(f"Starting migration task {task.task_id}: {task.source_node} -> {task.target_node}")
        task.status = "running"
        start_time = time.time()
        self._failed_keys = []

        try:
            source_keys = self._client.scan_keys(pattern=task.keys_pattern, node_id=task.source_node)
            task.total_keys = len(source_keys)
            logger.info(f"Found {task.total_keys} keys to migrate")

            if task.total_keys == 0:
                task.status = "completed"
                logger.info("No keys to migrate")
                return task

            for i in range(0, len(source_keys), self._batch_size):
                batch = source_keys[i : i + self._batch_size]
                self._migrate_batch(task, batch)
                elapsed = time.time() - start_time
                logger.info(
                    f"Task {task.task_id}: {task.migrated_keys}/{task.total_keys} "
                    f"({task.progress:.1%}) elapsed={elapsed:.1f}s"
                )
                if self._on_progress:
                    self._on_progress(task)

            if self._verify_after_migrate and self._failed_keys:
                logger.info(f"Retrying {len(self._failed_keys)} failed keys...")
                self._retry_failed_keys(task)

            task.failed_keys = len(self._failed_keys)
            task.status = "completed" if task.failed_keys == 0 else "completed_with_errors"
            logger.info(
                f"Migration {task.task_id} finished: {task.migrated_keys} migrated, "
                f"{task.failed_keys} failed, elapsed={time.time() - start_time:.1f}s"
            )

        except Exception as e:
            task.status = "failed"
            task.error_message = str(e)
            logger.error(f"Migration {task.task_id} failed: {e}")

        return task

    def _migrate_batch(self, task: MigrationTask, keys: list):
        for key in keys:
            success, error = self._migrate_single_key_with_retry(task, key)
            if success:
                task.migrated_keys += 1
            else:
                self._failed_keys.append((key, error or "unknown error"))

    def _migrate_single_key_with_retry(self, task: MigrationTask, key: str) -> Tuple[bool, Optional[str]]:
        last_error = None
        for attempt in range(self._max_retry):
            try:
                self._migrate_single_key(task, key)

                if self._verify_after_migrate:
                    target = self._client._get_node_client(task.target_node)
                    if not target.exists(key):
                        raise MigrationError("Key not found on target after migration")

                return True, None
            except Exception as e:
                last_error = str(e)
                logger.warning(
                    f"Failed to migrate key {key} (attempt {attempt + 1}/{self._max_retry}): {e}"
                )
                if attempt < self._max_retry - 1:
                    time.sleep(self._retry_delay)

        return False, last_error

    def _migrate_single_key(self, task: MigrationTask, key: str):
        source = self._client._get_node_client(task.source_node)
        target = self._client._get_node_client(task.target_node)

        if not source.exists(key):
            raise MigrationError("Key no longer exists on source")

        key_type = source.type(key)
        ttl = source.ttl(key) if self._preserve_ttl else None

        if key_type == "string":
            value = source.get(key)
            if value is None:
                if source.exists(key):
                    target.delete(key)
                return
            target.set(key, value)

        elif key_type == "list":
            values = source.lrange(key, 0, -1)
            target.delete(key)
            if values:
                target.rpush(key, *values)

        elif key_type == "set":
            members = source.smembers(key)
            target.delete(key)
            if members:
                target.sadd(key, *members)

        elif key_type == "zset":
            members = source.zrange(key, 0, -1, withscores=True)
            target.delete(key)
            if members:
                mapping = {member: score for member, score in members}
                target.zadd(key, mapping)

        elif key_type == "hash":
            fields = source.hgetall(key)
            target.delete(key)
            if fields:
                target.hset(key, mapping=fields)

        elif key_type == "stream":
            raise MigrationError(f"Stream type not supported for key: {key}")

        elif key_type == "none":
            target.delete(key)
            return

        else:
            raise MigrationError(f"Unsupported key type: {key_type}")

        if ttl and ttl > 0:
            target.expire(key, ttl)
        elif ttl == -1:
            target.persist(key)

    def _retry_failed_keys(self, task: MigrationTask):
        remaining = []
        for key, error in self._failed_keys:
            success, new_error = self._migrate_single_key_with_retry(task, key)
            if success:
                task.migrated_keys += 1
            else:
                remaining.append((key, new_error or error))
        self._failed_keys = remaining

    def migrate_keys_list(self, keys: List[str], target_node: str, source_node: Optional[str] = None) -> dict:
        task = self.create_task(
            source_node=source_node or "auto",
            target_node=target_node,
            keys_pattern="custom_list",
        )
        task.total_keys = len(keys)
        task.status = "running"
        self._failed_keys = []

        for key in keys:
            try:
                if source_node:
                    success, error = self._migrate_single_key_with_retry(task, key)
                    if success:
                        task.migrated_keys += 1
                    else:
                        self._failed_keys.append((key, error or "unknown error"))
                else:
                    info = self._client.get_key_info(key)
                    value = self._client.get_key_value(key, info["type"])
                    ttl = self._client._get_client().ttl(key) if self._preserve_ttl else None
                    if value is not None:
                        self._client.set_key(key, value, ttl)
                    task.migrated_keys += 1
            except Exception as e:
                self._failed_keys.append((key, str(e)))

        task.failed_keys = len(self._failed_keys)
        task.status = "completed" if task.failed_keys == 0 else "completed_with_errors"
        return task.to_dict()

    def dry_run(self, source_node: str, keys_pattern: str = "*") -> dict:
        keys = self._client.scan_keys(pattern=keys_pattern, node_id=source_node)
        return {
            "source_node": source_node,
            "pattern": keys_pattern,
            "total_keys": len(keys),
            "sample_keys": keys[:20],
        }
