import click
import os
import sys
import signal
import atexit
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional
from dotenv import load_dotenv
from configtool.utils import get_logger

logger = get_logger("cli")

@dataclass
class CLIContext:
    verbose: bool = False
    output_format: str = "text"
    output_file: Optional[str] = None
    env_file: str = ".env"
    config: Dict[str, Any] = field(default_factory=dict)
    no_color: bool = False
    quiet: bool = False
    resources: List[Any] = field(default_factory=list)
    exit_code: int = 0

    def add_resource(self, resource: Any, cleanup: Callable[[Any], None] = None) -> None:
        self.resources.append((resource, cleanup))

    def cleanup(self) -> None:
        for resource, cleanup in reversed(self.resources):
            try:
                if cleanup:
                    cleanup(resource)
                elif hasattr(resource, "close"):
                    resource.close()
            except Exception as e:
                logger.debug(f"资源清理失败: {e}")
        self.resources.clear()

    def set_exit_code(self, code: int) -> None:
        self.exit_code = max(self.exit_code, code)

    def log(self, level: str, message: str) -> None:
        if self.quiet and level in ("INFO", "DEBUG"):
            return
        log_fn = getattr(logger, level.lower(), logger.info)
        log_fn(message)

def _load_env(ctx, param, value):
    if value and os.path.exists(value):
        load_dotenv(value)
        logger.info(f"已加载环境变量文件: {value}")
    return value

def _handle_signal(signum, frame):
    logger.info(f"收到信号 {signum}，正在清理...")
    ctx = click.get_current_context()
    if ctx and hasattr(ctx, "obj") and isinstance(ctx.obj, CLIContext):
        ctx.obj.cleanup()
    sys.exit(128 + signum)

def _output_result(ctx: click.Context, result: Any, format_fn: Callable = None) -> None:
    cli_ctx: CLIContext = ctx.obj

    if format_fn:
        output = format_fn(result, cli_ctx.output_format)
    else:
        output = str(result)

    if cli_ctx.output_file:
        with open(cli_ctx.output_file, "w", encoding="utf-8") as f:
            f.write(output)
        cli_ctx.log("INFO", f"结果已保存到: {cli_ctx.output_file}")
    else:
        click.echo(output)

def create_cli() -> click.Group:
    @click.group(
        help="多子模块命令行工具 - 配置管理与运维自动化",
        context_settings={"help_option_names": ["-h", "--help"]},
        invoke_without_command=False,
    )
    @click.option(
        "--env-file",
        type=click.Path(exists=False, dir_okay=False),
        default=".env",
        callback=_load_env,
        help="指定环境变量配置文件路径",
        is_eager=True,
    )
    @click.option(
        "--verbose", "-v",
        is_flag=True,
        help="启用详细日志输出",
    )
    @click.option(
        "--quiet", "-q",
        is_flag=True,
        help="静默模式，仅输出错误信息",
    )
    @click.option(
        "--format", "-f",
        "output_format",
        type=click.Choice(["text", "json", "table", "yaml"]),
        default=None,
        help="全局输出格式，会被子命令的同名选项覆盖",
    )
    @click.option(
        "--output", "-o",
        "output_file",
        type=click.Path(dir_okay=False),
        default=None,
        help="将结果输出到文件",
    )
    @click.option(
        "--no-color",
        is_flag=True,
        help="禁用彩色输出",
    )
    @click.option(
        "--config-file",
        type=click.Path(exists=True, dir_okay=False),
        default=None,
        help="全局配置文件路径（YAML格式）",
    )
    @click.pass_context
    def cli(ctx, env_file, verbose, quiet, output_format, output_file, no_color, config_file):
        try:
            import logging
            from configtool.utils import load_yaml

            context = CLIContext(
                verbose=verbose,
                quiet=quiet,
                output_format=output_format or "text",
                output_file=output_file,
                env_file=env_file,
                no_color=no_color,
            )

            if config_file:
                try:
                    context.config = load_yaml(config_file)
                    logger.info(f"已加载全局配置文件: {config_file}")
                except Exception as e:
                    logger.warning(f"加载全局配置文件失败: {e}")

            if verbose:
                logger.setLevel(logging.DEBUG)
                logger.debug("已启用详细日志模式")

            if no_color:
                os.environ["NO_COLOR"] = "1"

            if quiet:
                logger.setLevel(logging.WARNING)

            ctx.obj = context
            ctx.call_on_close(context.cleanup)
            atexit.register(context.cleanup)

            signal.signal(signal.SIGINT, _handle_signal)
            if hasattr(signal, "SIGTERM"):
                signal.signal(signal.SIGTERM, _handle_signal)

        except Exception as e:
            logger.error(f"CLI初始化失败: {e}")
            sys.exit(1)

    @cli.group("diff", help="配置比对命令")
    def diff_group():
        pass

    @cli.group("rollback", help="批量回滚命令")
    def rollback_group():
        pass

    @cli.group("remote", help="远程调用命令")
    def remote_group():
        pass

    @cli.group("config", help="配置中心管理命令")
    def config_group():
        pass

    @cli.group("version", help="版本数据库管理命令")
    def version_group():
        pass

    @cli.group("logs", help="日志管理命令")
    def logs_group():
        pass

    @cli.group("schedule", help="定时任务命令")
    def schedule_group():
        pass

    from configtool.cli.commands import (
        diff_cmd,
        rollback_cmd,
        remote_cmd,
        config_cmd,
        version_cmd,
        logs_cmd,
        schedule_cmd,
    )

    for subcmd in diff_cmd.commands.values():
        diff_group.add_command(subcmd)

    for subcmd in rollback_cmd.commands.values():
        rollback_group.add_command(subcmd)

    for subcmd in remote_cmd.commands.values():
        remote_group.add_command(subcmd)

    for subcmd in config_cmd.commands.values():
        config_group.add_command(subcmd)

    for subcmd in version_cmd.commands.values():
        version_group.add_command(subcmd)

    for subcmd in logs_cmd.commands.values():
        logs_group.add_command(subcmd)

    for subcmd in schedule_cmd.commands.values():
        schedule_group.add_command(subcmd)

    return cli
