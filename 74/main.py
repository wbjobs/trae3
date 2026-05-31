import asyncio
import argparse
import logging
import signal
import sys
import os
import platform

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from common.config import load_config
from common.models import Task, TaskPriority, ComputeNode, SedimentResult
from master import ClusterMaster, ClusterWorker

logger = logging.getLogger(__name__)


def _get_system_info() -> dict:
    try:
        import multiprocessing
        cpu_cores = multiprocessing.cpu_count()
    except Exception:
        cpu_cores = 4
    return {
        "cpu_cores": cpu_cores,
        "platform": platform.system(),
        "python_version": platform.python_version(),
    }


async def run_master(config_path: str = None):
    master = ClusterMaster(config_path)
    loop = asyncio.get_event_loop()

    def _shutdown():
        logger.info("Shutdown signal received")
        asyncio.ensure_future(master.stop())

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _shutdown)
        except NotImplementedError:
            pass

    await master.start()

    logger.info("Submitting demo sediment tasks...")
    sys_info = _get_system_info()

    demo_node = ComputeNode(
        node_id="demo-node-01",
        host="localhost",
        port=9501,
        cpu_cores=sys_info["cpu_cores"],
        memory_gb=16.0,
        capabilities=["yang_sediment", "engelund_hansen", "rouse"],
    )
    await master.register_worker(demo_node)

    task_id_1 = master.submit_sediment_task(
        river_reach="Yangtze_Reach_A",
        model="yang_sediment",
        parameters={
            "river_reach": "Yangtze_Reach_A",
            "grain_size": 0.5e-3,
            "specific_gravity": 2.65,
            "water_temperature": 20.0,
            "kinematic_viscosity": 1e-6,
            "flow_rate": 1500.0,
            "start_time": 0.0,
            "end_time": 86400.0,
            "time_step": 3600,
            "reach_length": 1000.0,
        },
        initial_state={
            "velocity": 1.5,
            "slope": 0.0005,
            "depth": 5.0,
            "width": 200.0,
            "bed_elevation": 0.0,
        },
        time_steps=24,
        priority=TaskPriority.HIGH,
    )
    logger.info(f"Submitted demo task: {task_id_1}")

    task_id_2 = master.submit_sediment_task(
        river_reach="Yellow_Reach_B",
        model="engelund_hansen",
        parameters={
            "river_reach": "Yellow_Reach_B",
            "grain_size": 0.3e-3,
            "specific_gravity": 2.65,
            "flow_rate": 800.0,
            "start_time": 0.0,
            "end_time": 43200.0,
            "time_step": 3600,
            "reach_length": 500.0,
        },
        initial_state={
            "velocity": 1.2,
            "slope": 0.001,
            "depth": 3.0,
            "width": 150.0,
            "bed_elevation": 0.0,
        },
        time_steps=12,
        priority=TaskPriority.NORMAL,
    )
    logger.info(f"Submitted demo task: {task_id_2}")

    try:
        while True:
            await asyncio.sleep(10)
            status = master.get_cluster_status()
            logger.info(f"Cluster status: {status}")
    except asyncio.CancelledError:
        pass
    finally:
        await master.stop()


async def run_worker(node_id: str, host: str, port: int, config_path: str = None):
    worker = ClusterWorker(node_id, host, port, config_path)
    loop = asyncio.get_event_loop()

    def _shutdown():
        logger.info("Worker shutdown signal received")
        asyncio.ensure_future(worker.stop())

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _shutdown)
        except NotImplementedError:
            pass

    await worker.start()

    try:
        while True:
            await asyncio.sleep(5)
    except asyncio.CancelledError:
        pass
    finally:
        await worker.stop()


async def run_standalone(config_path: str = None):
    from sediment import create_model

    config = load_config(config_path)
    logger.info("Running standalone sediment computation demo...")

    model = create_model("yang_sediment", {
        "grain_size": 0.5e-3,
        "specific_gravity": 2.65,
        "water_temperature": 20.0,
        "kinematic_viscosity": 1e-6,
        "time_step": 3600,
        "reach_length": 1000.0,
        "max_bed_change_per_step": 0.5,
    })

    initial_state = {
        "velocity": 1.5,
        "slope": 0.0005,
        "depth": 5.0,
        "width": 200.0,
        "bed_elevation": 0.0,
        "inflow_sediment": 0.001,
    }

    result = model.evolve(initial_state, time_steps=24, enable_snapshot=True)
    time_series = result.get("time_series", [])
    stats = result.get("statistics", {})
    snapshots = result.get("snapshots", [])

    logger.info(
        f"Computation complete: {len(time_series)} time steps, "
        f"{len(snapshots)} snapshots, converged={result.get('converged', False)}"
    )

    for r in time_series[:5]:
        logger.info(
            f"  Step {r['step']}: dt={r['dt']:.0f}s depth={r['depth']:.4f}m "
            f"conc={r['concentration']:.4f} transport={r['transport_rate']:.8f} "
            f"bed_change={r['bed_change']:.8f}m cv={r['cv']:.6f}"
        )
    if len(time_series) > 5:
        logger.info(f"  ... ({len(time_series) - 5} more steps)")
        r = time_series[-1]
        logger.info(
            f"  Final Step {r['step']}: depth={r['depth']:.4f}m "
            f"conc={r['concentration']:.4f} transport={r['transport_rate']:.8f} "
            f"bed_change={r['bed_change']:.8f}m"
        )

    logger.info(f"Statistics:")
    logger.info(f"  Avg concentration: {stats.get('avg_concentration', 0):.4f}")
    logger.info(f"  Max concentration: {stats.get('max_concentration', 0):.4f}")
    logger.info(f"  Min concentration: {stats.get('min_concentration', 0):.4f}")
    logger.info(f"  P50 concentration: {stats.get('p50_concentration', 0):.4f}")
    logger.info(f"  Avg depth: {stats.get('avg_depth', 0):.4f}m")
    logger.info(f"  Total bed change: {stats.get('total_bed_change', 0):.6f}m")

    logger.info("Standalone computation finished successfully")


def main():
    parser = argparse.ArgumentParser(
        description="分布式水文泥沙计算集群系统",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python main.py master                         启动集群主节点
  python main.py worker --id node01             启动工作节点
  python main.py standalone                     单机演算演示
  python main.py master --config config.json    指定配置文件
        """
    )
    parser.add_argument(
        "mode",
        choices=["master", "worker", "standalone"],
        help="运行模式: master=主控节点, worker=计算节点, standalone=单机演示"
    )
    parser.add_argument("--config", default=None, help="配置文件路径")
    parser.add_argument("--id", default=None, help="工作节点ID")
    parser.add_argument("--host", default="localhost", help="工作节点主机地址")
    parser.add_argument("--port", type=int, default=9501, help="工作节点端口")

    args = parser.parse_args()

    if args.mode == "master":
        asyncio.run(run_master(args.config))
    elif args.mode == "worker":
        node_id = args.id or f"worker-{os.getpid()}"
        asyncio.run(run_worker(node_id, args.host, args.port, args.config))
    elif args.mode == "standalone":
        asyncio.run(run_standalone(args.config))


if __name__ == "__main__":
    main()
