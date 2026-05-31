import click
import json
import sys
import time
from datetime import datetime, timedelta
from configtool.utils import get_logger, ConfigToolError, load_yaml, save_yaml
from configtool.scheduler import (
    create_scheduler,
    ScheduleTask,
    ScheduleType,
    ComparisonType,
    DiffAlertConfig,
    AlertType,
    TaskStatus,
    parse_cron,
)

logger = get_logger("cli.schedule")

@click.group(help="定时任务命令")
def schedule_cmd():
    pass

@schedule_cmd.command("list", help="列出所有定时任务")
@click.option(
    "--include-disabled",
    is_flag=True,
    help="包含已禁用的任务",
)
@click.option(
    "--format", "-f",
    type=click.Choice(["text", "json", "table"]),
    default="text",
    help="输出格式",
)
@click.pass_context
def schedule_list(ctx, include_disabled, format):
    try:
        scheduler = create_scheduler()
        tasks = scheduler.list_tasks(include_disabled=include_disabled)
        output = scheduler.format_task_list(tasks, format)
        click.echo(output)
    except ConfigToolError as e:
        logger.error(f"获取任务列表失败: {e}")
        sys.exit(1)

@schedule_cmd.command("add", help="添加定时任务")
@click.option(
    "--name", "-n",
    required=True,
    help="任务名称",
)
@click.option(
    "--task-id",
    default=None,
    help="任务ID（不指定则自动生成）",
)
@click.option(
    "--schedule-type", "-s",
    type=click.Choice(["interval", "cron", "once"]),
    required=True,
    help="调度类型",
)
@click.option(
    "--comparison-type", "-c",
    type=click.Choice(["files", "configs", "version"]),
    required=True,
    help="比较类型",
)
@click.option(
    "--interval",
    type=int,
    default=3600,
    help="间隔秒数（interval类型使用）",
)
@click.option(
    "--cron",
    default="",
    help="Cron表达式（cron类型使用，如 '0 0 * * *'）",
)
@click.option(
    "--run-at",
    default=None,
    help="单次执行时间（once类型使用，格式：YYYY-MM-DD HH:MM:SS）",
)
@click.option(
    "--param", "-p",
    multiple=True,
    help="任务参数，格式 key=value（可多次指定）",
)
@click.option(
    "--alert-enabled/--alert-disabled",
    default=True,
    help="是否启用告警",
)
@click.option(
    "--alert-channel",
    multiple=True,
    default=["log"],
    help="告警通道: log/http/webhook",
)
@click.option(
    "--min-diff-count",
    type=int,
    default=1,
    help="触发告警的最小差异数",
)
@click.option(
    "--disabled",
    is_flag=True,
    help="创建后立即禁用",
)
@click.option(
    "--file",
    type=click.Path(exists=True, dir_okay=False),
    help="从YAML文件加载任务配置",
)
@click.pass_context
def schedule_add(ctx, name, task_id, schedule_type, comparison_type, interval, cron, run_at, param, alert_enabled, alert_channel, min_diff_count, disabled, file):
    try:
        import uuid

        if file:
            config = load_yaml(file)
            name = config.get("name", name)
            task_id = config.get("task_id", task_id)
            schedule_type = config.get("schedule_type", schedule_type)
            comparison_type = config.get("comparison_type", comparison_type)
            interval = config.get("interval", interval)
            cron = config.get("cron", cron)
            run_at = config.get("run_at", run_at)
            params = config.get("parameters", {})
            alert_config = config.get("alert_config", {})
            alert_enabled = alert_config.get("enabled", alert_enabled)
            alert_channel = tuple(alert_config.get("channels", list(alert_channel)))
            min_diff_count = alert_config.get("min_diff_count", min_diff_count)
            disabled = config.get("disabled", disabled)
        else:
            params = {}
            for p in param:
                if "=" in p:
                    k, v = p.split("=", 1)
                    params[k.strip()] = v.strip()

        if not task_id:
            task_id = str(uuid.uuid4())

        run_once_at = None
        if schedule_type == "once":
            if not run_at:
                raise ConfigToolError("once类型必须指定 --run-at")
            try:
                run_once_at = datetime.strptime(run_at, "%Y-%m-%d %H:%M:%S")
            except ValueError:
                raise ConfigToolError("--run-at 格式错误，请使用 YYYY-MM-DD HH:MM:SS")

        alert_config = None
        if alert_enabled:
            alert_config = DiffAlertConfig(
                alert_type=AlertType.LOG,
                enabled=True,
                alert_on_added=True,
                alert_on_removed=True,
                alert_on_modified=True,
                alert_on_type_changed=True,
                min_diff_count=min_diff_count,
                alert_channels=list(alert_channel),
            )

        task = ScheduleTask(
            task_id=task_id,
            name=name,
            schedule_type=ScheduleType(schedule_type),
            comparison_type=ComparisonType(comparison_type),
            parameters=params,
            interval_seconds=interval,
            cron_expression=cron,
            run_once_at=run_once_at,
            enabled=not disabled,
            alert_config=alert_config,
        )

        scheduler = create_scheduler()
        added_task = scheduler.add_task(task)

        click.echo(f"任务已添加: {added_task.name} ({added_task.task_id})")
        if added_task.next_run:
            click.echo(f"下次运行: {added_task.next_run.strftime('%Y-%m-%d %H:%M:%S')}")

    except ConfigToolError as e:
        logger.error(f"添加任务失败: {e}")
        sys.exit(1)

@schedule_cmd.command("remove", help="移除定时任务")
@click.argument("task_id")
@click.pass_context
def schedule_remove(ctx, task_id):
    try:
        scheduler = create_scheduler()
        if scheduler.remove_task(task_id):
            click.echo(f"任务已移除: {task_id}")
        else:
            click.echo(f"任务不存在: {task_id}")
            sys.exit(1)
    except ConfigToolError as e:
        logger.error(f"移除任务失败: {e}")
        sys.exit(1)

@schedule_cmd.command("enable", help="启用定时任务")
@click.argument("task_id")
@click.pass_context
def schedule_enable(ctx, task_id):
    try:
        scheduler = create_scheduler()
        if scheduler.enable_task(task_id):
            task = scheduler.get_task(task_id)
            click.echo(f"任务已启用: {task_id}")
            if task and task.next_run:
                click.echo(f"下次运行: {task.next_run.strftime('%Y-%m-%d %H:%M:%S')}")
        else:
            click.echo(f"任务不存在: {task_id}")
            sys.exit(1)
    except ConfigToolError as e:
        logger.error(f"启用任务失败: {e}")
        sys.exit(1)

@schedule_cmd.command("disable", help="禁用定时任务")
@click.argument("task_id")
@click.pass_context
def schedule_disable(ctx, task_id):
    try:
        scheduler = create_scheduler()
        if scheduler.disable_task(task_id):
            click.echo(f"任务已禁用: {task_id}")
        else:
            click.echo(f"任务不存在: {task_id}")
            sys.exit(1)
    except ConfigToolError as e:
        logger.error(f"禁用任务失败: {e}")
        sys.exit(1)

@schedule_cmd.command("run", help="立即执行任务")
@click.argument("task_id")
@click.option(
    "--format", "-f",
    type=click.Choice(["text", "json"]),
    default="text",
    help="输出格式",
)
@click.pass_context
def schedule_run(ctx, task_id, format):
    try:
        scheduler = create_scheduler()
        result = scheduler.run_task_now(task_id)

        if not result:
            click.echo(f"任务不存在: {task_id}")
            sys.exit(1)

        if format == "json":
            click.echo(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
        else:
            click.echo(f"任务执行结果: {result.status.value}")
            click.echo(f"耗时: {result.duration_seconds:.2f}s")
            click.echo(f"差异数: {result.diff_count}")
            if result.error:
                click.echo(f"错误: {result.error}")
            if result.alerts_triggered:
                click.echo(f"触发告警: {', '.join(result.alerts_triggered)}")

            if result.diff_count > 0:
                diff_result = result.output
                click.echo(f"  新增: {diff_result.get('added_count', 0)}")
                click.echo(f"  删除: {diff_result.get('removed_count', 0)}")
                click.echo(f"  修改: {diff_result.get('modified_count', 0)}")
                click.echo(f"  类型变更: {diff_result.get('type_changed_count', 0)}")

        if not result.success:
            sys.exit(1)

    except ConfigToolError as e:
        logger.error(f"执行任务失败: {e}")
        sys.exit(1)

@schedule_cmd.command("start", help="启动调度器（前台运行）")
@click.option(
    "--tick-interval",
    type=int,
    default=1,
    help="调度器检查间隔（秒）",
)
@click.option(
    "--state-file",
    default="schedule_state.yaml",
    help="状态保存文件",
)
@click.pass_context
def schedule_start(ctx, tick_interval, state_file):
    try:
        scheduler = create_scheduler(tick_interval=tick_interval, state_file=state_file)
        scheduler.load_state()

        tasks = scheduler.list_tasks(include_disabled=True)
        click.echo(f"调度器已启动，共 {len(tasks)} 个任务")
        click.echo("按 Ctrl+C 停止")
        click.echo("")

        for task in tasks:
            status = "启用" if task.enabled else "禁用"
            next_run = task.next_run.strftime("%Y-%m-%d %H:%M:%S") if task.next_run else "-"
            click.echo(f"  [{status}] {task.name} - 下次运行: {next_run}")

        scheduler.start()

        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            click.echo("\n正在停止调度器...")
        finally:
            scheduler.stop()
            click.echo("调度器已停止")

    except ConfigToolError as e:
        logger.error(f"启动调度器失败: {e}")
        sys.exit(1)

@schedule_cmd.command("history", help="查看任务执行历史")
@click.option(
    "--task-id",
    default=None,
    help="指定任务ID（不指定则显示所有）",
)
@click.option(
    "--limit",
    type=int,
    default=20,
    help="显示的记录数",
)
@click.option(
    "--format", "-f",
    type=click.Choice(["text", "json", "table"]),
    default="text",
    help="输出格式",
)
@click.pass_context
def schedule_history(ctx, task_id, limit, format):
    try:
        scheduler = create_scheduler()
        results = scheduler.get_results(task_id=task_id, limit=limit)

        if not results:
            click.echo("暂无执行记录")
            return

        if format == "json":
            click.echo(json.dumps([r.to_dict() for r in results], ensure_ascii=False, indent=2))
        elif format == "table":
            from tabulate import tabulate
            table_data = []
            headers = ["任务ID", "运行时间", "状态", "耗时", "差异数", "告警", "错误"]
            for r in results:
                alerts = ", ".join(r.alerts_triggered) if r.alerts_triggered else "-"
                error = r.error[:30] if r.error else "-"
                table_data.append([
                    r.task_id[:12],
                    r.run_time.strftime("%Y-%m-%d %H:%M:%S"),
                    r.status.value,
                    f"{r.duration_seconds:.2f}s",
                    r.diff_count,
                    alerts,
                    error,
                ])
            click.echo(tabulate(table_data, headers=headers, tablefmt="grid"))
        else:
            for r in results:
                status_icon = "✓" if r.success else "✗"
                click.echo(f"{status_icon} [{r.run_time.strftime('%Y-%m-%d %H:%M:%S')}] {r.task_id[:12]}")
                click.echo(f"  状态: {r.status.value}, 耗时: {r.duration_seconds:.2f}s, 差异: {r.diff_count}")
                if r.error:
                    click.echo(f"  错误: {r.error}")
                if r.alerts_triggered:
                    click.echo(f"  告警: {', '.join(r.alerts_triggered)}")
                click.echo("")

    except ConfigToolError as e:
        logger.error(f"获取历史记录失败: {e}")
        sys.exit(1)

@schedule_cmd.command("parse-cron", help="解析Cron表达式，计算下次运行时间")
@click.argument("expression")
@click.option(
    "--count", "-n",
    type=int,
    default=5,
    help="显示的下次运行次数",
)
@click.pass_context
def schedule_parse_cron(ctx, expression, count):
    try:
        now = datetime.now()
        click.echo(f"当前时间: {now.strftime('%Y-%m-%d %H:%M:%S')}")
        click.echo(f"Cron表达式: {expression}")
        click.echo("")

        current = now
        for i in range(count):
            next_time = parse_cron(expression, current)
            if not next_time:
                break
            click.echo(f"  第{i+1}次: {next_time.strftime('%Y-%m-%d %H:%M:%S')}")
            current = next_time + timedelta(minutes=1)

    except ValueError as e:
        logger.error(f"解析失败: {e}")
        sys.exit(1)

@schedule_cmd.command("example", help="输出任务配置示例")
@click.pass_context
def schedule_example(ctx):
    example = {
        "tasks": [
            {
                "name": "生产与测试环境比对",
                "task_id": "env-diff-prod-test",
                "schedule_type": "cron",
                "cron": "0 */6 * * *",
                "comparison_type": "configs",
                "parameters": {
                    "env1": "prod",
                    "env2": "test",
                    "namespace": "application",
                    "center_type": "apollo",
                    "ignore_keys": ["password", "secret"],
                },
                "alert_config": {
                    "enabled": True,
                    "min_diff_count": 1,
                    "channels": ["log", "http"],
                    "http_url": "https://api.example.com/alert",
                },
                "enabled": True,
            },
            {
                "name": "配置文件完整性检查",
                "task_id": "file-check-daily",
                "schedule_type": "cron",
                "cron": "0 2 * * *",
                "comparison_type": "files",
                "parameters": {
                    "source_file": "config/prod.yaml",
                    "target_file": "config/staging.yaml",
                },
                "alert_config": {
                    "enabled": True,
                    "min_diff_count": 1,
                    "channels": ["log"],
                },
                "enabled": True,
            },
        ]
    }
    import yaml
    click.echo(yaml.dump(example, default_flow_style=False, allow_unicode=True, sort_keys=False))
