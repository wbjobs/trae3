import uuid
import json
import copy
import time
import signal
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional, Set, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import defaultdict, deque
from configtool.utils import get_logger, deep_diff, RollbackError
from .models import (
    RollbackTask,
    RollbackResult,
    BatchRollbackResult,
    RollbackStatus,
    RollbackType,
    TaskPriority,
    ExecutionProgress,
)

logger = get_logger("rollback")

class RollbackManager:
    def __init__(self, max_workers: int = 5, auto_retry: int = 1, verify_after_rollback: bool = True):
        self.max_workers = max_workers
        self.auto_retry = auto_retry
        self.verify_after_rollback = verify_after_rollback
        self._executors: Dict[str, Callable] = {}
        self._register_default_executors()

    def _register_default_executors(self) -> None:
        self.register_executor(RollbackType.CONFIG_VERSION, self._execute_config_version_rollback)
        self.register_executor(RollbackType.CONFIG_CENTER, self._execute_config_center_rollback)
        self.register_executor(RollbackType.REMOTE_SERVICE, self._execute_remote_service_rollback)
        self.register_executor(RollbackType.DATABASE, self._execute_database_rollback)
        self.register_executor(RollbackType.FILE, self._execute_file_rollback)

    def register_executor(self, rollback_type: RollbackType, executor: Callable) -> None:
        self._executors[rollback_type] = executor
        logger.info(f"已注册回滚执行器: {rollback_type.value}")

    def create_task(
        self,
        rollback_type: RollbackType,
        target: str,
        target_version: Optional[str] = None,
        current_version: Optional[str] = None,
        parameters: Optional[Dict[str, Any]] = None,
        description: str = "",
        priority: TaskPriority = TaskPriority.NORMAL,
        dependencies: Optional[List[str]] = None,
        timeout_seconds: int = 300,
        max_retries: int = 0,
    ) -> RollbackTask:
        task_id = str(uuid.uuid4())
        task = RollbackTask(
            task_id=task_id,
            rollback_type=rollback_type,
            target=target,
            target_version=target_version,
            current_version=current_version,
            parameters=parameters or {},
            description=description,
            priority=priority,
            dependencies=dependencies or [],
            timeout_seconds=timeout_seconds,
            max_retries=max_retries,
        )
        logger.info(f"创建回滚任务: {task_id}, 类型: {rollback_type.value}, 目标: {target}")
        return task

    def _resolve_dependencies(self, tasks: List[RollbackTask]) -> List[RollbackTask]:
        task_map = {t.task_id: t for t in tasks}
        in_degree = {t.task_id: 0 for t in tasks}
        adj_list = defaultdict(list)

        for task in tasks:
            for dep_id in task.dependencies:
                if dep_id not in task_map:
                    raise RollbackError(f"任务 {task.task_id} 依赖不存在的任务 {dep_id}")
                adj_list[dep_id].append(task.task_id)
                in_degree[task.task_id] += 1

        queue = deque()
        for task_id, degree in in_degree.items():
            if degree == 0:
                queue.append(task_id)

        result = []
        visited = 0
        while queue:
            level_tasks = []
            for _ in range(len(queue)):
                task_id = queue.popleft()
                level_tasks.append(task_map[task_id])
                visited += 1
                for neighbor in adj_list[task_id]:
                    in_degree[neighbor] -= 1
                    if in_degree[neighbor] == 0:
                        queue.append(neighbor)
            result.append(level_tasks)

        if visited != len(tasks):
            raise RollbackError("检测到循环依赖，无法执行任务")

        return result

    def _sort_by_priority(self, task_groups: List[List[RollbackTask]]) -> List[List[RollbackTask]]:
        sorted_groups = []
        for group in task_groups:
            sorted_group = sorted(
                group,
                key=lambda t: t.priority.value,
                reverse=True
            )
            sorted_groups.append(sorted_group)
        return sorted_groups

    def _track_progress(
        self,
        progress: ExecutionProgress,
        current_step: int,
        total_steps: int,
        message: str,
        on_progress: Optional[Callable[[ExecutionProgress], None]] = None,
    ) -> None:
        progress.current_step = current_step
        progress.total_steps = total_steps
        progress.percentage = (current_step / total_steps * 100) if total_steps > 0 else 0.0
        progress.message = message
        progress.elapsed_seconds = (datetime.now() - progress.start_time).total_seconds()
        if on_progress:
            try:
                on_progress(progress)
            except Exception as e:
                logger.warning(f"进度回调执行失败: {e}")

    def _execute_single_task(
        self,
        task: RollbackTask,
        dry_run: bool = False,
        on_progress: Optional[Callable[[ExecutionProgress], None]] = None,
    ) -> RollbackResult:
        result = RollbackResult(
            task=task,
            status=RollbackStatus.RUNNING,
            priority=task.priority,
        )
        task.status = RollbackStatus.RUNNING
        progress = result.progress

        logger.info(f"开始执行回滚任务: {task.task_id}, 类型: {task.rollback_type.value}")

        total_steps = 1 + task.max_retries
        self._track_progress(progress, 0, total_steps, "准备执行任务", on_progress)

        if dry_run:
            logger.info(f"[DRY RUN] 模拟执行回滚任务: {task.task_id}")
            result.add_step("dry_run_check", RollbackStatus.SUCCESS, {"target": task.target})
            result.status = RollbackStatus.SUCCESS
            result.end_time = datetime.now()
            self._track_progress(progress, total_steps, total_steps, "任务执行完成", on_progress)
            return result

        def _timeout_handler(signum, frame):
            raise RollbackError(f"任务执行超时 (超过 {task.timeout_seconds} 秒)")

        try:
            executor = self._executors.get(task.rollback_type)
            if not executor:
                raise RollbackError(f"未找到回滚执行器: {task.rollback_type.value}")

            max_attempts = task.max_retries + 1
            for attempt in range(max_attempts):
                result.retry_count = attempt
                self._track_progress(
                    progress,
                    attempt + 1,
                    total_steps,
                    f"第 {attempt + 1} 次尝试执行",
                    on_progress
                )

                try:
                    if attempt > 0:
                        logger.warning(f"重试执行回滚任务 ({attempt}/{task.max_retries}): {task.task_id}")
                        time.sleep(1 * attempt)

                    if hasattr(signal, 'SIGALRM'):
                        signal.signal(signal.SIGALRM, _timeout_handler)
                        signal.alarm(task.timeout_seconds)

                    try:
                        executor_output = executor(task, result.add_step)
                        result.output = executor_output or {}
                        result.status = RollbackStatus.SUCCESS
                        task.status = RollbackStatus.SUCCESS
                        break
                    finally:
                        if hasattr(signal, 'SIGALRM'):
                            signal.alarm(0)

                except RollbackError:
                    if attempt == task.max_retries:
                        raise
                    logger.warning(f"回滚任务执行失败，准备重试: {task.task_id}")
                except Exception as e:
                    if attempt == task.max_retries:
                        raise RollbackError(str(e)) from e
                    logger.warning(f"回滚任务执行失败，准备重试: {task.task_id}, 错误: {e}")

            self._track_progress(progress, total_steps, total_steps, "任务执行完成", on_progress)
            logger.info(f"回滚任务执行成功: {task.task_id}, 耗时: {result.duration:.2f}s")

        except Exception as e:
            result.status = RollbackStatus.FAILED
            task.status = RollbackStatus.FAILED
            result.error_message = str(e)
            logger.error(f"回滚任务执行失败: {task.task_id}, 错误: {e}")
            self._track_progress(progress, progress.current_step, total_steps, f"任务失败: {e}", on_progress)

        finally:
            result.end_time = datetime.now()

        return result

    def execute_task(self, task: RollbackTask, dry_run: bool = False) -> RollbackResult:
        return self._execute_single_task(task, dry_run=dry_run)

    def execute_batch(
        self,
        tasks: List[RollbackTask],
        parallel: bool = False,
        dry_run: bool = False,
        stop_on_failure: bool = False,
        on_progress: Optional[Callable[[ExecutionProgress], None]] = None,
    ) -> BatchRollbackResult:
        batch_id = str(uuid.uuid4())
        batch_result = BatchRollbackResult(batch_id=batch_id)

        logger.info(
            f"开始批量回滚: batch_id={batch_id}, "
            f"任务数={len(tasks)}, 并行={parallel}, dry_run={dry_run}"
        )

        task_groups = self._resolve_dependencies(tasks)
        task_groups = self._sort_by_priority(task_groups)

        flat_tasks = [task for group in task_groups for task in group]
        total_tasks = len(flat_tasks)
        batch_progress = ExecutionProgress(total_steps=total_tasks)

        failed_task_ids: Set[str] = set()
        skipped_tasks: Dict[str, str] = {}

        for group_idx, group in enumerate(task_groups):
            if parallel:
                group_results = self._execute_group_parallel(
                    group,
                    dry_run,
                    failed_task_ids,
                    skipped_tasks,
                    on_progress,
                    batch_progress,
                    total_tasks,
                )
            else:
                group_results = self._execute_group_sequential(
                    group,
                    dry_run,
                    stop_on_failure,
                    failed_task_ids,
                    skipped_tasks,
                    on_progress,
                    batch_progress,
                    total_tasks,
                )

            for result in group_results:
                batch_result.results.append(result)
                if not result.success:
                    failed_task_ids.add(result.task.task_id)

            if stop_on_failure and any(not r.success for r in group_results):
                remaining = [t for g in task_groups[group_idx + 1:] for t in g]
                for task in remaining:
                    task.status = RollbackStatus.SKIPPED
                    batch_result.results.append(RollbackResult(
                        task=task,
                        status=RollbackStatus.SKIPPED,
                        error_message="批量回滚已终止",
                        priority=task.priority,
                    ))
                break

        batch_result.end_time = datetime.now()

        logger.info(
            f"批量回滚完成: batch_id={batch_id}, "
            f"成功={batch_result.success_count}/{batch_result.total_count}, "
            f"耗时={batch_result.end_time - batch_result.start_time}"
        )

        return batch_result

    def _execute_group_sequential(
        self,
        group: List[RollbackTask],
        dry_run: bool,
        stop_on_failure: bool,
        failed_task_ids: Set[str],
        skipped_tasks: Dict[str, str],
        on_progress: Optional[Callable[[ExecutionProgress], None]],
        batch_progress: ExecutionProgress,
        total_tasks: int,
    ) -> List[RollbackResult]:
        results = []
        for task in group:
            result = self._handle_task_execution(
                task,
                dry_run,
                failed_task_ids,
                skipped_tasks,
                on_progress,
                batch_progress,
                total_tasks,
                len(results),
                len(group),
            )
            results.append(result)

            if not result.success and stop_on_failure:
                logger.error(f"批量回滚因任务失败而终止: {task.task_id}")
                break

        return results

    def _execute_group_parallel(
        self,
        group: List[RollbackTask],
        dry_run: bool,
        failed_task_ids: Set[str],
        skipped_tasks: Dict[str, str],
        on_progress: Optional[Callable[[ExecutionProgress], None]],
        batch_progress: ExecutionProgress,
        total_tasks: int,
    ) -> List[RollbackResult]:
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_to_task = {
                executor.submit(
                    self._handle_task_execution,
                    task,
                    dry_run,
                    failed_task_ids,
                    skipped_tasks,
                    on_progress,
                    batch_progress,
                    total_tasks,
                    idx,
                    len(group),
                ): task
                for idx, task in enumerate(group)
            }

            ordered_results: List[Optional[RollbackResult]] = [None] * len(group)
            task_to_index = {task.task_id: idx for idx, task in enumerate(group)}

            for future in as_completed(future_to_task):
                task = future_to_task[future]
                try:
                    result = future.result()
                except Exception as e:
                    result = RollbackResult(
                        task=task,
                        status=RollbackStatus.FAILED,
                        error_message=str(e),
                        priority=task.priority,
                    )
                    result.end_time = datetime.now()
                ordered_results[task_to_index[task.task_id]] = result

        for i, result in enumerate(ordered_results):
            if result is None:
                ordered_results[i] = RollbackResult(
                    task=group[i],
                    status=RollbackStatus.FAILED,
                    error_message="执行结果丢失",
                    priority=group[i].priority,
                )
                ordered_results[i].end_time = datetime.now()

        return ordered_results

    def _handle_task_execution(
        self,
        task: RollbackTask,
        dry_run: bool,
        failed_task_ids: Set[str],
        skipped_tasks: Dict[str, str],
        on_progress: Optional[Callable[[ExecutionProgress], None]],
        batch_progress: ExecutionProgress,
        total_tasks: int,
        group_index: int,
        group_size: int,
    ) -> RollbackResult:
        failed_deps = [dep for dep in task.dependencies if dep in failed_task_ids]
        if failed_deps:
            skip_reason = f"依赖任务失败: {', '.join(failed_deps)}"
            logger.warning(f"跳过任务 {task.task_id}: {skip_reason}")
            task.status = RollbackStatus.SKIPPED
            skipped_tasks[task.task_id] = skip_reason
            result = RollbackResult(
                task=task,
                status=RollbackStatus.SKIPPED,
                error_message=skip_reason,
                priority=task.priority,
            )
            result.end_time = datetime.now()
        else:
            result = self._execute_single_task(task, dry_run=dry_run, on_progress=on_progress)

        completed = len([r for r in skipped_tasks if r not in failed_task_ids]) + len(failed_task_ids)
        self._track_progress(
            batch_progress,
            completed + (1 if result.success or result.status == RollbackStatus.SKIPPED else 0),
            total_tasks,
            f"执行任务 {task.task_id}",
            on_progress
        )

        return result

    def _execute_config_version_rollback(
        self,
        task: RollbackTask,
        add_step: Callable,
    ) -> Dict[str, Any]:
        add_step("validate_target", RollbackStatus.RUNNING)

        from configtool.version_db import VersionDB

        db = VersionDB()
        app_id = task.parameters.get("app_id", task.target)
        namespace = task.parameters.get("namespace", "application")
        target_version = int(task.target_version) if task.target_version else None

        add_step("validate_target", RollbackStatus.SUCCESS, {
            "app_id": app_id,
            "namespace": namespace,
            "target_version": target_version,
        })

        add_step("fetch_target_version", RollbackStatus.RUNNING)
        version_data = db.get_config_version(app_id, namespace, target_version)
        if not version_data:
            add_step("fetch_target_version", RollbackStatus.FAILED, error="目标版本不存在")
            raise RollbackError(f"目标版本不存在: {target_version}")
        add_step("fetch_target_version", RollbackStatus.SUCCESS, {
            "version": target_version,
            "created_at": version_data.get("created_at"),
        })

        expected_config = copy.deepcopy(version_data["config_data"])

        add_step("rollback_config", RollbackStatus.RUNNING)
        from configtool.config_center import get_config_center
        center_type = task.parameters.get("config_center", "apollo")
        center = get_config_center(center_type)
        publish_result = center.publish_config(
            namespace=namespace,
            config_data=expected_config,
            comment=f"回滚到版本 {target_version}",
        )

        failed_items = [
            item for item in publish_result.get("results", [])
            if not item.get("success", False)
        ]
        if failed_items:
            failed_keys = [item["key"] for item in failed_items]
            add_step("rollback_config", RollbackStatus.FAILED, {
                "failed_keys": failed_keys,
                "total_items": publish_result.get("total_items", 0),
                "success_items": publish_result.get("success_items", 0),
            })
            raise RollbackError(
                f"部分配置项发布失败 ({len(failed_items)}/{publish_result.get('total_items', 0)}): "
                f"失败项: {', '.join(failed_keys)}"
            )

        add_step("rollback_config", RollbackStatus.SUCCESS, {
            "total_items": publish_result.get("total_items", 0),
            "success_items": publish_result.get("success_items", 0),
        })

        if self.verify_after_rollback:
            add_step("verify_config", RollbackStatus.RUNNING)
            try:
                actual_config = center.get_config(namespace)
                if actual_config is None:
                    actual_config = {}
                diffs = deep_diff(expected_config, actual_config)
                if diffs:
                    diff_keys = [d[0] for d in diffs]
                    add_step("verify_config", RollbackStatus.FAILED, {
                        "unmatched_keys": diff_keys,
                        "diff_count": len(diffs),
                    })
                    raise RollbackError(
                        f"回滚后配置校验失败，{len(diffs)}处配置项未生效: "
                        f"{', '.join(diff_keys[:10])}"
                    )
                add_step("verify_config", RollbackStatus.SUCCESS, {"verified": True})
            except RollbackError:
                raise
            except Exception as e:
                add_step("verify_config", RollbackStatus.FAILED, error=str(e))
                logger.warning(f"回滚后配置校验异常: {e}")

        add_step("record_new_version", RollbackStatus.RUNNING)
        new_version = db.save_config_version(
            app_id=app_id,
            namespace=namespace,
            config_data=expected_config,
            operator=task.parameters.get("operator", "system"),
            change_type="rollback",
            description=f"回滚到版本 {target_version}",
        )
        add_step("record_new_version", RollbackStatus.SUCCESS, {"new_version": new_version})

        return {
            "target_version": target_version,
            "new_version": new_version,
            "config_data": expected_config,
        }

    def _execute_config_center_rollback(
        self,
        task: RollbackTask,
        add_step: Callable,
    ) -> Dict[str, Any]:
        add_step("validate_params", RollbackStatus.RUNNING)
        namespace = task.parameters.get("namespace", "application")
        target_env = task.parameters.get("target_env", task.target)
        source_env = task.parameters.get("source_env")
        add_step("validate_params", RollbackStatus.SUCCESS, {
            "namespace": namespace,
            "target_env": target_env,
            "source_env": source_env,
        })

        add_step("fetch_source_config", RollbackStatus.RUNNING)
        from configtool.config_center import get_config_center
        source_center = get_config_center(task.parameters.get("config_center", "apollo"), source_env)
        source_config = source_center.get_config(namespace)
        if source_config is None:
            add_step("fetch_source_config", RollbackStatus.FAILED, error="源环境配置为空")
            raise RollbackError(f"源环境 {source_env} 配置获取失败或为空")
        add_step("fetch_source_config", RollbackStatus.SUCCESS)

        expected_config = copy.deepcopy(source_config)

        add_step("apply_to_target", RollbackStatus.RUNNING)
        target_center = get_config_center(task.parameters.get("config_center", "apollo"), target_env)
        publish_result = target_center.publish_config(
            namespace=namespace,
            config_data=expected_config,
            comment=task.description or f"从环境 {source_env} 同步配置",
        )

        failed_items = [
            item for item in publish_result.get("results", [])
            if not item.get("success", False)
        ]
        if failed_items:
            failed_keys = [item["key"] for item in failed_items]
            add_step("apply_to_target", RollbackStatus.FAILED, {
                "failed_keys": failed_keys,
            })
            raise RollbackError(
                f"部分配置项同步失败 ({len(failed_items)}/{publish_result.get('total_items', 0)}): "
                f"失败项: {', '.join(failed_keys)}"
            )

        add_step("apply_to_target", RollbackStatus.SUCCESS, publish_result)

        if self.verify_after_rollback:
            add_step("verify_sync", RollbackStatus.RUNNING)
            try:
                actual_config = target_center.get_config(namespace)
                if actual_config is None:
                    actual_config = {}
                diffs = deep_diff(expected_config, actual_config)
                if diffs:
                    diff_keys = [d[0] for d in diffs]
                    add_step("verify_sync", RollbackStatus.FAILED, {
                        "unmatched_keys": diff_keys,
                        "diff_count": len(diffs),
                    })
                    raise RollbackError(
                        f"同步后配置校验失败，{len(diffs)}处配置项未生效: "
                        f"{', '.join(diff_keys[:10])}"
                    )
                add_step("verify_sync", RollbackStatus.SUCCESS, {"verified": True})
            except RollbackError:
                raise
            except Exception as e:
                add_step("verify_sync", RollbackStatus.FAILED, error=str(e))
                logger.warning(f"同步后配置校验异常: {e}")

        return {
            "source_env": source_env,
            "target_env": target_env,
            "namespace": namespace,
            "config_data": expected_config,
        }

    def _execute_remote_service_rollback(
        self,
        task: RollbackTask,
        add_step: Callable,
    ) -> Dict[str, Any]:
        add_step("validate_remote_params", RollbackStatus.RUNNING)
        service_url = task.parameters.get("service_url", task.target)
        rollback_endpoint = task.parameters.get("endpoint", "/api/rollback")
        request_timeout = task.parameters.get("timeout", 60)
        add_step("validate_remote_params", RollbackStatus.SUCCESS, {
            "service_url": service_url,
            "endpoint": rollback_endpoint,
            "timeout": request_timeout,
        })

        add_step("invoke_remote_rollback", RollbackStatus.RUNNING)
        from configtool.remote import RemoteClient
        client = RemoteClient(timeout=request_timeout)
        try:
            response = client.post(
                url=f"{service_url}{rollback_endpoint}",
                json_data={
                    "version": task.target_version,
                    "task_id": task.task_id,
                    **task.parameters.get("extra_data", {}),
                },
            )

            if not response.success:
                error_detail = response.error or f"HTTP {response.status_code}"
                add_step("invoke_remote_rollback", RollbackStatus.FAILED, {
                    "status_code": response.status_code,
                    "error": error_detail,
                })
                raise RollbackError(
                    f"远程回滚接口调用失败: {error_detail}"
                )

            add_step("invoke_remote_rollback", RollbackStatus.SUCCESS, {
                "status_code": response.status_code,
                "elapsed": response.elapsed,
            })
        finally:
            client.close()

        return {
            "service_url": service_url,
            "target_version": task.target_version,
            "response_status": response.status_code,
        }

    def _execute_database_rollback(
        self,
        task: RollbackTask,
        add_step: Callable,
    ) -> Dict[str, Any]:
        add_step("validate_db_params", RollbackStatus.RUNNING)
        sql_file = task.parameters.get("sql_file")
        backup_file = task.parameters.get("backup_file")
        add_step("validate_db_params", RollbackStatus.SUCCESS, {
            "sql_file": sql_file,
            "backup_file": backup_file,
        })

        if backup_file:
            add_step("restore_from_backup", RollbackStatus.RUNNING)
            restore_result = self._restore_database_backup(backup_file, task.parameters)
            add_step("restore_from_backup", RollbackStatus.SUCCESS, restore_result)
        elif sql_file:
            add_step("execute_rollback_sql", RollbackStatus.RUNNING)
            sql_result = self._execute_sql_file(sql_file, task.parameters)
            add_step("execute_rollback_sql", RollbackStatus.SUCCESS, sql_result)
        else:
            raise RollbackError("必须指定 sql_file 或 backup_file")

        return {"target": task.target, "target_version": task.target_version}

    def _execute_file_rollback(
        self,
        task: RollbackTask,
        add_step: Callable,
    ) -> Dict[str, Any]:
        import shutil
        from pathlib import Path

        add_step("validate_file_params", RollbackStatus.RUNNING)
        target_file = Path(task.target)
        backup_file = Path(task.parameters.get("backup_file", f"{task.target}.bak"))
        add_step("validate_file_params", RollbackStatus.SUCCESS, {
            "target_file": str(target_file),
            "backup_file": str(backup_file),
        })

        if not backup_file.exists():
            raise RollbackError(f"备份文件不存在: {backup_file}")

        add_step("backup_current", RollbackStatus.RUNNING)
        if target_file.exists():
            rollback_bak = Path(f"{task.target}.rollback_{int(time.time())}")
            shutil.copy2(target_file, rollback_bak)
            add_step("backup_current", RollbackStatus.SUCCESS, {"backup": str(rollback_bak)})
        else:
            add_step("backup_current", RollbackStatus.SUCCESS, {"note": "目标文件不存在，跳过备份"})

        add_step("restore_file", RollbackStatus.RUNNING)
        shutil.copy2(backup_file, target_file)
        add_step("restore_file", RollbackStatus.SUCCESS)

        return {
            "target_file": str(target_file),
            "restored_from": str(backup_file),
        }

    def _restore_database_backup(self, backup_file: str, params: Dict[str, Any]) -> Dict[str, Any]:
        logger.info(f"恢复数据库备份: {backup_file}")
        return {"backup_file": backup_file, "status": "completed"}

    def _execute_sql_file(self, sql_file: str, params: Dict[str, Any]) -> Dict[str, Any]:
        logger.info(f"执行回滚SQL: {sql_file}")
        return {"sql_file": sql_file, "rows_affected": 0}

    def format_result(self, result: RollbackResult, output_format: str = "text") -> str:
        if output_format == "json":
            return json.dumps(result.to_dict(), ensure_ascii=False, indent=2)
        elif output_format == "text":
            return self._format_text_result(result)
        else:
            raise ValueError(f"不支持的输出格式: {output_format}")

    def _format_text_result(self, result: RollbackResult) -> str:
        lines = []
        lines.append(f"回滚任务: {result.task.task_id}")
        lines.append(f"类型: {result.task.rollback_type.value}")
        lines.append(f"目标: {result.task.target}")
        lines.append(f"状态: {result.status.value}")
        lines.append(f"耗时: {result.duration:.2f}s")
        if result.error_message:
            lines.append(f"错误: {result.error_message}")
        lines.append("")
        lines.append("执行步骤:")
        for step in result.rollback_steps:
            status_icon = "✓" if step["status"] == "success" else "✗" if step["status"] == "failed" else "→"
            lines.append(f"  {status_icon} {step['step_name']} - {step['status']}")
            if step.get("error"):
                lines.append(f"      错误: {step['error']}")
        return "\n".join(lines)
