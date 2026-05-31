import sys
import time
import argparse
import numpy as np
import shutil
import os

from config import SimulationConfig, get_preset, PRESETS
from grid import BoundaryLayerGrid
from solver import BoundaryLayerSolver, warmup_jit
from database import SimulationDatabase
from exporter import ResultExporter
from scheduler import TaskScheduler


def clean_output_dirs():
    for pattern in ["output", "__pycache__"]:
        p = os.path.join(".", pattern)
        if os.path.exists(p):
            shutil.rmtree(p)
    for f in os.listdir("."):
        if f.endswith(".db"):
            os.remove(f)


def run_single(config: SimulationConfig, use_parallel: bool = False):
    print("=" * 70)
    print("  Boundary Layer Numerical Simulation System")
    print("=" * 70)
    print(f"\nTask: {config.task_name}")
    print(f"Grid: {config.grid.nx} x {config.grid.ny}")
    print(f"Domain: x=[0, {config.grid.x_length}], y=[0, {config.grid.y_length}]")
    print(f"Flow: U_inf={config.flow.u_inf}, nu={config.flow.nu:.4e}")
    print(f"Re_L = {config.flow.u_inf * config.grid.x_length / config.flow.nu:.2e}")
    print(f"Parallel post-processing: {use_parallel}")
    print(f"Numba threads: {config.parallel.num_workers}")

    print("\n[1/3] Initializing...")
    t0 = time.time()
    warmup_jit()
    grid = BoundaryLayerGrid(config.grid)
    solver = BoundaryLayerSolver(grid, config)
    solver.initialize()
    init_time = time.time() - t0
    info = grid.info()
    print(f"  Grid: {info['nx']}x{info['ny']}, dy_min={info['dy_min']:.2e}")
    print(f"  Init + JIT warmup: {init_time:.3f}s")

    print("\n[2/3] Solving boundary layer equations...")
    t0 = time.time()
    results = solver.solve(use_parallel=use_parallel, progress=True)
    solve_time = time.time() - t0

    res_hist = results['residual_history']
    if len(res_hist) > 1:
        print(f"  Max residual: {np.max(res_hist[1:]):.4e}")
    print(f"  Solve time: {solve_time:.2f}s ({results['iterations']/solve_time:.0f} stations/s)")

    print("\n[3/3] Exporting results...")
    t0 = time.time()
    exporter = ResultExporter(output_dir=f"output/{config.task_name}")
    exported = exporter.export_all(config.task_name, results)
    for key, path in exported.items():
        size_kb = os.path.getsize(path) / 1024
        print(f"  {key}: {path} ({size_kb:.1f} KB)")
    print(f"  Export elapsed: {time.time() - t0:.3f}s")

    print_boundary_layer_summary(results, config)
    return results


def print_boundary_layer_summary(results: dict, config: SimulationConfig):
    print("\n" + "-" * 70)
    print("  Boundary Layer Parameters vs Blasius Similarity Solution")
    print("-" * 70)
    x = np.asarray(results["x"], dtype=np.float64)
    cf = np.asarray(results["skin_friction"], dtype=np.float64)
    delta_star = np.asarray(results["displacement_thickness"], dtype=np.float64)
    theta = np.asarray(results["momentum_thickness"], dtype=np.float64)
    u_inf = config.flow.u_inf
    nu = config.flow.nu

    sample_indices = [len(x) // 5, len(x) // 3, len(x) // 2, 2 * len(x) // 3, len(x) - 1]
    print(f"  {'x':>8s} {'Re_x':>10s} {'cf_sim':>10s} {'cf_anal':>10s} {'err%':>7s} "
          f"{'H_sim':>7s} {'H_anal':>7s}")
    print("  " + "-" * 73)

    cf_errors = []
    h_errors = []
    for i in sample_indices:
        if i >= len(x) or i == 0:
            continue
        Re_x = u_inf * float(x[i]) / nu if x[i] > 0 else 0.0
        H_sim = float(delta_star[i]) / float(theta[i]) if theta[i] > 1e-30 else 0.0
        H_anal = 2.591
        cf_anal = 0.664 / np.sqrt(Re_x) if Re_x > 0 else 0.0
        cf_err = abs(float(cf[i]) - cf_anal) / cf_anal * 100.0 if cf_anal > 1e-30 else 0.0
        h_err = abs(H_sim - H_anal) / H_anal * 100.0
        cf_errors.append(cf_err)
        h_errors.append(h_err)
        print(f"  {float(x[i]):8.4f} {Re_x:10.2e} {float(cf[i]):10.3e} {cf_anal:10.3e} {cf_err:6.1f}%"
              f"  {H_sim:7.3f} {H_anal:7.3f}")

    if cf_errors:
        print("  " + "-" * 73)
        print(f"  Average cf error: {np.mean(cf_errors):.1f}%, "
              f"Average H error: {np.mean(h_errors):.1f}%")


def run_batch(configs: list, mode: str = "sequential"):
    print("=" * 70)
    print("  Batch Boundary Layer Simulation")
    print("=" * 70)
    print(f"  Tasks: {len(configs)}")
    print(f"  Mode: {mode}")
    num_w = configs[0].parallel.num_workers if configs else 4
    print(f"  Workers: {num_w}")

    t0_total = time.time()

    with TaskScheduler(
        db_path="boundary_layer_batch.db",
        output_dir="output/batch",
        max_workers=num_w,
    ) as scheduler:
        task_ids = scheduler.submit_batch(configs)
        print(f"  Submitted: {task_ids}")

        t0 = time.time()
        results_list = scheduler.run(mode=mode)
        compute_time = time.time() - t0

        success_count = sum(1 for r in results_list if "error" not in r)
        print(f"\n  Batch result: {success_count}/{len(results_list)} succeeded, "
              f"compute={compute_time:.2f}s, total={time.time() - t0_total:.2f}s")

    return results_list


def demo():
    print("Running demo with laminar flat plate preset...\n")
    config = get_preset("laminar_flat_plate")
    config.grid.nx = 100
    config.grid.ny = 60
    config.solver.convergence_tolerance = 1e-6
    config.parallel.num_workers = 2
    run_single(config, use_parallel=True)


def main():
    parser = argparse.ArgumentParser(
        description="Fluid Dynamics Boundary Layer Numerical Simulation System"
    )
    parser.add_argument("--mode", choices=["single", "batch", "demo"],
                        default="demo", help="Execution mode")
    parser.add_argument("--preset", choices=list(PRESETS.keys()),
                        default="laminar_flat_plate", help="Preset configuration")
    parser.add_argument("--config-file", type=str, default=None,
                        help="Path to JSON config file")
    parser.add_argument("--nx", type=int, default=None, help="Grid points in x")
    parser.add_argument("--ny", type=int, default=None, help="Grid points in y")
    parser.add_argument("--u-inf", type=float, default=None, help="Freestream velocity")
    parser.add_argument("--tol", type=float, default=None, help="Convergence tolerance")
    parser.add_argument("--num-workers", type=int, default=2, help="Number of workers")
    parser.add_argument("--parallel", action="store_true", help="Use parallel post-processing")
    parser.add_argument("--scheduler-mode", choices=["sequential", "parallel"],
                        default="parallel", help="Batch scheduler mode")
    parser.add_argument("--clean", action="store_true", help="Clean output and DB before run")

    args = parser.parse_args()

    if args.clean:
        clean_output_dirs()
        print("Cleaned output directories and database.\n")

    if args.mode == "demo":
        demo()
        return

    if args.config_file:
        config = SimulationConfig.load(args.config_file)
    else:
        config = get_preset(args.preset)

    if args.nx is not None:
        config.grid.nx = args.nx
    if args.ny is not None:
        config.grid.ny = args.ny
    if args.u_inf is not None:
        config.flow.u_inf = args.u_inf
    if args.tol is not None:
        config.solver.convergence_tolerance = args.tol
    config.parallel.num_workers = args.num_workers

    if args.mode == "single":
        run_single(config, use_parallel=args.parallel)
    elif args.mode == "batch":
        configs = [config]
        for i in range(1, 4):
            variant = SimulationConfig.from_dict(config.to_dict())
            variant.task_name = f"{config.task_name}_variant_{i}"
            variant.flow.u_inf = config.flow.u_inf * (1.0 + 0.5 * i)
            variant.grid.nx = max(60, config.grid.nx - 10 * i)
            variant.grid.ny = max(40, config.grid.ny - 5 * i)
            configs.append(variant)
        run_batch(configs, mode=args.scheduler_mode)


if __name__ == "__main__":
    main()
