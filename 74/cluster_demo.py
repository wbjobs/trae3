import asyncio
import sys
import os
import logging

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from common.config import load_config
from common.models import Task, TaskPriority, ComputeNode
from master import ClusterMaster, ClusterWorker
from sediment import create_model, list_models
from storage import StorageManager, ResultComparator, PartitionStrategy

logger = logging.getLogger(__name__)


async def run_full_demo(config_path: str = None):
    config = load_config(config_path)
    master = ClusterMaster(config_path)
    await master.start()

    logger.info("=== 集群水文泥沙计算系统优化功能演示 ===")
    logger.info(f"可用泥沙模型: {list_models()}")

    lb_status = master._node_manager.balancer.get_strategy_status()
    logger.info(f"\n负载均衡策略: {lb_status['current_strategy']}")
    logger.info(f"可用策略: {lb_status['available_strategies']}")

    demo_nodes = [
        ComputeNode(
            node_id="compute-node-01",
            host="192.168.1.101",
            port=9501,
            cpu_cores=16,
            memory_gb=64.0,
            capabilities=["yang_sediment", "engelund_hansen", "rouse"],
            max_tasks=8,
        ),
        ComputeNode(
            node_id="compute-node-02",
            host="192.168.1.102",
            port=9501,
            cpu_cores=32,
            memory_gb=128.0,
            capabilities=["yang_sediment", "engelund_hansen"],
            max_tasks=16,
        ),
        ComputeNode(
            node_id="compute-node-03",
            host="192.168.1.103",
            port=9501,
            cpu_cores=8,
            memory_gb=32.0,
            capabilities=["yang_sediment", "rouse"],
            max_tasks=4,
        ),
    ]

    for node in demo_nodes:
        await master.register_worker(node)
        logger.info(f"注册计算节点: {node.node_id} ({node.cpu_cores}核/{node.memory_gb}GB, max_tasks={node.max_tasks})")

    for i, node in enumerate(demo_nodes):
        for j in range(i + 1):
            master._node_manager.registry.record_task_result(node.node_id, True, 1.5 + j * 0.3)

    logger.info("\n--- 节点性能评分 ---")
    for node in demo_nodes:
        perf = master._node_manager.registry.get_node_performance(node.node_id)
        weight = master._node_manager.balancer._calculate_node_weight(node)
        logger.info(
            f"  {node.node_id}: score={weight:.3f}, "
            f"tasks={perf.get('total_tasks', 0)}, "
            f"success_rate={perf.get('success_rate', 0):.2%}"
        )

    logger.info("\n--- 功能1: 自适应时间步长 + 收敛性检测 ---")
    model_adaptive = create_model("yang_sediment", {
        "river_reach": "Yangtze_Adaptive",
        "grain_size": 0.4e-3,
        "specific_gravity": 2.65,
        "water_temperature": 20.0,
        "kinematic_viscosity": 1e-6,
        "time_step": 3600,
        "reach_length": 1500.0,
        "max_bed_change_per_step": 0.5,
        "enable_adaptive_dt": True,
        "enable_convergence_check": True,
        "convergence_window": 10,
        "convergence_threshold": 1e-4,
        "min_dt": 600,
        "max_dt": 7200,
    })

    init_state = {
        "velocity": 1.5,
        "slope": 0.0005,
        "depth": 5.0,
        "width": 200.0,
        "bed_elevation": 0.0,
        "inflow_sediment": 0.001,
    }

    result = model_adaptive.evolve(init_state, time_steps=50, enable_snapshot=True)
    ts = result.get("time_series", [])
    stats = result.get("statistics", {})
    snapshots = result.get("snapshots", [])

    dt_values = [step["dt"] for step in ts if "dt" in step]
    unique_dts = sorted(set(dt_values))
    logger.info(f"  计算完成: {len(ts)} 步, {len(snapshots)} 快照")
    logger.info(f"  收敛状态: {result.get('converged', False)}")
    logger.info(f"  时间步长变化: {[f'{int(dt)}s' for dt in unique_dts]}")
    logger.info(f"  最终浓度: {ts[-1]['concentration']:.4f}")
    logger.info(f"  平均浓度: {stats.get('avg_concentration', 0):.4f}")
    logger.info(f"  P50浓度: {stats.get('p50_concentration', 0):.4f}")

    logger.info("\n--- 功能2: 多分辨率计算与网格收敛指标 ---")
    model_mr = create_model("yang_sediment", {
        "river_reach": "Yangtze_MR",
        "grain_size": 0.4e-3,
        "specific_gravity": 2.65,
        "water_temperature": 20.0,
        "kinematic_viscosity": 1e-6,
        "time_step": 3600,
        "reach_length": 1500.0,
        "max_bed_change_per_step": 0.5,
    })

    mr_result = model_mr.multi_resolution_evolve(init_state, base_steps=12, refinement_levels=3)
    logger.info(f"  网格收敛指数 (GCI): {mr_result.get('grid_convergence_index', 0):.6%}")
    for level_key, level_data in mr_result.get("level_results", {}).items():
        level_ts = level_data.get("time_series", [])
        if level_ts:
            logger.info(f"  {level_key}: {len(level_ts)} 步, 最终浓度={level_ts[-1]['concentration']:.4f}")

    logger.info("\n--- 功能3: 分区存储策略 ---")
    storage = StorageManager(config)
    await storage.initialize()

    test_results = []
    for i, scenario in enumerate(["Yangtze", "Yellow", "Pearl"]):
        test_params = {
            "river_reach": f"{scenario}_Test",
            "model": "yang_sediment",
            "computed_at": 1717100000 + i * 100000,
        }
        part_time = PartitionStrategy.get_partition_key(test_params, "time")
        part_reach = PartitionStrategy.get_partition_key(test_params, "river_reach")
        test_results.append((scenario, part_time, part_reach))

    for scenario, part_time, part_reach in test_results:
        logger.info(f"  {scenario}: 时间分区={part_time}, 河段分区={part_reach}")

    logger.info(f"\n  存储分区策略: {storage.get_pool_status()['partition_info']['strategy']}")

    logger.info("\n--- 功能4: 结果比对功能 ---")
    result_a = {"time_series": ts, "statistics": stats}
    result_b_data = create_model("rouse", {
        "river_reach": "Rouse_Compare",
        "grain_size": 0.4e-3,
        "specific_gravity": 2.65,
        "water_temperature": 20.0,
        "kinematic_viscosity": 1e-6,
        "time_step": 3600,
        "reach_length": 1500.0,
        "max_bed_change_per_step": 0.5,
    })
    result_b_raw = result_b_data.evolve(init_state, time_steps=50)
    result_b = {"time_series": result_b_raw.get("time_series", []), "statistics": result_b_raw.get("statistics", {})}

    comparator = ResultComparator()
    comparison = comparator.compare_results(result_a, result_b, ["concentration", "depth"])

    logger.info(f"  Yang vs Rouse 模型比对:")
    for metric, data in comparison.get("metrics", {}).items():
        if "rmse" in data:
            logger.info(
                f"    {metric}: RMSE={data['rmse']:.6f}, "
                f"MARE={data['mare']:.4%}, "
                f"最终差={data['final_diff']:.6f}"
            )
    logger.info(f"  一致性评级: {comparison.get('summary', {}).get('agreement_level', 'unknown')}")

    logger.info("\n--- 功能5: 快照管理 ---")
    if snapshots:
        logger.info(f"  快照数量: {len(snapshots)}")
        for snap in snapshots[:3]:
            logger.info(
                f"    快照 {snap['step']}: 深度={snap['state']['depth']:.3f}m, "
                f"流速={snap['state'].get('velocity', 0):.3f}m/s"
            )
        if len(snapshots) > 3:
            logger.info(f"    ... ({len(snapshots) - 3} more)")

    logger.info("\n--- 集群调度器状态 ---")
    status = master.get_cluster_status()
    logger.info(f"  调度器: {status['scheduler']}")
    logger.info(f"  集群: {status['cluster']['online_nodes']} 节点在线 / {status['cluster']['total_nodes']} 总计")
    logger.info(f"  存储: 缓冲={status['storage']['buffered_results']}, 分区={status['storage']['partition_info'].get('partition_count', 0)}")

    await storage.close()
    await master.stop()
    logger.info("\n=== 所有优化功能演示完成 ===")


if __name__ == "__main__":
    asyncio.run(run_full_demo())
