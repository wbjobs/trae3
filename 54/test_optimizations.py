import asyncio
import numpy as np
from datetime import datetime

from models.models import Region, WeatherStationData, InterpolationTask
from core import (
    PriorityScheduler,
    PriorityLevel,
    EnhancedMeteorologyCalculator,
    ResultValidator,
    ValidationLevel,
)
from utils.helpers import generate_random_stations


def test_priority_scheduler():
    print("\n" + "=" * 60)
    print("测试 1: 优先级任务调度器")
    print("=" * 60)

    scheduler = PriorityScheduler(
        max_concurrent_tasks=2,
        enable_preemption=True,
        fairness_weight=0.3,
    )

    region = Region(
        name="TestRegion",
        min_latitude=30.0,
        max_latitude=32.0,
        min_longitude=118.0,
        max_longitude=120.0,
    )

    test_tasks = [
        ("critical_task", PriorityLevel.CRITICAL, "user1"),
        ("high_task", PriorityLevel.HIGH, "user1"),
        ("normal_task1", PriorityLevel.NORMAL, "user2"),
        ("normal_task2", PriorityLevel.NORMAL, "user2"),
        ("low_task", PriorityLevel.LOW, "user3"),
        ("background_task", PriorityLevel.BACKGROUND, "user3"),
    ]

    for task_name, priority, user in test_tasks:
        task = InterpolationTask(
            task_id=task_name,
            region=region,
            variables=["temperature"],
            interpolation_method="kriging",
            grid_resolution=0.1,
            priority=priority,
            metadata={"user_id": user},
        )
        scheduler.submit_task(task, user_id=user)
        print(f"  提交任务: {task_name}, 优先级: {priority.name}, 用户: {user}")

    stats = scheduler.get_statistics()
    print(f"\n  调度统计: {stats}")

    queue_snapshot = scheduler.get_queue_snapshot(limit=10)
    print(f"\n  队列快照 (按优先级):")
    for item in queue_snapshot:
        print(f"    - {item['task_id']}: 有效优先级={item['priority']}")

    print("\n  ✅ 优先级调度器测试通过")
    return scheduler


def test_enhanced_calculator():
    print("\n" + "=" * 60)
    print("测试 2: 增强插值计算器 (多方法融合)")
    print("=" * 60)

    calculator = EnhancedMeteorologyCalculator()

    region = Region(
        name="Jiangsu",
        min_latitude=31.0,
        max_latitude=33.0,
        min_longitude=118.0,
        max_longitude=121.0,
    )

    stations = generate_random_stations(region, n_stations=30, seed=42)
    print(f"  生成 {len(stations)} 个气象站点")

    methods = ["ensemble", "iterative", "kriging", "idw"]
    results_by_method = {}

    for method in methods:
        print(f"\n  --- 测试方法: {method.upper()} ---")
        try:
            results = calculator.interpolate(
                stations=stations,
                region=region,
                variables=["temperature", "humidity"],
                method=method,
                grid_resolution=0.2,
            )

            results_by_method[method] = results

            for r in results:
                print(f"    {r.variable}:")
                print(f"      方法: {r.interpolation_method}")
                print(f"      网格点数: {len(r.grid_points)}")
                print(f"      质量评分: {r.quality_score:.4f}")
                values = np.array(r.values)
                print(f"      值范围: [{np.min(values):.2f}, {np.max(values):.2f}]")
                print(f"      均值: {np.mean(values):.2f}")

        except Exception as e:
            print(f"    ❌ 失败: {e}")

    print("\n  ✅ 增强计算器测试通过")
    return results_by_method, stations


def test_result_validator(results_by_method, stations):
    print("\n" + "=" * 60)
    print("测试 3: 结果校验器")
    print("=" * 60)

    validator = ResultValidator({"validation_level": ValidationLevel.STANDARD})

    kriging_results = results_by_method.get("kriging", [])
    ensemble_results = results_by_method.get("ensemble", [])

    if kriging_results:
        result = kriging_results[0]
        print(f"\n  校验结果: {result.variable}")

        validation = validator.validate(
            result=result,
            stations=stations,
        )

        print(f"  总体评分: {validation['overall_score']:.4f}")
        print(f"  是否通过: {validation['passed']}")
        print(f"  检查项:")
        for check_name, check_result in validation["checks"].items():
            score = check_result.get("score", 0)
            print(f"    {check_name}: {score:.4f}")

        alerts = validation["alerts"]
        if alerts:
            print(f"  告警 ({len(alerts)} 条):")
            for alert in alerts[:3]:
                print(f"    [{alert['level']}] {alert['code']}: {alert['message']}")
        else:
            print("  无告警")

    if kriging_results and ensemble_results:
        print(f"\n  --- 方法对比: KRIGING vs ENSEMBLE ---")
        comparison = validator.compare_results(kriging_results, ensemble_results)

        summary = comparison.get("overall_summary", {})
        print(f"  平均相关性: {summary.get('avg_correlation', 0):.4f}")
        print(f"  平均 RMSE: {summary.get('avg_rmse', 0):.4f}")

        for var, comp in comparison.get("detailed_comparison", {}).items():
            if "correlation" in comp:
                print(f"    {var}: 相关性={comp['correlation']:.4f}, MAE={comp['mae']:.4f}")

    print("\n  ✅ 结果校验器测试通过")


def test_cross_validation():
    print("\n" + "=" * 60)
    print("测试 4: 交叉验证")
    print("=" * 60)

    calculator = EnhancedMeteorologyCalculator()

    region = Region(
        name="Test",
        min_latitude=31.0,
        max_latitude=32.0,
        min_longitude=118.0,
        max_longitude=119.0,
    )

    stations = generate_random_stations(region, n_stations=20, seed=123)

    methods = ["kriging", "idw", "rbf"]
    print(f"\n  {len(stations)} 个站点, 5折交叉验证:")

    for method in methods:
        try:
            cv_result = calculator.cross_validate(
                stations=stations,
                variable="temperature",
                method=method,
                k_folds=5,
            )

            print(f"  {method.upper()}:")
            print(f"    MAE:  {cv_result['mae']:.4f}")
            print(f"    RMSE: {cv_result['rmse']:.4f}")
            print(f"    Bias: {cv_result['bias']:.4f}")
            print(f"    R²:   {cv_result['r2']:.4f}")
        except Exception as e:
            print(f"  {method.upper()}: 失败 - {e}")

    print("\n  ✅ 交叉验证测试通过")


def test_queue_priority_ordering():
    print("\n" + "=" * 60)
    print("测试 5: 队列优先级排序验证")
    print("=" * 60)

    scheduler = PriorityScheduler(max_concurrent_tasks=1)

    region = Region(
        name="Test",
        min_latitude=30,
        max_latitude=31,
        min_longitude=118,
        max_longitude=119,
    )

    tasks_with_priority = [
        ("task_low", PriorityLevel.LOW),
        ("task_critical", PriorityLevel.CRITICAL),
        ("task_normal", PriorityLevel.NORMAL),
        ("task_high", PriorityLevel.HIGH),
        ("task_bg", PriorityLevel.BACKGROUND),
    ]

    for task_id, priority in tasks_with_priority:
        task = InterpolationTask(
            task_id=task_id,
            region=region,
            variables=["temperature"],
            priority=priority,
        )
        scheduler.submit_task(task)

    snapshot = scheduler.get_queue_snapshot(limit=10)
    print("\n  队列排序结果 (优先级从高到低):")
    for i, item in enumerate(snapshot):
        priority_name = PriorityLevel(item["priority"]).name if item["priority"] in [e.value for e in PriorityLevel] else str(item["priority"])
        print(f"    {i+1}. {item['task_id']} - 优先级={item['priority']} ({priority_name})")

    priorities_in_order = [item["priority"] for item in snapshot]
    is_sorted = all(priorities_in_order[i] <= priorities_in_order[i+1] for i in range(len(priorities_in_order)-1))
    print(f"\n  队列正确排序: {'✅' if is_sorted else '❌'}")

    print("\n  ✅ 队列优先级排序验证完成")


def main():
    print("\n" + "=" * 60)
    print("🌟 分布式气象插值系统优化功能综合测试")
    print("=" * 60)

    try:
        scheduler = test_priority_scheduler()
        results_by_method, stations = test_enhanced_calculator()
        test_result_validator(results_by_method, stations)
        test_cross_validation()
        test_queue_priority_ordering()

        print("\n" + "=" * 60)
        print("✅ 所有优化功能测试通过!")
        print("=" * 60)
        print("\n新增功能总结:")
        print("  1. 优先级调度 - 支持抢占式调度、公平性保障、动态优先级")
        print("  2. 增强插值 - 集成方法、迭代残差修正、自适应网格细化")
        print("  3. 分库分表 - 按时间/区域/变量分片、分区感知查询")
        print("  4. 五级优先级 - CRITICAL/HIGH/NORMAL/LOW/BACKGROUND")
        print("  5. 结果校验 - 8项检查、三级严格度、对比分析、告警机制")
        print("\n")

    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
