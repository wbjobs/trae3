import asyncio
import argparse
import signal
import sys
from datetime import datetime
from typing import List, Optional

from config.settings import load_settings, get_settings
from models.models import (
    Region,
    WeatherStationData,
    InterpolationTask,
    TaskResult,
    NodeInfo,
    NodeStatus,
)
from core.task_scheduler import TaskScheduler
from core.meteorology_calculator import MeteorologyCalculator
from core.node_manager import NodeManager
from core.result_storage import ResultStorage
from cluster.cluster_client import ClusterClient
from utils.logger import setup_logging, get_logger

logger = get_logger(__name__)


class DistributedWeatherInterpolation:
    def __init__(self, env_file: Optional[str] = None, use_cluster: bool = False):
        load_settings(env_file)
        self.settings = get_settings()
        setup_logging(self.settings.log_level)

        self.use_cluster = use_cluster

        self.scheduler: Optional[TaskScheduler] = None
        self.calculator: Optional[MeteorologyCalculator] = None
        self.node_manager: Optional[NodeManager] = None
        self.storage: Optional[ResultStorage] = None
        self.cluster_client: Optional[ClusterClient] = None

        self._running = False

        logger.info(
            f"DistributedWeatherInterpolation initialized - "
            f"node: {self.settings.node_id}, mode: {'cluster' if use_cluster else 'local'}"
        )

    async def start(self) -> None:
        if self._running:
            logger.warning("System is already running")
            return

        self.scheduler = TaskScheduler()
        self.calculator = MeteorologyCalculator()
        self.node_manager = NodeManager()
        self.storage = ResultStorage()

        try:
            self.storage.init_database()
            logger.info("Database initialized")
        except Exception as e:
            logger.warning(f"Database initialization failed: {e}")

        self.scheduler.set_node_assignment_callback(self.node_manager.assign_task_to_node)
        self.node_manager.add_node_failure_callback(self.scheduler.handle_node_failure)

        if self.use_cluster:
            self.cluster_client = ClusterClient()
            await self.cluster_client.start_polling()

        await self.scheduler.start()
        await self.node_manager.start()

        self._running = True
        logger.info("DistributedWeatherInterpolation started")

    async def stop(self) -> None:
        if not self._running:
            return

        self._running = False

        if self.scheduler:
            await self.scheduler.stop()
        if self.node_manager:
            await self.node_manager.stop()
        if self.cluster_client:
            await self.cluster_client.close()
        if self.storage:
            self.storage.close()

        logger.info("DistributedWeatherInterpolation stopped")

    def create_interpolation_task(
        self,
        region: Region,
        stations: List[WeatherStationData],
        variables: Optional[List[str]] = None,
        method: Optional[str] = None,
        grid_resolution: Optional[float] = None,
        priority: int = 5,
    ) -> InterpolationTask:
        variables = variables or self.settings.interpolation.variables
        method = method or self.settings.interpolation.method
        grid_resolution = grid_resolution or self.settings.interpolation.grid_resolution

        task = InterpolationTask(
            region=region,
            variables=variables,
            grid_resolution=grid_resolution,
            interpolation_method=method,
            priority=priority,
            metadata={"input_data": [s.model_dump() for s in stations]},
        )

        logger.info(
            f"Created interpolation task {task.task_id} for region {region.name}"
        )
        return task

    async def submit_local_task(
        self,
        task: InterpolationTask,
        store_result: bool = True,
    ) -> str:
        if not self.scheduler:
            raise RuntimeError("System not started")

        async def on_complete(result: TaskResult) -> None:
            if store_result and self.storage:
                await self.storage.store_task_results_async(result)
                logger.info(f"Task {result.task_id} results stored")

            if self.node_manager and result.node_id:
                self.node_manager.complete_task(
                    result.node_id, result.task_id, result.status.value == "completed"
                )

        task_id = self.scheduler.submit_task(task)
        self.scheduler.set_task_callback(task_id, on_complete)

        if self.storage:
            self.storage.store_task_metadata(
                task_id,
                {
                    "status": task.status.value,
                    "region_name": task.region.name,
                    "variables": task.variables,
                    "grid_resolution": task.grid_resolution,
                    "interpolation_method": task.interpolation_method,
                    "priority": task.priority,
                    "created_at": task.created_at,
                    "scheduled_at": task.scheduled_at,
                    "input_station_count": len(task.metadata.get("input_data", [])),
                },
            )

        return task_id

    async def submit_cluster_task(
        self,
        task: InterpolationTask,
        store_result: bool = True,
    ) -> Optional[str]:
        if not self.cluster_client:
            raise RuntimeError("Cluster client not initialized")

        async def on_complete(result: TaskResult) -> None:
            if store_result and self.storage and result:
                await self.storage.store_task_results_async(result)
                logger.info(f"Cluster task {result.task_id} results stored")

        job_id = await self.cluster_client.execute_task(task, on_complete)
        return job_id

    async def execute_interpolation(
        self,
        region: Region,
        stations: List[WeatherStationData],
        variables: Optional[List[str]] = None,
        method: Optional[str] = None,
        grid_resolution: Optional[float] = None,
        use_cluster: Optional[bool] = None,
        store_result: bool = True,
    ) -> str:
        task = self.create_interpolation_task(
            region=region,
            stations=stations,
            variables=variables,
            method=method,
            grid_resolution=grid_resolution,
        )

        use_cluster = use_cluster if use_cluster is not None else self.use_cluster

        if use_cluster:
            return await self.submit_cluster_task(task, store_result) or task.task_id
        else:
            return await self.submit_local_task(task, store_result)

    async def wait_for_task(self, task_id: str, timeout: int = 3600) -> Optional[TaskResult]:
        if not self.scheduler:
            return None

        import time
        start_time = time.time()

        while time.time() - start_time < timeout:
            status = self.scheduler.get_task_status(task_id)
            if status in ("completed", "failed", "cancelled"):
                return self.scheduler.get_task_result(task_id)
            await asyncio.sleep(1.0)

        logger.warning(f"Task {task_id} timed out")
        return None

    def register_local_node(self, node: NodeInfo) -> bool:
        if not self.node_manager:
            return False
        return self.node_manager.register_node(node)

    def get_system_status(self) -> dict:
        return {
            "running": self._running,
            "node_id": self.settings.node_id,
            "use_cluster": self.use_cluster,
            "scheduler": self.scheduler.get_statistics() if self.scheduler else None,
            "nodes": self.node_manager.get_statistics() if self.node_manager else None,
            "database": self.storage.get_database_size() if self.storage else None,
        }


def generate_sample_data(region: Region, num_stations: int = 50) -> List[WeatherStationData]:
    import random
    from datetime import datetime, timedelta

    stations = []
    random.seed(42)

    for i in range(num_stations):
        lat = random.uniform(region.min_latitude, region.max_latitude)
        lon = random.uniform(region.min_longitude, region.max_longitude)

        station = WeatherStationData(
            station_id=f"STATION-{i:04d}",
            latitude=lat,
            longitude=lon,
            timestamp=datetime.utcnow() - timedelta(minutes=random.randint(0, 60)),
            temperature=round(random.uniform(10.0, 35.0), 1),
            humidity=round(random.uniform(30.0, 90.0), 1),
            pressure=round(random.uniform(980.0, 1040.0), 1),
            wind_speed=round(random.uniform(0.0, 20.0), 1),
            precipitation=round(random.uniform(0.0, 50.0), 1),
            elevation=round(random.uniform(0.0, 2000.0), 1),
        )
        stations.append(station)

    return stations


async def run_local_demo():
    logger.info("=" * 60)
    logger.info("Starting Distributed Weather Interpolation DEMO")
    logger.info("=" * 60)

    system = DistributedWeatherInterpolation(use_cluster=False)
    await system.start()

    node1 = NodeInfo(
        node_id="compute-node-01",
        status=NodeStatus.IDLE,
        host="192.168.1.101",
        port=8080,
        cpu_cores=8,
        memory_gb=16.0,
        gpu_available=False,
        capabilities=["interpolation", "kriging", "idw"],
    )
    node2 = NodeInfo(
        node_id="compute-node-02",
        status=NodeStatus.IDLE,
        host="192.168.1.102",
        port=8080,
        cpu_cores=16,
        memory_gb=32.0,
        gpu_available=True,
        capabilities=["interpolation", "kriging", "idw", "gpu-accel"],
    )
    system.register_local_node(node1)
    system.register_local_node(node2)

    beijing_region = Region(
        name="Beijing-Metropolitan",
        min_latitude=39.4,
        max_latitude=41.1,
        min_longitude=115.4,
        max_longitude=117.5,
    )

    shanghai_region = Region(
        name="Shanghai-Metropolitan",
        min_latitude=30.7,
        max_latitude=31.9,
        min_longitude=120.9,
        max_longitude=122.1,
    )

    logger.info("\nGenerating sample weather station data...")
    beijing_stations = generate_sample_data(beijing_region, num_stations=80)
    shanghai_stations = generate_sample_data(shanghai_region, num_stations=60)

    logger.info(f"Generated {len(beijing_stations)} stations for Beijing")
    logger.info(f"Generated {len(shanghai_stations)} stations for Shanghai")

    logger.info("\nSubmitting interpolation tasks...")
    task1_id = await system.execute_interpolation(
        region=beijing_region,
        stations=beijing_stations,
        variables=["temperature", "humidity"],
        method="kriging",
        grid_resolution=0.05,
        priority=8,
    )

    task2_id = await system.execute_interpolation(
        region=shanghai_region,
        stations=shanghai_stations,
        variables=["temperature", "humidity", "pressure", "wind_speed"],
        method="idw",
        grid_resolution=0.05,
        priority=6,
    )

    logger.info(f"\nTask 1 (Beijing) ID: {task1_id}")
    logger.info(f"Task 2 (Shanghai) ID: {task2_id}")

    logger.info("\nWaiting for tasks to complete...")

    for task_id in [task1_id, task2_id]:
        result = await system.wait_for_task(task_id, timeout=120)
        if result:
            logger.info(f"\n{'='*40}")
            logger.info(f"Task {task_id} Result:")
            logger.info(f"  Status: {result.status}")
            logger.info(f"  Execution time: {result.execution_time_seconds:.2f}s")
            logger.info(f"  Node: {result.node_id}")
            logger.info(f"  Variables: {[r.variable for r in result.results]}")
            for r in result.results:
                logger.info(
                    f"    {r.variable}: {len(r.values)} grid points, "
                    f"quality: {r.quality_score:.2f}"
                )
        else:
            logger.error(f"Task {task_id} did not complete in time")

    logger.info("\nSystem Status:")
    status = system.get_system_status()
    for key, value in status.items():
        logger.info(f"  {key}: {value}")

    logger.info("\nStopping system...")
    await system.stop()

    logger.info("\n" + "=" * 60)
    logger.info("DEMO completed successfully!")
    logger.info("=" * 60)


def main():
    parser = argparse.ArgumentParser(
        description="Distributed Weather Interpolation System"
    )
    parser.add_argument(
        "--mode",
        choices=["local", "cluster", "demo"],
        default="demo",
        help="Running mode",
    )
    parser.add_argument(
        "--env-file",
        type=str,
        default=None,
        help="Path to .env file",
    )
    parser.add_argument(
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        default="INFO",
        help="Logging level",
    )

    args = parser.parse_args()

    if args.mode == "demo":
        asyncio.run(run_local_demo())
    else:
        use_cluster = args.mode == "cluster"
        system = DistributedWeatherInterpolation(
            env_file=args.env_file, use_cluster=use_cluster
        )

        def handle_shutdown(signum, frame):
            logger.info(f"Received signal {signum}, shutting down...")
            asyncio.create_task(system.stop())
            sys.exit(0)

        signal.signal(signal.SIGINT, handle_shutdown)
        signal.signal(signal.SIGTERM, handle_shutdown)

        asyncio.run(system.start())

        try:
            asyncio.get_event_loop().run_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
