import time
import json
import os
import random
import threading
import requests
from typing import Any, Dict, List, Optional, Tuple, Union, Type
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from configtool.utils import get_logger, NetworkError
from .retry import BackoffStrategy, RetryPolicy, CircuitBreaker, CircuitBreakerState, HealthCheck

logger = get_logger("remote")

class RemoteResponse:
    def __init__(
        self,
        status_code: int,
        data: Any = None,
        error: str = "",
        elapsed: float = 0.0,
        headers: Optional[Dict[str, str]] = None,
        is_timeout: bool = False,
        timeout_type: str = "",
    ):
        self.status_code = status_code
        self.data = data
        self.error = error
        self.elapsed = elapsed
        self.headers = headers or {}
        self.is_timeout = is_timeout
        self.timeout_type = timeout_type

    @property
    def success(self) -> bool:
        return 200 <= self.status_code < 300 and not self.error

    @property
    def is_json(self) -> bool:
        return isinstance(self.data, (dict, list))

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status_code": self.status_code,
            "data": self.data,
            "error": self.error,
            "elapsed": self.elapsed,
            "success": self.success,
            "is_timeout": self.is_timeout,
            "timeout_type": self.timeout_type,
        }

    def __str__(self) -> str:
        if self.is_timeout:
            return f"RemoteResponse(status={self.status_code}, timeout={self.timeout_type}, elapsed={self.elapsed:.2f}s)"
        if self.success:
            return f"RemoteResponse(status={self.status_code}, elapsed={self.elapsed:.2f}s)"
        return f"RemoteResponse(status={self.status_code}, error={self.error}, elapsed={self.elapsed:.2f}s)"

class RemoteClient:
    def __init__(
        self,
        base_url: str = "",
        timeout: int = None,
        connect_timeout: int = None,
        read_timeout: int = None,
        max_retries: int = None,
        retry_interval: float = None,
        verify_ssl: bool = True,
        default_headers: Optional[Dict[str, str]] = None,
        retry_policy: Optional[RetryPolicy] = None,
        circuit_breaker: Optional[CircuitBreaker] = None,
        health_check: Optional[HealthCheck] = None,
    ):
        self.base_url = base_url.rstrip("/") if base_url else ""
        self.timeout = timeout or int(os.environ.get("REMOTE_TIMEOUT", "30"))
        self.connect_timeout = connect_timeout or int(os.environ.get("REMOTE_CONNECT_TIMEOUT", "10"))
        self.read_timeout = read_timeout or int(os.environ.get("REMOTE_READ_TIMEOUT", str(self.timeout)))
        self.max_retries = max_retries or int(os.environ.get("REMOTE_RETRY_COUNT", "3"))
        self.retry_interval = retry_interval or float(os.environ.get("REMOTE_RETRY_INTERVAL", "1.0"))
        self.verify_ssl = verify_ssl
        self.default_headers = default_headers or {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "configtool/1.0",
        }
        self.retry_policy = retry_policy or RetryPolicy(
            max_retries=self.max_retries,
            initial_delay=self.retry_interval,
        )
        self.circuit_breaker = circuit_breaker
        self.health_check = health_check
        self._health_stop_event: Optional[threading.Event] = None
        if self.health_check is not None:
            self.health_check._set_client(self)
        self._session = self._create_session()

    def _create_session(self) -> requests.Session:
        session = requests.Session()

        retry_strategy = Retry(
            total=self.max_retries,
            backoff_factor=self.retry_interval,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
        )

        adapter = HTTPAdapter(
            max_retries=retry_strategy,
            pool_connections=10,
            pool_maxsize=10,
        )
        session.mount("http://", adapter)
        session.mount("https://", adapter)

        return session

    def _build_url(self, url: str) -> str:
        if url.startswith(("http://", "https://")):
            return url
        if self.base_url:
            return f"{self.base_url}/{url.lstrip('/')}"
        return url

    def _calculate_backoff(self, attempt: int) -> float:
        strategy = self.retry_policy.backoff_strategy
        initial_delay = self.retry_policy.initial_delay
        max_delay = self.retry_policy.max_delay
        jitter = self.retry_policy.jitter

        if strategy == BackoffStrategy.FIXED:
            backoff = initial_delay
        elif strategy == BackoffStrategy.EXPONENTIAL:
            backoff = initial_delay * (2 ** attempt)
        elif strategy == BackoffStrategy.LINEAR:
            backoff = initial_delay * (attempt + 1)
        elif strategy == BackoffStrategy.JITTER:
            backoff = initial_delay * (2 ** attempt)
            if jitter:
                backoff = backoff * (0.5 + random.random() * 0.5)
        else:
            backoff = initial_delay * (2 ** attempt)

        if jitter and strategy != BackoffStrategy.JITTER:
            backoff = backoff * (0.75 + random.random() * 0.5)

        return min(backoff, max_delay)

    def _should_retry(self, response: Optional[RemoteResponse], exception: Optional[Exception]) -> bool:
        if response is not None:
            if response.success:
                return False
            if response.status_code in self.retry_policy.retry_on_status:
                return True
        if exception is not None:
            for exc_type in self.retry_policy.retry_on_exceptions:
                if isinstance(exception, exc_type):
                    return True
            if isinstance(exception, (
                requests.exceptions.ConnectTimeout,
                requests.exceptions.ReadTimeout,
                requests.exceptions.Timeout,
                requests.exceptions.ConnectionError,
            )):
                return True
        return False

    def _request(
        self,
        method: str,
        url: str,
        params: Optional[Dict[str, Any]] = None,
        data: Optional[Union[Dict[str, Any], str]] = None,
        json_data: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
        timeout: Optional[Union[int, Tuple[int, int]]] = None,
        app_level_retries: int = None,
    ) -> RemoteResponse:
        if self.circuit_breaker is not None and not self.circuit_breaker.allow_request():
            raise NetworkError(
                f"熔断器已打开，请求被阻止: {method} {url}, "
                f"状态={self.circuit_breaker.state.value}"
            )

        request_url = self._build_url(url)
        request_headers = {**self.default_headers, **(headers or {})}

        if timeout is None:
            request_timeout = (self.connect_timeout, self.read_timeout)
        elif isinstance(timeout, (list, tuple)):
            request_timeout = tuple(timeout)
        else:
            request_timeout = (self.connect_timeout, int(timeout))

        max_retries = app_level_retries if app_level_retries is not None else self.retry_policy.max_retries

        logger.debug(
            f"发送请求: {method} {request_url}, "
            f"params={params}, "
            f"timeout=(connect={request_timeout[0]}s, read={request_timeout[1]}s)"
        )

        last_response = None
        last_exception = None
        for attempt in range(max_retries + 1):
            start_time = time.time()
            current_exception = None

            try:
                response = self._session.request(
                    method=method,
                    url=request_url,
                    params=params,
                    data=data,
                    json=json_data,
                    headers=request_headers,
                    timeout=request_timeout,
                    verify=self.verify_ssl,
                )

                elapsed = time.time() - start_time

                try:
                    response_data = response.json()
                except (ValueError, json.JSONDecodeError):
                    response_data = response.text

                result = RemoteResponse(
                    status_code=response.status_code,
                    data=response_data,
                    elapsed=elapsed,
                    headers=dict(response.headers),
                )

                if result.success:
                    logger.info(f"请求成功: {method} {request_url} - {response.status_code} ({elapsed:.2f}s)")
                    if self.circuit_breaker is not None:
                        self.circuit_breaker.record_success()
                    return result
                else:
                    logger.warning(
                        f"请求失败: {method} {request_url} - {response.status_code} ({elapsed:.2f}s), "
                        f"response={str(response_data)[:200]}"
                    )
                    last_response = result

            except requests.exceptions.ConnectTimeout as e:
                current_exception = e
                elapsed = time.time() - start_time
                error_msg = f"连接超时({request_timeout[0]}s): {e}"
                logger.error(f"{method} {request_url} - {error_msg}")
                last_response = RemoteResponse(
                    status_code=408, error=error_msg, elapsed=elapsed,
                    is_timeout=True, timeout_type="connect",
                )

            except requests.exceptions.ReadTimeout as e:
                current_exception = e
                elapsed = time.time() - start_time
                error_msg = f"读取超时({request_timeout[1]}s): {e}"
                logger.error(f"{method} {request_url} - {error_msg}")
                last_response = RemoteResponse(
                    status_code=408, error=error_msg, elapsed=elapsed,
                    is_timeout=True, timeout_type="read",
                )

            except requests.exceptions.Timeout as e:
                current_exception = e
                elapsed = time.time() - start_time
                error_msg = f"请求超时: {e}"
                logger.error(f"{method} {request_url} - {error_msg}")
                last_response = RemoteResponse(
                    status_code=408, error=error_msg, elapsed=elapsed,
                    is_timeout=True, timeout_type="unknown",
                )

            except requests.exceptions.ConnectionError as e:
                current_exception = e
                elapsed = time.time() - start_time
                error_msg = f"连接错误: {e}"
                logger.error(f"{method} {request_url} - {error_msg}")
                last_response = RemoteResponse(
                    status_code=503, error=error_msg, elapsed=elapsed,
                )

            except requests.exceptions.RequestException as e:
                current_exception = e
                elapsed = time.time() - start_time
                error_msg = f"请求异常: {e}"
                logger.error(f"{method} {request_url} - {error_msg}")
                last_response = RemoteResponse(
                    status_code=500, error=error_msg, elapsed=elapsed,
                )

            last_exception = current_exception

            if attempt < max_retries and self._should_retry(last_response, current_exception):
                backoff = self._calculate_backoff(attempt)
                logger.info(
                    f"应用层重试 ({attempt + 1}/{max_retries}): "
                    f"{method} {request_url}, 等待{backoff:.1f}s"
                )
                time.sleep(backoff)
            else:
                break

        if self.circuit_breaker is not None:
            self.circuit_breaker.record_failure()

        return last_response

    def health_check(self) -> bool:
        if self.health_check is None:
            return True
        return self.health_check.check()

    def start_health_check(self) -> None:
        if self.health_check is None:
            return
        if self._health_stop_event is not None:
            return
        self._health_stop_event = threading.Event()
        self.health_check.start_background(self._health_stop_event)

    def stop_health_check(self) -> None:
        if self._health_stop_event is not None:
            self._health_stop_event.set()
            self._health_stop_event = None
        if self.health_check is not None:
            self.health_check.stop()

    def get(
        self,
        url: str,
        params: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
        timeout: Optional[int] = None,
    ) -> RemoteResponse:
        return self._request("GET", url, params=params, headers=headers, timeout=timeout)

    def post(
        self,
        url: str,
        data: Optional[Union[Dict[str, Any], str]] = None,
        json_data: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
        timeout: Optional[int] = None,
    ) -> RemoteResponse:
        if json_data is not None and data is None:
            return self._request(
                "POST", url, params=params, json_data=json_data,
                headers=headers, timeout=timeout
            )
        return self._request(
            "POST", url, params=params, data=data,
            headers=headers, timeout=timeout
        )

    def put(
        self,
        url: str,
        data: Optional[Union[Dict[str, Any], str]] = None,
        json_data: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
        timeout: Optional[int] = None,
    ) -> RemoteResponse:
        if json_data is not None and data is None:
            return self._request(
                "PUT", url, params=params, json_data=json_data,
                headers=headers, timeout=timeout
            )
        return self._request(
            "PUT", url, params=params, data=data,
            headers=headers, timeout=timeout
        )

    def delete(
        self,
        url: str,
        params: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
        timeout: Optional[int] = None,
    ) -> RemoteResponse:
        return self._request("DELETE", url, params=params, headers=headers, timeout=timeout)

    def patch(
        self,
        url: str,
        data: Optional[Union[Dict[str, Any], str]] = None,
        json_data: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
        timeout: Optional[int] = None,
    ) -> RemoteResponse:
        if json_data is not None and data is None:
            return self._request(
                "PATCH", url, params=params, json_data=json_data,
                headers=headers, timeout=timeout
            )
        return self._request(
            "PATCH", url, params=params, data=data,
            headers=headers, timeout=timeout
        )

    def call_service(
        self,
        service_name: str,
        endpoint: str,
        method: str = "POST",
        data: Optional[Dict[str, Any]] = None,
        service_discovery: Optional[Dict[str, str]] = None,
    ) -> RemoteResponse:
        if service_discovery and service_name in service_discovery:
            base_url = service_discovery[service_name]
        else:
            base_url = os.environ.get(f"SERVICE_{service_name.upper()}_URL", "")
            if not base_url:
                raise NetworkError(f"未找到服务地址: {service_name}")

        client = RemoteClient(base_url=base_url)
        return client._request(method, endpoint, json_data=data)

    def close(self) -> None:
        self.stop_health_check()
        self._session.close()
        logger.debug("远程调用客户端已关闭")

    def __enter__(self) -> "RemoteClient":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()
