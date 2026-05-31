import click
import json
import sys
from typing import List
from configtool.utils import get_logger, ConfigToolError, load_yaml
from configtool.rollback import RollbackManager, RollbackType, RollbackTask

logger = get_logger("cli.rollback")

@click.group(help="批量回滚命令")
def rollback_cmd():
    pass

@rollback_cmd.command("version", help="回滚配置到指定历史版本")
@click.option(
    "--app-id", "-a",
    required=True,
    help="应用ID",
)
@click.option(
    "--namespace", "-n",
    default="application",
    help="配置命名空间",
)
@click.option(
    "--target-version", "-v",
    type=int,
    required=True,
    help="目标版本号",
)
@click.option(
    "--center-type", "-c",
    type=click.Choice(["apollo", "nacos"]),
    default="apollo",
    help="配置中心类型",
)
@click.option(
    "--operator", "-o",
    default="cli-user",
    help="操作人",
)
@click.option(
    "--reason", "-r",
    default="",
    help="回滚原因",
)
@click.option(
    "--dry-run",
    is_flag=True,
    help="试运行模式，不实际执行回滚",
)
@click.option(
    "--yes", "-y",
    is_flag=True,
    help="跳过确认提示",
)
def rollback_version(app_id, namespace, target_version, center_type, operator, reason, dry_run, yes):
    try:
        manager = RollbackManager()

        task = manager.create_task(
            rollback_type=RollbackType.CONFIG_VERSION,
            target=app_id,
            target_version=str(target_version),
            parameters={
                "app_id": app_id,
                "namespace": namespace,
                "config_center": center_type,
                "operator": operator,
                "reason": reason,
            },
            description=reason or f"回滚配置到版本 {target_version}",
        )

        if not yes:
            click.echo(f"即将执行回滚:")
            click.echo(f"  应用: {app_id}")
            click.echo(f"  命名空间: {namespace}")
            click.echo(f"  目标版本: {target_version}")
            click.echo(f"  操作人: {operator}")
            if reason:
                click.echo(f"  原因: {reason}")
            if dry_run:
                click.echo("  模式: DRY RUN (不实际执行)")
            if not click.confirm("确认执行?", default=False):
                click.echo("已取消")
                return

        result = manager.execute_task(task, dry_run=dry_run)
        click.echo(manager.format_result(result))

        if not result.success:
            sys.exit(1)

    except ConfigToolError as e:
        logger.error(f"回滚失败: {e}")
        sys.exit(1)

@rollback_cmd.command("sync", help="从源环境同步配置到目标环境")
@click.option(
    "--source-env", "-s",
    required=True,
    help="源环境名称",
)
@click.option(
    "--target-env", "-t",
    required=True,
    help="目标环境名称",
)
@click.option(
    "--namespace", "-n",
    default="application",
    help="配置命名空间",
)
@click.option(
    "--center-type", "-c",
    type=click.Choice(["apollo", "nacos"]),
    default="apollo",
    help="配置中心类型",
)
@click.option(
    "--operator", "-o",
    default="cli-user",
    help="操作人",
)
@click.option(
    "--dry-run",
    is_flag=True,
    help="试运行模式",
)
@click.option(
    "--yes", "-y",
    is_flag=True,
    help="跳过确认提示",
)
def rollback_sync(source_env, target_env, namespace, center_type, operator, dry_run, yes):
    try:
        manager = RollbackManager()

        task = manager.create_task(
            rollback_type=RollbackType.CONFIG_CENTER,
            target=target_env,
            parameters={
                "source_env": source_env,
                "target_env": target_env,
                "namespace": namespace,
                "config_center": center_type,
                "operator": operator,
            },
            description=f"从环境 {source_env} 同步配置到 {target_env}",
        )

        if not yes:
            click.echo(f"即将同步配置:")
            click.echo(f"  源环境: {source_env}")
            click.echo(f"  目标环境: {target_env}")
            click.echo(f"  命名空间: {namespace}")
            if dry_run:
                click.echo("  模式: DRY RUN")
            if not click.confirm("确认执行?", default=False):
                click.echo("已取消")
                return

        result = manager.execute_task(task, dry_run=dry_run)
        click.echo(manager.format_result(result))

        if not result.success:
            sys.exit(1)

    except ConfigToolError as e:
        logger.error(f"同步失败: {e}")
        sys.exit(1)

@rollback_cmd.command("batch", help="批量执行回滚任务")
@click.argument("task_file", type=click.Path(exists=True, dir_okay=False))
@click.option(
    "--parallel", "-p",
    is_flag=True,
    help="并行执行",
)
@click.option(
    "--max-workers", "-w",
    type=int,
    default=5,
    help="最大并发数",
)
@click.option(
    "--stop-on-failure",
    is_flag=True,
    help="遇到失败立即停止",
)
@click.option(
    "--dry-run",
    is_flag=True,
    help="试运行模式",
)
@click.option(
    "--format", "-f",
    type=click.Choice(["text", "json"]),
    default="text",
    help="输出格式",
)
def rollback_batch(task_file, parallel, max_workers, stop_on_failure, dry_run, format):
    try:
        task_data = load_yaml(task_file)
        tasks_config = task_data.get("tasks", [])

        if not tasks_config:
            logger.error("任务文件中没有定义任务")
            sys.exit(1)

        manager = RollbackManager(max_workers=max_workers)
        tasks: List[RollbackTask] = []

        type_map = {
            "config_version": RollbackType.CONFIG_VERSION,
            "config_center": RollbackType.CONFIG_CENTER,
            "remote_service": RollbackType.REMOTE_SERVICE,
            "database": RollbackType.DATABASE,
            "file": RollbackType.FILE,
        }

        for tc in tasks_config:
            rollback_type = type_map.get(tc["type"])
            if not rollback_type:
                raise ConfigToolError(f"不支持的回滚类型: {tc['type']}")

            task = manager.create_task(
                rollback_type=rollback_type,
                target=tc["target"],
                target_version=tc.get("target_version"),
                parameters=tc.get("parameters", {}),
                description=tc.get("description", ""),
            )
            tasks.append(task)

        click.echo(f"准备执行 {len(tasks)} 个回滚任务")
        click.echo(f"  并行: {'是' if parallel else '否'}")
        if parallel:
            click.echo(f"  并发数: {max_workers}")
        click.echo(f"  遇到失败: {'立即停止' if stop_on_failure else '继续执行'}")

        if not click.confirm("确认执行?", default=False):
            click.echo("已取消")
            return

        result = manager.execute_batch(
            tasks=tasks,
            parallel=parallel,
            dry_run=dry_run,
            stop_on_failure=stop_on_failure,
        )

        if format == "json":
            click.echo(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
        else:
            click.echo("=" * 60)
            click.echo(f"批量回滚结果: batch_id={result.batch_id}")
            click.echo(f"成功: {result.success_count}/{result.total_count}")
            click.echo(f"耗时: {result.end_time - result.start_time}")
            click.echo("")

            for r in result.results:
                status = "✓" if r.success else "✗"
                click.echo(f"{status} [{r.task.rollback_type.value}] {r.task.target} - {r.status.value}")
                if not r.success and r.error_message:
                    click.echo(f"    错误: {r.error_message}")

        if not result.all_success:
            sys.exit(1)

    except ConfigToolError as e:
        logger.error(f"批量回滚失败: {e}")
        sys.exit(1)

@rollback_cmd.command("remote", help="调用远程服务接口执行回滚")
@click.option(
    "--service-url", "-u",
    required=True,
    help="服务URL",
)
@click.option(
    "--target-version", "-v",
    help="目标版本号",
)
@click.option(
    "--endpoint", "-e",
    default="/api/rollback",
    help="回滚接口路径",
)
@click.option(
    "--timeout", "-t",
    type=int,
    default=30,
    help="请求超时时间(秒)",
)
@click.option(
    "--data", "-d",
    help="额外的请求数据(JSON格式)",
)
@click.option(
    "--dry-run",
    is_flag=True,
    help="试运行模式",
)
def rollback_remote(service_url, target_version, endpoint, timeout, data, dry_run):
    try:
        manager = RollbackManager()

        extra_data = {}
        if data:
            extra_data = json.loads(data)

        task = manager.create_task(
            rollback_type=RollbackType.REMOTE_SERVICE,
            target=service_url,
            target_version=target_version,
            parameters={
                "service_url": service_url,
                "endpoint": endpoint,
                "timeout": timeout,
                "extra_data": extra_data,
            },
            description=f"调用远程服务回滚: {service_url}",
        )

        result = manager.execute_task(task, dry_run=dry_run)
        click.echo(manager.format_result(result))

        if not result.success:
            sys.exit(1)

    except (ConfigToolError, json.JSONDecodeError) as e:
        logger.error(f"远程回滚失败: {e}")
        sys.exit(1)
