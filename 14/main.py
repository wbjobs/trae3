import os
import sys
import logging
import argparse
import time
import config
from grid_mesh import GridMesh
from turbulence_solver import TurbulenceSolver
from viz_export import ResultExporter, ResultVisualizer


def setup_logging(level=logging.INFO):
    os.makedirs(config.LOG_DIR, exist_ok=True)
    log_file = os.path.join(config.LOG_DIR, "meteo_turbulence.log")
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[
            logging.FileHandler(log_file, encoding="utf-8"),
            logging.StreamHandler(sys.stdout),
        ],
    )


def run_single_simulation(args):
    logger = logging.getLogger(__name__)
    logger.info("=" * 60)
    logger.info("Meteo Turbulence Simulation - Single Mode")
    logger.info("=" * 60)

    nx = args.grid_nx if args.grid_nx else config.GRID_DEFAULT_NX
    ny = args.grid_ny if args.grid_ny else config.GRID_DEFAULT_NY
    nz = args.grid_nz if args.grid_nz else config.GRID_DEFAULT_NZ

    grid = GridMesh(
        nx=nx, ny=ny, nz=nz,
        roughness_length=args.z0,
    )
    grid.generate()
    logger.info("Grid generated: %dx%dx%d", nx, ny, nz)

    meteo_params = {
        "wind_speed": args.wind_speed,
        "wind_direction": args.wind_dir,
        "roughness_length": args.z0,
        "temperature": args.temperature,
        "pressure": args.pressure,
    }

    solver_cfg = {
        "method": args.method,
        "turbulence_model": args.turb_model,
        "max_iterations": args.max_iter,
        "tolerance": config.SOLVER_TOLERANCE,
        "dt": args.dt,
        "t_end": args.t_end,
    }

    logger.info("Creating solver: method=%s, model=%s, dt=%.4f, t_end=%.2f",
                 solver_cfg["method"], solver_cfg["turbulence_model"],
                 solver_cfg["dt"], solver_cfg["t_end"])

    solver = TurbulenceSolver(grid, meteo_params, solver_cfg)

    def on_realtime(summary):
        progress = summary.get("progress", 0)
        eta = summary.get("eta_seconds", 0)
        wall = summary.get("wall_elapsed", 0)
        step = summary.get("step", 0)
        avg_spd = summary.get("avg_wind_speed", 0)
        avg_tke = summary.get("avg_tke", 0)
        max_v = summary.get("max_velocity", 0)
        logger.info(
            "[Monitor] step=%d  progress=%.1f%%  wall=%.1fs  eta=%.1fs  avg_speed=%.4f  avg_tke=%.6f  max_v=%.4f",
            step, progress * 100, wall, eta, avg_spd, avg_tke, max_v,
        )

    wall_start = time.time()
    result = solver.solve(callback=on_realtime, monitor_interval=2.0)
    wall_elapsed = time.time() - wall_start

    result_path = os.path.join(config.RESULT_DIR, "single_sim_result.pkl")
    solver.save_result(result_path)

    exporter = ResultExporter()
    visualizer = ResultVisualizer()
    output_dir = os.path.join(config.RESULT_DIR, "single_sim")

    logger.info("[Export] Exporting results...")
    exported = exporter.export_all(result, base_dir=output_dir)
    logger.info("[Export] Formats: %s", list(exported.keys()))

    logger.info("[Visualize] Generating plots...")
    plots = visualizer.visualize_all(result, output_dir=output_dir)
    logger.info("[Visualize] Plots: %s", list(plots.keys()))

    meta = result["metadata"]
    logger.info("=" * 60)
    logger.info("Simulation complete: steps=%d, time=%.4f, converged=%s",
                 meta["total_steps"], meta["final_time"], meta["converged"])
    logger.info("  Wall time: %.2f seconds", wall_elapsed)
    logger.info("  Steps/second: %.2f", meta["total_steps"] / max(wall_elapsed, 1e-6))
    if result["history"]:
        last = result["history"][-1]
        logger.info("  Avg wind speed: %.4f m/s", last["avg_wind_speed"])
        logger.info("  Avg TKE: %.6f m²/s²", last["avg_tke"])
        logger.info("  Max velocity: %.4f m/s", last["max_velocity"])
    logger.info("=" * 60)


def run_full_pipeline(args):
    logger = logging.getLogger(__name__)
    logger.info("=" * 60)
    logger.info("Meteo Turbulence Simulation - Full Pipeline")
    logger.info("=" * 60)

    from db_manager import DatabaseManager
    from meteo_importer import MeteoImporter
    from task_queue import TaskQueue

    db = DatabaseManager()
    try:
        db.initialize()
    except Exception as e:
        logger.error("Database initialization failed: %s", e)
        logger.info("Falling back to single simulation mode")
        fake_args = argparse.Namespace(
            grid_nx=args.grid_nx, grid_ny=args.grid_ny, grid_nz=args.grid_nz,
            wind_speed=5.0, wind_dir=0.0, z0=0.01,
            temperature=20.0, pressure=1013.25,
            method=args.method or "LES",
            turb_model=args.turb_model or "Smagorinsky",
            dt=args.dt or config.SOLVER_DT,
            t_end=args.t_end or config.SOLVER_T_END,
            max_iter=args.max_iter or config.SOLVER_MAX_ITER,
        )
        run_single_simulation(fake_args)
        return

    importer = MeteoImporter(db=db)

    logger.info("[Step 1/5] Importing meteorological parameters...")
    if args.csv:
        param_ids = importer.import_csv(args.csv, batch_name=args.batch_name)
    elif args.csv_dir:
        all_ids = importer.import_csv_batch(args.csv_dir)
        param_ids = []
        for ids in all_ids.values():
            param_ids.extend(ids)
    else:
        sample_csv = os.path.join(config.IMPORT_DIR, "sample_meteo.csv")
        logger.info("No input specified, generating sample CSV: %s", sample_csv)
        importer.generate_sample_csv(sample_csv)
        param_ids = importer.import_csv(sample_csv, batch_name="sample")

    if not param_ids:
        logger.error("No parameters imported, aborting")
        db.close()
        return
    logger.info("Imported %d parameter sets", len(param_ids))

    logger.info("[Step 2/5] Creating simulation tasks...")
    queue = TaskQueue(db=db, max_workers=args.workers)
    task_ids = []
    for i, pid in enumerate(param_ids):
        task_name = f"sim_task_{i:03d}_param{pid}"
        grid_cfg = {}
        if args.grid_nx:
            grid_cfg["nx"] = args.grid_nx
        if args.grid_ny:
            grid_cfg["ny"] = args.grid_ny
        if args.grid_nz:
            grid_cfg["nz"] = args.grid_nz

        solver_cfg = {}
        if args.method:
            solver_cfg["method"] = args.method
        if args.turb_model:
            solver_cfg["turbulence_model"] = args.turb_model
        if args.dt:
            solver_cfg["dt"] = args.dt
        if args.t_end:
            solver_cfg["t_end"] = args.t_end
        if args.max_iter:
            solver_cfg["max_iterations"] = args.max_iter

        tid = queue.submit_task(task_name, pid, grid_cfg, solver_cfg)
        task_ids.append(tid)
    logger.info("Created %d tasks", len(task_ids))

    logger.info("[Step 3/5] Executing tasks (workers=%d)...", args.workers)
    results = queue.process_pending()
    completed = [r for r in results if r["status"] == "completed"]
    failed = [r for r in results if r["status"] == "failed"]
    logger.info("Results: %d completed, %d failed", len(completed), len(failed))

    logger.info("[Step 4/5] Exporting results...")
    exporter = ResultExporter()
    visualizer = ResultVisualizer()
    for r in completed:
        status_info = queue.get_task_status(r["task_id"])
        if not status_info or not status_info.get("result_path"):
            continue
        try:
            result = exporter.load_result(status_info["result_path"])
            task_output_dir = os.path.join(config.RESULT_DIR, f"task_{r['task_id']}")
            exported = exporter.export_all(result, base_dir=task_output_dir)
            logger.info("  Task %d exported: %s", r["task_id"], list(exported.keys()))

            plots = visualizer.visualize_all(result, output_dir=task_output_dir)
            logger.info("  Task %d plots: %s", r["task_id"], list(plots.keys()))
        except Exception as e:
            logger.error("  Task %d export failed: %s", r["task_id"], e)

    logger.info("[Step 5/5] Pipeline complete!")
    db.close()


def run_import_only(args):
    from db_manager import DatabaseManager
    from meteo_importer import MeteoImporter

    db = DatabaseManager()
    try:
        db.initialize()
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error("Database initialization failed: %s", e)
        return

    importer = MeteoImporter(db=db)

    if args.csv:
        ids = importer.import_csv(args.csv, batch_name=args.batch_name)
        print(f"Imported IDs: {ids}")
    elif args.csv_dir:
        all_ids = importer.import_csv_batch(args.csv_dir)
        for fname, ids in all_ids.items():
            print(f"  {fname}: {len(ids)} records")
    elif args.generate_sample:
        path = os.path.join(config.IMPORT_DIR, "sample_meteo.csv")
        importer.generate_sample_csv(path)
        print(f"Sample CSV generated: {path}")

    db.close()


def run_queue_daemon(args):
    from db_manager import DatabaseManager
    from task_queue import TaskQueue

    db = DatabaseManager()
    try:
        db.initialize()
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error("Database initialization failed: %s", e)
        return

    queue = TaskQueue(db=db, max_workers=args.workers)
    queue.run_daemon(
        poll_interval=args.poll_interval,
        max_cycles=args.max_cycles,
    )
    db.close()


def main():
    parser = argparse.ArgumentParser(
        description="Meteorological Micro-Block Turbulence Numerical Simulation System"
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    pipeline_parser = subparsers.add_parser("pipeline", help="Run full simulation pipeline (requires PostgreSQL)")
    pipeline_parser.add_argument("--csv", help="Path to CSV file")
    pipeline_parser.add_argument("--csv-dir", help="Directory of CSV files")
    pipeline_parser.add_argument("--batch-name", help="Batch name for imports")
    pipeline_parser.add_argument("--workers", type=int, default=config.PARALLEL_MAX_WORKERS)
    pipeline_parser.add_argument("--grid-nx", type=int)
    pipeline_parser.add_argument("--grid-ny", type=int)
    pipeline_parser.add_argument("--grid-nz", type=int)
    pipeline_parser.add_argument("--method", choices=["LES", "RANS"])
    pipeline_parser.add_argument("--turb-model", choices=["Smagorinsky", "k-epsilon"])
    pipeline_parser.add_argument("--dt", type=float)
    pipeline_parser.add_argument("--t-end", type=float)
    pipeline_parser.add_argument("--max-iter", type=int)

    single_parser = subparsers.add_parser("single", help="Run single simulation (no database required)")
    single_parser.add_argument("--wind-speed", type=float, default=5.0)
    single_parser.add_argument("--wind-dir", type=float, default=0.0)
    single_parser.add_argument("--z0", type=float, default=0.01)
    single_parser.add_argument("--temperature", type=float, default=20.0)
    single_parser.add_argument("--pressure", type=float, default=1013.25)
    single_parser.add_argument("--grid-nx", type=int, default=16)
    single_parser.add_argument("--grid-ny", type=int, default=16)
    single_parser.add_argument("--grid-nz", type=int, default=8)
    single_parser.add_argument("--method", default="LES")
    single_parser.add_argument("--turb-model", default="Smagorinsky")
    single_parser.add_argument("--dt", type=float, default=0.01)
    single_parser.add_argument("--t-end", type=float, default=1.0)
    single_parser.add_argument("--max-iter", type=int, default=500)

    import_parser = subparsers.add_parser("import", help="Import meteorological data (requires PostgreSQL)")
    import_parser.add_argument("--csv", help="Path to CSV file")
    import_parser.add_argument("--csv-dir", help="Directory of CSV files")
    import_parser.add_argument("--batch-name", help="Batch name")
    import_parser.add_argument("--generate-sample", action="store_true")

    daemon_parser = subparsers.add_parser("daemon", help="Run task queue daemon (requires PostgreSQL)")
    daemon_parser.add_argument("--workers", type=int, default=config.PARALLEL_MAX_WORKERS)
    daemon_parser.add_argument("--poll-interval", type=float, default=2.0)
    daemon_parser.add_argument("--max-cycles", type=int, default=None)

    args = parser.parse_args()
    setup_logging()

    if args.command == "pipeline":
        run_full_pipeline(args)
    elif args.command == "single":
        run_single_simulation(args)
    elif args.command == "import":
        run_import_only(args)
    elif args.command == "daemon":
        run_queue_daemon(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
