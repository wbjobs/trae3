import click
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from cache_toolkit.config import ConfigManager
from cache_toolkit.core.rpc import RpcClient, RpcError
from cache_toolkit.utils.logger import get_logger

console = Console()
logger = get_logger()


@click.group()
def remote():
    """远程调用命令"""
    pass


def _get_rpc_client(cfg: ConfigManager) -> RpcClient:
    rpc_cfg = cfg.get("rpc", {})
    client = RpcClient(
        timeout=rpc_cfg.get("timeout", 30),
        retry_count=rpc_cfg.get("retry_count", 3),
        retry_delay=rpc_cfg.get("retry_delay", 2),
    )
    return client


@remote.command("register")
@click.argument("node_id")
@click.argument("endpoint")
@click.option("--token", default=None, help="认证Token")
@click.pass_context
def remote_register(ctx, node_id, endpoint, token):
    """注册远程节点"""
    cfg = ctx.obj
    client = _get_rpc_client(cfg)
    client.register_node(node_id, endpoint, token)

    rpc_nodes = cfg.get("rpc_nodes", {})
    rpc_nodes[node_id] = {"endpoint": endpoint, "token": token}
    cfg.set("rpc_nodes", rpc_nodes)

    console.print(f"[green]✓[/green] 远程节点 [bold]{node_id}[/bold] 已注册 → {endpoint}")


@remote.command("nodes")
@click.pass_context
def remote_nodes(ctx):
    """列出已注册远程节点"""
    cfg = ctx.obj
    rpc_nodes = cfg.get("rpc_nodes", {})

    if not rpc_nodes:
        console.print("[yellow]暂无注册的远程节点[/yellow]")
        return

    table = Table(title="远程节点列表")
    table.add_column("节点ID", style="cyan")
    table.add_column("端点", style="green")
    table.add_column("认证", style="magenta")
    for nid, info in rpc_nodes.items():
        table.add_row(nid, info.get("endpoint", ""), "是" if info.get("token") else "否")
    console.print(table)


@remote.command("ping")
@click.argument("node_id")
@click.pass_context
def remote_ping(ctx, node_id):
    """测试远程节点连通性"""
    cfg = ctx.obj
    client = _get_rpc_client(cfg)

    rpc_nodes = cfg.get("rpc_nodes", {})
    if node_id in rpc_nodes:
        client.register_node(node_id, rpc_nodes[node_id]["endpoint"], rpc_nodes[node_id].get("token"))

    try:
        result = client.ping(node_id)
        console.print(f"[green]✓[/green] 节点 [bold]{node_id}[/bold] 连通: {result}")
    except RpcError as e:
        console.print(f"[red]✗[/red] 节点 [bold]{node_id}[/bold] 不可达: {e}")
    finally:
        client.close()


@remote.command("inspect")
@click.argument("node_id")
@click.option("--pattern", "-p", default="*", help="键模式匹配")
@click.option("--scan-count", "-n", default=200, help="SCAN批量大小")
@click.pass_context
def remote_inspect(ctx, node_id, pattern, scan_count):
    """远程键巡检"""
    cfg = ctx.obj
    client = _get_rpc_client(cfg)

    rpc_nodes = cfg.get("rpc_nodes", {})
    if node_id in rpc_nodes:
        client.register_node(node_id, rpc_nodes[node_id]["endpoint"], rpc_nodes[node_id].get("token"))

    try:
        result = client.remote_inspect(node_id, pattern=pattern, scan_count=scan_count)
        console.print(Panel(
            f"节点: {node_id}\n"
            f"模式: {pattern}\n"
            f"结果: {result}",
            title="远程巡检结果",
            border_style="cyan",
        ))
    except RpcError as e:
        console.print(f"[red]✗[/red] 远程巡检失败: {e}")
    finally:
        client.close()


@remote.command("migrate")
@click.argument("node_id")
@click.option("--source", "-s", required=True, help="源节点ID")
@click.option("--target", "-t", required=True, help="目标节点ID")
@click.option("--pattern", "-p", default="*", help="键模式匹配")
@click.pass_context
def remote_migrate(ctx, node_id, source, target, pattern):
    """远程触发迁移"""
    cfg = ctx.obj
    client = _get_rpc_client(cfg)

    rpc_nodes = cfg.get("rpc_nodes", {})
    if node_id in rpc_nodes:
        client.register_node(node_id, rpc_nodes[node_id]["endpoint"], rpc_nodes[node_id].get("token"))

    try:
        result = client.remote_migrate(node_id, source=source, target=target, keys_pattern=pattern)
        console.print(Panel(
            f"远程节点: {node_id}\n"
            f"源: {source} → 目标: {target}\n"
            f"结果: {result}",
            title="远程迁移结果",
            border_style="green",
        ))
    except RpcError as e:
        console.print(f"[red]✗[/red] 远程迁移失败: {e}")
    finally:
        client.close()


@remote.command("health")
@click.argument("node_id")
@click.pass_context
def remote_health(ctx, node_id):
    """远程健康检查"""
    cfg = ctx.obj
    client = _get_rpc_client(cfg)

    rpc_nodes = cfg.get("rpc_nodes", {})
    if node_id in rpc_nodes:
        client.register_node(node_id, rpc_nodes[node_id]["endpoint"], rpc_nodes[node_id].get("token"))

    try:
        result = client.remote_health(node_id)
        console.print(Panel(
            str(result),
            title=f"远程健康检查: {node_id}",
            border_style="cyan",
        ))
    except RpcError as e:
        console.print(f"[red]✗[/red] 远程健康检查失败: {e}")
    finally:
        client.close()


@remote.command("batch-ping")
@click.pass_context
def remote_batch_ping(ctx):
    """批量测试所有节点连通性"""
    cfg = ctx.obj
    rpc_nodes = cfg.get("rpc_nodes", {})

    if not rpc_nodes:
        console.print("[yellow]暂无注册的远程节点[/yellow]")
        return

    client = _get_rpc_client(cfg)
    for nid, info in rpc_nodes.items():
        client.register_node(nid, info["endpoint"], info.get("token"))

    try:
        results = client.batch_call(list(rpc_nodes.keys()), "ping")

        table = Table(title="批量连通性测试")
        table.add_column("节点", style="cyan")
        table.add_column("状态", style="green")
        table.add_column("响应", style="white")
        for nid, r in results.items():
            status = "[green]✓[/green]" if r["success"] else "[red]✗[/red]"
            resp = str(r.get("data", r.get("error", "")))
            table.add_row(nid, status, resp)
        console.print(table)
    finally:
        client.close()
