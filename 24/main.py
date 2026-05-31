import argparse
import sys
import os
import json
import random
import time
from typing import Dict, List

from mesh_generator import MeshGenerator
from parameter_import import ParameterImporter
from task_scheduler import TaskScheduler, ProcessTaskScheduler, scheduler, run_scheduler_foreground
from result_exporter import ResultExporter, export_task_result
from database import db
from config import PARAMETER_DIR, RESULT_OUTPUT_DIR
from sensor_processor import get_sensor_processor
from timeseries_engine import get_ts_query_engine
from chamber_manager import get_chamber_manager
from dashboard_server import get_dashboard_server


def create_sample_grid():
    print("Creating sample grid...")
    mg = MeshGenerator()
    mg.generate_rectangular_grid(
        width=100.0, height=50.0,
        nx=20, ny=10,
        element_type='quadrilateral'
    )
    mg.identify_boundaries(nx=20, ny=10)
    filepath, grid_id = mg.save_mesh(
        filename='sample_grid.json',
        name='Sample Grid',
        description='A 100x50m rectangular grid for demonstration'
    )
    print(f"Grid created with ID: {grid_id}")
    print(f"Grid saved to: {filepath}")
    return grid_id


def create_sample_parameters(grid_id: int, nx: int = 20, ny: int = 10):
    print("Creating sample parameters...")
    pi = ParameterImporter()

    pi.create_stratum(
        name='Sand Layer',
        description='Upper sand aquifer',
        thickness=10.0,
        hydraulic_conductivity=1e-4,
        porosity=0.35,
        specific_storage=1e-5
    )

    param_file = os.path.join(PARAMETER_DIR, f'sample_params_{grid_id}.json')

    nodes_per_row = nx + 1
    left_nodes = [i * nodes_per_row for i in range(ny + 1)]
    right_nodes = [i * nodes_per_row + nx for i in range(ny + 1)]
    left_values = [10.0] * len(left_nodes)
    right_values = [5.0] * len(right_nodes)

    sample_data = {
        'parameters': [
            {
                'parameter_name': 'hydraulic_conductivity',
                'parameter_value': 1e-4,
                'unit': 'm/s',
                'stratum_id': 1,
                'grid_id': grid_id
            },
            {
                'parameter_name': 'porosity',
                'parameter_value': 0.35,
                'unit': '',
                'stratum_id': 1,
                'grid_id': grid_id
            },
            {
                'parameter_name': 'specific_storage',
                'parameter_value': 1e-5,
                'unit': '1/m',
                'stratum_id': 1,
                'grid_id': grid_id
            }
        ],
        'boundary_conditions': [
            {
                'boundary_type': 'dirichlet',
                'node_indices': left_nodes,
                'values': left_values,
                'description': '左侧定水头边界 (h=10m)'
            },
            {
                'boundary_type': 'dirichlet',
                'node_indices': right_nodes,
                'values': right_values,
                'description': '右侧定水头边界 (h=5m)'
            }
        ]
    }

    os.makedirs(os.path.dirname(param_file), exist_ok=True)
    with open(param_file, 'w', encoding='utf-8') as f:
        json.dump(sample_data, f, indent=2, ensure_ascii=False)

    pi.import_from_json(param_file, grid_id=grid_id)

    print(f"Parameters imported from: {param_file}")
    print(f"  Left boundary nodes: {len(left_nodes)} nodes, h=10m")
    print(f"  Right boundary nodes: {len(right_nodes)} nodes, h=5m")


def create_sample_task(grid_id: int):
    print("Creating sample task...")
    task_id = scheduler.create_task(
        name='Sample Groundwater Flow Simulation',
        grid_id=grid_id,
        description='Demonstration groundwater flow simulation',
        priority=1,
        solver_config={'solver_type': 'direct', 'tolerance': 1e-8}
    )
    print(f"Task created with ID: {task_id}")
    return task_id


def run_single_task(task_id: int):
    print(f"Running task {task_id}...")
    scheduler.start()
    success = scheduler.wait_for_task(task_id, timeout=300)
    scheduler.stop()

    if success:
        print(f"Task {task_id} completed successfully!")
    else:
        print(f"Task {task_id} failed or timed out!")


def export_results(task_id: int, fmt: str = 'vtk'):
    print(f"Exporting results for task {task_id} to {fmt} format...")
    try:
        filepath = export_task_result(task_id, fmt)
        print(f"Results exported to: {filepath}")
        return filepath
    except Exception as e:
        print(f"Export failed: {e}")
        return None


def show_status():
    grids = db.get_all_grids()
    print(f"\nGrids: {len(grids)}")
    for g in grids[:5]:
        print(f"  - ID {g['id']}: {g['name']} ({g['num_nodes']} nodes, {g['num_elements']} elements)")

    tasks = db.get_all_tasks()
    print(f"\nTasks: {len(tasks)}")
    for t in tasks[:10]:
        print(f"  - ID {t['id']}: {t['name']} - {t['status']} ({t['progress']:.0f}%)")

    chambers = db.get_all_chambers()
    print(f"\nChambers: {len(chambers)}")
    for c in chambers:
        print(f"  - ID {c['id']}: {c['name']} - {c.get('circuit_breaker_status', 'closed')}")


def create_sample_chambers():
    print("\nCreating sample chambers...")
    for i in range(3):
        chamber_id = db.insert_chamber(
            name=f'舱室-{i + 1:02d}',
            description=f'标准计算舱室 {i + 1}',
            chamber_type='standard' if i < 2 else 'high_priority',
            memory_limit_mb=2048 if i == 2 else 1024,
            cpu_limit=0.8 if i == 2 else 0.5,
            max_concurrent_tasks=3 if i == 2 else 2
        )
        print(f"  Chamber {chamber_id}: 舱室-{i + 1:02d} created")
    return db.get_all_chambers()


def create_sample_sensors(chambers):
    print("\nCreating sample sensors...")
    sensor_types = ['水位', '水温', '水压', '流量', '电导率']
    units = ['m', '°C', 'MPa', 'm³/s', 'S/m']

    for chamber in chambers:
        for i in range(5):
            sensor_id = db.insert_sensor(
                sensor_code=f'SNS-{chamber["id"]:03d}-{i + 1:03d}',
                name=f'{sensor_types[i]}传感器-{chamber["id"]:02d}-{i + 1:02d}',
                chamber_id=chamber['id'],
                sensor_type='analog',
                measurement_type=sensor_types[i],
                location_x=random.uniform(0, 100),
                location_y=random.uniform(0, 50),
                unit=units[i],
                sampling_interval=60,
                accuracy=0.01
            )
            print(f"  Sensor {sensor_id}: {sensor_types[i]}传感器 created")


def simulate_sensor_data(duration_seconds: int = 10):
    print(f"\nSimulating sensor data for {duration_seconds} seconds...")
    processor = get_sensor_processor()
    chamber_manager = get_chamber_manager()

    chambers = db.get_all_chambers()
    if not chambers:
        chambers = create_sample_chambers()
        create_sample_sensors(chambers)

    all_sensors = []
    for c in chambers:
        all_sensors.extend(db.get_sensors_by_chamber(c['id']))

    if not all_sensors:
        create_sample_sensors(chambers)
        all_sensors = []
        for c in chambers:
            all_sensors.extend(db.get_sensors_by_chamber(c['id']))

    print(f"  Total sensors: {len(all_sensors)}")
    start_time = time.time()
    count = 0

    try:
        while time.time() - start_time < duration_seconds:
            for sensor in all_sensors:
                timestamp = int(time.time() * 1000)
                value = random.uniform(0, 100) + random.gauss(0, 5)
                chamber_id = sensor['chamber_id']

                processor.process_data(
                    sensor_id=sensor['id'],
                    timestamp=timestamp,
                    value=value,
                    chamber_id=chamber_id,
                    quality=random.choice([1, 1, 1, 0])
                )
                count += 1

            stats = processor.get_stats()
            print(f"\r  Processed: {count} | Queue: {stats['queue_size']} | "
                  f"Written: {stats['written']} | Duplicates: {stats['duplicates']}",
                  end='', flush=True)
            time.sleep(0.1)

    except KeyboardInterrupt:
        pass

    print(f"\n\nSimulation complete. Flushing remaining data...")
    time.sleep(3)
    stats = processor.get_stats()
    print(f"  Total: {stats['received']} received, {stats['written']} written, "
          f"{stats['duplicates']} duplicates, {stats['errors']} errors")


def show_system_stats():
    print("\n=== System Statistics ===")

    sensor_stats = get_sensor_processor().get_stats()
    print("\nSensor Processor:")
    print(f"  Received: {sensor_stats['received']}")
    print(f"  Written: {sensor_stats['written']}")
    print(f"  Duplicates: {sensor_stats['duplicates']}")
    print(f"  Aggregated: {sensor_stats['aggregated']}")
    print(f"  Queue size: {sensor_stats['queue_size']}")

    ts_stats = get_ts_query_engine().get_stats()
    print("\nTimeSeries Engine:")
    print(f"  Total queries: {ts_stats['total_queries']}")
    print(f"  Cache hits: {ts_stats['cache_hits']} ({(ts_stats['cache_hit_rate'] * 100):.1f}%)")
    print(f"  Avg query time: {(ts_stats['avg_query_time'] * 1000):.1f}ms")
    print(f"  Pre-agg queries: {ts_stats['pre_aggregated_queries']}")

    chamber_stats = get_chamber_manager().get_stats()
    print("\nChamber Manager:")
    print(f"  Active chambers: {chamber_stats['active_chambers']}")
    print(f"  Total requests: {chamber_stats['total_requests']}")
    print(f"  Rejected: {chamber_stats['rejected_requests']}")
    print(f"  Rejection rate: {(chamber_stats['rejection_rate'] * 100):.2f}%")
    print(f"  Circuit breaker ops: {chamber_stats['circuit_breaker_ops']}")

    dashboard = get_dashboard_server()
    print("\nDashboard Server:")
    status = dashboard.get_status()
    print(f"  Running: {status['running']}")
    print(f"  Connected clients: {status['connected_clients']}")
    print(f"  Components: {len(status['components'])}")


def start_dashboard():
    print("\nStarting dashboard server...")
    print("Press Ctrl+C to stop")
    dashboard = get_dashboard_server()
    dashboard.start()

    chambers = db.get_all_chambers()
    if not chambers:
        create_sample_chambers()
        chambers = db.get_all_chambers()

    all_sensors = []
    for c in chambers:
        sensors = db.get_sensors_by_chamber(c['id'])
        if not sensors:
            create_sample_sensors([c])
            sensors = db.get_sensors_by_chamber(c['id'])
        all_sensors.extend(sensors)

    from dashboard_server import SensorChartComponent
    for sensor in all_sensors[:6]:
        comp = SensorChartComponent(sensor_id=sensor['id'], interval='1min')
        dashboard.register_component(comp)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping dashboard...")
        dashboard.stop()


def interactive_mode():
    print("\n=== Groundwater FEM System ===")
    print("Interactive mode")

    while True:
        print("\nOptions:")
        print("--- Core Functions ---")
        print("1. Create sample grid")
        print("2. Create sample parameters")
        print("3. Create sample task")
        print("4. Run scheduler (foreground)")
        print("5. Export results")
        print("6. Show status")
        print("7. Run complete demo")
        print("\n--- Performance Optimization ---")
        print("10. Create sample chambers & sensors")
        print("11. Simulate sensor data (10s)")
        print("12. Show system statistics")
        print("13. Start dashboard server")
        print("\n0. Exit")

        choice = input("\nEnter option: ").strip()

        if choice == '1':
            create_sample_grid()
        elif choice == '2':
            grid_id = input("Enter grid ID: ").strip()
            if grid_id:
                nx = input("Enter nx (default 20): ").strip()
                ny = input("Enter ny (default 10): ").strip()
                nx = int(nx) if nx else 20
                ny = int(ny) if ny else 10
                create_sample_parameters(int(grid_id), nx=nx, ny=ny)
        elif choice == '3':
            grid_id = input("Enter grid ID: ").strip()
            if grid_id:
                create_sample_task(int(grid_id))
        elif choice == '4':
            print("Starting scheduler in foreground. Press Ctrl+C to stop.")
            run_scheduler_foreground()
        elif choice == '5':
            task_id = input("Enter task ID: ").strip()
            fmt = input("Enter format (vtk/csv/tecplot/mat): ").strip() or 'vtk'
            if task_id:
                export_results(int(task_id), fmt)
        elif choice == '6':
            show_status()
        elif choice == '7':
            run_complete_demo()
        elif choice == '10':
            chambers = create_sample_chambers()
            create_sample_sensors(chambers)
        elif choice == '11':
            duration = input("Duration seconds (default 10): ").strip()
            duration = int(duration) if duration else 10
            simulate_sensor_data(duration)
        elif choice == '12':
            show_system_stats()
        elif choice == '13':
            start_dashboard()
        elif choice == '0':
            print("Goodbye!")
            break
        else:
            print("Invalid option")


def run_complete_demo():
    print("\n=== Running Complete Demo ===")

    nx, ny = 20, 10
    grid_id = create_sample_grid()
    create_sample_parameters(grid_id, nx=nx, ny=ny)
    task_id = create_sample_task(grid_id)

    print(f"\nRunning task {task_id}...")
    scheduler.start()
    success = scheduler.wait_for_task(task_id, timeout=300)
    scheduler.stop()

    if success:
        print("\nTask completed! Exporting results...")
        export_results(task_id, 'vtk')
        export_results(task_id, 'csv')

        result_path = os.path.join(RESULT_OUTPUT_DIR, f'result_task_{task_id}.json')
        if os.path.exists(result_path):
            with open(result_path, 'r') as f:
                result_data = json.load(f)
            stats = result_data.get('statistics', {})
            print("\n=== Calculation Results ===")
            print(f"  Head range: {stats.get('head_min', 0):.2f}m - {stats.get('head_max', 0):.2f}m")
            print(f"  Mean head: {stats.get('head_mean', 0):.2f}m")
            print(f"  Max velocity: {stats.get('velocity_max', 0):.2e} m/s")
            print(f"  Max flux: {stats.get('flux_max', 0):.2e} m/s")
            print(f"  Max gradient: {stats.get('gradient_max', 0):.4f}")
            print(f"  Mass balance error: {stats.get('mass_balance_error', 0):.2f}%")
    else:
        print("\nTask failed!")

    show_status()


def main():
    parser = argparse.ArgumentParser(
        description='Groundwater FEM Numerical Calculation System'
    )

    parser.add_argument(
        '--mode', '-m',
        choices=['interactive', 'scheduler', 'demo', 'status'],
        default='interactive',
        help='Operation mode'
    )

    parser.add_argument(
        '--task-id', '-t',
        type=int,
        help='Task ID for operations'
    )

    parser.add_argument(
        '--export-format', '-f',
        default='vtk',
        help='Export format (vtk, csv, tecplot, mat)'
    )

    parser.add_argument(
        '--parallel', '-p',
        action='store_true',
        help='Use process-based parallel scheduler'
    )

    args = parser.parse_args()

    if args.mode == 'interactive':
        interactive_mode()
    elif args.mode == 'scheduler':
        if args.parallel:
            print("Starting process-based parallel scheduler...")
            ps = ProcessTaskScheduler()
            ps.run_pending_tasks()
        else:
            print("Starting scheduler in foreground. Press Ctrl+C to stop.")
            run_scheduler_foreground()
    elif args.mode == 'demo':
        run_complete_demo()
    elif args.mode == 'status':
        show_status()


if __name__ == '__main__':
    main()
