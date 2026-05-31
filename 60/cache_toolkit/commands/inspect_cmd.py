import click
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.progress import Progress
from cache_toolkit.config import ConfigManager
from cache_toolkit.core.cache_client import CacheClient
from cache_toolkit.core.inspector import Inspector
from cache_toolkit.utils.logger import get_logger

console = Console()
logger = get_logger()


@click.group()
def inspect():
    """缓存巡检命令"""
    pass


def _get_client_and_inspector(cfg: ConfigManager, cluster_name: str):
    cluster_cfg = cfg.get_cluster(cluster_name)
    if not cluster_cfg:
        console.print(f"[red]✗[/red] 集群 [bold]{cluster_name}[/bold] 不存在")
        return None, None
    client = CacheClient(
        hosts=cluster_cfg["hosts"],
        password=cluster_cfg.get("password"),
    )
    try:
        client.connect()
    except Exception as e:
        console.print(f"[red]✗[/red] 连接失败: {e}")
        client.close()
        return None, None
    return client, Inspector(client)


@inspect.command("health")
@click.argument("cluster_name")
@click.pass_context
def inspect_health(ctx, cluster_name):
    """集群健康检查"""
    cfg = ctx.obj
    client, inspector = _get_client_and_inspector(cfg, cluster_name)
    if not inspector:
        return

    try:
        result = inspector.health_check()
        status_style = "green" if result["healthy"] else "red"
        status_icon = "✓" if result["healthy"] else "✗"

        console.print(Panel(
            f"[{status_style}]{status_icon} 状态: {result['status']}[/{status_style}]\n"
            f"节点: {result.get('total_nodes', 0)} (在线: {result.get('online_nodes', 0)}, 离线: {result.get('offline_nodes', 0)})\n"
            f"主节点: {result.get('masters', 0)}, 从节点: {result.get('slaves', 0)}\n"
            f"槽位: {result.get('slots_assigned', 0)}/{result.get('slots_total', 0)}",
            title=f"健康检查: {cluster_name}",
            border_style=status_style,
        ))

        if result.get("warnings"):
            console.print("\n[bold yellow]⚠ 警告:[/bold yellow]")
            for w in result["warnings"]:
                console.print(f"  • {w}")
    finally:
        client.close()


@inspect.command("keys")
@click.argument("cluster_name")
@click.option("--pattern", "-p", default="*", help="键模式匹配")
@click.option("--scan-count", "-n", default=200, help="SCAN批量大小")
@click.option("--node", "-N", default=None, help="指定节点ID")
@click.option("--limit", "-l", default=50, help="显示条数")
@click.pass_context
def inspect_keys(ctx, cluster_name, pattern, scan_count, node, limit):
    """扫描键信息"""
    cfg = ctx.obj
    client, inspector = _get_client_and_inspector(cfg, cluster_name)
    if not inspector:
        return

    try:
        with Progress() as progress:
            task = progress.add_task("扫描键中...", total=None)
            keys = inspector.scan_keys(pattern=pattern, scan_count=scan_count, node_id=node)
            progress.update(task, total=len(keys), completed=len(keys))

        stats = inspector.key_stats(keys)
        console.print(Panel(
            f"匹配模式: {pattern}\n"
            f"总键数: {stats['total_keys']}\n"
            f"无TTL键: {stats['keys_no_ttl']}\n"
            f"即将过期(<1h): {stats['keys_expiring_soon']}\n"
            f"类型分布: {stats['types_distribution']}",
            title="键统计",
            border_style="cyan",
        ))

        if keys:
            table = Table(title=f"键列表 (前{limit}条)")
            table.add_column("键", style="cyan", max_width=40)
            table.add_column("类型", style="green")
            table.add_column("TTL", style="yellow")
            table.add_column("大小", style="magenta")
            for k in keys[:limit]:
                ttl_str = str(k.ttl) if k.ttl >= 0 else "永不过期"
                table.add_row(k.key, k.type, ttl_str, str(k.size))
            console.print(table)
    finally:
        client.close()


@inspect.command("ttl")
@click.argument("cluster_name")
@click.option("--pattern", "-p", default="*", help="键模式匹配")
@click.pass_context
def inspect_ttl(ctx, cluster_name, pattern):
    """TTL巡检"""
    cfg = ctx.obj
    client, inspector = _get_client_and_inspector(cfg, cluster_name)
    if not inspector:
        return

    try:
        result = inspector.inspect_ttl(pattern=pattern)
        console.print(Panel(
            f"匹配模式: {result['pattern']}\n"
            f"扫描总数: {result['total_scanned']}\n"
            f"无TTL键: {result['keys_no_ttl']}\n"
            f"1h内过期: {result['keys_expiring_within_1h']}\n"
            f"已过期键: {result['keys_already_expired']}",
            title="TTL巡检结果",
            border_style="yellow",
        ))

        if result["no_ttl_keys_sample"]:
            console.print("[bold]无TTL键示例:[/bold]")
            for k in result["no_ttl_keys_sample"]:
                console.print(f"  • {k}")
    finally:
        client.close()


@inspect.command("memory")
@click.argument("cluster_name")
@click.option("--pattern", "-p", default="*", help="键模式匹配")
@click.option("--top", "-t", default=20, help="显示Top N键")
@click.pass_context
def inspect_memory(ctx, cluster_name, pattern, top):
    """内存巡检"""
    cfg = ctx.obj
    client, inspector = _get_client_and_inspector(cfg, cluster_name)
    if not inspector:
        return

    try:
        result = inspector.inspect_memory(pattern=pattern, top_n=top)
        console.print(Panel(
            f"匹配模式: {result['pattern']}\n"
            f"扫描总数: {result['total_scanned']}\n"
            f"总逻辑大小: {result['total_logical_size']}\n"
            f"平均键大小: {result['avg_key_size']}",
            title="内存巡检结果",
            border_style="magenta",
        ))

        if result["top_keys_by_size"]:
            table = Table(title=f"Top {top} 大键")
            table.add_column("键", style="cyan", max_width=40)
            table.add_column("类型", style="green")
            table.add_column("大小", style="red")
            table.add_column("TTL", style="yellow")
            for k in result["top_keys_by_size"]:
                ttl_str = str(k["ttl"]) if k["ttl"] >= 0 else "永不过期"
                table.add_row(k["key"], k["type"], str(k["size"]), ttl_str)
            console.print(table)
    finally:
        client.close()
