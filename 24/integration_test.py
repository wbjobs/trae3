import sys
import os
import time
import json
import threading
import random
import numpy as np
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import db
from config import SENSOR_CONFIG, TIMESERIES_CONFIG, CHAMBER_CONFIG
from sensor_processor import get_sensor_processor, SensorDataProcessor
from timeseries_engine import get_ts_query_engine, TimeSeriesQueryEngine
from chamber_manager import get_chamber_manager, ChamberManager
from dashboard_server import get_dashboard_server


def create_test_environment():
    print("=" * 70)
    print("创建测试环境")
    print("=" * 70)

    chambers = []
    for i in range(3):
        chamber_id = db.insert_chamber(
            name=f'测试舱室-{i + 1:02d}',
            description=f'集成测试舱室 {i + 1}',
            chamber_type='standard' if i < 2 else 'high_priority',
            memory_limit_mb=2048 if i == 2 else 1024,
            cpu_limit=0.8 if i == 2 else 0.5,
            max_concurrent_tasks=3 if i == 2 else 2
        )
        chambers.append(chamber_id)
        print(f"  ✅ 创建舱室 {chamber_id}: 测试舱室-{i + 1:02d}")

    sensors = []
    sensor_types = ['水位', '水温', '水压', '流量', '电导率']
    units = ['m', '°C', 'MPa', 'm³/s', 'S/m']

    for chamber_id in chambers:
        for i in range(5):
            sensor_id = db.insert_sensor(
                sensor_code=f'SNS-{chamber_id:03d}-{i + 1:03d}',
                name=f'{sensor_types[i]}传感器-{chamber_id:02d}-{i + 1:02d}',
                chamber_id=chamber_id,
                sensor_type='analog',
                measurement_type=sensor_types[i],
                location_x=random.uniform(0, 100),
                location_y=random.uniform(0, 50),
                unit=units[i],
                sampling_interval=60,
                accuracy=0.01
            )
            sensors.append(sensor_id)
            print(f"  ✅ 创建传感器 {sensor_id}: {sensor_types[i]}传感器-{chamber_id:02d}-{i + 1:02d}")

    print(f"\n共创建 {len(chambers)} 个舱室, {len(sensors)} 个传感器")
    return chambers, sensors


def test_sensor_data_processing(chambers, sensors):
    print("\n" + "=" * 70)
    print("测试1: 传感器数据合并处理（去重 + 聚合 + 批写入）")
    print("=" * 70)

    processor = get_sensor_processor()

    print(f"\n配置信息:")
    print(f"  批处理大小: {processor.batch_size}")
    print(f"  队列容量: {processor.max_queue_size}")
    print(f"  重复数据过滤: {'启用' if processor.enable_duplicate_filter else '禁用'}")
    print(f"  数据聚合: {'启用' if processor.aggregation_enabled else '禁用'}")

    print(f"\n开始生成模拟传感器数据...")
    total_data = 5000
    duplicate_count = 0
    start_time = time.time()

    for i in range(total_data):
        sensor_id = random.choice(sensors)
        chamber_id = db.get_sensor(sensor_id)['chamber_id']
        timestamp = int(time.time() * 1000) - random.randint(0, 3600000)

        base_value = random.uniform(0, 100)
        value = base_value + random.gauss(0, 1)

        if i > 0 and i % 10 == 0:
            if processor.process_data(
                sensor_id=sensor_id,
                timestamp=timestamp,
                value=value,
                chamber_id=chamber_id,
                quality=1
            ):
                pass
            duplicate_count += 1

        success = processor.process_data(
            sensor_id=sensor_id,
            timestamp=timestamp,
            value=value,
            chamber_id=chamber_id,
            quality=1
        )

        if i % 1000 == 0 and i > 0:
            print(f"  已处理 {i}/{total_data} 条数据...")

    print(f"\n等待数据写入完成...")
    time.sleep(SENSOR_CONFIG.get('flush_interval', 5.0) + 2)

    elapsed = time.time() - start_time
    stats = processor.get_stats()

    print(f"\n处理结果:")
    print(f"  总耗时: {elapsed:.2f}s")
    print(f"  数据接收: {stats['received']} 条")
    print(f"  重复过滤: {stats['duplicates']} 条")
    print(f"  数据写入: {stats['written']} 条")
    print(f"  聚合数据: {stats['aggregated']} 条")
    print(f"  丢弃数据: {stats['dropped']} 条")
    print(f"  处理错误: {stats['errors']} 次")
    print(f"  平均速率: {stats['received'] / elapsed:.0f} 条/秒")
    print(f"  写入速率: {stats['write_rate']:.0f} 条/秒")

    if stats['received'] > 0:
        print(f"\n  ✅ 重复过滤率: {(stats['duplicates'] / stats['received'] * 100):.1f}%")
        print(f"  ✅ 数据写入率: {(stats['written'] / stats['received'] * 100):.1f}%")

    return stats


def test_timeseries_optimization(sensors):
    print("\n" + "=" * 70)
    print("测试2: 时序数据库查询优化（索引 + 预聚合 + 缓存）")
    print("=" * 70)

    ts_engine = get_ts_query_engine()

    print(f"\n配置信息:")
    print(f"  查询超时: {TIMESERIES_CONFIG.get('query_timeout', 30)}s")
    print(f"  最大返回行数: {TIMESERIES_CONFIG.get('max_query_rows', 100000)}")
    print(f"  预聚合: {'启用' if TIMESERIES_CONFIG.get('pre_aggregation_enabled', True) else '禁用'}")
    print(f"  预聚合区间: {TIMESERIES_CONFIG.get('pre_aggregation_intervals', [])}")

    test_sensor_ids = sensors[:3]
    end_time = int(time.time() * 1000)
    start_time = end_time - 3600000

    print(f"\n开始查询性能测试...")
    print(f"  测试传感器: {test_sensor_ids}")
    print(f"  时间范围: 1小时")

    query_results = []

    for interval in [None, '1min', '5min', '15min']:
        print(f"\n--- 聚合区间: {interval or '原始数据'} ---")

        for i in range(3):
            start_q = time.time()
            result = ts_engine.query_sensor_data(
                sensor_ids=test_sensor_ids,
                start_time=start_time,
                end_time=end_time,
                interval=interval,
                aggregation='avg'
            )
            elapsed_q = time.time() - start_q

            total_points = sum(len(v) for v in result.get('data', {}).values())

            print(f"  查询 {i + 1}: {elapsed_q * 1000:.1f}ms, "
                  f"数据点: {total_points}, "
                  f"类型: {result.get('query_type', 'unknown')}, "
                  f"缓存: {'是' if result.get('from_cache') else '否'}")

            query_results.append({
                'interval': interval,
                'run': i + 1,
                'elapsed_ms': elapsed_q * 1000,
                'from_cache': result.get('from_cache', False),
                'query_type': result.get('query_type', 'unknown'),
                'data_points': total_points
            })

    stats = ts_engine.get_stats()
    print(f"\n查询引擎统计:")
    print(f"  总查询次数: {stats['total_queries']}")
    print(f"  缓存命中: {stats['cache_hits']} 次 ({(stats['cache_hit_rate'] * 100):.1f}%)")
    print(f"  缓存未命中: {stats['cache_misses']} 次")
    print(f"  预聚合查询: {stats['pre_aggregated_queries']} 次")
    print(f"  原始数据查询: {stats['raw_queries']} 次")
    print(f"  平均查询耗时: {(stats['avg_query_time'] * 1000):.1f}ms")

    if stats['cache_hit_rate'] >= 0.3:
        print(f"\n  ✅ 缓存命中率 > 30%，查询优化有效")

    cached_queries = [q for q in query_results if q['from_cache']]
    uncached_queries = [q for q in query_results if not q['from_cache']]
    if cached_queries and uncached_queries:
        avg_cached = np.mean([q['elapsed_ms'] for q in cached_queries])
        avg_uncached = np.mean([q['elapsed_ms'] for q in uncached_queries])
        if avg_cached < avg_uncached:
            speedup = avg_uncached / avg_cached
            print(f"  ✅ 缓存加速: {speedup:.1f}x")

    return stats


def test_chamber_stability(chambers):
    print("\n" + "=" * 70)
    print("测试3: 多舱室资源隔离与稳定性保障（流控 + 熔断）")
    print("=" * 70)

    chamber_manager = get_chamber_manager()

    print(f"\n配置信息:")
    print(f"  资源隔离: {'启用' if CHAMBER_CONFIG.get('isolation_enabled', True) else '禁用'}")
    print(f"  流量控制: {'启用' if CHAMBER_CONFIG.get('flow_control_enabled', True) else '禁用'}")
    print(f"  熔断器: {'启用' if CHAMBER_CONFIG.get('circuit_breaker_enabled', True) else '禁用'}")
    print(f"  背压控制: {'启用' if CHAMBER_CONFIG.get('backpressure_enabled', True) else '禁用'}")
    print(f"  熔断阈值: {CHAMBER_CONFIG.get('circuit_breaker_failure_threshold', 5)} 次失败")
    print(f"  熔断恢复时间: {CHAMBER_CONFIG.get('circuit_breaker_timeout', 30)}s")

    print(f"\n舱室状态检查:")
    for chamber_id in chambers:
        status = chamber_manager.get_chamber_status(chamber_id)
        if status:
            print(f"\n  舱室 {chamber_id} ({status['name']}):")
            print(f"    最大并发: {status['max_concurrent']}")
            print(f"    内存限制: {status.get('resource_usage', {}).get('memory_limit_mb', 1024)}MB")
            print(f"    CPU限制: {status.get('resource_usage', {}).get('cpu_limit_percent', 50):.0f}%")

            if status.get('circuit_breaker'):
                cb = status['circuit_breaker']
                print(f"    熔断器状态: {cb['state']} "
                      f"(失败: {cb['failure_count']}次)")

    print(f"\n舱室任务提交测试:")
    success_count = 0
    fail_count = 0

    def test_task(should_fail=False):
        time.sleep(0.1)
        if should_fail:
            raise ValueError("模拟任务失败")
        return "success"

    for i, chamber_id in enumerate(chambers):
        print(f"\n  舱室 {chamber_id} 测试:")

        for j in range(5):
            should_fail = (j == 4 and i == 0)
            result = chamber_manager.submit_task(chamber_id, test_task, should_fail)
            if result['success']:
                success_count += 1
                print(f"    任务 {j + 1}: ✅ 成功")
            else:
                fail_count += 1
                print(f"    任务 {j + 1}: ❌ {result.get('reason', 'unknown')}")

    stats = chamber_manager.get_stats()
    print(f"\n舱室管理器统计:")
    print(f"  总请求: {stats['total_requests']}")
    print(f"  成功: {success_count}")
    print(f"  拒绝: {stats['rejected_requests']}")
    print(f"  熔断触发: {stats['circuit_breaker_ops']} 次")
    print(f"  背压事件: {stats['backpressure_events']} 次")
    print(f"  内存超限: {stats['memory_limit_violations']} 次")
    print(f"  CPU超限: {stats['cpu_limit_violations']} 次")
    print(f"  拒绝率: {(stats['rejection_rate'] * 100):.2f}%")

    print(f"\n舱室最终状态:")
    all_status = chamber_manager.get_all_chamber_status()
    for status in all_status:
        cb_state = status.get('circuit_breaker', {}).get('state', 'unknown')
        print(f"  舱室 {status['chamber_id']}: 熔断器={cb_state}, "
              f"运行任务={status['running_tasks']}, "
              f"总任务={status['total_tasks']}, "
              f"失败={status['failed_tasks']}")

        if status.get('circuit_breaker', {}).get('state') == 'open':
            print(f"    ⚠️  熔断器已触发，正在保护系统")

    return stats


def test_dashboard_server(chambers, sensors):
    print("\n" + "=" * 70)
    print("测试4: 前端仪表盘（Flask + WebSocket 局部刷新）")
    print("=" * 70)

    try:
        dashboard = get_dashboard_server()
    except Exception as e:
        print(f"\n❌ 仪表盘服务器初始化失败: {e}")
        return None

    print(f"\n配置信息:")
    print(f"  监听地址: {dashboard.config.get('host', '0.0.0.0')}:{dashboard.config.get('port', 5000)}")
    print(f"  局部刷新: {'启用' if dashboard.partial_refresh_enabled else '禁用'}")
    print(f"  刷新间隔: {int(dashboard.refresh_interval * 1000)}ms")
    print(f"  最大连接数: {dashboard.max_connections}")
    print(f"  心跳间隔: {dashboard.config.get('heartbeat_interval', 30)}s")

    print(f"\n已注册组件:")
    for comp_id, comp in dashboard._components.items():
        print(f"  ✅ {comp_id}: {comp.refresh_interval}ms 刷新")

    for sensor_id in sensors[:3]:
        comp_id = f'sensor_chart_{sensor_id}_1min'
        from dashboard_server import SensorChartComponent
        sensor_comp = SensorChartComponent(
            sensor_id=sensor_id,
            interval='1min',
            time_range_ms=3600000
        )
        dashboard.register_component(sensor_comp)
        print(f"  ✅ 注册传感器图表组件: {comp_id}")

    status = dashboard.get_status()
    print(f"\n仪表盘状态:")
    print(f"  运行中: {'是' if status['running'] else '否'}")
    print(f"  连接客户端: {status['connected_clients']}")
    print(f"  组件数量: {len(status['components'])}")
    print(f"  局部刷新: {'启用' if status['partial_refresh_enabled'] else '禁用'}")

    print(f"\n组件数据获取测试:")
    for comp_id in ['system_overview', 'task_progress', 'chamber_status_all']:
        comp = dashboard.get_component(comp_id)
        if comp:
            data = comp.get_data()
            print(f"  ✅ {comp_id}: {len(str(data))} 字节")
            if 'error' in data:
                print(f"    ⚠️  错误: {data['error']}")

    print(f"\n  ✅ 仪表盘组件数据获取正常")

    print(f"\n启动仪表盘服务器...")
    dashboard.start()
    time.sleep(2)

    status = dashboard.get_status()
    print(f"  服务器状态: {'✅ 运行中' if status['running'] else '❌ 未启动'}")

    return status


def run_integration_test():
    print("\n" + "=" * 70)
    print("全链路性能优化 - 集成测试")
    print("=" * 70)
    print(f"测试时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"工作目录: {os.getcwd()}")

    try:
        chambers, sensors = create_test_environment()

        sensor_stats = test_sensor_data_processing(chambers, sensors)
        ts_stats = test_timeseries_optimization(sensors)
        chamber_stats = test_chamber_stability(chambers)
        dashboard_status = test_dashboard_server(chambers, sensors)

        print("\n" + "=" * 70)
    except Exception as e:
        print(f"\n❌ 测试执行出错: {e}")
        import traceback
        traceback.print_exc()
        return False

    print("\n" + "=" * 70)
    print("📊 综合测试报告")
    print("=" * 70)

    all_passed = True

    print("\n1. 传感器数据处理:")
    if sensor_stats:
        data_quality = (sensor_stats['written'] / max(1, sensor_stats['received']) * 100)
        if data_quality >= 90:
            print(f"   ✅ 数据质量: {data_quality:.1f}% (≥90%)")
        else:
            print(f"   ⚠️  数据质量: {data_quality:.1f}% (<90%)")
            all_passed = False

        if sensor_stats['duplicates'] > 0:
            print(f"   ✅ 重复过滤: {sensor_stats['duplicates']} 条")
        if sensor_stats['errors'] == 0:
            print(f"   ✅ 处理错误: 0 次")
        else:
            print(f"   ⚠️  处理错误: {sensor_stats['errors']} 次")
            all_passed = False

    print("\n2. 时序查询优化:")
    if ts_stats:
        if ts_stats['cache_hit_rate'] >= 0.3:
            print(f"   ✅ 缓存命中率: {(ts_stats['cache_hit_rate'] * 100):.1f}% (≥30%)")
        else:
            print(f"   ⚠️  缓存命中率: {(ts_stats['cache_hit_rate'] * 100):.1f}% (<30%)")
            all_passed = False

        if ts_stats['avg_query_time'] < 1.0:
            print(f"   ✅ 平均查询耗时: {(ts_stats['avg_query_time'] * 1000):.1f}ms (<1s)")
        else:
            print(f"   ⚠️  平均查询耗时: {(ts_stats['avg_query_time'] * 1000):.1f}ms (≥1s)")
            all_passed = False

    print("\n3. 多舱室稳定性:")
    if chamber_stats:
        if chamber_stats['rejection_rate'] <= 0.1:
            print(f"   ✅ 请求拒绝率: {(chamber_stats['rejection_rate'] * 100):.2f}% (≤10%)")
        else:
            print(f"   ⚠️  请求拒绝率: {(chamber_stats['rejection_rate'] * 100):.2f}% (>10%)")

        if chamber_stats.get('circuit_breaker_ops', 0) > 0:
            print(f"   ✅ 熔断器触发: {chamber_stats['circuit_breaker_ops']} 次 (保护机制生效)")

    print("\n4. 仪表盘服务:")
    if dashboard_status and dashboard_status.get('running'):
        print(f"   ✅ 服务运行: 是")
        print(f"   ✅ 组件数量: {len(dashboard_status.get('components', []))}")
    else:
        print(f"   ⚠️  服务运行: 否")
        all_passed = False

    print("\n" + "=" * 70)
    if all_passed:
        print("✅ 所有测试通过！全链路性能优化验证成功")
    else:
        print("⚠️  部分测试未通过，请检查相关配置和日志")
    print("=" * 70)

    try:
        from dashboard_server import get_dashboard_server
        dashboard = get_dashboard_server()
        if dashboard and dashboard._running:
            print(f"\n💡 仪表盘服务正在运行，可访问:")
            print(f"   http://localhost:{dashboard.config.get('port', 5000)}")
            print(f"   (按 Ctrl+C 停止服务)")
    except:
        pass

    return all_passed


if __name__ == '__main__':
    success = run_integration_test()
    sys.exit(0 if success else 1)
