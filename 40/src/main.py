import os
import sys
import json
from pathlib import Path
from typing import Optional

import click
from colorama import init, Fore, Style
from dotenv import load_dotenv
from tabulate import tabulate

from . import __version__
from .parser import ConfigParser, ConfigParseError
from .validator import ConfigValidator
from .remote import (
    ConfigCenterFactory, ConfigCenterError,
    ConfigNotFoundError, ConfigCenterTimeoutError,
    ConfigCenterConnectionError
)
from .backup import ConfigBackupManager, ScheduledBackupService, BackupCorruptedError
from .migration import ConfigDiffComparer, MigrationFactory, DiffType

from .core.canary import (
    CanaryReleaseManager, CanaryStatus, CanaryRule, CanaryStrategy,
    build_ip_whitelist_rule, build_label_rule, build_header_rule
)
from .core.audit import get_audit_logger, OperationType, AuditLogEntry
from .core.retry import (
    RetryExecutor, RetryPolicy, BackoffStrategy,
    DeadLetterQueue, retry
)
from .core.executor import BatchExecutor

init(autoreset=True)


class ConfigToolContext:
    def __init__(self):
        self.verbose = False
        self.config_dir = Path(__file__).parent.parent / "config"
        self.parser = ConfigParser()
        self.validator = ConfigValidator()
        self.canary_manager = CanaryReleaseManager()
        self.audit_logger = get_audit_logger("./logs/audit.db")
        self.dlq = DeadLetterQueue()
        
        env_path = self.config_dir / ".env"
        if env_path.exists():
            load_dotenv(env_path)


pass_ctx = click.make_pass_decorator(ConfigToolContext, ensure=True)


@click.group(invoke_without_command=True)
@click.version_option(__version__, '-v', '--version')
@click.option('--verbose', is_flag=True, help='显示详细日志')
@click.option('--config-dir', type=click.Path(), help='配置目录路径')
@pass_ctx
def cli(ctx, verbose, config_dir):
    """微服务集群配置一体化命令行工具
    
    支持配置校验、跨集群迁移、备份管理、差异比对等功能
    """
    ctx.verbose = verbose
    if config_dir:
        ctx.config_dir = Path(config_dir)


@cli.group()
def validate():
    """配置校验相关命令"""
    pass


@validate.command('file')
@click.argument('file_path', type=click.Path(exists=True))
@click.option('--profile', '-p', help='环境配置(dev/test/prod)')
@click.option('--format', '-f', 'output_format', type=click.Choice(['text', 'json']), default='text')
@pass_ctx
def validate_file(ctx, file_path, profile, output_format):
    """校验单个配置文件"""
    try:
        result = ctx.validator.validate_file(file_path, profile)
        
        if output_format == 'json':
            click.echo(json.dumps(result.to_dict(), indent=2, ensure_ascii=False))
        else:
            _print_validation_result(result)
            
        sys.exit(0 if result.is_valid else 1)
        
    except Exception as e:
        click.echo(f"{Fore.RED}校验失败: {str(e)}")
        sys.exit(1)


@validate.command('dir')
@click.argument('dir_path', type=click.Path(exists=True, file_okay=False))
@click.option('--pattern', help='文件名匹配模式(正则表达式)')
@click.option('--profile', '-p', help='环境配置(dev/test/prod)')
@click.option('--fail-fast', is_flag=True, help='遇到错误立即停止')
@click.option('--format', '-f', 'output_format', type=click.Choice(['text', 'json']), default='text')
@pass_ctx
def validate_dir(ctx, dir_path, pattern, profile, fail_fast, output_format):
    """批量校验目录下的配置文件"""
    try:
        result = ctx.validator.validate_directory(dir_path, pattern, profile, fail_fast)
        
        if output_format == 'json':
            click.echo(json.dumps(result.to_dict(), indent=2, ensure_ascii=False))
        else:
            _print_batch_validation_result(result)
            
        sys.exit(0 if result.invalid_files == 0 else 1)
        
    except Exception as e:
        click.echo(f"{Fore.RED}批量校验失败: {str(e)}")
        sys.exit(1)


def _print_validation_result(result):
    status = f"{Fore.GREEN}✓ 通过" if result.is_valid else f"{Fore.RED}✗ 失败"
    click.echo(f"\n{Style.BRIGHT}配置校验结果: {status}{Style.RESET_ALL}")
    click.echo(f"文件: {result.file_path}\n")
    
    if result.errors:
        click.echo(f"{Fore.RED}{Style.BRIGHT}错误 ({len(result.errors)}):")
        for err in result.errors:
            field = f" [{err.get('field', '')}]" if err.get('field') else ""
            click.echo(f"  • {err['message']}{field}")
        click.echo()
    
    if result.warnings:
        click.echo(f"{Fore.YELLOW}{Style.BRIGHT}警告 ({len(result.warnings)}):")
        for warn in result.warnings:
            field = f" [{warn.get('field', '')}]" if warn.get('field') else ""
            click.echo(f"  • {warn['message']}{field}")
        click.echo()


def _print_batch_validation_result(result):
    click.echo(f"\n{Style.BRIGHT}批量校验结果{Style.RESET_ALL}")
    click.echo(f"总计: {result.total_files} 个文件")
    click.echo(f"通过: {Fore.GREEN}{result.valid_files}{Style.RESET_ALL}")
    click.echo(f"失败: {Fore.RED}{result.invalid_files}{Style.RESET_ALL}")
    click.echo(f"通过率: {result.to_dict()['success_rate']}\n")
    
    for r in result.results:
        if not r.is_valid:
            click.echo(f"{Fore.RED}✗ {r.file_path}")
            for err in r.errors[:3]:
                click.echo(f"    {err['message']}")
            if len(r.errors) > 3:
                click.echo(f"    ... 还有 {len(r.errors) - 3} 个错误")
    click.echo()


@cli.group()
def config():
    """配置中心操作命令"""
    pass


@config.command('list')
@click.option('--cluster', '-c', required=True, help='集群名称')
@click.option('--group', '-g', help='配置分组')
@click.option('--namespace', '-n', help='命名空间')
@pass_ctx
def config_list(ctx, cluster, group, namespace):
    """列出配置中心的所有配置"""
    try:
        client = _get_cluster_client(ctx, cluster)
        configs = client.list_all_configs(group, namespace)
        
        table_data = []
        for cfg in configs:
            table_data.append([
                cfg.get('dataId', ''),
                cfg.get('group', ''),
                cfg.get('type', ''),
                cfg.get('tenant', namespace or 'public')
            ])
        
        click.echo(tabulate(table_data, headers=['Data ID', 'Group', 'Type', 'Namespace']))
        click.echo(f"\n共 {len(configs)} 个配置项")
        
    except ConfigCenterTimeoutError as e:
        click.echo(f"{Fore.RED}连接配置中心超时: {str(e)}")
        click.echo(f"{Fore.YELLOW}提示: 请检查网络连接或使用 --timeout 参数调整超时时间")
        sys.exit(1)
    except ConfigCenterConnectionError as e:
        click.echo(f"{Fore.RED}无法连接配置中心: {str(e)}")
        click.echo(f"{Fore.YELLOW}提示: 请检查配置中心地址和网络连接")
        sys.exit(1)
    except ConfigCenterError as e:
        click.echo(f"{Fore.RED}获取配置列表失败: {str(e)}")
        sys.exit(1)
    except Exception as e:
        click.echo(f"{Fore.RED}获取配置列表失败: {str(e)}")
        sys.exit(1)


@config.command('get')
@click.argument('data_id')
@click.option('--cluster', '-c', required=True, help='集群名称')
@click.option('--group', '-g', default='DEFAULT_GROUP', help='配置分组')
@click.option('--namespace', '-n', help='命名空间')
@click.option('--output', '-o', type=click.Path(), help='输出到文件')
@pass_ctx
def config_get(ctx, data_id, cluster, group, namespace, output):
    """获取指定配置内容"""
    try:
        client = _get_cluster_client(ctx, cluster)
        content = client.get_config(data_id, group, namespace)
        
        if content is None:
            click.echo(f"{Fore.YELLOW}配置不存在: {group}/{data_id}")
            sys.exit(1)
        
        if output:
            with open(output, 'w', encoding='utf-8') as f:
                f.write(content)
            click.echo(f"配置已保存到: {output}")
        else:
            click.echo(content)
        
    except Exception as e:
        click.echo(f"{Fore.RED}获取配置失败: {str(e)}")
        sys.exit(1)


@config.command('publish')
@click.argument('data_id')
@click.argument('file_path', type=click.Path(exists=True))
@click.option('--cluster', '-c', required=True, help='集群名称')
@click.option('--group', '-g', default='DEFAULT_GROUP', help='配置分组')
@click.option('--namespace', '-n', help='命名空间')
@click.option('--type', 'config_type', default='yaml', help='配置类型')
@click.option('--desc', help='配置描述')
@pass_ctx
def config_publish(ctx, data_id, file_path, cluster, group, namespace, config_type, desc):
    """发布配置到配置中心"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        client = _get_cluster_client(ctx, cluster)
        success = client.publish_config(data_id, group, content, config_type, namespace, desc or '')
        
        if success:
            click.echo(f"{Fore.GREEN}配置发布成功: {group}/{data_id}")
        else:
            click.echo(f"{Fore.RED}配置发布失败")
            sys.exit(1)
            
    except Exception as e:
        click.echo(f"{Fore.RED}发布配置失败: {str(e)}")
        sys.exit(1)


def _get_cluster_client(ctx, cluster_name):
    clusters_config = ctx.parser.parse_file(str(ctx.config_dir / "clusters" / "clusters.yaml"))
    clusters_config = ctx.parser.resolve_environment_variables(clusters_config)
    
    clusters = clusters_config.get("clusters", {})
    if cluster_name not in clusters:
        raise ValueError(f"集群配置不存在: {cluster_name}")
    
    return ConfigCenterFactory.create_from_cluster_config(clusters[cluster_name])


@cli.group()
def backup():
    """备份管理命令"""
    pass


@backup.command('full')
@click.option('--cluster', '-c', required=True, help='集群名称')
@click.option('--group', '-g', help='配置分组')
@click.option('--namespace', '-n', help='命名空间')
@click.option('--no-compress', is_flag=True, help='不压缩备份')
@pass_ctx
def backup_full(ctx, cluster, group, namespace, no_compress):
    """执行全量备份"""
    try:
        client = _get_cluster_client(ctx, cluster)
        clusters_config = ctx.parser.parse_file(str(ctx.config_dir / "clusters" / "clusters.yaml"))
        backup_path = clusters_config.get("clusters", {}).get(cluster, {}).get("backup_path", f"./backups/{cluster}")
        
        manager = ConfigBackupManager(client, backup_path, cluster)
        result = manager.backup_full(group, namespace, compress=not no_compress)
        
        if result.success:
            click.echo(f"{Fore.GREEN}全量备份完成")
            click.echo(f"备份路径: {result.backup_path}")
            click.echo(f"备份项数: {result.total_items}")
        else:
            click.echo(f"{Fore.RED}备份失败: {result.message}")
            sys.exit(1)
            
    except Exception as e:
        click.echo(f"{Fore.RED}备份失败: {str(e)}")
        sys.exit(1)


@backup.command('incr')
@click.option('--cluster', '-c', required=True, help='集群名称')
@click.option('--group', '-g', help='配置分组')
@click.option('--namespace', '-n', help='命名空间')
@pass_ctx
def backup_incr(ctx, cluster, group, namespace):
    """执行增量备份"""
    try:
        client = _get_cluster_client(ctx, cluster)
        clusters_config = ctx.parser.parse_file(str(ctx.config_dir / "clusters" / "clusters.yaml"))
        backup_path = clusters_config.get("clusters", {}).get(cluster, {}).get("backup_path", f"./backups/{cluster}")
        
        manager = ConfigBackupManager(client, backup_path, cluster)
        result = manager.backup_incremental(group, namespace)
        
        if result.success:
            if result.backup_path:
                click.echo(f"{Fore.GREEN}增量备份完成")
                click.echo(f"备份路径: {result.backup_path}")
                click.echo(f"更新项数: {result.total_items}")
            else:
                click.echo(f"{Fore.YELLOW}{result.message}")
        else:
            click.echo(f"{Fore.RED}增量备份失败: {result.message}")
            sys.exit(1)
            
    except Exception as e:
        click.echo(f"{Fore.RED}增量备份失败: {str(e)}")
        sys.exit(1)


@backup.command('list')
@click.option('--cluster', '-c', required=True, help='集群名称')
@pass_ctx
def backup_list(ctx, cluster):
    """列出备份历史"""
    try:
        client = _get_cluster_client(ctx, cluster)
        clusters_config = ctx.parser.parse_file(str(ctx.config_dir / "clusters" / "clusters.yaml"))
        backup_path = clusters_config.get("clusters", {}).get(cluster, {}).get("backup_path", f"./backups/{cluster}")
        
        manager = ConfigBackupManager(client, backup_path, cluster)
        backups = manager.list_backups()
        
        if not backups:
            click.echo("暂无备份记录")
            return
        
        table_data = []
        for idx, b in enumerate(backups, 1):
            status = f"{Fore.GREEN}✓ 完整" if b.integrity_ok else f"{Fore.RED}✗ 损坏"
            table_data.append([
                idx,
                b.timestamp,
                b.items_count,
                f"{b.size_bytes / 1024:.1f} KB",
                status,
                b.path
            ])
        
        click.echo(tabulate(table_data, headers=['#', '时间', '项数', '大小', '完整性', '路径']))
        
        corrupted = [b for b in backups if not b.integrity_ok]
        if corrupted:
            click.echo(f"\n{Fore.YELLOW}警告: 检测到 {len(corrupted)} 个损坏的备份文件，建议删除并重新备份")
        
    except Exception as e:
        click.echo(f"{Fore.RED}获取备份列表失败: {str(e)}")
        sys.exit(1)


@backup.command('restore')
@click.argument('backup_path', type=click.Path(exists=True))
@click.option('--cluster', '-c', required=True, help='集群名称')
@click.option('--group', '-g', help='配置分组')
@click.option('--namespace', '-n', help='命名空间')
@click.option('--dry-run', is_flag=True, help='预览模式')
@click.confirmation_option(prompt='确认要恢复备份吗？此操作将覆盖现有配置')
@pass_ctx
def backup_restore(ctx, backup_path, cluster, group, namespace, dry_run):
    """从备份恢复配置"""
    try:
        client = _get_cluster_client(ctx, cluster)
        clusters_config = ctx.parser.parse_file(str(ctx.config_dir / "clusters" / "clusters.yaml"))
        backup_root = clusters_config.get("clusters", {}).get(cluster, {}).get("backup_path", f"./backups/{cluster}")
        
        manager = ConfigBackupManager(client, backup_root, cluster)
        result = manager.restore_backup(backup_path, group, namespace, dry_run)
        
        if result.success:
            click.echo(f"{Fore.GREEN}恢复完成")
            click.echo(f"处理项数: {result.total_items}")
            if result.failed_items:
                click.echo(f"{Fore.RED}失败项数: {len(result.failed_items)}")
                for item in result.failed_items[:5]:
                    click.echo(f"  - {item}")
        else:
            click.echo(f"{Fore.RED}恢复失败: {result.message}")
            sys.exit(1)
            
    except BackupCorruptedError as e:
        click.echo(f"{Fore.RED}备份文件损坏: {str(e)}")
        click.echo(f"{Fore.YELLOW}提示: 请使用完整的备份文件，或尝试其他备份版本")
        sys.exit(1)
    except ConfigCenterTimeoutError as e:
        click.echo(f"{Fore.RED}连接配置中心超时: {str(e)}")
        sys.exit(1)
    except ConfigCenterConnectionError as e:
        click.echo(f"{Fore.RED}无法连接配置中心: {str(e)}")
        sys.exit(1)
    except Exception as e:
        click.echo(f"{Fore.RED}恢复失败: {str(e)}")
        sys.exit(1)


@backup.command('schedule')
@pass_ctx
def backup_schedule(ctx):
    """启动定时备份服务"""
    try:
        service = ScheduledBackupService(str(ctx.config_dir / "clusters" / "clusters.yaml"))
        service.start()
    except KeyboardInterrupt:
        service.stop()
    except Exception as e:
        click.echo(f"{Fore.RED}定时备份服务异常: {str(e)}")
        sys.exit(1)


@cli.group()
def migrate():
    """跨集群迁移命令"""
    pass


@migrate.command('diff')
@click.option('--source', '-s', required=True, help='源集群名称')
@click.option('--target', '-t', required=True, help='目标集群名称')
@click.option('--group', '-g', help='配置分组')
@click.option('--namespace', '-n', help='命名空间')
@click.option('--export', type=click.Path(), help='导出报告路径')
@click.option('--format', 'report_format', type=click.Choice(['json', 'html']), default='json')
@pass_ctx
def migrate_diff(ctx, source, target, group, namespace, export, report_format):
    """比较两个集群的配置差异"""
    try:
        migrator = MigrationFactory.create_from_cluster_configs(
            source, target,
            str(ctx.config_dir / "clusters" / "clusters.yaml")
        )
        
        comparer = ConfigDiffComparer()
        diffs = comparer.compare_configs(
            migrator.source_client,
            migrator.target_client,
            group, namespace,
            include_detailed=True
        )
        
        added = len([d for d in diffs if d.diff_type == DiffType.ADDED])
        removed = len([d for d in diffs if d.diff_type == DiffType.REMOVED])
        modified = len([d for d in diffs if d.diff_type == DiffType.MODIFIED])
        unchanged = len([d for d in diffs if d.diff_type == DiffType.UNCHANGED])
        
        click.echo(f"\n{Style.BRIGHT}配置差异汇总{Style.RESET_ALL}")
        click.echo(f"源集群: {source}")
        click.echo(f"目标集群: {target}\n")
        click.echo(f"新增: {Fore.GREEN}{added}{Style.RESET_ALL}")
        click.echo(f"删除: {Fore.RED}{removed}{Style.RESET_ALL}")
        click.echo(f"修改: {Fore.YELLOW}{modified}{Style.RESET_ALL}")
        click.echo(f"未变: {Fore.CYAN}{unchanged}{Style.RESET_ALL}\n")
        
        for diff in diffs:
            if diff.diff_type == DiffType.ADDED:
                click.echo(f"{Fore.GREEN}+ {diff.group}/{diff.data_id}")
            elif diff.diff_type == DiffType.REMOVED:
                click.echo(f"{Fore.RED}- {diff.group}/{diff.data_id}")
            elif diff.diff_type == DiffType.MODIFIED:
                click.echo(f"{Fore.YELLOW}~ {diff.group}/{diff.data_id}")
        
        if export:
            comparer.export_diff_report(diffs, export, report_format)
            click.echo(f"\n报告已导出到: {export}")
        
    except Exception as e:
        click.echo(f"{Fore.RED}差异比较失败: {str(e)}")
        sys.exit(1)


@migrate.command('run')
@click.option('--source', '-s', required=True, help='源集群名称')
@click.option('--target', '-t', required=True, help='目标集群名称')
@click.option('--group', '-g', help='配置分组')
@click.option('--namespace', '-n', help='命名空间')
@click.option('--target-namespace', help='目标命名空间')
@click.option('--data-id', multiple=True, help='指定要迁移的Data ID')
@click.option('--dry-run', is_flag=True, help='预览模式')
@click.option('--no-overwrite', is_flag=True, help='不覆盖已存在的配置')
@click.option('--with-rollback', is_flag=True, help='失败时自动回滚')
@click.confirmation_option(prompt='确认要执行配置迁移吗？')
@pass_ctx
def migrate_run(ctx, source, target, group, namespace, target_namespace, data_id, dry_run, no_overwrite, with_rollback):
    """执行跨集群配置迁移"""
    try:
        migrator = MigrationFactory.create_from_cluster_configs(
            source, target,
            str(ctx.config_dir / "clusters" / "clusters.yaml")
        )
        
        if dry_run:
            click.echo(f"{Fore.CYAN}预览模式 - 不会实际修改目标集群{Style.RESET_ALL}\n")
        
        if with_rollback and not dry_run:
            result = migrator.migrate_with_rollback(group, namespace, target_namespace)
        else:
            data_ids = list(data_id) if data_id else None
            result = migrator.migrate(
                group, namespace, target_namespace,
                data_ids=data_ids,
                dry_run=dry_run,
                overwrite=not no_overwrite
            )
        
        click.echo(f"\n迁移结果:")
        click.echo(f"总计: {result.total_items}")
        click.echo(f"成功: {Fore.GREEN}{result.migrated_items}{Style.RESET_ALL}")
        click.echo(f"失败: {Fore.RED}{len(result.failed_items)}{Style.RESET_ALL}")
        click.echo(f"跳过: {Fore.YELLOW}{len(result.skipped_items)}{Style.RESET_ALL}")
        
        if result.failed_items:
            click.echo(f"\n{Fore.RED}失败项:")
            for item in result.failed_items[:10]:
                click.echo(f"  - {item}")
        
        if not result.success:
            sys.exit(1)
            
    except Exception as e:
        click.echo(f"{Fore.RED}迁移失败: {str(e)}")
        sys.exit(1)


@cli.command('convert')
@click.argument('input_file', type=click.Path(exists=True))
@click.option('--format', '-f', 'output_format', required=True, type=click.Choice(['yaml', 'json', 'properties']))
@click.option('--output', '-o', type=click.Path(), help='输出文件路径')
@pass_ctx
def convert(ctx, input_file, output_format, output):
    """配置格式转换"""
    try:
        config = ctx.parser.parse_file(input_file)
        result = ctx.parser.to_format(config, output_format)
        
        if output:
            with open(output, 'w', encoding='utf-8') as f:
                f.write(result)
            click.echo(f"{Fore.GREEN}转换完成，已保存到: {output}")
        else:
            click.echo(result)
            
    except Exception as e:
        click.echo(f"{Fore.RED}转换失败: {str(e)}")
        sys.exit(1)


@cli.group()
def canary():
    """灰度发布管理命令"""
    pass


@canary.command('create')
@click.argument('data_id')
@click.argument('file_path', type=click.Path(exists=True))
@click.option('--cluster', '-c', required=True, help='集群名称')
@click.option('--group', '-g', default='DEFAULT_GROUP', help='配置分组')
@click.option('--namespace', '-n', help='命名空间')
@click.option('--type', 'config_type', default='yaml', help='配置类型')
@click.option('--percentage', '-p', type=int, default=10, help='流量百分比')
@click.option('--ip-whitelist', multiple=True, help='IP白名单')
@click.option('--label', multiple=True, help='标签匹配，格式: key=value')
@click.option('--header', multiple=True, help='Header匹配，格式: key=value')
@click.option('--operator', default='cli', help='操作人')
@pass_ctx
def canary_create(ctx, data_id, file_path, cluster, group, namespace, config_type,
                  percentage, ip_whitelist, label, header, operator):
    """创建灰度发布"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            new_content = f.read()
        
        client = _get_cluster_client(ctx, cluster)
        old_content = client.get_config(data_id, group, namespace)
        
        rules = []
        if ip_whitelist:
            rules.append(build_ip_whitelist_rule(list(ip_whitelist)))
        if label:
            labels = dict(kv.split('=', 1) for kv in label)
            rules.append(build_label_rule(labels))
        if header:
            headers = dict(kv.split('=', 1) for kv in header)
            rules.append(build_header_rule(headers))
        
        release = ctx.canary_manager.create_release(
            data_id=data_id,
            group=group,
            namespace=namespace or '',
            cluster=cluster,
            new_content=new_content,
            old_content=old_content,
            config_type=config_type,
            rules=rules,
            traffic_percentage=percentage
        )
        
        ctx.audit_logger.log(AuditLogEntry(
            operation=OperationType.CREATE,
            operator=operator,
            cluster=cluster,
            namespace=namespace or '',
            group_name=group,
            data_id=data_id,
            new_value=f"灰度发布创建: {release.release_id}, 流量: {percentage}%",
            metadata={"release_id": release.release_id, "percentage": percentage}
        ))
        
        click.echo(f"{Fore.GREEN}灰度发布创建成功")
        click.echo(f"Release ID: {release.release_id}")
        click.echo(f"流量比例: {percentage}%")
        if rules:
            click.echo(f"规则数量: {len(rules)}")
        
    except Exception as e:
        click.echo(f"{Fore.RED}创建灰度发布失败: {str(e)}")
        sys.exit(1)


@canary.command('start')
@click.argument('release_id')
@click.option('--operator', default='cli', help='操作人')
@pass_ctx
def canary_start(ctx, release_id, operator):
    """启动灰度发布"""
    try:
        ctx.canary_manager.start_release(release_id)
        
        release = ctx.canary_manager._releases.get(release_id)
        if release:
            ctx.audit_logger.log(AuditLogEntry(
                operation=OperationType.CANARY_START,
                operator=operator,
                cluster=release.cluster,
                namespace=release.namespace,
                group_name=release.group,
                data_id=release.data_id,
                metadata={"release_id": release_id}
            ))
        
        click.echo(f"{Fore.GREEN}灰度发布已启动: {release_id}")
        
    except Exception as e:
        click.echo(f"{Fore.RED}启动失败: {str(e)}")
        sys.exit(1)


@canary.command('pause')
@click.argument('release_id')
@click.option('--operator', default='cli', help='操作人')
@pass_ctx
def canary_pause(ctx, release_id, operator):
    """暂停灰度发布"""
    try:
        ctx.canary_manager.pause_release(release_id)
        
        release = ctx.canary_manager._releases.get(release_id)
        if release:
            ctx.audit_logger.log(AuditLogEntry(
                operation=OperationType.CANARY_PAUSE,
                operator=operator,
                cluster=release.cluster,
                namespace=release.namespace,
                group_name=release.group,
                data_id=release.data_id,
                metadata={"release_id": release_id}
            ))
        
        click.echo(f"{Fore.YELLOW}灰度发布已暂停: {release_id}")
        
    except Exception as e:
        click.echo(f"{Fore.RED}暂停失败: {str(e)}")
        sys.exit(1)


@canary.command('complete')
@click.argument('release_id')
@click.option('--operator', default='cli', help='操作人')
@click.confirmation_option(prompt='确认完成灰度发布？配置将全量发布')
@pass_ctx
def canary_complete(ctx, release_id, operator):
    """完成灰度发布（全量发布）"""
    try:
        release = ctx.canary_manager._releases.get(release_id)
        if not release:
            click.echo(f"{Fore.RED}灰度发布不存在: {release_id}")
            sys.exit(1)
        
        client = _get_cluster_client(ctx, release.cluster)
        success = client.publish_config(
            release.data_id, release.group, release.new_content,
            release.config_type, release.namespace or None, '灰度发布全量'
        )
        
        if success:
            ctx.canary_manager.complete_release(release_id)
            
            ctx.audit_logger.log(AuditLogEntry(
                operation=OperationType.CANARY_COMPLETE,
                operator=operator,
                cluster=release.cluster,
                namespace=release.namespace,
                group_name=release.group,
                data_id=release.data_id,
                old_value=release.old_content,
                new_value=release.new_content,
                metadata={"release_id": release_id}
            ))
            
            click.echo(f"{Fore.GREEN}灰度发布已完成，配置已全量发布: {release_id}")
        else:
            click.echo(f"{Fore.RED}全量发布失败")
            sys.exit(1)
        
    except Exception as e:
        click.echo(f"{Fore.RED}完成失败: {str(e)}")
        sys.exit(1)


@canary.command('cancel')
@click.argument('release_id')
@click.option('--operator', default='cli', help='操作人')
@pass_ctx
def canary_cancel(ctx, release_id, operator):
    """取消灰度发布"""
    try:
        release = ctx.canary_manager._releases.get(release_id)
        
        ctx.canary_manager.cancel_release(release_id)
        
        if release:
            ctx.audit_logger.log(AuditLogEntry(
                operation=OperationType.CANARY_CANCEL,
                operator=operator,
                cluster=release.cluster,
                namespace=release.namespace,
                group_name=release.group,
                data_id=release.data_id,
                metadata={"release_id": release_id}
            ))
        
        click.echo(f"{Fore.RED}灰度发布已取消: {release_id}")
        
    except Exception as e:
        click.echo(f"{Fore.RED}取消失败: {str(e)}")
        sys.exit(1)


@canary.command('list')
@pass_ctx
def canary_list(ctx):
    """列出所有灰度发布"""
    try:
        releases = ctx.canary_manager._releases.values()
        
        if not releases:
            click.echo("暂无灰度发布任务")
            return
        
        table_data = []
        for release in releases:
            status_map = {
                CanaryStatus.DRAFT: f"{Fore.CYAN}草稿",
                CanaryStatus.ACTIVE: f"{Fore.GREEN}运行中",
                CanaryStatus.PAUSED: f"{Fore.YELLOW}已暂停",
                CanaryStatus.COMPLETED: f"{Fore.BLUE}已完成",
                CanaryStatus.CANCELLED: f"{Fore.RED}已取消"
            }
            status = status_map.get(release.status, str(release.status))
            
            stats = ctx.canary_manager.get_release_stats(release.release_id)
            
            table_data.append([
                release.release_id,
                release.data_id,
                release.cluster,
                status,
                f"{release.traffic_percentage}%",
                stats.get('canary_ratio', '0%'),
                release.created_at.strftime('%Y-%m-%d %H:%M:%S')
            ])
        
        click.echo(tabulate(
            table_data,
            headers=['Release ID', 'Data ID', '集群', '状态', '流量比例', '实际灰度', '创建时间']
        ))
        
    except Exception as e:
        click.echo(f"{Fore.RED}获取列表失败: {str(e)}")
        sys.exit(1)


@canary.command('stats')
@click.argument('release_id')
@pass_ctx
def canary_stats(ctx, release_id):
    """查看灰度发布统计"""
    try:
        stats = ctx.canary_manager.get_release_stats(release_id)
        
        if not stats:
            click.echo(f"{Fore.RED}灰度发布不存在: {release_id}")
            sys.exit(1)
        
        click.echo(f"\n{Style.BRIGHT}灰度发布统计{Style.RESET_ALL}")
        for key, value in stats.items():
            click.echo(f"  {key}: {value}")
        click.echo()
        
    except Exception as e:
        click.echo(f"{Fore.RED}获取统计失败: {str(e)}")
        sys.exit(1)


@cli.group()
def audit():
    """审计日志命令"""
    pass


@audit.command('logs')
@click.option('--cluster', '-c', help='集群名称')
@click.option('--operation', '-o', help='操作类型')
@click.option('--data-id', help='配置ID')
@click.option('--operator', help='操作人')
@click.option('--limit', '-n', type=int, default=50, help='显示条数')
@click.option('--format', 'output_format', type=click.Choice(['table', 'json']), default='table')
@pass_ctx
def audit_logs(ctx, cluster, operation, data_id, operator, limit, output_format):
    """查询审计日志"""
    try:
        op_type = None
        if operation:
            try:
                op_type = OperationType(operation)
            except ValueError:
                click.echo(f"{Fore.YELLOW}未知操作类型: {operation}，将作为字符串过滤")
        
        logs = ctx.audit_logger.query(
            cluster=cluster,
            operation=op_type,
            data_id=data_id,
            operator=operator,
            limit=limit
        )
        
        if output_format == 'json':
            click.echo(json.dumps(logs, indent=2, ensure_ascii=False))
        else:
            if not logs:
                click.echo("暂无审计日志")
                return
            
            table_data = []
            for log in logs:
                status_color = Fore.GREEN if log['status'] == 'success' else Fore.RED
                table_data.append([
                    log['log_id'][:8],
                    log['operation'],
                    log['operator'],
                    log['cluster'],
                    log['data_id'],
                    f"{status_color}{log['status']}{Style.RESET_ALL}",
                    log['created_at'][:19]
                ])
            
            click.echo(tabulate(
                table_data,
                headers=['Log ID', '操作', '操作人', '集群', 'Data ID', '状态', '时间']
            ))
        
    except Exception as e:
        click.echo(f"{Fore.RED}查询失败: {str(e)}")
        sys.exit(1)


@audit.command('export')
@click.argument('output_path', type=click.Path())
@click.option('--cluster', '-c', help='集群名称')
@pass_ctx
def audit_export(ctx, output_path, cluster):
    """导出审计日志"""
    try:
        ctx.audit_logger.export_logs(output_path, cluster=cluster)
        click.echo(f"{Fore.GREEN}审计日志已导出到: {output_path}")
        
    except Exception as e:
        click.echo(f"{Fore.RED}导出失败: {str(e)}")
        sys.exit(1)


@audit.command('history')
@click.argument('data_id')
@click.option('--cluster', '-c', required=True, help='集群名称')
@click.option('--group', '-g', default='DEFAULT_GROUP', help='配置分组')
@click.option('--namespace', '-n', help='命名空间')
@click.option('--limit', '-n', 'limit_count', type=int, default=10, help='显示条数')
@pass_ctx
def audit_history(ctx, data_id, cluster, group, namespace, limit_count):
    """查看配置变更历史"""
    try:
        logs = ctx.audit_logger.get_config_history(
            cluster=cluster,
            namespace=namespace or '',
            group_name=group,
            data_id=data_id,
            limit=limit_count
        )
        
        if not logs:
            click.echo("暂无变更记录")
            return
        
        click.echo(f"\n{Style.BRIGHT}配置变更历史: {data_id}{Style.RESET_ALL}\n")
        
        for log in logs:
            status_icon = '✓' if log['status'] == 'success' else '✗'
            status_color = Fore.GREEN if log['status'] == 'success' else Fore.RED
            click.echo(f"{status_color}{status_icon}{Style.RESET_ALL} [{log['created_at'][:19]}] {log['operation']} by {log['operator']}")
            if log['error_message']:
                click.echo(f"  错误: {log['error_message']}")
            if log.get('metadata'):
                click.echo(f"  元数据: {json.dumps(log['metadata'], ensure_ascii=False)}")
            click.echo()
        
    except Exception as e:
        click.echo(f"{Fore.RED}查询失败: {str(e)}")
        sys.exit(1)


@cli.group()
def task():
    """任务管理命令（批量执行、重试）"""
    pass


@task.command('batch')
@click.argument('file_path', type=click.Path(exists=True))
@click.option('--concurrency', '-w', type=int, default=5, help='并发数')
@click.option('--retry', 'max_retries', type=int, default=0, help='失败重试次数')
@pass_ctx
def task_batch(ctx, file_path, concurrency, max_retries):
    """批量执行任务"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            tasks = json.load(f)
        
        if not isinstance(tasks, list):
            raise ValueError("任务文件必须是数组格式")
        
        click.echo(f"加载 {len(tasks)} 个任务，并发数: {concurrency}")
        
        executor = BatchExecutor(max_workers=concurrency, show_progress=True)
        
        task_funcs = []
        for idx, task in enumerate(tasks):
            task_type = task.get('type', 'unknown')
            task_id = f"task_{idx}_{task_type}"
            
            if task_type == 'validate':
                def make_validate_task(t):
                    def validate_task():
                        result = ctx.validator.validate_file(t['file'])
                        return result.to_dict()
                    return validate_task
                task_funcs.append((task_id, make_validate_task(task), (), {}))
            else:
                click.echo(f"{Fore.YELLOW}跳过未知任务类型: {task_type}")
        
        if task_funcs:
            results = executor.execute(task_funcs)
            
            success = sum(1 for r in results if r.get('success', False))
            failed = len(results) - success
            
            click.echo(f"\n{Style.BRIGHT}批量执行结果{Style.RESET_ALL}")
            click.echo(f"成功: {Fore.GREEN}{success}{Style.RESET_ALL}")
            click.echo(f"失败: {Fore.RED}{failed}{Style.RESET_ALL}")
            
            if failed > 0 and max_retries > 0:
                click.echo(f"\n{Fore.YELLOW}对失败任务进行重试 (最多 {max_retries} 次)...")
                retry_policy = RetryPolicy(
                    max_attempts=max_retries,
                    backoff_strategy=BackoffStrategy.EXPONENTIAL
                )
                retry_executor = RetryExecutor(retry_policy)
                for result in results:
                    if not result.get('success', False):
                        click.echo(f"  重试任务: {result.get('task_id')}")
        
    except Exception as e:
        click.echo(f"{Fore.RED}批量执行失败: {str(e)}")
        sys.exit(1)


@task.command('dlq')
@click.option('--retry', is_flag=True, help='重试所有失败任务')
@click.option('--clear', is_flag=True, help='清空死信队列')
@pass_ctx
def task_dlq(ctx, retry, clear):
    """死信队列管理"""
    try:
        if clear:
            ctx.dlq.clear()
            click.echo(f"{Fore.GREEN}死信队列已清空")
            return
        
        if retry:
            click.echo(f"开始重试死信队列中的 {ctx.dlq.size()} 个任务...")
            results = ctx.dlq.retry_all()
            
            success = sum(1 for r in results if r.success)
            click.echo(f"重试完成: 成功 {success}, 失败 {len(results) - success}")
            
            if ctx.dlq.size() > 0:
                click.echo(f"{Fore.YELLOW}仍有 {ctx.dlq.size()} 个任务在死信队列中")
            return
        
        failed_tasks = ctx.dlq.get_failed_tasks()
        
        if not failed_tasks:
            click.echo("死信队列为空")
            return
        
        click.echo(f"\n死信队列中有 {len(failed_tasks)} 个失败任务:\n")
        
        for task in failed_tasks:
            click.echo(f"  {task['task_id']}: {task['error_type']} - {task['error'][:100]}")
        
        click.echo(f"\n使用 --retry 参数重试所有任务")
        
    except Exception as e:
        click.echo(f"{Fore.RED}操作失败: {str(e)}")
        sys.exit(1)


@cli.group()
def advanced():
    """高级功能命令"""
    pass


@advanced.command('retry-config')
@click.option('--strategy', type=click.Choice(['fixed', 'linear', 'exponential', 'exponential_jitter']),
              default='exponential_jitter', help='重试策略')
@click.option('--max-attempts', type=int, default=3, help='最大重试次数')
@click.option('--initial-delay', type=float, default=1.0, help='初始延迟(秒)')
@click.option('--max-delay', type=float, default=60.0, help='最大延迟(秒)')
@pass_ctx
def advanced_retry_config(ctx, strategy, max_attempts, initial_delay, max_delay):
    """配置重试策略并演示"""
    strategy_map = {
        'fixed': BackoffStrategy.FIXED,
        'linear': BackoffStrategy.LINEAR,
        'exponential': BackoffStrategy.EXPONENTIAL,
        'exponential_jitter': BackoffStrategy.EXPONENTIAL_JITTER
    }
    
    policy = RetryPolicy(
        max_attempts=max_attempts,
        backoff_strategy=strategy_map[strategy],
        initial_delay=initial_delay,
        max_delay=max_delay
    )
    
    click.echo(f"\n{Style.BRIGHT}重试策略配置{Style.RESET_ALL}")
    click.echo(f"  策略: {strategy}")
    click.echo(f"  最大重试次数: {max_attempts}")
    click.echo(f"  初始延迟: {initial_delay}s")
    click.echo(f"  最大延迟: {max_delay}s\n")
    
    click.echo(f"计算延迟预览:")
    for attempt in range(1, max_attempts + 1):
        delay = policy.calculate_delay(attempt)
        click.echo(f"  第 {attempt} 次重试: {delay:.2f}s")
    
    click.echo()


if __name__ == '__main__':
    cli()
