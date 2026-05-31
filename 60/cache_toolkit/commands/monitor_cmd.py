import click
import time
import json
import sys
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.live import Live
from cache_toolkit.config import ConfigManager
from cache_toolkit.core.cache_client import CacheClient
from cache_toolkit.core.ttl_monitor import TTLMonitor, TTLAlertManager
from cache_toolkit.core.scheduler import Scheduler, get_scheduler
from cache_toolkit.core.inspector import Inspector
from cache_toolkit.commands.base import pass_cli_ctx

console = Console()


@click.group()
def monitor():
    """监控与定时任务命令"""
    pass


@monitor.group()
def ttl():
    """TTL过期监控"""
    pass


@ttl.command("check")
@click.argument("cluster_name")
@click.option("--pattern", "-p", default="*", help="键模式匹配")
@click.option("--warning", "-w", type=int, default=300, help="警告阈值(秒)")
@click.option("--critical", "-c", type=int, default=60, help="严重阈值(秒)")
@pass_cli_ctx
def ttl_check(ctx, cluster_name, pattern, warning, critical):
    """检查即将过期的键"""
    client = ctx.get_client(cluster_name)
    if not client:
        console.print(f"[red]✗[/red] 无法连接集群: {cluster_name}")
        return

    monitor = TTLMonitor(client, warning_threshold=warning, critical_threshold=critical)
    result = monitor.check_once(pattern=pattern)
    client.close()

    console.print(Panel(
        f"扫描键数: {result['scanned']}\n"
        f"警告阈值: {warning}s, 严重阈值: {critical}s\n"
        f"即将过期(警告): {result['warning_count']}\n"
        f"即将过期(严重): {result['critical_count']}\n"
        f"已过期: {result['expired_count']}",
        title=f"TTL检查: {cluster_name}",
        border_style="yellow",
    ))

    if result["critical_keys"]:
        table = Table(title="严重即将过期键")
        table.add_column("键", style="red", max_width=40)
        table.add_column("TTL", style="red")
        table.add_column("类型", style="cyan")
        table.add_column("大小", style="magenta")
        for k in result["critical_keys"][:20]:
            table.add_row(k["key"], str(k["ttl"]), k["type"], str(k["size"]))
        console.print(table)

    if result["warning_keys"]:
        table = Table(title="警告即将过期键")
        table.add_column("键", style="yellow", max_width=40)
        table.add_column("TTL", style="yellow")
        table.add_column("类型", style="cyan")
        for k in result["warning_keys"][:20]:
            table.add_row(k["key"], str(k["ttl"]), k["type"])
        console.print(table)


@ttl.command("watch")
@click.argument("cluster_name")
@click.option("--pattern", "-p", default="*", help="键模式匹配")
@click.option("--interval", "-i", type=int, default=60, help="检查间隔(秒)")
@click.option("--warning", "-w", type=int, default=300, help="警告阈值(秒)")
@click.option("--critical", "-c", type=int, default=60, help="严重阈值(秒)")
@pass_cli_ctx
def ttl_watch(ctx, cluster_name, pattern, interval, warning, critical):
    """持续监控TTL"""
    client = ctx.get_client(cluster_name)
    if not client:
        console.print(f"[red]✗[/red] 无法连接集群: {cluster_name}")
        return

    monitor = TTLMonitor(
        client,
        check_interval=interval,
        warning_threshold=warning,
        critical_threshold=critical,
    )
    monitor.add_pattern(pattern)
    alert_mgr = TTLAlertManager(monitor)

    def on_critical(data):
        console.print(f"[bold red]TTL CRITICAL[/bold red] {data['key']} TTL={data['ttl']}s")

    def on_expired(data):
        console.print(f"[bold magenta]TTL EXPIRED[/bold magenta] {data.get('key', 'unknown')}")

    monitor.on_critical(on_critical)
    monitor.on_expired(on_expired)

    console.print(f"[bold]TTL监控启动[/bold] - 集群: {cluster_name}, 间隔: {interval}s")
    console.print("按 Ctrl+C 停止\n")

    try:
        while True:
            result = monitor.check_once()
            console.print(
                f"[{time.strftime('%H:%M:%S')}] "
                f"扫描: {result['scanned']}, "
                f"警告: {result['warning_count']}, "
                f"严重: {result['critical_count']}, "
                f"已过期: {result['expired_count']}"
            )
            time.sleep(interval)
    except KeyboardInterrupt:
        console.print("\n[yellow]监控已停止[/yellow]")
        stats = monitor.stats
        console.print(
            f"统计: 检查{stats.get('checks', 0)}次, "
            f"扫描{stats.get('scanned', 0)}键, "
            f"警告{stats.get('warning', 0)}, "
            f"严重{stats.get('critical', 0)}, "
            f"过期{stats.get('expired', 0)}"
        )
    finally:
        client.close()


@monitor.group()
def schedule():
    """定时任务调度"""
    pass


@schedule.command("add")
@click.argument("task_id")
@click.argument("task_type", type=click.Choice(["health", "inspect", "ttl", "memory"]))
@click.option("--cluster", "-C", required=True, help="集群名称")
@click.option("--interval", "-i", type=int, default=300, help="执行间隔(秒)")
@click.option("--pattern", "-p", default="*", help="键模式匹配")
@pass_cli_ctx
def schedule_add(ctx, task_id, task_type, cluster, interval, pattern):
    """添加定时任务"""
    scheduler = get_scheduler()

    def task_func():
        cfg = ConfigManager()
        client = CacheClient(
            hosts=cfg.get_cluster(cluster)["hosts"],
            password=cfg.get_cluster(cluster).get("password"),
        )
        try:
            client.connect()
            inspector = Inspector(client)

            if task_type == "health":
                return inspector.health_check()
            elif task_type == "ttl":
                return inspector.inspect_ttl(pattern=pattern)
            elif task_type == "memory":
                return inspector.inspect_memory(pattern=pattern)
            elif task_type == "inspect":
                return {
                    "health": inspector.health_check(),
                    "ttl": inspector.inspect_ttl(pattern=pattern),
                    "memory": inspector.inspect_memory(pattern=pattern, top_n=20),
                }
        finally:
            client.close()

    try:
        scheduler.add_task(
            task_id=task_id,
            func=task_func,
            interval=interval,
        )
        console.print(f"[green]✓[/green] 定时任务已添加: {task_id} ({task_type}, 每{interval}秒)")
    except ValueError as e:
        console.print(f"[red]✗[/red] {e}")


@schedule.command("list")
@pass_cli_ctx
def schedule_list(ctx):
    """列出定时任务"""
    scheduler = get_scheduler()
    tasks = scheduler.list_tasks()

    if not tasks:
        console.print("[yellow]暂无定时任务[/yellow]")
        return

    table = Table(title="定时任务列表")
    table.add_column("ID", style="cyan")
    table.add_column("间隔", style="green")
    table.add_column("状态", style="yellow")
    table.add_column("上次执行", style="white")
    table.add_column("成功/失败", style="magenta")
    for t in tasks:
        status = "[green]运行中[/green]" if t.running else "[blue]等待中[/blue]"
        last = t.last_run.strftime("%H:%M:%S") if t.last_run else "-"
        table.add_row(
            t.task_id,
            f"{t.interval}s",
            status,
            last,
            f"{t.success_count}/{t.failure_count}",
        )
    console.print(table)


@schedule.command("remove")
@click.argument("task_id")
@pass_cli_ctx
def schedule_remove(ctx, task_id):
    """移除定时任务"""
    scheduler = get_scheduler()
    if scheduler.remove_task(task_id):
        console.print(f"[green]✓[/green] 定时任务已移除: {task_id}")
    else:
        console.print(f"[red]✗[/red] 任务不存在: {task_id}")


@schedule.command("run")
@click.argument("task_id")
@pass_cli_ctx
def schedule_run(ctx, task_id):
    """立即执行一次定时任务"""
    scheduler = get_scheduler()
    try:
        result = scheduler.run_once(task_id)
        console.print(Panel(
            json.dumps(result, indent=2, ensure_ascii=False),
            title=f"执行结果: {task_id}",
            border_style="green",
        ))
    except Exception as e:
        console.print(f"[red]✗[/red] 执行失败: {e}")


@schedule.command("start")
@pass_cli_ctx
def schedule_start(ctx):
    """启动调度器"""
    scheduler = get_scheduler()
    scheduler.start()
    console.print("[green]✓[/green] 调度器已启动")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        scheduler.stop()
        console.print("\n[yellow]调度器已停止[/yellow]")
