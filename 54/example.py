import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from config.settings import load_settings, get_settings
from models.models import (
    Region,
    WeatherStationData,
    InterpolationTask,
    NodeInfo,
    NodeStatus,
)
from core.meteorology_calculator import MeteorologyCalculator
from utils.logger import setup_logging, get_logger
from utils.helpers import generate_grid_points

setup_logging("INFO")
logger = get_logger(__name__)


async def example_basic_interpolation():
    logger.info("=" * 50)
    logger.info("Example 1: Basic Interpolation")
    logger.info("=" * 50)

    region = Region(
        name="Test-Region",
        min_latitude=30.0,
        max_latitude=31.0,
        min_longitude=120.0,
        max_longitude=121.0,
    )

    import random
    from datetime import datetime

    random.seed(42)
    stations = []
    for i in range(30):
        station = WeatherStationData(
            station_id=f"TEST-{i:03d}",
            latitude=random.uniform(region.min_latitude, region.max_latitude),
            longitude=random.uniform(region.min_longitude, region.max_longitude),
            timestamp=datetime.utcnow(),
            temperature=round(random.uniform(15.0, 30.0), 1),
            humidity=round(random.uniform(40.0, 80.0), 1),
            pressure=round(random.uniform(990.0, 1030.0), 1),
        )
        stations.append(station)

    logger.info(f"Generated {len(stations)} weather stations")
    logger.info(f"Region area: {region.area:.4f} square degrees")

    grid_points = generate_grid_points(region, resolution=0.1)
    logger.info(f"Grid points: {len(grid_points)}")

    calculator = MeteorologyCalculator()

    methods = ["kriging", "idw", "linear"]
    results = {}

    for method in methods:
        logger.info(f"\nRunning {method} interpolation...")
        try:
            result = calculator.interpolate(
                stations=stations,
                region=region,
                variables=["temperature", "humidity"],
                method=method,
                grid_resolution=0.1,
            )
            results[method] = result

            for r in result:
                logger.info(
                    f"  {r.variable}: {len(r.values)} points, "
                    f"quality={r.quality_score:.3f}, "
                    f"range=[{min(r.values):.2f}, {max(r.values):.2f}]"
                )
        except Exception as e:
            logger.error(f"  Failed: {e}")

    logger.info("\nCross-validation for temperature:")
    cv_result = calculator.cross_validate(
        stations=stations,
        variable="temperature",
        method="kriging",
        k_folds=5,
    )
    for key, value in cv_result.items():
        logger.info(f"  {key}: {value}")

    return results


async def example_node_management():
    logger.info("\n" + "=" * 50)
    logger.info("Example 2: Node Management")
    logger.info("=" * 50)

    from core.node_manager import NodeManager

    manager = NodeManager()
    await manager.start()

    for i in range(5):
        node = NodeInfo(
            node_id=f"node-{i:03d}",
            status=NodeStatus.IDLE,
            host=f"192.168.1.{100 + i}",
            port=8080,
            cpu_cores=4 if i % 2 == 0 else 8,
            memory_gb=8.0 if i % 2 == 0 else 16.0,
            gpu_available=i >= 3,
            capabilities=["interpolation", "kriging"],
        )
        success = manager.register_node(node)
        logger.info(f"Registered node {node.node_id}: success={success}")

    stats = manager.get_statistics()
    logger.info(f"\nCluster statistics: {stats}")

    available_nodes = manager.get_available_nodes()
    logger.info(f"Available nodes: {[n.node_id for n in available_nodes]}")

    await manager.stop()


async def example_task_creation():
    logger.info("\n" + "=" * 50)
    logger.info("Example 3: Task Creation")
    logger.info("=" * 50)

    regions = [
        Region(
            name="North-China",
            min_latitude=38.0,
            max_latitude=42.0,
            min_longitude=113.0,
            max_longitude=120.0,
        ),
        Region(
            name="East-China",
            min_latitude=28.0,
            max_latitude=33.0,
            min_longitude=116.0,
            max_longitude=123.0,
        ),
    ]

    import random
    from datetime import datetime

    random.seed(123)

    tasks = []
    for region in regions:
        stations = []
        for i in range(50):
            station = WeatherStationData(
                station_id=f"{region.name}-{i:03d}",
                latitude=random.uniform(region.min_latitude, region.max_latitude),
                longitude=random.uniform(region.min_longitude, region.max_longitude),
                timestamp=datetime.utcnow(),
                temperature=round(random.uniform(10.0, 35.0), 1),
                humidity=round(random.uniform(30.0, 90.0), 1),
            )
            stations.append(station)

        task = InterpolationTask(
            region=region,
            variables=["temperature", "humidity"],
            grid_resolution=0.05,
            interpolation_method="kriging",
            priority=7,
            metadata={"input_data": [s.model_dump() for s in stations]},
        )
        tasks.append(task)
        logger.info(
            f"Created task {task.task_id}: {region.name}, "
            f"{len(stations)} stations, priority={task.priority}"
        )

    return tasks


async def main():
    logger.info("Running Distributed Weather Interpolation Examples\n")

    try:
        await example_basic_interpolation()
        await example_node_management()
        await example_task_creation()
    except Exception as e:
        logger.error(f"Example execution failed: {e}", exc_info=True)
        raise

    logger.info("\n" + "=" * 50)
    logger.info("All examples completed successfully!")
    logger.info("=" * 50)


if __name__ == "__main__":
    asyncio.run(main())
