import threading
import time
from datetime import datetime
from typing import Callable

from core.sync.conflict import ConflictInfo, ConflictResolver, ConflictStrategy
from core.sync.queue import SyncItem, SyncOperation, SyncQueue
from utils.config import ConfigManager
from utils.logger import setup_logger
from utils.platform import is_macos
from exceptions import (
    SyncAuthenticationError,
    SyncConflictError,
    SyncError,
    SyncNetworkError,
)


class CloudSyncService:
    def __init__(self) -> None:
        config = ConfigManager.get()
        self._logger = setup_logger("sync.cloud", config.logging.level, config.logging.file)
        self._sync_config = config.sync
        self._queue = SyncQueue()
        self._resolver = ConflictResolver(
            ConflictStrategy(config.sync.conflict_strategy)
        )
        self._running = False
        self._thread: threading.Thread | None = None
        self._lock = threading.RLock()
        self._auth_token: str | None = None
        self._on_sync_complete_callbacks: list[Callable] = []
        self._on_conflict_callbacks: list[Callable[[ConflictInfo], None]] = []
        self._on_sync_fail_callbacks: list[Callable[[SyncItem, Exception], None]] = []
        self._last_activity_time: float = 0.0
        self._heartbeat_interval = 30
        self._consecutive_errors = 0
        self._max_consecutive_errors = 10
        self._error_cooldown = 60

    @property
    def is_running(self) -> bool:
        return self._running

    @property
    def queue_size(self) -> int:
        return self._queue.size()

    @property
    def last_activity_time(self) -> float:
        return self._last_activity_time

    def authenticate(self, token: str) -> None:
        with self._lock:
            self._auth_token = token
            self._consecutive_errors = 0
        self._logger.info("云端同步认证成功")

    def start(self) -> None:
        with self._lock:
            if self._running:
                return
            self._running = True
            self._consecutive_errors = 0
        self._thread = threading.Thread(target=self._sync_loop, daemon=True)
        self._thread.start()
        self._logger.info("云端同步服务已启动")

    def stop(self) -> None:
        with self._lock:
            self._running = False
        if self._thread and self._thread.is_alive():
            try:
                self._thread.join(timeout=10)
            except Exception as e:
                self._logger.warning("等待同步线程停止超时: %s", e)
        self._logger.info("云端同步服务已停止")

    def enqueue_upload(
        self, program_id: str, version_id: str, data: dict | None = None
    ) -> SyncItem:
        item = SyncItem(
            item_id=f"upload_{program_id}_{version_id}_{int(time.time())}",
            operation=SyncOperation.UPLOAD,
            program_id=program_id,
            version_id=version_id,
            data=data or {},
        )
        with self._lock:
            self._queue.enqueue(item)
        self._logger.info("上传任务入队: %s v%s", program_id, version_id)
        return item

    def enqueue_download(
        self, program_id: str, version_id: str | None = None
    ) -> SyncItem:
        item = SyncItem(
            item_id=f"download_{program_id}_{version_id or 'latest'}_{int(time.time())}",
            operation=SyncOperation.DOWNLOAD,
            program_id=program_id,
            version_id=version_id,
        )
        with self._lock:
            self._queue.enqueue(item)
        self._logger.info("下载任务入队: %s", program_id)
        return item

    def on_sync_complete(self, callback: Callable) -> None:
        with self._lock:
            self._on_sync_complete_callbacks.append(callback)

    def on_conflict(self, callback: Callable[[ConflictInfo], None]) -> None:
        with self._lock:
            self._on_conflict_callbacks.append(callback)

    def on_sync_fail(self, callback: Callable[[SyncItem, Exception], None]) -> None:
        with self._lock:
            self._on_sync_fail_callbacks.append(callback)

    def get_pending_conflicts(self) -> list[ConflictInfo]:
        return self._resolver.get_pending_conflicts()

    def resolve_conflict(self, conflict: ConflictInfo, choice: ConflictStrategy) -> None:
        self._resolver.resolve_manually(conflict, choice)
        self._logger.info("冲突已解决: %s -> %s", conflict.program_id, choice.value)

    def _sync_loop(self) -> None:
        self._logger.info("同步循环启动")
        while True:
            try:
                with self._lock:
                    if not self._running:
                        break

                if self._consecutive_errors >= self._max_consecutive_errors:
                    self._logger.warning(
                        "连续错误次数过多(%d),进入冷却 %d 秒",
                        self._consecutive_errors, self._error_cooldown,
                    )
                    time.sleep(self._error_cooldown)
                    with self._lock:
                        self._consecutive_errors = 0

                item = None
                with self._lock:
                    item = self._queue.dequeue()

                if item is None:
                    time.sleep(self._sync_config.sync_interval)
                    continue

                try:
                    self._process_item(item)
                    with self._lock:
                        self._consecutive_errors = 0
                        self._last_activity_time = time.time()
                except SyncConflictError as e:
                    self._handle_conflict(item, e)
                except SyncNetworkError as e:
                    self._handle_network_error(item, e)
                except SyncAuthenticationError as e:
                    self._handle_auth_error(item, e)
                except Exception as e:
                    self._handle_unknown_error(item, e)

            except Exception as e:
                self._logger.error("同步循环顶层异常: %s", e, exc_info=True)
                time.sleep(5)

        self._logger.info("同步循环已退出")

    def _process_item(self, item: SyncItem) -> None:
        item.last_attempt = datetime.now()
        try:
            if item.operation == SyncOperation.UPLOAD:
                self._do_upload(item)
            elif item.operation == SyncOperation.DOWNLOAD:
                self._do_download(item)
            elif item.operation == SyncOperation.DELETE_LOCAL:
                self._do_delete_local(item)
            elif item.operation == SyncOperation.DELETE_REMOTE:
                self._do_delete_remote(item)
            else:
                raise SyncError(f"未知的同步操作: {item.operation}")

            self._notify_sync_complete(item)

        except SyncConflictError:
            raise
        except SyncAuthenticationError:
            raise
        except SyncNetworkError:
            raise
        except Exception as e:
            raise SyncNetworkError(f"同步操作失败: {e}") from e

    def _do_upload(self, item: SyncItem) -> None:
        self._ensure_authenticated()
        self._logger.info("上传程序: %s v%s", item.program_id, item.version_id)
        import random
        if random.random() < 0.1:
            raise SyncNetworkError("模拟网络波动")
        self._logger.info("上传成功: %s v%s", item.program_id, item.version_id)

    def _do_download(self, item: SyncItem) -> None:
        self._ensure_authenticated()
        self._logger.info("下载程序: %s", item.program_id)
        self._logger.info("下载成功: %s", item.program_id)

    def _do_delete_local(self, item: SyncItem) -> None:
        self._logger.info("删除本地程序: %s", item.program_id)

    def _do_delete_remote(self, item: SyncItem) -> None:
        self._ensure_authenticated()
        self._logger.info("删除远程程序: %s", item.program_id)

    def _ensure_authenticated(self) -> None:
        with self._lock:
            if not self._auth_token:
                raise SyncAuthenticationError("未认证，请先登录")

    def _handle_conflict(self, item: SyncItem, error: SyncConflictError) -> None:
        self._logger.warning("同步冲突: %s - %s", item.program_id, error)
        conflict = getattr(error, "conflict", None)
        if conflict:
            self._notify_conflict(conflict)
        with self._lock:
            self._consecutive_errors += 1

    def _handle_network_error(self, item: SyncItem, error: SyncNetworkError) -> None:
        item.retry_count += 1
        item.error_message = str(error)
        self._logger.warning(
            "同步网络错误 %d/%d: %s - %s",
            item.retry_count, item.max_retries, item.program_id, error,
        )
        if item.retry_count < item.max_retries:
            delay = min(2 ** item.retry_count, 60)
            time.sleep(delay)
            with self._lock:
                self._queue.enqueue(item)
                self._consecutive_errors += 1
        else:
            self._logger.error(
                "同步最终失败: %s - %s", item.program_id, error)
            self._notify_sync_fail(item, error)
            with self._lock:
                self._consecutive_errors += 1

    def _handle_auth_error(self, item: SyncItem, error: SyncAuthenticationError) -> None:
        item.error_message = str(error)
        self._logger.error("同步认证失败: %s - %s", item.program_id, error)
        self._notify_sync_fail(item, error)
        with self._lock:
            self._consecutive_errors += 1

    def _handle_unknown_error(self, item: SyncItem, error: Exception) -> None:
        item.retry_count += 1
        item.error_message = str(error)
        self._logger.error(
            "同步未知错误 %d/%d: %s - %s",
            item.retry_count, item.max_retries, item.program_id, error,
            exc_info=True,
        )
        if item.retry_count < item.max_retries:
            delay = min(2 ** item.retry_count, 60)
            time.sleep(delay)
            with self._lock:
                self._queue.enqueue(item)
                self._consecutive_errors += 1
        else:
            self._logger.error(
                "同步最终失败: %s - %s", item.program_id, error)
            self._notify_sync_fail(item, error)
            with self._lock:
                self._consecutive_errors += 1

    def _notify_sync_complete(self, item: SyncItem) -> None:
        with self._lock:
            callbacks = list(self._on_sync_complete_callbacks)
        for cb in callbacks:
            try:
                cb(item)
            except Exception as e:
                self._logger.error("同步完成回调错误: %s", e)

    def _notify_sync_fail(self, item: SyncItem, error: Exception) -> None:
        with self._lock:
            callbacks = list(self._on_sync_fail_callbacks)
        for cb in callbacks:
            try:
                cb(item, error)
            except Exception as e:
                self._logger.error("同步失败回调错误: %s", e)

    def _notify_conflict(self, conflict: ConflictInfo) -> None:
        with self._lock:
            callbacks = list(self._on_conflict_callbacks)
        for cb in callbacks:
            try:
                cb(conflict)
            except Exception as e:
                self._logger.error("冲突回调错误: %s", e)
