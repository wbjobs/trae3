import click
import json
import sys
import time
from datetime import datetime
from typing import List, Optional
from configtool.utils import get_logger, ConfigToolError
from configtool.log_exporter import LogExporter, LogLevel

logger = get_logger("cli.logs")


@click.group(help="日志管理命令")
def logs_cmd():
    pass


def _apply_filters(
    exporter: LogExporter,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    level: Optional[str] = None,
    module: Optional[List[str]] = None,
    keyword: Optional[List[str]] = None,
) -> None:
    if start_time:
        st = datetime.strptime(start_time, "%Y-%m-%d %H:%M:%S")
    else:
        st = datetime.min
    if end_time:
        et = datetime.strptime(end_time, "%Y-%m-%d %H:%M:%S")
    else:
        et = datetime.max
    exporter.filter_by_time(st, et)

    if level:
        exporter.filter_by_level(level)

    if module:
        exporter.filter_by_module(list(module))

    if keyword:
        exporter.filter_by_message(list(keyword))


@logs_cmd.command("export", help="导出日志")
@click.option(
    "--input", "-i", "input_path",
    type=click.Path(exists=True, dir_okay=False),
    required=True,
    help="输入日志文件路径",
)
@click.option(
    "--output", "-o", "output_path",
    type=click.Path(dir_okay=False),
    required=True,
    help="输出文件路径",
)
@click.option(
    "--format", "-f",
    type=click.Choice(["text", "json", "csv"]),
    default="text",
    help="输出格式",
)
@click.option(
    "--start-time",
    help="开始时间 (格式: YYYY-MM-DD HH:MM:SS)",
)
@click.option(
    "--end-time",
    help="结束时间 (格式: YYYY-MM-DD HH:MM:SS)",
)
@click.option(
    "--level",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
    help="最低日志级别",
)
@click.option(
    "--module",
    multiple=True,
    help="模块名称过滤（可指定多个）",
)
@click.option(
    "--keyword",
    multiple=True,
    help="消息关键词过滤（可指定多个）",
)
def logs_export(
    input_path, output_path, format, start_time, end_time, level, module, keyword
):
    try:
        exporter = LogExporter()
        exporter.load_log_file(input_path)

        _apply_filters(exporter, start_time, end_time, level, module, keyword)

        if format == "json":
            count = exporter.export_json(output_path)
        elif format == "csv":
            count = exporter.export_csv(output_path)
        else:
            count = exporter.export_text(output_path)

        click.echo(f"已导出 {count} 条日志到: {output_path}")
        logger.info(f"日志导出完成: {count} 条记录 -> {output_path}")

    except ConfigToolError as e:
        logger.error(f"导出日志失败: {e}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"导出日志异常: {e}")
        sys.exit(1)


@logs_cmd.command("stats", help="统计分析")
@click.option(
    "--input", "-i", "input_path",
    type=click.Path(exists=True, dir_okay=False),
    required=True,
    help="输入日志文件路径",
)
@click.option(
    "--by",
    type=click.Choice(["level", "module", "time"]),
    default="level",
    help="统计维度",
)
def logs_stats(input_path, by):
    try:
        exporter = LogExporter()
        exporter.load_log_file(input_path)
        stats = exporter.get_statistics()

        click.echo("=" * 60)
        click.echo(f"日志统计分析 (总记录数: {stats['total_count']})")
        click.echo("=" * 60)

        if by in ["level", "module", "time"]:
            if by == "level":
                click.echo("\n按级别统计:")
                for lvl in ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]:
                    count = stats["level_stats"].get(lvl, 0)
                    if count > 0:
                        click.echo(f"  {lvl:10s}: {count}")
            elif by == "module":
                click.echo("\n按模块统计:")
                for mod, count in sorted(
                    stats["module_stats"].items(), key=lambda x: x[1], reverse=True
                ):
                    click.echo(f"  {mod:30s}: {count}")
            elif by == "time":
                time_stats = {}
                for entry in exporter.entries:
                    hour_key = entry.timestamp.strftime("%Y-%m-%d %H:00")
                    time_stats[hour_key] = time_stats.get(hour_key, 0) + 1
                click.echo("\n按时间统计（每小时）:")
                for hour in sorted(time_stats.keys()):
                    click.echo(f"  {hour}: {time_stats[hour]}")

        click.echo("\n" + "=" * 60)
        click.echo(json.dumps(stats, ensure_ascii=False, indent=2))

    except ConfigToolError as e:
        logger.error(f"统计分析失败: {e}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"统计分析异常: {e}")
        sys.exit(1)


@logs_cmd.command("tail", help="实时查看")
@click.option(
    "--input", "-i", "input_path",
    type=click.Path(exists=True, dir_okay=False),
    required=True,
    help="输入日志文件路径",
)
@click.option(
    "--lines", "-n",
    type=int,
    default=10,
    help="显示最后 N 行",
)
@click.option(
    "--follow", "-f",
    is_flag=True,
    help="持续跟踪日志更新",
)
@click.option(
    "--filter",
    multiple=True,
    help="过滤关键词（可指定多个）",
)
def logs_tail(input_path, lines, follow, filter):
    try:
        with open(input_path, "r", encoding="utf-8") as f:
            all_lines = f.readlines()
            last_lines = all_lines[-lines:] if lines < len(all_lines) else all_lines

            for line in last_lines:
                line = line.rstrip("\n")
                if not filter or all(k in line for k in filter):
                    click.echo(line)

            if follow:
                f.seek(0, 2)
                click.echo("\n--- 正在跟踪日志，按 Ctrl+C 退出 ---")
                try:
                    while True:
                        line = f.readline()
                        if not line:
                            time.sleep(0.1)
                            continue
                        line = line.rstrip("\n")
                        if not filter or all(k in line for k in filter):
                            click.echo(line)
                except KeyboardInterrupt:
                    click.echo("\n已停止跟踪")

    except ConfigToolError as e:
        logger.error(f"查看日志失败: {e}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"查看日志异常: {e}")
        sys.exit(1)
