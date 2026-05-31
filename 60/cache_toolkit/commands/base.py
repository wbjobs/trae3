import click
from typing import Optional, Callable, Any
from functools import wraps
from cache_toolkit.config import ConfigManager
from cache_toolkit.core.cache_client import CacheClient, CacheClientError
from cache_toolkit.utils.logger import get_logger, setup_logger, flush_logs

logger = get_logger()


class CLIContext:
    def __init__(self):
        self.config: Optional[ConfigManager] = None
        self._clients: dict = {}
        self._quiet: bool = False
        self._verbose: bool = False
        self._json_output: bool = False

    def get_client(self, cluster_name: str) -> Optional[CacheClient]:
        if cluster_name in self._clients:
            return self._clients[cluster_name]

        cluster_cfg = self.config.get_cluster(cluster_name) if self.config else None
        if not cluster_cfg:
            return None

        try:
            client = CacheClient(
                hosts=cluster_cfg["hosts"],
                password=cluster_cfg.get("password"),
            )
            client.connect()
            self._clients[cluster_name] = client
            return client
        except CacheClientError:
            return None

    def close(self):
        for c in self._clients.values():
            try:
                c.close()
            except Exception:
                pass
        self._clients.clear()
        flush_logs()


pass_cli_ctx = click.make_pass_decorator(CLIContext, ensure=True)


def cluster_option(required: bool = True):
    def decorator(func: Callable) -> Callable:
        @click.option("--cluster", "-C", required=required, help="集群名称")
        @wraps(func)
        def wrapper(*args, **kwargs):
            return func(*args, **kwargs)
        return wrapper
    return decorator


def output_format_option():
    def decorator(func: Callable) -> Callable:
        @click.option("--output", "-o", type=click.Choice(["text", "json", "table"]), default="table", help="输出格式")
        @wraps(func)
        def wrapper(*args, **kwargs):
            return func(*args, **kwargs)
        return wrapper
    return decorator


def quiet_option():
    def decorator(func: Callable) -> Callable:
        @click.option("--quiet", "-q", is_flag=True, help="静默模式")
        @wraps(func)
        def wrapper(*args, **kwargs):
            return func(*args, **kwargs)
        return wrapper
    return decorator


def pattern_option(default: str = "*"):
    def decorator(func: Callable) -> Callable:
        @click.option("--pattern", "-p", default=default, help="键模式匹配")
        @wraps(func)
        def wrapper(*args, **kwargs):
            return func(*args, **kwargs)
        return wrapper
    return decorator


def timeout_option(default: int = 30):
    def decorator(func: Callable) -> Callable:
        @click.option("--timeout", "-t", type=int, default=default, help="超时时间(秒)")
        @wraps(func)
        def wrapper(*args, **kwargs):
            return func(*args, **kwargs)
        return wrapper
    return decorator


def parallel_option():
    def decorator(func: Callable) -> Callable:
        @click.option("--parallel", "-P", type=int, default=1, help="并行数")
        @wraps(func)
        def wrapper(*args, **kwargs):
            return func(*args, **kwargs)
        return wrapper
    return decorator


def with_client(func: Callable) -> Callable:
    @wraps(func)
    @pass_cli_ctx
    def wrapper(ctx: CLIContext, *args, **kwargs):
        cluster_name = kwargs.pop("cluster", None)
        if not cluster_name:
            for arg in args:
                if isinstance(arg, str) and ctx.config and ctx.config.get_cluster(arg):
                    cluster_name = arg
                    break

        if not cluster_name:
            click.echo("Error: cluster name required", err=True)
            ctx.close()
            raise click.Abort()

        client = ctx.get_client(cluster_name)
        if not client:
            click.echo(f"Error: failed to connect to cluster '{cluster_name}'", err=True)
            ctx.close()
            raise click.Abort()

        kwargs["client"] = client
        kwargs["cluster_name"] = cluster_name

        try:
            return func(ctx, *args, **kwargs)
        finally:
            ctx.close()

    return wrapper
