from __future__ import annotations

import time
import json
from typing import Any, Callable, Dict, List, Optional, Tuple, Set, TYPE_CHECKING
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict, deque
from configtool.utils import get_logger
from .client import RemoteClient, RemoteResponse

if TYPE_CHECKING:
    from .retry import RetryPolicy, CircuitBreaker, HealthCheck

logger = get_logger("remote.batch")

class TaskPriority(Enum):
    LOW = 0
    NORMAL = 1
    HIGH = 2
    CRITICAL = 3

class BatchStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    PARTIAL_SUCCESS = "partial_success"
    FAILED = "failed"

@dataclass
class BatchRequest:
    request_id: str
    url: str
    method: str = "GET"
    params: Optional[Dict[str, Any]] = None
    data: Optional[Dict[str, Any]] = None
    headers: Optional[Dict[str, str]] = None
    timeout: Optional[int] = None
    context: Dict[str, Any] = field(default_factory=dict)
    priority: TaskPriority = TaskPriority.NORMAL
    dependencies: List[str] = field(default_factory=list)

@dataclass
class BatchResult:
    request: BatchRequest
    response: Optional[RemoteResponse] = None
    error: str = ""
    start_time: float = 0.0
    end_time: float = 0.0

    @property
    def success(self) -> bool:
        return self.response is not None and self.response.success and not self.error

    @property
    def duration(self) -> float:
        return self.end_time - self.start_time

    def to_dict(self) -> Dict[str, Any]:
        return {
            "request_id": self.request.request_id,
            "url": self.request.url,
            "method": self.request.method,
            "success": self.success,
            "error": self.error,
            "duration": self.duration,
            "response": self.response.to_dict() if self.response else None,
            "context": self.request.context,
            "priority": self.request.priority.value,
            "dependencies": self.request.dependencies,
        }

@dataclass
class BatchResponse:
    results: List[BatchResult] = field(default_factory=list)
    status: BatchStatus = BatchStatus.PENDING
    start_time: float = 0.0
    end_time: float = 0.0

    @property
    def total_count(self) -> int:
        return len(self.results)

    @property
    def success_count(self) -> int:
        return sum(1 for r in self.results if r.success)

    @property
    def failed_count(self) -> int:
        return sum(1 for r in self.results if not r.success)

    @property
    def success_rate(self) -> float:
        if self.total_count == 0:
            return 0.0
        return self.success_count / self.total_count

    @property
    def total_duration(self) -> float:
        return self.end_time - self.start_time

    @property
    def all_success(self) -> bool:
        return all(r.success for r in self.results)

    def get_successful(self) -> List[BatchResult]:
        return [r for r in self.results if r.success]

    def get_failed(self) -> List[BatchResult]:
        return [r for r in self.results if not r.success]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_count": self.total_count,
            "success_count": self.success_count,
            "failed_count": self.failed_count,
            "success_rate": f"{self.success_rate * 100:.2f}%",
            "total_duration": f"{self.total_duration:.2f}s",
            "status": self.status.value,
            "all_success": self.all_success,
            "results": [r.to_dict() for r in self.results],
        }

class BatchRemoteCaller:
    def __init__(
        self,
        max_workers: int = 10,
        base_url: str = "",
        stop_on_failure: bool = False,
        retry_policy: Optional[RetryPolicy] = None,
        circuit_breaker: Optional[CircuitBreaker] = None,
        health_check: Optional[HealthCheck] = None,
    ):
        self.max_workers = max_workers
        self.base_url = base_url
        self.stop_on_failure = stop_on_failure
        self.retry_policy = retry_policy
        self.circuit_breaker = circuit_breaker
        self.health_check = health_check
        self.client = RemoteClient(
            base_url=base_url,
            retry_policy=retry_policy,
            circuit_breaker=circuit_breaker,
            health_check=health_check,
        )

    def _resolve_dependencies(self, requests: List[BatchRequest]) -> List[List[BatchRequest]]:
        req_map = {r.request_id: r for r in requests}
        in_degree = {r.request_id: 0 for r in requests}
        adj_list = defaultdict(list)

        for req in requests:
            for dep_id in req.dependencies:
                if dep_id not in req_map:
                    raise ValueError(f"请求 {req.request_id} 依赖不存在的请求 {dep_id}")
                adj_list[dep_id].append(req.request_id)
                in_degree[req.request_id] += 1

        queue = deque()
        for req_id, degree in in_degree.items():
            if degree == 0:
                queue.append(req_id)

        result = []
        visited = 0
        while queue:
            level_reqs = []
            for _ in range(len(queue)):
                req_id = queue.popleft()
                level_reqs.append(req_map[req_id])
                visited += 1
                for neighbor in adj_list[req_id]:
                    in_degree[neighbor] -= 1
                    if in_degree[neighbor] == 0:
                        queue.append(neighbor)
            result.append(level_reqs)

        if visited != len(requests):
            raise ValueError("检测到循环依赖，无法执行请求")

        return result

    def _sort_by_priority(self, req_groups: List[List[BatchRequest]]) -> List[List[BatchRequest]]:
        sorted_groups = []
        for group in req_groups:
            sorted_group = sorted(
                group,
                key=lambda r: r.priority.value,
                reverse=True
            )
            sorted_groups.append(sorted_group)
        return sorted_groups

    def _report_progress(
        self,
        completed: int,
        total: int,
        message: str,
        progress_callback: Optional[Callable[[int, int, str], None]] = None,
    ) -> None:
        if progress_callback:
            try:
                progress_callback(completed, total, message)
            except Exception as e:
                logger.warning(f"进度回调执行失败: {e}")

    def create_request(
        self,
        url: str,
        method: str = "GET",
        params: Optional[Dict[str, Any]] = None,
        data: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
        timeout: Optional[int] = None,
        context: Optional[Dict[str, Any]] = None,
        priority: TaskPriority = TaskPriority.NORMAL,
        dependencies: Optional[List[str]] = None,
    ) -> BatchRequest:
        import uuid
        return BatchRequest(
            request_id=str(uuid.uuid4()),
            url=url,
            method=method,
            params=params,
            data=data,
            headers=headers,
            timeout=timeout,
            context=context or {},
            priority=priority,
            dependencies=dependencies or [],
        )

    def execute(
        self,
        requests: List[BatchRequest],
        callback: Optional[Callable[[BatchResult], None]] = None,
        skip_health_check: bool = False,
        progress_callback: Optional[Callable[[int, int, str], None]] = None,
    ) -> BatchResponse:
        batch_response = BatchResponse(
            status=BatchStatus.RUNNING,
            start_time=time.time(),
        )

        if not skip_health_check and self.health_check is not None:
            logger.info("执行批量调用前健康检查")
            healthy = self.client.health_check()
            if not healthy:
                logger.warning(f"健康检查失败，服务状态不健康，仍将尝试执行批量调用")

        logger.info(
            f"开始批量远程调用: 任务数={len(requests)}, "
            f"并发数={self.max_workers}"
        )

        req_groups = self._resolve_dependencies(requests)
        req_groups = self._sort_by_priority(req_groups)

        total_requests = len(requests)
        completed = 0
        failed_ids: Set[str] = set()

        self._report_progress(completed, total_requests, "开始执行批量请求", progress_callback)

        for group_idx, group in enumerate(req_groups):
            use_parallel = len(group) > self.max_workers // 2 or len(group) > 2

            if use_parallel:
                group_results = self._execute_group_parallel(
                    group,
                    callback,
                    progress_callback,
                    failed_ids,
                    completed,
                    total_requests,
                )
            else:
                group_results = self._execute_group_sequential(
                    group,
                    callback,
                    progress_callback,
                    failed_ids,
                    completed,
                    total_requests,
                )

            for result in group_results:
                batch_response.results.append(result)
                completed += 1
                if not result.success:
                    failed_ids.add(result.request.request_id)

            if self.stop_on_failure and any(not r.success for r in group_results):
                remaining = [r for g in req_groups[group_idx + 1:] for r in g]
                for req in remaining:
                    skip_reason = "批量调用已终止"
                    result = BatchResult(
                        request=req,
                        error=skip_reason,
                        start_time=time.time(),
                        end_time=time.time(),
                    )
                    batch_response.results.append(result)
                    completed += 1
                logger.error(f"批量调用因请求失败而终止")
                break

        self._report_progress(completed, total_requests, "批量请求执行完成", progress_callback)

        batch_response.end_time = time.time()

        if batch_response.all_success:
            batch_response.status = BatchStatus.COMPLETED
        elif batch_response.success_count > 0:
            batch_response.status = BatchStatus.PARTIAL_SUCCESS
        else:
            batch_response.status = BatchStatus.FAILED

        logger.info(
            f"批量远程调用完成: 成功={batch_response.success_count}/{batch_response.total_count}, "
            f"成功率={batch_response.success_rate * 100:.2f}%, "
            f"总耗时={batch_response.total_duration:.2f}s"
        )

        return batch_response

    def _execute_group_sequential(
        self,
        group: List[BatchRequest],
        callback: Optional[Callable[[BatchResult], None]],
        progress_callback: Optional[Callable[[int, int, str], None]],
        failed_ids: Set[str],
        completed: int,
        total_requests: int,
    ) -> List[BatchResult]:
        results = []
        for req in group:
            result = self._handle_request_execution(
                req,
                callback,
                progress_callback,
                failed_ids,
                completed + len(results),
                total_requests,
            )
            results.append(result)

            if not result.success and self.stop_on_failure:
                logger.error(f"批量调用因请求失败而终止: {req.request_id}")
                break

        return results

    def _execute_group_parallel(
        self,
        group: List[BatchRequest],
        callback: Optional[Callable[[BatchResult], None]],
        progress_callback: Optional[Callable[[int, int, str], None]],
        failed_ids: Set[str],
        completed: int,
        total_requests: int,
    ) -> List[BatchResult]:
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_map = {
                executor.submit(
                    self._handle_request_execution,
                    req,
                    callback,
                    progress_callback,
                    failed_ids,
                    completed + idx,
                    total_requests,
                ): req
                for idx, req in enumerate(group)
            }

            ordered_results: List[Optional[BatchResult]] = [None] * len(group)
            req_to_index = {req.request_id: idx for idx, req in enumerate(group)}

            for future in as_completed(future_map):
                req = future_map[future]
                try:
                    result = future.result()
                except Exception as e:
                    result = BatchResult(
                        request=req,
                        error=str(e),
                        start_time=time.time(),
                        end_time=time.time(),
                    )
                ordered_results[req_to_index[req.request_id]] = result

                if callback:
                    try:
                        callback(result)
                    except Exception as e:
                        logger.warning(f"回调执行失败: {e}")

        for i, result in enumerate(ordered_results):
            if result is None:
                ordered_results[i] = BatchResult(
                    request=group[i],
                    error="执行结果丢失",
                    start_time=time.time(),
                    end_time=time.time(),
                )

        return ordered_results

    def _handle_request_execution(
        self,
        req: BatchRequest,
        callback: Optional[Callable[[BatchResult], None]],
        progress_callback: Optional[Callable[[int, int, str], None]],
        failed_ids: Set[str],
        current_idx: int,
        total_requests: int,
    ) -> BatchResult:
        failed_deps = [dep for dep in req.dependencies if dep in failed_ids]
        if failed_deps:
            skip_reason = f"依赖请求失败: {', '.join(failed_deps)}"
            logger.warning(f"跳过请求 {req.request_id}: {skip_reason}")
            result = BatchResult(
                request=req,
                error=skip_reason,
                start_time=time.time(),
                end_time=time.time(),
            )
        else:
            result = self._execute_single(req)

        if callback and not failed_deps:
            try:
                callback(result)
            except Exception as e:
                logger.warning(f"回调执行失败: {e}")

        self._report_progress(
            current_idx + 1,
            total_requests,
            f"执行请求 {req.request_id}",
            progress_callback
        )

        return result

    def _execute_single(self, request: BatchRequest) -> BatchResult:
        result = BatchResult(request=request, start_time=time.time())

        logger.debug(f"执行请求: {request.method} {request.url}")

        try:
            if request.method.upper() == "GET":
                response = self.client.get(
                    url=request.url,
                    params=request.params,
                    headers=request.headers,
                    timeout=request.timeout,
                )
            elif request.method.upper() == "POST":
                response = self.client.post(
                    url=request.url,
                    json_data=request.data,
                    params=request.params,
                    headers=request.headers,
                    timeout=request.timeout,
                )
            elif request.method.upper() == "PUT":
                response = self.client.put(
                    url=request.url,
                    json_data=request.data,
                    params=request.params,
                    headers=request.headers,
                    timeout=request.timeout,
                )
            elif request.method.upper() == "DELETE":
                response = self.client.delete(
                    url=request.url,
                    params=request.params,
                    headers=request.headers,
                    timeout=request.timeout,
                )
            elif request.method.upper() == "PATCH":
                response = self.client.patch(
                    url=request.url,
                    json_data=request.data,
                    params=request.params,
                    headers=request.headers,
                    timeout=request.timeout,
                )
            else:
                raise ValueError(f"不支持的HTTP方法: {request.method}")

            result.response = response

            if not response.success:
                result.error = response.error or f"HTTP {response.status_code}"

        except Exception as e:
            result.error = str(e)
            logger.error(f"请求执行异常: {request.url}, 错误: {e}")

        finally:
            result.end_time = time.time()

        status_icon = "✓" if result.success else "✗"
        logger.debug(
            f"{status_icon} {request.method} {request.url} - "
            f"{result.duration:.2f}s"
        )

        return result

    def format_result(self, batch_response: BatchResponse, output_format: str = "text") -> str:
        if output_format == "json":
            return json.dumps(batch_response.to_dict(), ensure_ascii=False, indent=2)
        elif output_format == "text":
            return self._format_text(batch_response)
        elif output_format == "table":
            return self._format_table(batch_response)
        else:
            raise ValueError(f"不支持的输出格式: {output_format}")

    def _format_text(self, batch_response: BatchResponse) -> str:
        lines = []
        lines.append("批量远程调用结果")
        lines.append("=" * 60)
        lines.append(f"总计请求: {batch_response.total_count}")
        lines.append(f"成功: {batch_response.success_count}")
        lines.append(f"失败: {batch_response.failed_count}")
        lines.append(f"成功率: {batch_response.success_rate * 100:.2f}%")
        lines.append(f"总耗时: {batch_response.total_duration:.2f}s")
        lines.append(f"状态: {batch_response.status.value}")
        lines.append("")

        if batch_response.get_failed():
            lines.append("失败的请求:")
            lines.append("-" * 60)
            for result in batch_response.get_failed():
                lines.append(f"  [{result.request.method}] {result.request.url}")
                lines.append(f"      错误: {result.error}")
                if result.response:
                    lines.append(f"      状态码: {result.response.status_code}")
                lines.append(f"      耗时: {result.duration:.2f}s")
                lines.append("")

        return "\n".join(lines)

    def _format_table(self, batch_response: BatchResponse) -> str:
        from tabulate import tabulate

        table_data = []
        headers = ["状态", "方法", "URL", "状态码", "耗时", "错误"]

        for result in batch_response.results:
            status = "✓" if result.success else "✗"
            status_code = result.response.status_code if result.response else "-"
            table_data.append([
                status,
                result.request.method,
                result.request.url[:50] + "..." if len(result.request.url) > 50 else result.request.url,
                status_code,
                f"{result.duration:.2f}s",
                result.error[:30] if result.error else "-",
            ])

        return tabulate(table_data, headers=headers, tablefmt="grid")

    def close(self) -> None:
        self.client.close()

    def __enter__(self) -> "BatchRemoteCaller":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()
