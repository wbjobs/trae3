import time
import threading
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Callable

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from utils.config import ConfigManager
from utils.logger import setup_logger
from utils.platform import is_macos
from exceptions import CloudAPIAuthError, CloudAPIError


@dataclass
class BatchRequest:
    endpoint: str
    method: str = "GET"
    params: dict = field(default_factory=dict)
    callback: Callable | None = None
    priority: int = 0
    created_at: float = field(default_factory=time.time)


class CloudAPIOptimizer:
    def __init__(self, base_url: str) -> None:
        config = ConfigManager.get()
        self._logger = setup_logger("api.optimizer", config.logging.level, config.logging.file)
        self._base_url = base_url
        self._session = requests.Session()
        self._setup_connection_pool()

        self._request_queue: deque[BatchRequest] = deque()
        self._queue_lock = threading.Lock()
        self._batch_interval = 0.1
        self._max_batch_size = 10
        self._processor_thread: threading.Thread | None = None
        self._running = False

        self._cache: dict[str, tuple[float, Any]] = {}
        self._cache_ttl = 300

        self._preloaded: dict[str, Any] = {}

    def _setup_connection_pool(self) -> None:
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET", "POST"],
        )
        adapter = HTTPAdapter(
            pool_connections=10,
            pool_maxsize=50,
            max_retries=retry_strategy,
            pool_block=False,
        )
        self._session.mount("http://", adapter)
        self._session.mount("https://", adapter)
        self._session.headers.update({"Connection": "keep-alive"})

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._processor_thread = threading.Thread(target=self._batch_processor, daemon=True)
        self._processor_thread.start()
        self._logger.info("云端API优化器已启动")

    def stop(self) -> None:
        self._running = False
        if self._processor_thread and self._processor_thread.is_alive():
            self._processor_thread.join(timeout=5)
        self._session.close()
        self._logger.info("云端API优化器已停止")

    def queue_request(
        self,
        endpoint: str,
        method: str = "GET",
        params: dict | None = None,
        callback: Callable | None = None,
        priority: int = 0,
    ) -> None:
        request = BatchRequest(
            endpoint=endpoint,
            method=method,
            params=params or {},
            callback=callback,
            priority=priority,
        )
        with self._queue_lock:
            self._request_queue.append(request)
        self._logger.debug("请求入队: %s %s", method, endpoint)

    def get_cached(self, key: str) -> Any | None:
        cached = self._cache.get(key)
        if cached:
            timestamp, value = cached
            if time.time() - timestamp < self._cache_ttl:
                return value
            else:
                del self._cache[key]
        return None

    def set_cache(self, key: str, value: Any) -> None:
        self._cache[key] = (time.time(), value)

    def invalidate_cache(self, pattern: str | None = None) -> int:
        if pattern is None:
            count = len(self._cache)
            self._cache.clear()
            return count
        count = 0
        keys_to_remove = [k for k in self._cache.keys() if pattern in k]
        for k in keys_to_remove:
            del self._cache[k]
            count += 1
        return count

    def preload(self, endpoints: list[str]) -> None:
        threading.Thread(
            target=self._preload_worker,
            args=(endpoints,),
            daemon=True,
        ).start()

    def _preload_worker(self, endpoints: list[str]) -> None:
        for endpoint in endpoints:
            try:
                response = self._session.get(
                    f"{self._base_url}{endpoint}",
                    timeout=10,
                )
                if response.status_code == 200:
                    self._preloaded[endpoint] = response.json()
                    self.set_cache(endpoint, response.json())
                    self._logger.debug("预加载完成: %s", endpoint)
            except Exception as e:
                self._logger.warning("预加载失败: %s - %s", endpoint, e)

    def get_preloaded(self, endpoint: str) -> Any | None:
        return self._preloaded.get(endpoint)

    def _batch_processor(self) -> None:
        while self._running:
            time.sleep(self._batch_interval)

            batch: list[BatchRequest] = []
            with self._queue_lock:
                while self._request_queue and len(batch) < self._max_batch_size:
                    batch.append(self._request_queue.popleft())

            if not batch:
                continue

            try:
                self._process_batch(batch)
            except Exception as e:
                self._logger.error("批量处理错误: %s", e)

    def _process_batch(self, batch: list[BatchRequest]) -> None:
        get_requests = [r for r in batch if r.method.upper() == "GET"]
        other_requests = [r for r in batch if r.method.upper() != "GET"]

        if len(get_requests) >= 2:
            try:
                batch_response = self._execute_batch_get(get_requests)
                for req, resp in zip(get_requests, batch_response):
                    if req.callback:
                        try:
                            req.callback(resp)
                        except Exception as e:
                            self._logger.error("回调执行错误: %s", e)
            except Exception as e:
                self._logger.warning("批量GET失败,退化为串行: %s", e)
                for req in get_requests:
                    self._execute_single(req)
        else:
            for req in get_requests:
                self._execute_single(req)

        for req in other_requests:
            self._execute_single(req)

    def _execute_batch_get(self, requests_list: list[BatchRequest]) -> list[dict]:
        results = []
        for req in requests_list:
            try:
                cache_key = f"{req.endpoint}:{str(req.params)}"
                cached = self.get_cached(cache_key)
                if cached is not None:
                    results.append(cached)
                    continue

                response = self._session.get(
                    f"{self._base_url}{req.endpoint}",
                    params=req.params,
                    timeout=15,
                )
                response.raise_for_status()
                data = response.json()
                self.set_cache(cache_key, data)
                results.append(data)
            except Exception as e:
                results.append({"error": str(e)})
        return results

    def _execute_single(self, req: BatchRequest) -> None:
        try:
            cache_key = f"{req.endpoint}:{str(req.params)}"
            if req.method.upper() == "GET":
                cached = self.get_cached(cache_key)
                if cached is not None and req.callback:
                    req.callback(cached)
                    return

            response = self._session.request(
                method=req.method,
                url=f"{self._base_url}{req.endpoint}",
                params=req.params if req.method.upper() == "GET" else None,
                json=req.params if req.method.upper() != "GET" else None,
                timeout=30,
            )

            if response.status_code == 401:
                raise CloudAPIAuthError("认证失败")
            if response.status_code >= 400:
                raise CloudAPIError(f"HTTP {response.status_code}")

            data = response.json()
            if req.method.upper() == "GET":
                self.set_cache(cache_key, data)

            if req.callback:
                req.callback(data)

        except Exception as e:
            if req.callback:
                req.callback({"error": str(e)})

    def execute_immediate(
        self,
        endpoint: str,
        method: str = "GET",
        params: dict | None = None,
    ) -> dict:
        cache_key = f"{endpoint}:{str(params)}"
        if method.upper() == "GET":
            cached = self.get_cached(cache_key)
            if cached is not None:
                return cached

        response = self._session.request(
            method=method,
            url=f"{self._base_url}{endpoint}",
            params=params if method.upper() == "GET" else None,
            json=params if method.upper() != "GET" else None,
            timeout=30,
        )

        if response.status_code == 401:
            raise CloudAPIAuthError("认证失败")
        if response.status_code >= 400:
            raise CloudAPIError(f"HTTP {response.status_code}")

        data = response.json()
        if method.upper() == "GET":
            self.set_cache(cache_key, data)

        return data
