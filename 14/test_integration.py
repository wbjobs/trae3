import os
import sys
import logging
import time
import traceback
import numpy as np
from concurrent.futures import ProcessPoolExecutor, as_completed

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("integration_test")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from grid_mesh import GridMesh
from turbulence_solver import TurbulenceSolver
from viz_export import ResultExporter, ResultVisualizer


def _execute_simulation(task_id, config_dict, result_dir):
    pid = os.getpid()
    logger.info("[Task %d] Starting in process %d", task_id, pid)
    try:
        meteo_params = config_dict["meteo"]
        grid_cfg = config_dict["grid"]
        solver_cfg = config_dict["solver"]

        start_time = time.time()

        grid = GridMesh(
            nx=grid_cfg.get("nx", 8),
            ny=grid_cfg.get("ny", 8),
            nz=grid_cfg.get("nz", 4),
            roughness_length=meteo_params.get("roughness_length", 0.01),
        )
        grid.generate()

        solver = TurbulenceSolver(grid, meteo_params, solver_cfg)
        result = solver.solve()

        elapsed = time.time() - start_time

        result_path = os.path.join(result_dir, f"task_{task_id}_result.pkl")
        solver.save_result(result_path)

        exporter = ResultExporter()
        task_output_dir = os.path.join(result_dir, f"task_{task_id}")
        exported = exporter.export_all(result, base_dir=task_output_dir)

        visualizer = ResultVisualizer()
        viz_dir = os.path.join(result_dir, f"task_{task_id}", "plots")
        os.makedirs(viz_dir, exist_ok=True)
        visualizer.plot_wind_field_crosssection(
            result,
            filepath=os.path.join(viz_dir, "wind_xy.png"),
        )
        visualizer.plot_velocity_profile(
            result,
            filepath=os.path.join(viz_dir, "velocity_profile.png"),
        )

        history = result.get("history", [])
        summary = {
            "task_id": task_id,
            "pid": pid,
            "status": "completed",
            "total_steps": result["metadata"]["total_steps"],
            "final_time": result["metadata"]["final_time"],
            "converged": result["metadata"]["converged"],
            "avg_wind_speed": history[-1]["avg_wind_speed"] if history else 0,
            "avg_tke": history[-1]["avg_tke"] if history else 0,
            "max_velocity": history[-1]["max_velocity"] if history else 0,
            "elapsed": elapsed,
            "result_path": result_path,
            "exported_formats": list(exported.keys()),
        }

        logger.info("[Task %d] Completed: steps=%d, elapsed=%.2fs, avg_speed=%.4f",
                     task_id, summary["total_steps"], elapsed, summary["avg_wind_speed"])

        return task_id, "completed", None, summary

    except Exception as e:
        tb = traceback.format_exc()
        logger.error("[Task %d] Failed: %s\n%s", task_id, e, tb)
        return task_id, "failed", str(e), None


def run_parallel_test(num_tasks=3, max_workers=2):
    logger.info("=" * 70)
    logger.info("PARALLEL EXECUTION TEST")
    logger.info("=" * 70)
    logger.info("Tasks: %d, Max workers: %d", num_tasks, max_workers)

    result_dir = os.path.join("data", "results", "parallel_test")
    os.makedirs(result_dir, exist_ok=True)

    task_configs = []
    for i in range(num_tasks):
        wind_speeds = [3.0, 5.0, 7.0, 4.0, 6.0]
        wind_dirs = [0.0, 45.0, 90.0, 180.0, 270.0]
        roughness = [0.005, 0.01, 0.02, 0.05, 0.1]

        config_dict = {
            "meteo": {
                "wind_speed": wind_speeds[i % len(wind_speeds)],
                "wind_direction": wind_dirs[i % len(wind_dirs)],
                "temperature": 15.0 + i,
                "pressure": 101325.0,
                "humidity": 60.0,
                "roughness_length": roughness[i % len(roughness)],
                "station_id": f"STN_{i:03d}",
            },
            "grid": {
                "nx": 8,
                "ny": 8,
                "nz": 4,
            },
            "solver": {
                "dt": 0.01,
                "t_end": 0.05,
                "method": "LES",
                "turbulence_model": "Smagorinsky",
            },
        }
        task_configs.append(config_dict)

    start_time = time.time()
    results = []
    pids = []

    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        future_map = {}
        for task_id, cfg in enumerate(task_configs):
            future = executor.submit(_execute_simulation, task_id, cfg, result_dir)
            future_map[future] = task_id
            logger.info("Submitted task %d", task_id)

        for future in as_completed(future_map):
            task_id = future_map[future]
            try:
                tid, status, err, summary = future.result()
                if summary:
                    pids.append(summary["pid"])
                results.append({"task_id": tid, "status": status, "error": err, "summary": summary})
                if status == "completed":
                    logger.info("✓ Task %d completed successfully", tid)
                else:
                    logger.error("✗ Task %d failed: %s", tid, err)
            except Exception as e:
                logger.error("✗ Task %d exception: %s", task_id, e)
                results.append({"task_id": task_id, "status": "failed", "error": str(e)})

    total_elapsed = time.time() - start_time

    logger.info("-" * 70)
    logger.info("PARALLEL TEST SUMMARY")
    logger.info("-" * 70)
    logger.info("Total elapsed: %.2f seconds", total_elapsed)
    logger.info("Tasks completed: %d/%d", sum(1 for r in results if r["status"] == "completed"), len(results))
    logger.info("Unique PIDs used: %s", sorted(set(pids)))
    logger.info("Average elapsed per task: %.2fs",
                 total_elapsed / len(results) if results else 0)

    for r in sorted(results, key=lambda x: x["task_id"]):
        if r["summary"]:
            s = r["summary"]
            logger.info("  Task %d: pid=%d, steps=%d, avg_speed=%.4f, elapsed=%.2fs",
                         s["task_id"], s["pid"], s["total_steps"],
                         s["avg_wind_speed"], s["elapsed"])
        else:
            logger.info("  Task %d: FAILED - %s", r["task_id"], r["error"])

    success = all(r["status"] == "completed" for r in results)
    if success:
        logger.info("✓ All tasks completed successfully!")
    else:
        logger.error("✗ Some tasks failed!")

    logger.info("=" * 70)
    return success


def run_solver_verification():
    logger.info("=" * 70)
    logger.info("SOLVER VERIFICATION TEST")
    logger.info("=" * 70)

    meteo_params = {
        "wind_speed": 5.0,
        "wind_direction": 0.0,
        "temperature": 15.0,
        "pressure": 101325.0,
        "humidity": 60.0,
        "roughness_length": 0.01,
    }

    grid = GridMesh(nx=8, ny=8, nz=6, roughness_length=0.01)
    grid.generate()

    solver_cfg = {
        "dt": 0.01,
        "t_end": 0.3,
        "method": "LES",
        "turbulence_model": "Smagorinsky",
    }

    solver = TurbulenceSolver(grid, meteo_params, solver_cfg)
    result = solver.solve()

    logger.info("-" * 70)
    logger.info("SOLVER VERIFICATION SUMMARY")
    logger.info("-" * 70)

    checks = []

    u, v, w = result["u"], result["v"], result["w"]
    tke = result["tke"]
    p = result["p"]

    has_nan = np.any(np.isnan(u)) or np.any(np.isnan(v)) or np.any(np.isnan(w))
    has_inf = np.any(np.isinf(u)) or np.any(np.isinf(v)) or np.any(np.isinf(w))
    logger.info("NaN check: %s", "✗ FAILED" if has_nan else "✓ PASSED")
    logger.info("Inf check: %s", "✗ FAILED" if has_inf else "✓ PASSED")
    checks.append(not has_nan and not has_inf)

    speed = np.sqrt(u ** 2 + v ** 2 + w ** 2)
    max_speed = np.max(speed)
    avg_speed = np.mean(speed)
    min_speed = np.min(speed)
    logger.info("Speed range: [%.6f, %.6f], avg=%.6f", min_speed, max_speed, avg_speed)

    u_ref = meteo_params["wind_speed"]
    max_allowed = max(3.0 * u_ref, 30.0)
    speed_ok = max_speed <= max_allowed + 1e-6
    logger.info("Speed bound check (<= %.2f): %s (max=%.4f)",
                 max_allowed, "✓ PASSED" if speed_ok else "✗ FAILED", max_speed)
    checks.append(speed_ok)

    tke_max = np.max(tke)
    tke_avg = np.mean(tke)
    tke_ok = tke_avg > 0 and tke_max < 1000
    logger.info("TKE: avg=%.6f, max=%.6f", tke_avg, tke_max)
    logger.info("TKE physical check: %s", "✓ PASSED" if tke_ok else "✗ FAILED")
    checks.append(tke_ok)

    nu_sgs = result["nu_sgs"]
    nu_min = np.min(nu_sgs)
    nu_max = np.max(nu_sgs)
    nu_ok = nu_min >= 0.05 and nu_max <= 50.0
    logger.info("SGS viscosity: [%.6f, %.6f]", nu_min, nu_max)
    logger.info("SGS viscosity range check: %s", "✓ PASSED" if nu_ok else "✗ FAILED")
    checks.append(nu_ok)

    div_x = np.zeros_like(u)
    div_y = np.zeros_like(v)
    div_z = np.zeros_like(w)
    div_x[1:, :, :] = (u[1:, :, :] - u[:-1, :, :]) / grid.dx[1:, None, None]
    div_y[:, 1:, :] = (v[:, 1:, :] - v[:, :-1, :]) / grid.dy[None, 1:, None]
    div_z[:, :, 1:] = (w[:, :, 1:] - w[:, :, :-1]) / grid.dz[None, None, 1:]
    div = div_x + div_y + div_z
    avg_div = np.mean(np.abs(div[1:-1, 1:-1, 1:-1]))
    div_ok = avg_div < 10.0
    logger.info("Avg divergence: %.6e", avg_div)
    logger.info("Divergence check (< 10.0): %s", "✓ PASSED" if div_ok else "✗ FAILED")
    checks.append(div_ok)

    history = result.get("history", [])
    if len(history) > 5:
        speeds = [h["avg_wind_speed"] for h in history]
        variation = (max(speeds) - min(speeds)) / (max(speeds) + 1e-15)
        logger.info("Speed variation over time: %.4f%%", variation * 100)

    all_passed = all(checks)
    logger.info("-" * 70)
    logger.info("OVERALL: %s (%d/%d checks passed)",
                 "✓ PASSED" if all_passed else "✗ FAILED", sum(checks), len(checks))
    logger.info("=" * 70)

    return all_passed


def main():
    logger.info("=" * 70)
    logger.info("INTEGRATION TEST SUITE")
    logger.info("=" * 70)
    logger.info("")

    results = {}

    try:
        results["solver_verification"] = run_solver_verification()
    except Exception as e:
        logger.error("Solver verification failed with exception: %s", e)
        results["solver_verification"] = False

    logger.info("")

    try:
        results["parallel_execution"] = run_parallel_test(num_tasks=3, max_workers=2)
    except Exception as e:
        logger.error("Parallel test failed with exception: %s", e)
        results["parallel_execution"] = False

    logger.info("")
    logger.info("=" * 70)
    logger.info("FINAL RESULTS")
    logger.info("=" * 70)
    for test_name, passed in results.items():
        logger.info("  %s: %s", test_name, "✓ PASSED" if passed else "✗ FAILED")

    all_passed = all(results.values())
    logger.info("-" * 70)
    logger.info("Overall: %s", "ALL TESTS PASSED ✓" if all_passed else "SOME TESTS FAILED ✗")
    logger.info("=" * 70)

    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
