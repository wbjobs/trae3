import json
import click
from datetime import datetime, timedelta

from . import __version__
from .common import get_logger
from .parser import CommandParser, BatchExecutor
from .inspector import TopicInspector
from .replayer import MessageReplayer, ReplayConfig
from .rpc import RPCClient
from .configdb import ConfigDBClient
from .msg_cluster import KafkaClient, RedisClient
from .security import TopicACLManager, Permission, ResourceType, ResourcePatternType
from .scheduler import TaskScheduler, ScheduleType
from .utils import LogExporter, ExportFormat, CompressionType, LogFilter

logger = get_logger("msgcli")


@click.group()
@click.version_option(__version__, '-v', '--version')
@click.option('--verbose', '-V', is_flag=True, help='Enable verbose output')
def cli(verbose):
    """多子模块命令行工具 - 消息集群管理工具
    
    包含指令解析、主题巡检、消息重放、远程调用模块，对接消息集群与配置数据库
    """
    if verbose:
        import logging
        logging.getLogger("msgcli").setLevel(logging.DEBUG)


@cli.group()
def parse():
    """指令解析命令"""
    pass


@parse.command("lex")
@click.argument('command_line')
def parse_lex(command_line):
    """词法分析命令"""
    from .parser.lexer import Lexer
    lexer = Lexer(command_line)
    tokens = lexer.tokenize()
    for token in tokens:
        click.echo(f"{token.type.value:12} {repr(token.value):20} pos={token.position} line={token.line}")


@parse.command("parse")
@click.argument('command_line')
def parse_command(command_line):
    """解析命令"""
    parser = CommandParser()
    commands = parser.parse(command_line)
    for cmd in commands:
        click.echo(cmd)


@parse.command("batch")
@click.option('--file', '-f', type=click.Path(exists=True), help='从文件批量解析指令')
@click.option('--commands', '-c', help='批量命令字符串')
@click.option('--execute', '-x', is_flag=True, help='执行解析后的命令')
def parse_batch(file, commands, execute):
    """批量解析指令"""
    parser = CommandParser()
    
    if file:
        commands_list = parser.parse_file(file)
        click.echo(f"从文件解析到 {len(commands_list)} 条命令:")
    elif commands:
        commands_list = parser.parse_batch(commands)
        click.echo(f"解析到 {len(commands_list)} 条命令:")
    else:
        click.echo("请指定 --file 或 --commands 参数")
        return
    
    for i, cmd in enumerate(commands_list, 1):
        click.echo(f"\n  {i}. {cmd.command} {cmd.subcommand or ''}")
        if cmd.args:
            click.echo(f"     参数: {cmd.args}")
        if cmd.options:
            click.echo(f"     选项: {cmd.options}")
        if cmd.flags:
            click.echo(f"     标志: {cmd.flags}")


@cli.group()
def inspect():
    """主题巡检命令"""
    pass


@inspect.command("all")
@click.option('--format', '-f', 'output_format', default='text', 
              type=click.Choice(['text', 'json', 'markdown']),
              help='输出格式')
@click.option('--output', '-o', type=click.Path(), help='输出文件')
@click.option('--no-config-sync', is_flag=True, help='跳过配置同步检查')
def inspect_all(output_format, output, no_config_sync):
    """巡检所有主题"""
    inspector = TopicInspector()
    try:
        report = inspector.inspect_all(check_config_sync=not no_config_sync)
        output_text = inspector.generate_report(report, output_format)
        
        if output:
            with open(output, 'w', encoding='utf-8') as f:
                f.write(output_text)
            click.echo(f"报告已保存到: {output}")
        else:
            click.echo(output_text)
    finally:
        inspector.close()


@inspect.command("topic")
@click.argument('topic_name')
@click.option('--format', '-f', 'output_format', default='text',
              type=click.Choice(['text', 'json']))
def inspect_topic(topic_name, output_format):
    """巡检指定主题"""
    inspector = TopicInspector()
    try:
        health = inspector.inspect_topic(topic_name)
        if output_format == 'json':
            click.echo(json.dumps({
                "name": health.name,
                "exists": health.exists,
                "partition_count": health.partition_count,
                "status": health.status,
                "issues": health.issues,
            }, indent=2))
        else:
            click.echo(f"主题: {health.name}")
            click.echo(f"状态: {health.status.upper()}")
            click.echo(f"分区数: {health.partition_count}")
            if health.issues:
                click.echo("问题:")
                for issue in health.issues:
                    click.echo(f"  - {issue}")
    finally:
        inspector.close()


@cli.group()
def schedule():
    """定时巡检调度命令"""
    pass


@schedule.command("add")
@click.argument('name')
@click.option('--topics', '-t', multiple=True, required=True, help='要巡检的主题列表')
@click.option('--type', 'schedule_type', default='interval',
              type=click.Choice(['once', 'interval', 'cron', 'daily', 'hourly']),
              help='调度类型')
@click.option('--value', '-v', required=True, help='调度值 (interval秒数, cron表达式, daily=HH:MM, hourly=分钟)')
@click.option('--checks', '-c', multiple=True, default=['health', 'lag', 'partitions'],
              help='巡检检查项')
def schedule_add(name, topics, schedule_type, value, checks):
    """添加定时巡检任务"""
    scheduler = TaskScheduler()
    task_id = scheduler.add_inspection(
        name=name,
        topics=list(topics),
        schedule_type=ScheduleType(schedule_type),
        schedule_value=value,
        checks=list(checks),
    )
    click.echo(f"已添加巡检任务: {task_id}")


@schedule.command("list")
def schedule_list():
    """列出所有定时巡检任务"""
    scheduler = TaskScheduler()
    tasks = scheduler.list_inspections()
    if not tasks:
        click.echo("没有定时巡检任务")
        return
    
    click.echo(f"共 {len(tasks)} 个定时巡检任务:")
    for task in tasks:
        status = "启用" if task["enabled"] else "禁用"
        click.echo(f"\n  {task['task_id']} - {task['name']} ({status})")
        click.echo(f"    主题: {', '.join(task['topics'])}")
        click.echo(f"    调度: {task['schedule_type']} {task['schedule_value']}")
        click.echo(f"    检查项: {', '.join(task['checks'])}")


@schedule.command("remove")
@click.argument('task_id')
def schedule_remove(task_id):
    """删除定时巡检任务"""
    scheduler = TaskScheduler()
    if scheduler.remove_inspection(task_id):
        click.echo(f"已删除任务: {task_id}")
    else:
        click.echo(f"任务不存在: {task_id}")


@schedule.command("enable")
@click.argument('task_id')
def schedule_enable(task_id):
    """启用定时巡检任务"""
    scheduler = TaskScheduler()
    if scheduler.enable_inspection(task_id):
        click.echo(f"已启用任务: {task_id}")
    else:
        click.echo(f"任务不存在: {task_id}")


@schedule.command("disable")
@click.argument('task_id')
def schedule_disable(task_id):
    """禁用定时巡检任务"""
    scheduler = TaskScheduler()
    if scheduler.disable_inspection(task_id):
        click.echo(f"已禁用任务: {task_id}")
    else:
        click.echo(f"任务不存在: {task_id}")


@schedule.command("run")
@click.argument('task_id')
def schedule_run(task_id):
    """立即运行指定巡检任务"""
    scheduler = TaskScheduler()
    inspector = TopicInspector()
    
    def run_inspection(topic, checks):
        health = inspector.inspect_topic(topic)
        return {
            "exists": health.exists,
            "partition_count": health.partition_count,
            "health_status": health.status,
            "issues": health.issues,
        }
    
    try:
        result = scheduler.run_inspection(task_id, run_inspection)
        click.echo(f"巡检任务运行完成: {result.run_id}")
        click.echo(f"状态: {result.status.value}")
        if result.summary:
            click.echo(f"摘要: {json.dumps(result.summary, indent=2, ensure_ascii=False)}")
        if result.issues:
            click.echo(f"发现 {len(result.issues)} 个问题:")
            for issue in result.issues:
                click.echo(f"  - [{issue['severity']}] {issue['topic']}: {issue['message']}")
    except ValueError as e:
        click.echo(str(e))
    finally:
        inspector.close()


@schedule.command("history")
@click.argument('task_id', required=False)
@click.option('--limit', '-n', type=int, default=50, help='显示记录数')
def schedule_history(task_id, limit):
    """查看巡检历史"""
    scheduler = TaskScheduler()
    history = scheduler.get_inspection_history(task_id, limit)
    
    if not history:
        click.echo("没有历史记录")
        return
    
    click.echo(f"共 {len(history)} 条历史记录:")
    for record in history:
        click.echo(f"\n  {record['run_id']} ({record['status']})")
        click.echo(f"    时间: {record['start_time']}")
        if record.get('summary'):
            click.echo(f"    摘要: {json.dumps(record['summary'], ensure_ascii=False)}")


@cli.group()
def replay():
    """消息重放命令"""
    pass


@replay.command("kafka")
@click.argument('source_topic')
@click.argument('target_topic')
@click.option('--max-messages', '-n', type=int, default=1000, help='最大消息数')
@click.option('--speed', '-s', type=float, default=1.0, help='重放速度因子')
@click.option('--dry-run', '-d', is_flag=True, help='试运行模式')
@click.option('--filter', '-f', 'filter_expr', help='过滤表达式')
@click.option('--resume', is_flag=True, help='从断点恢复')
def replay_kafka(source_topic, target_topic, max_messages, speed, dry_run, filter_expr, resume):
    """从Kafka主题重放消息"""
    replayer = MessageReplayer()
    try:
        config = ReplayConfig(
            source_topic=source_topic,
            target_topic=target_topic,
            max_messages=max_messages,
            speed_factor=speed,
            dry_run=dry_run,
            filter_expression=filter_expr,
            resume=resume,
        )
        
        def progress_callback(progress):
            click.echo(f"\r进度: {progress.percentage:.1f}% ({progress.replayed_messages}/{progress.total_messages}) "
                      f"{progress.messages_per_second:.1f} msg/s", nl=False)
        
        result = replayer.replay(config, progress_callback=progress_callback)
        click.echo()
        click.echo(json.dumps(result.to_dict(), indent=2))
    finally:
        replayer.close()


@replay.command("file")
@click.argument('file_path', type=click.Path(exists=True))
@click.argument('target_topic')
@click.option('--speed', '-s', type=float, default=1.0, help='重放速度因子')
@click.option('--dry-run', '-d', is_flag=True, help='试运行模式')
@click.option('--resume', is_flag=True, help='从断点恢复')
def replay_file(file_path, target_topic, speed, dry_run, resume):
    """从文件重放消息"""
    replayer = MessageReplayer()
    try:
        config = ReplayConfig(
            source_topic=file_path,
            target_topic=target_topic,
            speed_factor=speed,
            dry_run=dry_run,
            resume=resume,
        )
        result = replayer.replay_from_file(file_path, target_topic, config)
        click.echo(json.dumps(result.to_dict(), indent=2))
    finally:
        replayer.close()


@replay.command("collect")
@click.argument('topic')
@click.option('--output', '-o', type=click.Path(), required=True, help='输出文件')
@click.option('--max-messages', '-n', type=int, default=1000, help='最大消息数')
def replay_collect(topic, output, max_messages):
    """收集消息到文件"""
    replayer = MessageReplayer()
    try:
        messages = replayer.collect_messages(topic, max_messages)
        replayer.save_messages_to_file(messages, output)
        click.echo(f"已收集 {len(messages)} 条消息到 {output}")
    finally:
        replayer.close()


@replay.command("tasks")
def replay_tasks():
    """列出重放任务"""
    replayer = MessageReplayer()
    try:
        tasks = replayer.list_tasks()
        if not tasks:
            click.echo("没有进行中的重放任务")
            return
        
        for task in tasks:
            click.echo(f"\n  {task['task_id']} ({task['status']})")
            click.echo(f"    进度: {task['percentage']}%")
            click.echo(f"    已处理: {task['processed_messages']}/{task['total_messages']}")
            click.echo(f"    速率: {task['messages_per_second']} msg/s")
    finally:
        replayer.close()


@replay.command("progress")
@click.argument('task_id')
def replay_progress(task_id):
    """查看重放进度"""
    replayer = MessageReplayer()
    try:
        progress = replayer.get_progress(task_id)
        if progress:
            click.echo(json.dumps(progress, indent=2, ensure_ascii=False))
        else:
            click.echo(f"任务不存在: {task_id}")
    finally:
        replayer.close()


@replay.command("pause")
@click.argument('task_id')
def replay_pause(task_id):
    """暂停重放任务"""
    replayer = MessageReplayer()
    try:
        replayer.pause(task_id)
        click.echo(f"已暂停任务: {task_id}")
    finally:
        replayer.close()


@replay.command("resume")
@click.argument('task_id')
def replay_resume(task_id):
    """恢复重放任务"""
    replayer = MessageReplayer()
    try:
        replayer.resume(task_id)
        click.echo(f"已恢复任务: {task_id}")
    finally:
        replayer.close()


@replay.command("cancel")
@click.argument('task_id')
def replay_cancel(task_id):
    """取消重放任务"""
    replayer = MessageReplayer()
    try:
        replayer.cancel(task_id)
        click.echo(f"已取消任务: {task_id}")
    finally:
        replayer.close()


@cli.group()
def acl():
    """主题权限管控命令"""
    pass


@acl.group()
def user():
    """用户管理"""
    pass


@user.command("create")
@click.argument('username')
@click.option('--password', '-p', required=True, help='密码')
@click.option('--admin', is_flag=True, help='是否管理员')
def acl_user_create(username, password, admin):
    """创建用户"""
    acl_manager = TopicACLManager()
    try:
        user = acl_manager.create_user(username, password, is_admin=admin)
        click.echo(f"已创建用户: {user.username}")
    except ValueError as e:
        click.echo(str(e))


@user.command("list")
def acl_user_list():
    """列出所有用户"""
    acl_manager = TopicACLManager()
    users = acl_manager.list_users()
    click.echo(f"共 {len(users)} 个用户:")
    for user in users:
        admin_flag = " [管理员]" if user["is_admin"] else ""
        active_flag = "" if user["is_active"] else " [已禁用]"
        click.echo(f"  - {user['username']}{admin_flag}{active_flag}")
        if user["roles"]:
            click.echo(f"    角色: {', '.join(user['roles'])}")


@user.command("delete")
@click.argument('username')
def acl_user_delete(username):
    """删除用户"""
    acl_manager = TopicACLManager()
    if acl_manager.delete_user(username):
        click.echo(f"已删除用户: {username}")
    else:
        click.echo(f"用户不存在: {username}")


@user.command("assign-role")
@click.argument('username')
@click.argument('role_name')
def acl_user_assign_role(username, role_name):
    """为用户分配角色"""
    acl_manager = TopicACLManager()
    if acl_manager.assign_role(username, role_name):
        click.echo(f"已为用户 {username} 分配角色 {role_name}")
    else:
        click.echo("操作失败，请检查用户和角色是否存在")


@user.command("revoke-role")
@click.argument('username')
@click.argument('role_name')
def acl_user_revoke_role(username, role_name):
    """撤销用户角色"""
    acl_manager = TopicACLManager()
    if acl_manager.revoke_role(username, role_name):
        click.echo(f"已撤销用户 {username} 的角色 {role_name}")
    else:
        click.echo("操作失败")


@acl.group()
def role():
    """角色管理"""
    pass


@role.command("create")
@click.argument('name')
@click.option('--description', '-d', default='', help='角色描述')
@click.option('--permissions', '-p', multiple=True, help='权限列表 (格式: action:resource)')
def acl_role_create(name, description, permissions):
    """创建角色"""
    acl_manager = TopicACLManager()
    try:
        role = acl_manager.create_role(name, description, set(permissions))
        click.echo(f"已创建角色: {role.name}")
    except ValueError as e:
        click.echo(str(e))


@role.command("list")
def acl_role_list():
    """列出所有角色"""
    acl_manager = TopicACLManager()
    roles = acl_manager.list_roles()
    click.echo(f"共 {len(roles)} 个角色:")
    for role in roles:
        click.echo(f"\n  {role['name']} - {role['description']}")
        if role['permissions']:
            click.echo(f"    权限: {', '.join(role['permissions'])}")


@role.command("delete")
@click.argument('name')
def acl_role_delete(name):
    """删除角色"""
    acl_manager = TopicACLManager()
    if acl_manager.delete_role(name):
        click.echo(f"已删除角色: {name}")
    else:
        click.echo(f"角色不存在: {name}")


@acl.command("grant")
@click.argument('principal')
@click.argument('resource_name')
@click.option('--resource-type', '-t', default='topic',
              type=click.Choice(['topic', 'group', 'cluster', 'transactional_id']),
              help='资源类型')
@click.option('--permission', '-p', default='read',
              type=click.Choice(['read', 'write', 'create', 'delete', 'alter', 'describe', 'all']),
              help='权限类型')
@click.option('--pattern', default='literal',
              type=click.Choice(['literal', 'prefixed', 'any']),
              help='匹配模式')
@click.option('--expires-days', type=int, help='过期天数')
def acl_grant(principal, resource_name, resource_type, permission, pattern, expires_days):
    """授予权限"""
    acl_manager = TopicACLManager()
    acl = acl_manager.grant_permission(
        principal=principal,
        resource_type=ResourceType(resource_type),
        resource_name=resource_name,
        permission=Permission(permission),
        pattern_type=ResourcePatternType(pattern),
        expires_days=expires_days,
    )
    click.echo(f"已授予权限: {acl.permission.value} on {acl.resource_name} to {acl.principal}")


@acl.command("revoke")
@click.argument('principal')
@click.argument('resource_name')
@click.option('--resource-type', '-t', default='topic',
              type=click.Choice(['topic', 'group', 'cluster', 'transactional_id']),
              help='资源类型')
@click.option('--permission', '-p', default='read',
              type=click.Choice(['read', 'write', 'create', 'delete', 'alter', 'describe', 'all']),
              help='权限类型')
def acl_revoke(principal, resource_name, resource_type, permission):
    """撤销权限"""
    acl_manager = TopicACLManager()
    if acl_manager.revoke_permission(
        principal=principal,
        resource_type=ResourceType(resource_type),
        resource_name=resource_name,
        permission=Permission(permission),
    ):
        click.echo("权限已撤销")
    else:
        click.echo("未找到匹配的权限")


@acl.command("list")
@click.option('--principal', '-p', help='按主体过滤')
@click.option('--resource-type', '-t',
              type=click.Choice(['topic', 'group', 'cluster', 'transactional_id']),
              help='按资源类型过滤')
def acl_list(principal, resource_type):
    """列出所有权限"""
    acl_manager = TopicACLManager()
    rt = ResourceType(resource_type) if resource_type else None
    acls = acl_manager.list_acls(principal, rt)
    
    if not acls:
        click.echo("没有权限记录")
        return
    
    click.echo(f"共 {len(acls)} 条权限记录:")
    for acl in acls:
        status = " [已过期]" if acl.get("expires_at") and datetime.fromisoformat(acl["expires_at"]) < datetime.now() else ""
        click.echo(f"\n  {acl['principal']} -> {acl['resource_type']}:{acl['resource_name']}")
        click.echo(f"    权限: {acl['permission']} ({'允许' if acl['allowed'] else '拒绝'})")
        click.echo(f"    模式: {acl['pattern_type']}{status}")


@acl.command("check")
@click.argument('principal')
@click.argument('resource_name')
@click.option('--resource-type', '-t', default='topic',
              type=click.Choice(['topic', 'group', 'cluster', 'transactional_id']),
              help='资源类型')
@click.option('--permission', '-p', default='read',
              type=click.Choice(['read', 'write', 'create', 'delete', 'alter', 'describe', 'all']),
              help='权限类型')
def acl_check(principal, resource_name, resource_type, permission):
    """检查权限"""
    acl_manager = TopicACLManager()
    allowed = acl_manager.check_permission(
        principal=principal,
        resource_type=ResourceType(resource_type),
        resource_name=resource_name,
        permission=Permission(permission),
    )
    click.echo(f"权限检查结果: {'允许' if allowed else '拒绝'}")


@cli.group()
def logs():
    """日志管理命令"""
    pass


@logs.command("list")
def logs_list():
    """列出日志文件"""
    exporter = LogExporter()
    files = exporter.list_log_files()
    
    if not files:
        click.echo("没有找到日志文件")
        return
    
    click.echo(f"共 {len(files)} 个日志文件:")
    for f in files:
        size_mb = f["size"] / 1024 / 1024
        click.echo(f"  - {f['name']} ({size_mb:.2f} MB)")
        click.echo(f"    修改时间: {f['modified']}")


@logs.command("export")
@click.argument('output_file')
@click.option('--input', '-i', multiple=True, help='输入日志文件')
@click.option('--format', '-f', 'fmt', default='json',
              type=click.Choice(['json', 'jsonl', 'csv', 'tsv', 'text', 'xml']),
              help='输出格式')
@click.option('--compression', '-c', default='none',
              type=click.Choice(['none', 'gzip', 'zip', 'tar.gz']),
              help='压缩方式')
@click.option('--level', '-l', help='日志级别过滤')
@click.option('--keyword', '-k', multiple=True, help='关键词过滤')
@click.option('--start-date', help='开始日期 (YYYY-MM-DD)')
@click.option('--end-date', help='结束日期 (YYYY-MM-DD)')
@click.option('--max-entries', '-n', type=int, help='最大条目数')
def logs_export(output_file, input, fmt, compression, level, keyword, start_date, end_date, max_entries):
    """导出日志"""
    exporter = LogExporter()
    
    filter_config = LogFilter()
    if level:
        filter_config.log_level = level
    if keyword:
        filter_config.keywords = list(keyword)
    if start_date:
        filter_config.start_time = datetime.strptime(start_date, "%Y-%m-%d")
    if end_date:
        filter_config.end_time = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
    if max_entries:
        filter_config.max_entries = max_entries
    
    if not input:
        input = [f["name"] for f in exporter.list_log_files()]
    
    stats = exporter.export(
        input_files=list(input),
        output_file=output_file,
        format=ExportFormat(fmt),
        compression=CompressionType(compression),
        filter_config=filter_config,
    )
    
    click.echo(f"日志导出完成:")
    click.echo(f"  输出文件: {stats['output_file']}")
    click.echo(f"  总条目数: {stats['total_entries']}")
    click.echo(f"  文件大小: {stats['file_size']} 字节")


@logs.command("search")
@click.argument('keyword')
@click.option('--files', '-f', multiple=True, help='指定文件搜索')
@click.option('--limit', '-n', type=int, default=100, help='结果数量限制')
@click.option('--case-sensitive', is_flag=True, help='区分大小写')
def logs_search(keyword, files, limit, case_sensitive):
    """搜索日志"""
    exporter = LogExporter()
    results = exporter.search(
        keyword=keyword,
        files=list(files) if files else None,
        case_sensitive=case_sensitive,
        limit=limit,
    )
    
    if not results:
        click.echo("没有找到匹配的日志")
        return
    
    click.echo(f"找到 {len(results)} 条匹配记录:")
    for i, entry in enumerate(results, 1):
        click.echo(f"\n{i}. {entry.get('timestamp', '')} [{entry.get('level', 'UNKNOWN')}]")
        click.echo(f"   {entry.get('raw', json.dumps(entry, ensure_ascii=False))[:200]}")


@logs.command("tail")
@click.argument('file_path')
@click.option('--lines', '-n', type=int, default=100, help='显示行数')
@click.option('--level', '-l', help='日志级别过滤')
def logs_tail(file_path, lines, level):
    """查看日志尾部"""
    exporter = LogExporter()
    
    filter_config = None
    if level:
        filter_config = LogFilter(log_level=level)
    
    entries = exporter.tail(file_path, lines, filter_config)
    
    for entry in entries:
        ts = entry.get('timestamp', '')
        lvl = entry.get('level', 'INFO')
        msg = entry.get('raw', json.dumps(entry, ensure_ascii=False))
        click.echo(f"{ts} [{lvl}] {msg}")


@logs.command("stats")
@click.argument('file_path')
def logs_stats(file_path):
    """查看日志统计"""
    exporter = LogExporter()
    stats = exporter.get_log_stats(file_path)
    
    click.echo(f"日志文件: {file_path}")
    click.echo(f"总行数: {stats['total_lines']}")
    click.echo("\n按级别统计:")
    for level, count in stats['by_level'].items():
        if count > 0:
            click.echo(f"  {level}: {count}")
    if stats['time_range']['first']:
        click.echo(f"\n时间范围: {stats['time_range']['first']} ~ {stats['time_range']['last']}")


@logs.command("cleanup")
@click.option('--days', '-d', type=int, default=30, help='保留天数')
@click.option('--dry-run', is_flag=True, help='试运行模式')
def logs_cleanup(days, dry_run):
    """清理旧日志"""
    exporter = LogExporter()
    result = exporter.cleanup_old_logs(days, dry_run)
    
    if dry_run:
        click.echo(f"[试运行] 将删除 {result['deleted_count']} 个文件")
    else:
        click.echo(f"已删除 {result['deleted_count']} 个文件")
    
    size_mb = result['total_size_freed'] / 1024 / 1024
    click.echo(f"释放空间: {size_mb:.2f} MB")
    
    if result['files']:
        click.echo("\n已删除文件:")
        for f in result['files']:
            click.echo(f"  - {f['file']}")


@cli.group()
def rpc():
    """远程调用命令"""
    pass


@rpc.command("call")
@click.argument('method')
@click.option('--params', '-p', help='JSON格式参数')
@click.option('--endpoint', '-e', help='RPC端点')
@click.option('--path', default='/rpc', help='RPC路径')
def rpc_call(method, params, endpoint, path):
    """调用RPC方法"""
    client = RPCClient(endpoint=endpoint)
    try:
        params_dict = json.loads(params) if params else None
        response = client.call(method, params_dict, path)
        click.echo(json.dumps(response.to_dict(), indent=2))
    finally:
        client.close()


@rpc.command("get")
@click.argument('path')
@click.option('--endpoint', '-e', help='RPC端点')
def rpc_get(path, endpoint):
    """HTTP GET请求"""
    client = RPCClient(endpoint=endpoint)
    try:
        response = client.get(path)
        click.echo(json.dumps(response.to_dict(), indent=2))
    finally:
        client.close()


@rpc.command("post")
@click.argument('path')
@click.option('--data', '-d', help='JSON数据')
@click.option('--endpoint', '-e', help='RPC端点')
def rpc_post(path, data, endpoint):
    """HTTP POST请求"""
    client = RPCClient(endpoint=endpoint)
    try:
        json_data = json.loads(data) if data else None
        response = client.post(path, json_data=json_data)
        click.echo(json.dumps(response.to_dict(), indent=2))
    finally:
        client.close()


@rpc.command("health")
@click.option('--endpoint', '-e', help='RPC端点')
def rpc_health(endpoint):
    """健康检查"""
    client = RPCClient(endpoint=endpoint)
    try:
        response = client.health_check()
        click.echo(f"状态: {'健康' if response.success else '异常'}")
        click.echo(f"响应码: {response.status_code}")
        click.echo(f"响应时间: {response.response_time:.3f}s")
        if response.data:
            click.echo(f"响应: {json.dumps(response.data, indent=2)}")
    finally:
        client.close()


@cli.group()
def kafka():
    """Kafka管理命令"""
    pass


@kafka.command("topics")
def kafka_topics():
    """列出所有主题"""
    client = KafkaClient()
    try:
        topics = client.list_topics()
        click.echo(f"共 {len(topics)} 个主题:")
        for topic in topics:
            click.echo(f"  - {topic}")
    finally:
        client.close()


@kafka.command("create-topic")
@click.argument('topic_name')
@click.option('--partitions', '-p', type=int, default=3, help='分区数')
@click.option('--replicas', '-r', type=int, default=1, help='副本数')
def kafka_create_topic(topic_name, partitions, replicas):
    """创建主题"""
    client = KafkaClient()
    try:
        success = client.create_topic(topic_name, partitions, replicas)
        if success:
            click.echo(f"主题 {topic_name} 创建成功")
        else:
            click.echo(f"主题 {topic_name} 创建失败")
    finally:
        client.close()


@kafka.command("delete-topic")
@click.argument('topic_name')
def kafka_delete_topic(topic_name):
    """删除主题"""
    client = KafkaClient()
    try:
        success = client.delete_topic(topic_name)
        if success:
            click.echo(f"主题 {topic_name} 删除成功")
        else:
            click.echo(f"主题 {topic_name} 删除失败")
    finally:
        client.close()


@kafka.command("send")
@click.argument('topic')
@click.argument('message')
@click.option('--key', '-k', help='消息键')
def kafka_send(topic, message, key):
    """发送消息"""
    client = KafkaClient()
    try:
        msg_data = json.loads(message)
        success = client.send_message(topic, msg_data, key)
        if success:
            click.echo("消息发送成功")
        else:
            click.echo("消息发送失败")
    finally:
        client.close()


@kafka.command("consume")
@click.argument('topic')
@click.option('--count', '-n', type=int, default=10, help='消费消息数')
def kafka_consume(topic, count):
    """消费消息"""
    client = KafkaClient()
    try:
        messages = []
        def callback(msg):
            messages.append(msg)
            click.echo(json.dumps(msg, ensure_ascii=False))
        
        client.consume_messages(topic, callback, max_messages=count)
        click.echo(f"\n共消费 {len(messages)} 条消息")
    finally:
        client.close()


@kafka.command("groups")
def kafka_groups():
    """列出消费者组"""
    client = KafkaClient()
    try:
        groups = client.get_consumer_groups()
        click.echo(f"共 {len(groups)} 个消费者组:")
        for group in groups:
            click.echo(f"  - {group}")
    finally:
        client.close()


@cli.group()
def configdb():
    """配置数据库命令"""
    pass


@configdb.command("topics")
def configdb_topics():
    """列出配置的主题"""
    db = ConfigDBClient()
    try:
        topics = db.list_topics()
        click.echo(f"共 {len(topics)} 个配置主题:")
        for topic in topics:
            click.echo(f"  - {topic.name} (分区: {topic.partitions}, 状态: {topic.status})")
    finally:
        db.disconnect()


@configdb.command("get-topic")
@click.argument('topic_name')
def configdb_get_topic(topic_name):
    """获取主题配置"""
    db = ConfigDBClient()
    try:
        topic = db.get_topic(topic_name)
        if topic:
            click.echo(json.dumps(topic.to_dict(), indent=2, default=str))
        else:
            click.echo(f"主题 {topic_name} 不存在")
    finally:
        db.disconnect()


@configdb.command("consumers")
def configdb_consumers():
    """列出消费者配置"""
    db = ConfigDBClient()
    try:
        consumers = db.list_consumers()
        click.echo(f"共 {len(consumers)} 个消费者配置:")
        for consumer in consumers:
            click.echo(f"  - {consumer.group_id} -> {consumer.topic_name}")
    finally:
        db.disconnect()


@cli.group()
def redis():
    """Redis管理命令"""
    pass


@redis.command("get")
@click.argument('key')
def redis_get(key):
    """获取键值"""
    client = RedisClient()
    try:
        value = client.get(key)
        if value:
            if isinstance(value, (dict, list)):
                click.echo(json.dumps(value, indent=2))
            else:
                click.echo(value)
        else:
            click.echo(f"键 {key} 不存在")
    finally:
        client.close()


@redis.command("set")
@click.argument('key')
@click.argument('value')
@click.option('--expire', '-e', type=int, help='过期时间(秒)')
def redis_set(key, value, expire):
    """设置键值"""
    client = RedisClient()
    try:
        success = client.set(key, value, expire)
        if success:
            click.echo(f"键 {key} 设置成功")
        else:
            click.echo(f"键 {key} 设置失败")
    finally:
        client.close()


@redis.command("keys")
@click.option('--pattern', '-p', default='*', help='匹配模式')
def redis_keys(pattern):
    """列出键"""
    client = RedisClient()
    try:
        keys = client.keys(pattern)
        click.echo(f"共 {len(keys)} 个键:")
        for key in sorted(keys):
            click.echo(f"  - {key}")
    finally:
        client.close()


@redis.command("llen")
@click.argument('key')
def redis_llen(key):
    """获取列表长度"""
    client = RedisClient()
    try:
        length = client.llen(key)
        click.echo(f"列表 {key} 长度: {length}")
    finally:
        client.close()


@redis.command("lrange")
@click.argument('key')
@click.option('--start', '-s', type=int, default=0, help='起始索引')
@click.option('--end', '-e', type=int, default=-1, help='结束索引')
def redis_lrange(key, start, end):
    """获取列表范围"""
    client = RedisClient()
    try:
        items = client.lrange(key, start, end)
        click.echo(f"列表 {key} 元素 ({len(items)} 个):")
        for i, item in enumerate(items):
            if isinstance(item, (dict, list)):
                click.echo(f"  {i}: {json.dumps(item, ensure_ascii=False)}")
            else:
                click.echo(f"  {i}: {item}")
    finally:
        client.close()


if __name__ == '__main__':
    cli()
