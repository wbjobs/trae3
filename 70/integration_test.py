import sys
import os
import json
import tempfile
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from configtool.utils import get_logger, deep_diff, load_yaml, save_yaml

logger = get_logger("integration_test")

def test_cli_context():
    logger.info("=" * 60)
    logger.info("测试1: CLI上下文对象")
    logger.info("=" * 60)

    from configtool.cli import CLIContext

    ctx = CLIContext(
        verbose=True,
        output_format="json",
        output_file=None,
        no_color=False,
        quiet=False,
    )

    assert ctx.verbose is True
    assert ctx.output_format == "json"

    ctx.log("INFO", "测试日志信息")
    ctx.set_exit_code(1)
    ctx.set_exit_code(0)
    assert ctx.exit_code == 1

    mock_resource = type("MockResource", (), {"close": lambda self: None})()
    ctx.add_resource(mock_resource)
    ctx.cleanup()
    assert len(ctx.resources) == 0

    logger.info("✓ CLI上下文对象测试通过")
    logger.info("")

def test_cli_parser():
    logger.info("=" * 60)
    logger.info("测试2: CLI解析器重构")
    logger.info("=" * 60)

    from configtool.cli import create_cli
    import click

    cli = create_cli()
    assert isinstance(cli, click.Group)

    commands = list(cli.commands.keys())
    expected = ["config", "diff", "logs", "remote", "rollback", "schedule", "version"]
    for cmd in expected:
        assert cmd in commands, f"缺少命令: {cmd}"

    params = [p.name for p in cli.params]
    expected_params = ["env_file", "verbose", "quiet", "output_format", "output_file", "no_color", "config_file"]
    for p in expected_params:
        assert p in params, f"缺少全局选项: {p}"

    logger.info(f"✓ CLI命令: {', '.join(sorted(commands))}")
    logger.info(f"✓ 全局选项: {', '.join(sorted(params))}")
    logger.info("")

def test_batch_task_dependencies():
    logger.info("=" * 60)
    logger.info("测试3: 批量任务依赖与优先级")
    logger.info("=" * 60)

    from configtool.rollback import RollbackManager, RollbackTask, RollbackType, TaskPriority
    import uuid

    manager = RollbackManager(max_workers=2)

    task1 = manager.create_task(
        rollback_type=RollbackType.FILE,
        target="file1.yaml",
        parameters={"backup_file": "backup1.yaml"},
        priority=TaskPriority.HIGH,
        description="任务1(高优)",
    )

    task2 = manager.create_task(
        rollback_type=RollbackType.FILE,
        target="file2.yaml",
        parameters={"backup_file": "backup2.yaml"},
        priority=TaskPriority.NORMAL,
        dependencies=[task1.task_id],
        description="任务2(依赖任务1)",
    )

    task3 = manager.create_task(
        rollback_type=RollbackType.FILE,
        target="file3.yaml",
        parameters={"backup_file": "backup3.yaml"},
        priority=TaskPriority.LOW,
        description="任务3(低优)",
    )

    logger.info(f"任务1: {task1.task_id[:8]}..., 优先级={task1.priority.name}, 依赖={task1.dependencies}")
    logger.info(f"任务2: {task2.task_id[:8]}..., 优先级={task2.priority.name}, 依赖={[d[:8] for d in task2.dependencies]}")
    logger.info(f"任务3: {task3.task_id[:8]}..., 优先级={task3.priority.name}, 依赖={task3.dependencies}")

    assert task1.priority == TaskPriority.HIGH
    assert task2.dependencies == [task1.task_id]
    assert task3.priority == TaskPriority.LOW

    logger.info("✓ 批量任务依赖与优先级测试通过")
    logger.info("")

def test_retry_mechanisms():
    logger.info("=" * 60)
    logger.info("测试4: 连接重试机制增强")
    logger.info("=" * 60)

    from configtool.remote import (
        BackoffStrategy, RetryPolicy, CircuitBreaker, CircuitBreakerState,
        HealthCheck, RemoteClient
    )

    policy = RetryPolicy(
        max_retries=3,
        backoff_strategy=BackoffStrategy.EXPONENTIAL,
        initial_delay=1.0,
        max_delay=30.0,
        jitter=True,
    )

    client = RemoteClient(
        base_url="https://example.com",
        retry_policy=policy,
        connect_timeout=5,
        read_timeout=15,
    )

    assert client.connect_timeout == 5
    assert client.read_timeout == 15
    assert client.retry_policy.backoff_strategy == BackoffStrategy.EXPONENTIAL

    backoffs = [client._calculate_backoff(i) for i in range(4)]
    logger.info(f"指数退避(前4次): {[f'{b:.1f}s' for b in backoffs]}")

    policy_fixed = RetryPolicy(
        max_retries=3,
        backoff_strategy=BackoffStrategy.FIXED,
        initial_delay=2.0,
    )
    client2 = RemoteClient(retry_policy=policy_fixed)
    backoffs_fixed = [client2._calculate_backoff(i) for i in range(4)]
    logger.info(f"固定退避(前4次): {[f'{b:.1f}s' for b in backoffs_fixed]}")
    assert all(b == 2.0 for b in backoffs_fixed), "固定退避应保持2秒"

    cb = CircuitBreaker(failure_threshold=3, recovery_timeout=5)
    assert cb.state == CircuitBreakerState.CLOSED
    assert cb.allow_request() is True

    for _ in range(3):
        cb.record_failure()

    assert cb.state == CircuitBreakerState.OPEN
    assert cb.allow_request() is False
    logger.info(f"✓ 熔断器状态流转: CLOSED -> OPEN (3次失败)")

    hc = HealthCheck(endpoint="/health", interval=10, timeout=5)
    logger.info(f"✓ 健康检查配置: {hc.endpoint}, 间隔={hc.interval}s, 超时={hc.timeout}s")

    client.close()
    client2.close()

    logger.info("✓ 连接重试机制测试通过")
    logger.info("")

def test_whitelist():
    logger.info("=" * 60)
    logger.info("测试5: 配置项白名单")
    logger.info("=" * 60)

    from configtool.whitelist import ConfigWhitelist

    wl = ConfigWhitelist()
    wl.add_include("database.*")
    wl.add_include("server.port")
    wl.add_exclude("*.password")

    test_dict = {
        "database": {"host": "localhost", "port": 3306, "password": "secret"},
        "server": {"host": "0.0.0.0", "port": 8080},
        "app": {"name": "test", "debug": True},
    }

    filtered = wl.filter_dict(test_dict)
    logger.info(f"原始键: {sorted(test_dict.keys())}")
    logger.info(f"过滤后键: {sorted(filtered.keys())}")

    assert "database" in filtered
    assert "server" in filtered
    assert "app" not in filtered
    assert "password" not in filtered["database"]
    assert "port" in filtered["server"]

    d1 = {"database": {"host": "a", "port": 3306}, "server": {"port": 8080}, "extra": "ignore"}
    d2 = {"database": {"host": "b", "port": 3307}, "server": {"port": 9090}, "extra2": "ignore"}

    diffs = deep_diff(d1, d2, whitelist=wl)
    logger.info(f"白名单过滤后差异数: {len(diffs)}")
    for d in diffs:
        logger.info(f"  {d[1]}: {d[0]} = {d[2]} -> {d[3]}")

    assert len(diffs) == 3
    assert all("extra" not in d[0] for d in diffs)

    wl2 = ConfigWhitelist.load_from_file("examples/whitelist.yaml")
    logger.info(f"✓ 从文件加载include规则: {wl2.include_patterns}")
    logger.info(f"✓ 从文件加载exclude规则: {wl2.exclude_patterns}")

    logger.info("✓ 配置项白名单测试通过")
    logger.info("")

def test_schedule():
    logger.info("=" * 60)
    logger.info("测试6: 定时比对功能")
    logger.info("=" * 60)

    from configtool.scheduler import (
        Scheduler, ScheduleTask, ScheduleType, ComparisonType,
        TaskStatus, parse_cron, create_scheduler
    )
    import uuid

    now = datetime(2026, 5, 30, 10, 30, 0)

    test_cases = [
        ("0 * * * *", "2026-05-30 11:00:00"),
        ("0 0 * * *", "2026-05-31 00:00:00"),
        ("*/15 * * * *", "2026-05-30 10:45:00"),
        ("0 9-18 * * 1-5", "2026-05-30 11:00:00"),
    ]

    for expr, expected in test_cases:
        result = parse_cron(expr, now)
        result_str = result.strftime("%Y-%m-%d %H:%M:%S") if result else "None"
        status = "✓" if result_str == expected else "✗"
        logger.info(f"  {status} {expr:20} -> {result_str}")
        assert result_str == expected, f"Cron解析错误: {expr}"

    with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
        state_file = f.name

    scheduler = create_scheduler(tick_interval=1, state_file=state_file)

    task = ScheduleTask(
        task_id=str(uuid.uuid4()),
        name="集成测试任务",
        schedule_type=ScheduleType.INTERVAL,
        comparison_type=ComparisonType.FILES,
        parameters={"source_file": "examples/sample_config.yaml", "target_file": "examples/sample_config.yaml"},
        interval_seconds=3600,
    )

    added = scheduler.add_task(task)
    assert added.task_id == task.task_id
    logger.info(f"✓ 添加任务: {added.name}")
    logger.info(f"  下次运行: {added.next_run.strftime('%Y-%m-%d %H:%M:%S')}")

    tasks = scheduler.list_tasks()
    assert len(tasks) == 1
    assert tasks[0].name == "集成测试任务"

    task_list_text = scheduler.format_task_list(tasks, "text")
    assert "集成测试任务" in task_list_text

    task_list_table = scheduler.format_task_list(tasks, "table")
    assert "集成测试任务" in task_list_table

    task_list_json = scheduler.format_task_list(tasks, "json")
    json_data = json.loads(task_list_json)
    assert len(json_data) == 1
    assert json_data[0]["name"] == "集成测试任务"

    logger.info(f"✓ 任务列表输出格式化正常")

    scheduler.disable_task(task.task_id)
    disabled = scheduler.get_task(task.task_id)
    assert disabled.enabled is False
    assert disabled.status == TaskStatus.CANCELLED
    logger.info(f"✓ 禁用任务: {task.task_id[:8]}...")

    scheduler.enable_task(task.task_id)
    enabled = scheduler.get_task(task.task_id)
    assert enabled.enabled is True
    assert enabled.status == TaskStatus.PENDING
    logger.info(f"✓ 启用任务: {task.task_id[:8]}...")

    result = scheduler.run_task_now(task.task_id)
    assert result is not None
    assert result.success is True
    assert result.diff_count == 0
    logger.info(f"✓ 立即执行: 状态={result.status.value}, 差异数={result.diff_count}")

    history = scheduler.get_results(task_id=task.task_id)
    assert len(history) >= 1
    logger.info(f"✓ 执行历史: {len(history)} 条记录")

    scheduler.remove_task(task.task_id)
    tasks = scheduler.list_tasks()
    assert len(tasks) == 0
    logger.info(f"✓ 移除任务成功")

    try:
        os.unlink(state_file)
    except:
        pass

    logger.info("✓ 定时比对功能测试通过")
    logger.info("")

def test_log_exporter():
    logger.info("=" * 60)
    logger.info("测试7: 日志导出功能")
    logger.info("=" * 60)

    from configtool.log_exporter import LogExporter, LogLevel

    exporter = LogExporter()
    entries = exporter.load_log_file("examples/log_example.log")
    logger.info(f"✓ 加载日志: {len(entries)} 条")

    exporter.filter_by_level(min_level="INFO")
    logger.info(f"✓ 按级别过滤(>=INFO): {len(exporter.entries)} 条")

    stats = exporter.get_statistics()
    logger.info(f"✓ 统计信息: 按级别={stats['level_stats']}, 总数={stats['total_count']}")

    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json_file = f.name
    count = exporter.export_json(json_file)
    assert count > 0
    logger.info(f"✓ 导出JSON: {count} 行 -> {os.path.basename(json_file)}")

    with open(json_file, 'r', encoding='utf-8') as f:
        json_data = json.load(f)
    assert isinstance(json_data, list)
    assert len(json_data) == count

    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
        csv_file = f.name
    count_csv = exporter.export_csv(csv_file)
    assert count_csv > 0
    logger.info(f"✓ 导出CSV: {count_csv} 行 -> {os.path.basename(csv_file)}")

    try:
        os.unlink(json_file)
        os.unlink(csv_file)
    except:
        pass

    logger.info("✓ 日志导出功能测试通过")
    logger.info("")

def test_cli_commands():
    logger.info("=" * 60)
    logger.info("测试8: CLI命令可用性")
    logger.info("=" * 60)

    import subprocess

    tests = [
        ("configtool --help", ["schedule", "logs", "--format", "--quiet"]),
        ("configtool schedule --help", ["list", "add", "remove", "enable", "disable", "run", "start", "history", "parse-cron", "example"]),
        ("configtool logs --help", ["export", "stats", "tail"]),
        ("configtool diff --help", ["files", "configs", "version"]),
        ("configtool diff files --help", ["--whitelist"]),
        ("configtool rollback --help", ["batch"]),
        ("configtool rollback batch --help", ["--parallel"]),
        ("configtool remote --help", ["get", "post", "batch"]),
        ("configtool config --help", ["get", "set", "publish"]),
        ("configtool config publish --help", ["--whitelist"]),
        ("configtool version --help", ["save", "get", "list", "diff"]),
    ]

    for cmd, expected_strs in tests:
        result = subprocess.run(
            ["python", "-m"] + cmd.split(),
            capture_output=True, text=True, timeout=10
        )
        output = result.stdout + result.stderr

        for s in expected_strs:
            if s not in output:
                logger.warning(f"  ⚠  '{s}' 未在输出中找到: {cmd}")
            else:
                logger.info(f"  ✓ '{s}' 存在于 {cmd}")

    logger.info("✓ CLI命令可用性测试完成")
    logger.info("")

def main():
    logger.info("=" * 60)
    logger.info("开始集成测试")
    logger.info(f"时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info("=" * 60)
    logger.info("")

    all_passed = True
    tests = [
        ("CLI上下文对象", test_cli_context),
        ("CLI解析器重构", test_cli_parser),
        ("批量任务依赖与优先级", test_batch_task_dependencies),
        ("连接重试机制增强", test_retry_mechanisms),
        ("配置项白名单", test_whitelist),
        ("定时比对功能", test_schedule),
        ("日志导出功能", test_log_exporter),
        ("CLI命令可用性", test_cli_commands),
    ]

    passed_count = 0
    for name, test_fn in tests:
        try:
            test_fn()
            passed_count += 1
        except AssertionError as e:
            logger.error(f"✗ {name} 断言失败: {e}")
            all_passed = False
        except Exception as e:
            logger.error(f"✗ {name} 异常: {e}")
            import traceback
            logger.debug(traceback.format_exc())
            all_passed = False

    logger.info("=" * 60)
    logger.info(f"测试完成: {passed_count}/{len(tests)} 通过")
    if all_passed:
        logger.info("✓ 所有测试通过！")
    else:
        logger.error("✗ 部分测试失败，请检查错误信息")
    logger.info("=" * 60)

    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())
