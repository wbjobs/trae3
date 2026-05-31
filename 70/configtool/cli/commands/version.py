import click
import json
import sys
from tabulate import tabulate
from configtool.utils import get_logger, ConfigToolError
from configtool.version_db import VersionDB

logger = get_logger("cli.version")

@click.group(help="版本数据库管理命令")
def version_cmd():
    pass

@version_cmd.command("save", help="保存配置版本")
@click.option(
    "--app-id", "-a",
    required=True,
    help="应用ID",
)
@click.option(
    "--namespace", "-n",
    default="application",
    help="配置命名空间",
)
@click.option(
    "--file", "-f",
    type=click.Path(exists=True, dir_okay=False),
    help="配置文件路径",
)
@click.option(
    "--config-data", "-d",
    help="配置数据(JSON格式)",
)
@click.option(
    "--operator", "-o",
    default="cli-user",
    help="操作人",
)
@click.option(
    "--change-type", "-t",
    type=click.Choice(["create", "update", "rollback", "delete"]),
    default="update",
    help="变更类型",
)
@click.option(
    "--description", "-m",
    default="",
    help="变更描述",
)
def version_save(app_id, namespace, file, config_data, operator, change_type, description):
    try:
        if file:
            from configtool.utils import load_yaml
            data = load_yaml(file)
        elif config_data:
            data = json.loads(config_data)
        else:
            raise ConfigToolError("必须指定 --file 或 --config-data")

        with VersionDB() as db:
            version = db.save_config_version(
                app_id=app_id,
                namespace=namespace,
                config_data=data,
                operator=operator,
                change_type=change_type,
                description=description,
            )
            click.echo(f"配置版本已保存: version={version}")

    except (ConfigToolError, json.JSONDecodeError) as e:
        logger.error(f"保存版本失败: {e}")
        sys.exit(1)

@version_cmd.command("get", help="获取配置版本")
@click.option(
    "--app-id", "-a",
    required=True,
    help="应用ID",
)
@click.option(
    "--namespace", "-n",
    default="application",
    help="配置命名空间",
)
@click.option(
    "--version", "-v",
    type=int,
    help="版本号（不指定则获取最新版本）",
)
@click.option(
    "--output", "-o",
    type=click.Path(dir_okay=False),
    help="将配置保存到文件",
)
def version_get(app_id, namespace, version, output):
    try:
        with VersionDB() as db:
            data = db.get_config_version(app_id, namespace, version)

            if not data:
                logger.error(f"未找到配置版本: app={app_id}, namespace={namespace}, version={version}")
                sys.exit(1)

            click.echo(f"版本信息:")
            click.echo(f"  ID: {data['id']}")
            click.echo(f"  版本: {data['version']}")
            click.echo(f"  变更类型: {data['change_type']}")
            click.echo(f"  操作人: {data['operator']}")
            click.echo(f"  创建时间: {data['created_at']}")
            if data.get('description'):
                click.echo(f"  描述: {data['description']}")
            if data.get('diff_summary'):
                click.echo(f"  变更统计: {data['diff_summary']}")
            click.echo("\n配置数据:")
            click.echo(json.dumps(data['config_data'], ensure_ascii=False, indent=2))

            if output:
                from configtool.utils import save_yaml
                save_yaml(data['config_data'], output)
                logger.info(f"配置已保存到: {output}")

    except ConfigToolError as e:
        logger.error(f"获取版本失败: {e}")
        sys.exit(1)

@version_cmd.command("list", help="列出配置版本")
@click.option(
    "--app-id", "-a",
    required=True,
    help="应用ID",
)
@click.option(
    "--namespace", "-n",
    default="application",
    help="配置命名空间",
)
@click.option(
    "--page", "-p",
    type=int,
    default=1,
    help="页码",
)
@click.option(
    "--page-size", "-s",
    type=int,
    default=20,
    help="每页数量",
)
def version_list(app_id, namespace, page, page_size):
    try:
        with VersionDB() as db:
            result = db.list_versions(app_id, namespace, page, page_size)

            click.echo(f"配置版本列表: {app_id}/{namespace}")
            click.echo(f"总计: {result['total']} 个版本，第 {result['page']}/{result['total_pages']} 页")
            click.echo("")

            table_data = []
            headers = ["版本", "变更类型", "操作人", "变更统计", "创建时间", "描述"]
            for item in result['items']:
                diff = item.get('diff_summary') or {}
                diff_str = f"+{diff.get('added',0)} -{diff.get('removed',0)} ~{diff.get('modified',0)}"
                table_data.append([
                    item['version'],
                    item['change_type'],
                    item['operator'],
                    diff_str,
                    item['created_at'][:19] if item['created_at'] else "",
                    (item.get('description', "") or "")[:30],
                ])

            click.echo(tabulate(table_data, headers=headers, tablefmt="grid"))

    except ConfigToolError as e:
        logger.error(f"获取版本列表失败: {e}")
        sys.exit(1)

@version_cmd.command("diff", help="比较两个版本的差异")
@click.option(
    "--app-id", "-a",
    required=True,
    help="应用ID",
)
@click.option(
    "--namespace", "-n",
    default="application",
    help="配置命名空间",
)
@click.option(
    "--from-version", "-f",
    type=int,
    required=True,
    help="起始版本",
)
@click.option(
    "--to-version", "-t",
    type=int,
    help="结束版本（不指定则为最新版本）",
)
@click.option(
    "--format", "-o",
    type=click.Choice(["text", "json", "table"]),
    default="text",
    help="输出格式",
)
def version_diff(app_id, namespace, from_version, to_version, format):
    try:
        with VersionDB() as db:
            diff_result = db.get_version_diff(app_id, namespace, from_version, to_version)

            if format == "json":
                click.echo(json.dumps(diff_result, ensure_ascii=False, indent=2))
            elif format == "table":
                table_data = []
                headers = ["类型", "配置项路径", "旧值", "新值"]
                type_map = {"added": "新增", "removed": "删除", "modified": "修改"}
                for d in diff_result['diffs']:
                    table_data.append([
                        type_map.get(d['change_type'], d['change_type']),
                        d['key_path'],
                        str(d['old_value'])[:30] if d['old_value'] is not None else "-",
                        str(d['new_value'])[:30] if d['new_value'] is not None else "-",
                    ])
                click.echo(tabulate(table_data, headers=headers, tablefmt="grid"))
            else:
                click.echo(f"版本差异: v{diff_result['from_version']} -> v{diff_result['to_version']}")
                click.echo(f"总计 {diff_result['total_diffs']} 处变更")
                click.echo("")
                for d in diff_result['diffs']:
                    if d['change_type'] == 'added':
                        click.echo(f"[+] {d['key_path']}: {d['new_value']}")
                    elif d['change_type'] == 'removed':
                        click.echo(f"[-] {d['key_path']}: {d['old_value']}")
                    elif d['change_type'] == 'modified':
                        click.echo(f"[~] {d['key_path']}:")
                        click.echo(f"    旧值: {d['old_value']}")
                        click.echo(f"    新值: {d['new_value']}")

    except ConfigToolError as e:
        logger.error(f"版本比较失败: {e}")
        sys.exit(1)

@version_cmd.command("changelog", help="查看配置变更日志")
@click.option(
    "--app-id", "-a",
    required=True,
    help="应用ID",
)
@click.option(
    "--namespace", "-n",
    default="application",
    help="配置命名空间",
)
@click.option(
    "--version", "-v",
    type=int,
    help="指定版本（不指定则为全部）",
)
@click.option(
    "--page", "-p",
    type=int,
    default=1,
    help="页码",
)
@click.option(
    "--page-size", "-s",
    type=int,
    default=50,
    help="每页数量",
)
def version_changelog(app_id, namespace, version, page, page_size):
    try:
        with VersionDB() as db:
            result = db.get_change_logs(app_id, namespace, version, page, page_size)

            click.echo(f"配置变更日志: {app_id}/{namespace}")
            click.echo(f"总计: {result['total']} 条记录，第 {result['page']}/{result['total_pages']} 页")
            click.echo("")

            table_data = []
            headers = ["版本", "类型", "配置项路径", "创建时间"]
            type_map = {"added": "新增", "removed": "删除", "modified": "修改"}
            for item in result['items']:
                table_data.append([
                    item['version'],
                    type_map.get(item['change_type'], item['change_type']),
                    item['key_path'],
                    item['created_at'][:19] if item['created_at'] else "",
                ])

            click.echo(tabulate(table_data, headers=headers, tablefmt="grid"))

    except ConfigToolError as e:
        logger.error(f"获取变更日志失败: {e}")
        sys.exit(1)

@version_cmd.command("rollbacks", help="查看回滚记录")
@click.option(
    "--app-id", "-a",
    help="应用ID（可选）",
)
@click.option(
    "--namespace", "-n",
    help="配置命名空间（可选）",
)
@click.option(
    "--page", "-p",
    type=int,
    default=1,
    help="页码",
)
@click.option(
    "--page-size", "-s",
    type=int,
    default=20,
    help="每页数量",
)
def version_rollbacks(app_id, namespace, page, page_size):
    try:
        with VersionDB() as db:
            result = db.list_rollback_records(app_id, namespace, page, page_size)

            click.echo(f"回滚记录")
            if app_id:
                click.echo(f"  应用: {app_id}")
            if namespace:
                click.echo(f"  命名空间: {namespace}")
            click.echo(f"总计: {result['total']} 条记录，第 {result['page']}/{result['total_pages']} 页")
            click.echo("")

            table_data = []
            headers = ["应用", "命名空间", "从版本", "到版本", "操作人", "状态", "原因", "时间"]
            for item in result['items']:
                table_data.append([
                    item['app_id'],
                    item['namespace'],
                    item['from_version'],
                    item['to_version'],
                    item['operator'],
                    item['status'],
                    (item.get('reason', "") or "")[:20],
                    item['created_at'][:19] if item['created_at'] else "",
                ])

            click.echo(tabulate(table_data, headers=headers, tablefmt="grid"))

    except ConfigToolError as e:
        logger.error(f"获取回滚记录失败: {e}")
        sys.exit(1)

@version_cmd.command("check", help="检查数据库连接")
def version_check():
    try:
        with VersionDB() as db:
            if db.check_connection():
                click.echo(click.style("数据库连接正常", fg="green"))
            else:
                click.echo(click.style("数据库连接失败", fg="red"))
                sys.exit(1)
    except ConfigToolError as e:
        logger.error(f"数据库连接检查失败: {e}")
        sys.exit(1)
