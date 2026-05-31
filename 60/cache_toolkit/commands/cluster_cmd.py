import click
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from cache_toolkit.config import ConfigManager

console = Console()
pass_config = click.make_pass_decorator(ConfigManager, ensure=True)


@click.group()
def cluster():
    """集群管理命令"""
    pass


@cluster.command("add")
@click.argument("name")
@click.option("--hosts", "-h", required=True, help="节点地址，逗号分隔 (host:port,host:port)")
@click.option("--password", "-p", default=None, help="连接密码")
@pass_config
def cluster_add(cfg, name, hosts, password):
    """添加集群配置"""
    host_list = [h.strip() for h in hosts.split(",") if h.strip()]
    cfg.add_cluster(name, host_list, password)
    console.print(f"[green]✓[/green] 集群 [bold]{name}[/bold] 已添加 ({len(host_list)} 个节点)")


@cluster.command("remove")
@click.argument("name")
@pass_config
def cluster_remove(cfg, name):
    """移除集群配置"""
    if cfg.remove_cluster(name):
        console.print(f"[green]✓[/green] 集群 [bold]{name}[/bold] 已移除")
    else:
        console.print(f"[red]✗[/red] 集群 [bold]{name}[/bold] 不存在")


@cluster.command("list")
@pass_config
def cluster_list(cfg):
    """列出所有集群"""
    clusters = cfg.list_clusters()
    if not clusters:
        console.print("[yellow]暂无集群配置[/yellow]")
        return

    table = Table(title="集群列表")
    table.add_column("名称", style="cyan")
    table.add_column("节点", style="green")
    table.add_column("密码", style="magenta")
    for c in clusters:
        table.add_row(c["name"], ", ".join(c["hosts"]), "是" if c["has_password"] else "否")
    console.print(table)


@cluster.command("info")
@click.argument("name")
@pass_config
def cluster_info(cfg, name):
    """查看集群详细信息"""
    from cache_toolkit.core.cache_client import CacheClient

    cluster_cfg = cfg.get_cluster(name)
    if not cluster_cfg:
        console.print(f"[red]✗[/red] 集群 [bold]{name}[/bold] 不存在")
        return

    client = CacheClient(
        hosts=cluster_cfg["hosts"],
        password=cluster_cfg.get("password"),
    )
    try:
        client.connect()
        info = client.get_cluster_info(name)

        panel_content = f"[bold]集群状态:[/bold] {info.status}\n"
        panel_content += f"[bold]集群模式:[/bold] {'Cluster' if client.is_cluster else 'Standalone'}\n"
        panel_content += f"[bold]节点数:[/bold] {len(info.nodes)} (主: {len(info.get_masters())}, 从: {len(info.get_slaves())})\n"
        if client.is_cluster:
            panel_content += f"[bold]槽位:[/bold] {info.slots_assigned}/{info.slots_total}\n"

        console.print(Panel(panel_content, title=f"集群: {name}", border_style="cyan"))

        if info.nodes:
            table = Table(title="节点列表")
            table.add_column("ID", style="dim", max_width=12)
            table.add_column("地址", style="cyan")
            table.add_column("角色", style="green")
            table.add_column("状态", style="magenta")
            table.add_column("槽位数", style="yellow")
            for node in info.nodes:
                status_style = "green" if node.status.value == "online" else "red"
                table.add_row(
                    node.node_id[:12],
                    node.address,
                    node.role.value,
                    f"[{status_style}]{node.status.value}[/{status_style}]",
                    str(len(node.slots)),
                )
            console.print(table)
    except Exception as e:
        console.print(f"[red]✗[/red] 连接失败: {e}")
    finally:
        client.close()
