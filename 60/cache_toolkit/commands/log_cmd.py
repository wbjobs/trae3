import click
import sys
from pathlib import Path
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from cache_toolkit.core.log_exporter import LogExporter, LogParser, AuditLog
from cache_toolkit.utils.logger import setup_logger, get_logger, SafeRotatingFileHandler

console = Console()


@click.group()
def log():
    """日志管理命令"""
    pass


@log.command("tail")
@click.option("--file", "-f", required=True, help="日志文件路径")
@click.option("--lines", "-n", type=int, default=50, help="显示行数")
@click.option("--level", "-l", default=None, help="过滤级别")
def log_tail(file, lines, level):
    """查看日志尾部"""
    parser = LogParser(file)
    entries = parser.tail(lines=lines)

    if level:
        entries = [e for e in entries if e["level"] == level.upper()]

    if not entries:
        console.print("[yellow]无匹配日志[/yellow]")
        return

    for entry in entries:
        level_colors = {
            "DEBUG": "dim",
            "INFO": "white",
            "WARNING": "yellow",
            "ERROR": "red",
            "CRITICAL": "bold red",
        }
        color = level_colors.get(entry["level"], "white")
        console.print(
            f"[{color}][{entry['timestamp']}] {entry['level']:7} {entry['name']}[/] - {entry['message']}"
        )


@log.command("export")
@click.option("--file", "-f", required=True, help="源日志文件路径")
@click.option("--output", "-o", required=True, help="输出文件路径")
@click.option("--format", "-F", type=click.Choice(["json", "csv", "text"]), default="json", help="输出格式")
@click.option("--level", "-l", default=None, help="过滤级别")
@click.option("--keyword", "-k", default=None, help="关键词过滤")
@click.option("--start", "-s", default=None, help="开始时间")
@click.option("--end", "-e", default=None, help="结束时间")
@click.option("--limit", "-n", type=int, default=10000, help="最大条数")
def log_export(file, output, format, level, keyword, start, end, limit):
    """导出日志"""
    exporter = LogExporter(file)
    try:
        count = exporter.export(
            output_file=output,
            format=format,
            level=level,
            keyword=keyword,
            start_time=start,
            end_time=end,
            limit=limit,
        )
        console.print(f"[green]✓[/green] 已导出 {count} 条日志到 {output}")
    except Exception as e:
        console.print(f"[red]✗[/red] 导出失败: {e}")


@log.command("filter")
@click.option("--file", "-f", required=True, help="日志文件路径")
@click.option("--level", "-l", default=None, help="过滤级别")
@click.option("--keyword", "-k", default=None, help="关键词过滤")
@click.option("--limit", "-n", type=int, default=100, help="最大条数")
def log_filter(file, level, keyword, limit):
    """过滤并显示日志"""
    parser = LogParser(file)
    entries = parser.filter(level=level, keyword=keyword, limit=limit)

    if not entries:
        console.print("[yellow]无匹配日志[/yellow]")
        return

    level_colors = {
        "DEBUG": "dim",
        "INFO": "white",
        "WARNING": "yellow",
        "ERROR": "red",
        "CRITICAL": "bold red",
    }

    for entry in entries:
        color = level_colors.get(entry["level"], "white")
        console.print(
            f"[{color}][{entry['timestamp']}] {entry['level']:7} {entry['name']}[/] - {entry['message']}"
        )

    console.print(f"\n[dim]共 {len(entries)} 条匹配[/dim]")


@log.command("stats")
@click.option("--file", "-f", required=True, help="日志文件路径")
@click.option("--limit", "-n", type=int, default=10000, help="统计条数")
def log_stats(file, limit):
    """日志统计"""
    parser = LogParser(file)
    entries = parser.filter(limit=limit)

    if not entries:
        console.print("[yellow]无日志[/yellow]")
        return

    level_counts = {}
    for e in entries:
        lvl = e["level"]
        level_counts[lvl] = level_counts.get(lvl, 0) + 1

    console.print(Panel(
        f"总条数: {len(entries)}\n"
        f"INFO: {level_counts.get('INFO', 0)}\n"
        f"WARNING: {level_counts.get('WARNING', 0)}\n"
        f"ERROR: {level_counts.get('ERROR', 0)}",
        title="日志统计",
        border_style="cyan",
    ))


@log.group()
def audit():
    """审计日志"""
    pass


@audit.command("record")
@click.argument("operation")
@click.option("--file", "-f", required=True, help="审计日志文件")
@click.option("--user", "-u", default="system", help="操作用户")
@click.option("--data", "-d", default=None, help="JSON格式数据")
def audit_record(file, operation, user, data):
    """记录审计日志"""
    import json
    audit = AuditLog(file)
    extra = json.loads(data) if data else {}
    ts = audit.log(operation, user=user, **extra)
    console.print(f"[green]✓[/green] 审计记录已保存: {ts}")


@audit.command("list")
@click.option("--file", "-f", required=True, help="审计日志文件")
@click.option("--operation", "-o", default=None, help="操作类型过滤")
@click.option("--user", "-u", default=None, help="用户过滤")
@click.option("--limit", "-n", type=int, default=50, help="显示条数")
def audit_list(file, operation, user, limit):
    """列出审计日志"""
    audit = AuditLog(file)
    entries = audit.read(operation=operation, user=user, limit=limit)

    if not entries:
        console.print("[yellow]无审计日志[/yellow]")
        return

    table = Table(title="审计日志")
    table.add_column("时间", style="cyan")
    table.add_column("操作", style="green")
    table.add_column("用户", style="blue")
    table.add_column("详情", style="white")

    for e in entries:
        details = {k: v for k, v in e.items() if k not in ("timestamp", "operation", "user")}
        table.add_row(
            e.get("timestamp", "")[:19],
            e.get("operation", ""),
            e.get("user", ""),
            str(details)[:60] if details else "-",
        )

    console.print(table)
