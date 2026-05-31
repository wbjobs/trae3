import click
import json
import sys
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from cache_toolkit.config import ConfigManager
from cache_toolkit.core.task_queue import TaskQueue, TaskType, TaskStatus, get_task_queue
from cache_toolkit.core.migrator import Migrator
from cache_toolkit.core.inspector import Inspector
from cache_toolkit.commands.base import pass_cli_ctx

console = Console()


@click.group()
def task():
    """任务管理命令"""
    pass


@task.command("submit")
@click.argument("task_type", type=click.Choice(["migration", "inspection", "cleanup"]))
@click.option("--cluster", "-C", required=True, help="集群名称")
@click.option("--source", "-s", help="源节点ID (迁移任务)")
@click.option("--target", "-t", help="目标节点ID (迁移任务)")
@click.option("--pattern", "-p", default="*", help="键模式匹配")
@click.option("--priority", "-P", type=int, default=5, help="优先级(1-10)")
@click.option("--params-json", default=None, help="JSON格式额外参数")
@pass_cli_ctx
def task_submit(ctx, task_type, cluster, source, target, pattern, priority, params_json):
    """提交任务到队列"""
    queue = get_task_queue()

    task_params = {"pattern": pattern}
    if source:
        task_params["source_node"] = source
    if target:
        task_params["target_node"] = target
    if params_json:
        task_params.update(json.loads(params_json))

    ttype = TaskType(task_type)
    task = queue.add_task(
        task_type=ttype,
        cluster_name=cluster,
        params=task_params,
        priority=priority,
    )

    console.print(f"[green]✓[/green] 任务已提交: [bold]{task.task_id}[/bold]")
    console.print(f"  类型: {task_type}, 集群: {cluster}, 优先级: {priority}")


@task.command("list")
@click.option("--status", "-s", default=None, help="过滤状态")
@click.option("--limit", "-l", default=50, help="显示条数")
@click.option("--all", "-a", is_flag=True, help="包含已完成任务")
@pass_cli_ctx
def task_list(ctx, status, limit, all):
    """列出任务队列"""
    queue = get_task_queue()

    pending = queue.list_queue()
    if status:
        pending = [t for t in pending if t.status.value == status]

    if pending:
        table = Table(title=f"等待中任务 ({len(pending)})")
        table.add_column("ID", style="cyan")
        table.add_column("类型", style="green")
        table.add_column("集群", style="blue")
        table.add_column("状态", style="yellow")
        table.add_column("优先级", style="magenta")
        table.add_column("进度", style="white")
        for t in pending[:limit]:
            table.add_row(
                t.task_id,
                t.task_type.value,
                t.cluster_name,
                t.status.value,
                str(t.priority),
                f"{t.progress:.0%}",
            )
        console.print(table)

    if all:
        completed = queue.list_completed(limit=limit)
        if completed:
            table = Table(title=f"已完成任务 ({len(completed)})")
            table.add_column("ID", style="cyan")
            table.add_column("类型", style="green")
            table.add_column("集群", style="blue")
            table.add_column("状态", style="yellow")
            table.add_column("完成时间", style="white")
            for t in completed[:limit]:
                table.add_row(
                    t.task_id,
                    t.task_type.value,
                    t.cluster_name,
                    t.status.value,
                    t.completed_at or "-",
                )
            console.print(table)


@task.command("show")
@click.argument("task_id")
@pass_cli_ctx
def task_show(ctx, task_id):
    """查看任务详情"""
    queue = get_task_queue()
    task = queue.get_task(task_id)
    if not task:
        console.print(f"[red]✗[/red] 任务不存在: {task_id}")
        return

    status_style = {"completed": "green", "running": "blue", "failed": "red", "pending": "yellow"}.get(
        task.status.value, "white"
    )

    content = (
        f"[bold]ID:[/bold] {task.task_id}\n"
        f"[bold]类型:[/bold] {task.task_type.value}\n"
        f"[bold]集群:[/bold] {task.cluster_name}\n"
        f"[bold]状态:[/bold] [{status_style}]{task.status.value}[/{status_style}]\n"
        f"[bold]进度:[/bold] {task.progress:.1%}\n"
        f"[bold]重试:[/bold] {task.retry_count}/{task.max_retries}\n"
        f"[bold]创建时间:[/bold] {task.created_at}\n"
    )
    if task.started_at:
        content += f"[bold]开始时间:[/bold] {task.started_at}\n"
    if task.message:
        content += f"[bold]消息:[/bold] {task.message}\n"
    if task.error:
        content += f"[bold red]错误:[/bold red] {task.error}\n"

    console.print(Panel(content, title=f"任务详情: {task_id}", border_style=status_style))

    if task.params:
        console.print("\n[bold]参数:[/bold]")
        console.print(json.dumps(task.params, indent=2, ensure_ascii=False))

    if task.result:
        console.print("\n[bold]结果:[/bold]")
        console.print(json.dumps(task.result, indent=2, ensure_ascii=False))


@task.command("cancel")
@click.argument("task_id")
@pass_cli_ctx
def task_cancel(ctx, task_id):
    """取消等待中任务"""
    queue = get_task_queue()
    if queue.cancel_task(task_id):
        console.print(f"[green]✓[/green] 任务已取消: {task_id}")
    else:
        console.print(f"[red]✗[/red] 无法取消任务: {task_id}")


@task.command("worker")
@click.option("--max-tasks", "-n", type=int, default=0, help="执行N个任务后退出(0=一直运行)")
@click.option("--daemon", "-d", is_flag=True, help="后台运行")
@pass_cli_ctx
def task_worker(ctx, max_tasks, daemon):
    """启动任务执行器"""
    queue = get_task_queue()
    console.print("[bold]任务执行器启动[/bold]")

    executed = 0
    try:
        while True:
            task = queue.get_next_task()
            if task:
                console.print(f"\n执行任务: {task.task_id} ({task.task_type.value})")
                result = _execute_task(ctx, queue, task)
                executed += 1
                if max_tasks and executed >= max_tasks:
                    break
            elif daemon:
                import time
                time.sleep(1)
            else:
                console.print("[yellow]无待执行任务[/yellow]")
                break
    except KeyboardInterrupt:
        console.print("\n[yellow]执行器已停止[/yellow]")


def _execute_task(ctx, queue: TaskQueue, task) -> dict:
    queue.start_task(task.task_id)

    try:
        client = ctx.get_client(task.cluster_name)
        if not client:
            raise Exception(f"无法连接到集群: {task.cluster_name}")

        params = task.params

        if task.task_type == TaskType.MIGRATION:
            migrator = Migrator(client)
            migration_task = migrator.create_task(
                source_node=params.get("source_node", ""),
                target_node=params.get("target_node", ""),
                keys_pattern=params.get("pattern", "*"),
            )

            def progress_cb(t):
                queue.update_progress(task.task_id, t.progress, f"Migrating: {t.migrated_keys}/{t.total_keys}")

            migrator.set_progress_callback(progress_cb)
            migrator.execute_migration(migration_task)
            result = migration_task.to_dict()

        elif task.task_type == TaskType.INSPECTION:
            inspector = Inspector(client)
            result = {
                "health": inspector.health_check(),
                "ttl": inspector.inspect_ttl(pattern=params.get("pattern", "*")),
                "memory": inspector.inspect_memory(pattern=params.get("pattern", "*"), top_n=50),
            }

        else:
            raise Exception(f"不支持的任务类型: {task.task_type}")

        client.close()
        queue.complete_task(task.task_id, result, "Task completed successfully")
        return result

    except Exception as e:
        queue.fail_task(task.task_id, str(e))
        raise
