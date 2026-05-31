import click
import json
import sys
from configtool.utils import get_logger, ConfigToolError, load_yaml, save_yaml
from configtool.config_center import get_config_center
from configtool.whitelist import ConfigWhitelist

logger = get_logger("cli.config")

@click.group(help="配置中心管理命令")
def config_cmd():
    pass

@config_cmd.command("get", help="获取配置")
@click.option(
    "--namespace", "-n",
    default="application",
    help="配置命名空间",
)
@click.option(
    "--key", "-k",
    help="配置项键名（不指定则获取全部）",
)
@click.option(
    "--center-type", "-c",
    type=click.Choice(["apollo", "nacos"]),
    default="apollo",
    help="配置中心类型",
)
@click.option(
    "--env", "-e",
    default="default",
    help="环境名称",
)
@click.option(
    "--output", "-o",
    type=click.Path(dir_okay=False),
    help="将配置保存到文件",
)
@click.option(
    "--format", "-f",
    type=click.Choice(["text", "json", "yaml"]),
    default="json",
    help="输出格式",
)
def config_get(namespace, key, center_type, env, output, format):
    try:
        center = get_config_center(center_type, env)

        if key:
            value = center.get_config(namespace, key)
            click.echo(f"{key} = {value}")
        else:
            config_data = center.get_all_configs(namespace)

            if output:
                if format in ["yaml", "text"] and output.endswith((".yaml", ".yml")):
                    save_yaml(config_data, output)
                else:
                    with open(output, "w", encoding="utf-8") as f:
                        json.dump(config_data, f, ensure_ascii=False, indent=2)
                logger.info(f"配置已保存到: {output}")
            else:
                if format == "yaml":
                    import yaml
                    click.echo(yaml.dump(config_data, default_flow_style=False, allow_unicode=True, sort_keys=False))
                elif format == "json":
                    click.echo(json.dumps(config_data, ensure_ascii=False, indent=2))
                else:
                    for k, v in config_data.items():
                        click.echo(f"{k} = {v}")

    except ConfigToolError as e:
        logger.error(f"获取配置失败: {e}")
        sys.exit(1)

@config_cmd.command("set", help="设置配置项")
@click.option(
    "--namespace", "-n",
    default="application",
    help="配置命名空间",
)
@click.option(
    "--key", "-k",
    required=True,
    help="配置项键名",
)
@click.option(
    "--value", "-v",
    required=True,
    help="配置项值",
)
@click.option(
    "--comment", "-m",
    default="",
    help="变更备注",
)
@click.option(
    "--center-type", "-c",
    type=click.Choice(["apollo", "nacos"]),
    default="apollo",
    help="配置中心类型",
)
@click.option(
    "--env", "-e",
    default="default",
    help="环境名称",
)
def config_set(namespace, key, value, comment, center_type, env):
    try:
        center = get_config_center(center_type, env)
        success = center.update_config(namespace, key, value, comment)

        if success:
            click.echo(f"配置项已更新: {key} = {value}")
        else:
            logger.error("配置项更新失败")
            sys.exit(1)

    except ConfigToolError as e:
        logger.error(f"设置配置失败: {e}")
        sys.exit(1)

@config_cmd.command("publish", help="发布配置")
@click.option(
    "--namespace", "-n",
    default="application",
    help="配置命名空间",
)
@click.option(
    "--file", "-f",
    type=click.Path(exists=True, dir_okay=False),
    required=True,
    help="配置文件路径",
)
@click.option(
    "--comment", "-m",
    default="",
    help="发布备注",
)
@click.option(
    "--center-type", "-c",
    type=click.Choice(["apollo", "nacos"]),
    default="apollo",
    help="配置中心类型",
)
@click.option(
    "--env", "-e",
    default="default",
    help="环境名称",
)
@click.option(
    "--whitelist",
    type=click.Path(exists=True, dir_okay=False),
    help="白名单配置文件路径",
)
def config_publish(namespace, file, comment, center_type, env, whitelist):
    try:
        config_data = load_yaml(file) if file.endswith((".yaml", ".yml")) else json.load(open(file, "r", encoding="utf-8"))

        center = get_config_center(center_type, env)
        wl = ConfigWhitelist.load_from_file(whitelist) if whitelist else None
        result = center.publish_config(namespace, config_data, comment, whitelist=wl)

        click.echo(json.dumps(result, ensure_ascii=False, indent=2))

        if not result.get("success", False):
            sys.exit(1)

    except (ConfigToolError, json.JSONDecodeError) as e:
        logger.error(f"发布配置失败: {e}")
        sys.exit(1)

@config_cmd.command("list", help="列出命名空间")
@click.option(
    "--center-type", "-c",
    type=click.Choice(["apollo", "nacos"]),
    default="apollo",
    help="配置中心类型",
)
@click.option(
    "--env", "-e",
    default="default",
    help="环境名称",
)
def config_list(center_type, env):
    try:
        center = get_config_center(center_type, env)
        namespaces = center.list_namespaces()

        click.echo(f"命名空间列表 ({center_type}/{env}):")
        for ns in namespaces:
            click.echo(f"  - {ns}")

    except ConfigToolError as e:
        logger.error(f"获取命名空间列表失败: {e}")
        sys.exit(1)

@config_cmd.command("history", help="查看发布历史")
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
    default=10,
    help="每页数量",
)
@click.option(
    "--center-type", "-c",
    type=click.Choice(["apollo", "nacos"]),
    default="apollo",
    help="配置中心类型",
)
@click.option(
    "--env", "-e",
    default="default",
    help="环境名称",
)
def config_history(namespace, page, page_size, center_type, env):
    try:
        center = get_config_center(center_type, env)
        history = center.publish_history(namespace, page, page_size)

        click.echo(f"发布历史 ({namespace}):")
        click.echo("=" * 60)

        for idx, item in enumerate(history, 1):
            click.echo(f"#{idx} 版本: {item.get('version', 'N/A')}")
            click.echo(f"  名称: {item.get('name', '')}")
            click.echo(f"  操作人: {item.get('operator', '')}")
            click.echo(f"  时间: {item.get('created_at', '')}")
            if item.get('comment'):
                click.echo(f"  备注: {item['comment']}")
            click.echo("")

    except ConfigToolError as e:
        logger.error(f"获取发布历史失败: {e}")
        sys.exit(1)

@config_cmd.command("sync", help="同步配置到其他环境")
@click.option(
    "--namespace", "-n",
    default="application",
    help="配置命名空间",
)
@click.option(
    "--source-env", "-s",
    required=True,
    help="源环境",
)
@click.option(
    "--target-env", "-t",
    required=True,
    multiple=True,
    help="目标环境（可指定多个）",
)
@click.option(
    "--center-type", "-c",
    type=click.Choice(["apollo", "nacos"]),
    default="apollo",
    help="配置中心类型",
)
@click.option(
    "--dry-run",
    is_flag=True,
    help="试运行模式",
)
def config_sync(namespace, source_env, target_env, center_type, dry_run):
    try:
        source_center = get_config_center(center_type, source_env)
        source_config = source_center.get_all_configs(namespace)

        click.echo(f"从 {source_env} 获取配置，共 {len(source_config)} 个配置项")

        for target in target_env:
            click.echo(f"\n同步到 {target}:")
            if dry_run:
                click.echo("  [DRY RUN] 跳过实际发布")
                continue

            target_center = get_config_center(center_type, target)
            result = target_center.publish_config(
                namespace,
                source_config,
                f"从环境 {source_env} 同步配置",
            )
            if result.get("success", True):
                click.echo("  ✓ 同步成功")
            else:
                click.echo(f"  ✗ 同步失败: {result.get('message', '未知错误')}")
                sys.exit(1)

    except ConfigToolError as e:
        logger.error(f"同步配置失败: {e}")
        sys.exit(1)
