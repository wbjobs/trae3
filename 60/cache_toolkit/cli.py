import click
import atexit
from pathlib import Path
from rich.console import Console
from cache_toolkit.config import ConfigManager
from cache_toolkit.utils.logger import setup_logger
from cache_toolkit.commands.base import CLIContext, pass_cli_ctx
from cache_toolkit.core.task_queue import get_task_queue

console = Console()


@click.group()
@click.option("--config", "-c", default=None, help="配置文件路径")
@click.option("--log-level", "-l", default="INFO", type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR"]))
@click.option("--log-file", default=None, help="日志文件路径")
@click.option("--quiet", "-q", is_flag=True, help="静默模式")
@click.version_option(version="1.1.0", prog_name="cache-toolkit")
@click.pass_context
def cli(ctx, config, log_level, log_file, quiet):
    """缓存集群管理工具 v1.1 - 巡检/迁移/监控/任务队列"""
    setup_logger(level=log_level, log_file=log_file)

    cli_ctx = CLIContext()
    cli_ctx.config = ConfigManager(config_path=config)
    cli_ctx._quiet = quiet
    ctx.obj = cli_ctx

    default_queue_path = Path.home() / ".cache_toolkit" / "tasks.json"
    get_task_queue(persist_path=str(default_queue_path))

    def cleanup():
        cli_ctx.close()

    atexit.register(cleanup)


from cache_toolkit.commands.cluster_cmd import cluster
from cache_toolkit.commands.inspect_cmd import inspect
from cache_toolkit.commands.migrate_cmd import migrate
from cache_toolkit.commands.remote_cmd import remote
from cache_toolkit.commands.task_cmd import task
from cache_toolkit.commands.monitor_cmd import monitor
from cache_toolkit.commands.log_cmd import log

cli.add_command(cluster)
cli.add_command(inspect)
cli.add_command(migrate)
cli.add_command(remote)
cli.add_command(task)
cli.add_command(monitor)
cli.add_command(log)
