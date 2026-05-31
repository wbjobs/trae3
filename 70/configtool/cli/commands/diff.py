import click
import json
import sys
from configtool.utils import get_logger, ConfigToolError
from configtool.config_diff import ConfigComparator
from configtool.whitelist import ConfigWhitelist

logger = get_logger("cli.diff")

@click.group(help="配置比对命令")
def diff_cmd():
    pass

@diff_cmd.command("files", help="比对两个配置文件")
@click.argument("source_file", type=click.Path(exists=True, dir_okay=False))
@click.argument("target_file", type=click.Path(exists=True, dir_okay=False))
@click.option(
    "--format", "-f",
    type=click.Choice(["text", "json", "table"]),
    default="text",
    help="输出格式",
)
@click.option(
    "--output", "-o",
    type=click.Path(dir_okay=False),
    help="将结果输出到文件",
)
@click.option(
    "--ignore-keys",
    multiple=True,
    help="忽略指定的配置项",
)
@click.option(
    "--whitelist",
    type=click.Path(exists=True, dir_okay=False),
    help="白名单配置文件路径",
)
def diff_files(source_file, target_file, format, output, ignore_keys, whitelist):
    try:
        comparator = ConfigComparator(ignore_keys=list(ignore_keys) if ignore_keys else None)
        wl = ConfigWhitelist.load_from_file(whitelist) if whitelist else None
        result = comparator.compare_files(source_file, target_file, whitelist=wl)
        output_text = comparator.format_result(result, format)

        if output:
            with open(output, "w", encoding="utf-8") as f:
                f.write(output_text)
            logger.info(f"结果已保存到: {output}")
        else:
            click.echo(output_text)

        if result.has_changes():
            sys.exit(1)

    except ConfigToolError as e:
        logger.error(f"比对失败: {e}")
        sys.exit(1)

@diff_cmd.command("configs", help="比对两个环境的配置中心配置")
@click.argument("env1")
@click.argument("env2")
@click.option(
    "--namespace", "-n",
    default="application",
    help="配置命名空间",
)
@click.option(
    "--center-type", "-c",
    type=click.Choice(["apollo", "nacos"]),
    default="apollo",
    help="配置中心类型",
)
@click.option(
    "--format", "-f",
    type=click.Choice(["text", "json", "table"]),
    default="text",
    help="输出格式",
)
@click.option(
    "--output", "-o",
    type=click.Path(dir_okay=False),
    help="将结果输出到文件",
)
@click.option(
    "--whitelist",
    type=click.Path(exists=True, dir_okay=False),
    help="白名单配置文件路径",
)
def diff_configs(env1, env2, namespace, center_type, format, output, whitelist):
    try:
        comparator = ConfigComparator()
        wl = ConfigWhitelist.load_from_file(whitelist) if whitelist else None
        result = comparator.compare_env(env1, env2, namespace, center_type, whitelist=wl)
        output_text = comparator.format_result(result, format)

        if output:
            with open(output, "w", encoding="utf-8") as f:
                f.write(output_text)
            logger.info(f"结果已保存到: {output}")
        else:
            click.echo(output_text)

        if result.has_changes():
            sys.exit(1)

    except ConfigToolError as e:
        logger.error(f"比对失败: {e}")
        sys.exit(1)

@diff_cmd.command("version", help="比对当前配置与历史版本")
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
    required=True,
    help="历史版本号",
)
@click.option(
    "--current-file",
    type=click.Path(exists=True, dir_okay=False),
    help="当前配置文件路径（如果不指定则从配置中心获取）",
)
@click.option(
    "--center-type", "-c",
    type=click.Choice(["apollo", "nacos"]),
    default="apollo",
    help="配置中心类型",
)
@click.option(
    "--format", "-f",
    type=click.Choice(["text", "json", "table"]),
    default="text",
    help="输出格式",
)
@click.option(
    "--whitelist",
    type=click.Path(exists=True, dir_okay=False),
    help="白名单配置文件路径",
)
def diff_version(app_id, namespace, version, current_file, center_type, format, whitelist):
    try:
        from configtool.config_center import get_config_center

        if current_file:
            from configtool.utils import load_yaml
            current_config = load_yaml(current_file)
        else:
            center = get_config_center(center_type)
            current_config = center.get_all_configs(namespace)

        comparator = ConfigComparator()
        wl = ConfigWhitelist.load_from_file(whitelist) if whitelist else None
        result = comparator.compare_with_version(
            current_config=current_config,
            version=version,
            app_id=app_id,
            namespace=namespace,
            whitelist=wl,
        )
        click.echo(comparator.format_result(result, format))

        if result.has_changes():
            sys.exit(1)

    except ConfigToolError as e:
        logger.error(f"比对失败: {e}")
        sys.exit(1)
