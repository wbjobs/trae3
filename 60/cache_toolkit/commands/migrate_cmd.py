import click
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn, TimeElapsedColumn
from cache_toolkit.config import ConfigManager
from cache_toolkit.core.cache_client import CacheClient
from cache_toolkit.core.migrator import Migrator
from cache_toolkit.utils.logger import get_logger

console = Console()
logger = get_logger()


@click.group()
def migrate():
    """数据迁移命令"""
    pass


def _get_client(cfg: ConfigManager, cluster_name: str):
    cluster_cfg = cfg.get_cluster(cluster_name)
    if not cluster_cfg:
        console.print(f"[red]✗[/red] 集群 [bold]{cluster_name}[/bold] 不存在")
        return None
    client = CacheClient(
        hosts=cluster_cfg["hosts"],
        password=cluster_cfg.get("password"),
    )
    try:
        client.connect()
    except Exception as e:
        console.print(f"[red]✗[/red] 连接失败: {e}")
        client.close()
        return None
    return client


@migrate.command("dry-run")
@click.argument("cluster_name")
@click.option("--source", "-s", required=True, help="源节点ID")
@click.option("--pattern", "-p", default="*", help="键模式匹配")
@click.pass_context
def migrate_dry_run(ctx, cluster_name, source, pattern):
    """迁移预演（不实际执行）"""
    cfg = ctx.obj
    client = _get_client(cfg, cluster_name)
    if not client:
        return

    try:
        migrator = Migrator(client)
        result = migrator.dry_run(source_node=source, keys_pattern=pattern)
        console.print(Panel(
            f"源节点: {result['source_node']}\n"
            f"匹配模式: {result['pattern']}\n"
            f"待迁移键数: {result['total_keys']}\n"
            f"示例键: {', '.join(result['sample_keys'][:10])}",
            title="迁移预演",
            border_style="yellow",
        ))
    finally:
        client.close()


@migrate.command("run")
@click.argument("cluster_name")
@click.option("--source", "-s", required=True, help="源节点ID")
@click.option("--target", "-t", required=True, help="目标节点ID")
@click.option("--pattern", "-p", default="*", help="键模式匹配")
@click.option("--batch-size", "-b", default=500, help="批量大小")
@click.option("--no-preserve-ttl", is_flag=True, help="不保留TTL")
@click.pass_context
def migrate_run(ctx, cluster_name, source, target, pattern, batch_size, no_preserve_ttl):
    """执行数据迁移"""
    cfg = ctx.obj
    client = _get_client(cfg, cluster_name)
    if not client:
        return

    try:
        migrator = Migrator(client, batch_size=batch_size, preserve_ttl=not no_preserve_ttl)
        task = migrator.create_task(source_node=source, target_node=target, keys_pattern=pattern)

        console.print(f"[bold]开始迁移任务 {task.task_id}[/bold]")
        console.print(f"  源: {source} → 目标: {target}  模式: {pattern}")

        task = migrator.execute_migration(task)

        status_style = "green" if task.status == "completed" else "red" if task.status == "failed" else "yellow"
        console.print(Panel(
            f"[{status_style}]状态: {task.status}[/{status_style}]\n"
            f"总键数: {task.total_keys}\n"
            f"已迁移: {task.migrated_keys}\n"
            f"失败: {task.failed_keys}\n"
            f"进度: {task.progress:.1%}"
            + (f"\n错误: {task.error_message}" if task.error_message else ""),
            title=f"迁移结果: {task.task_id}",
            border_style=status_style,
        ))
    finally:
        client.close()


@migrate.command("keys")
@click.argument("cluster_name")
@click.option("--target", "-t", required=True, help="目标节点ID")
@click.option("--keys-file", "-f", required=True, help="键列表文件路径(每行一个键)")
@click.option("--source", "-s", default=None, help="源节点ID")
@click.pass_context
def migrate_keys(ctx, cluster_name, target, keys_file, source):
    """按键列表迁移"""
    cfg = ctx.obj
    client = _get_client(cfg, cluster_name)
    if not client:
        return

    try:
        with open(keys_file, "r", encoding="utf-8") as f:
            keys = [line.strip() for line in f if line.strip()]

        if not keys:
            console.print("[yellow]键列表为空[/yellow]")
            return

        console.print(f"共 [bold]{len(keys)}[/bold] 个键待迁移")

        migrator = Migrator(client)
        result = migrator.migrate_keys_list(keys=keys, target_node=target, source_node=source)

        console.print(Panel(
            f"状态: {result['status']}\n"
            f"总键数: {result['total_keys']}\n"
            f"已迁移: {result['migrated_keys']}\n"
            f"失败: {result['failed_keys']}\n"
            f"进度: {result['progress']:.1%}",
            title="按键列表迁移结果",
            border_style="green" if result["failed_keys"] == 0 else "yellow",
        ))
    finally:
        client.close()
