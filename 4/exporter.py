import csv
import json
import os
import struct
import numpy as np
from typing import Dict, Any, Optional


class ResultExporter:
    def __init__(self, output_dir: str = "output"):
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)

    def _make_path(self, task_name: str, extension: str) -> str:
        filename = f"{task_name}{extension}"
        return os.path.join(self.output_dir, filename)

    def export_csv(self, task_name: str, results: Dict[str, Any],
                   mode: str = "profiles") -> str:
        if mode == "profiles":
            return self._export_profiles_csv(task_name, results)
        elif mode == "boundary_params":
            return self._export_boundary_params_csv(task_name, results)
        elif mode == "residual":
            return self._export_residual_csv(task_name, results)
        else:
            raise ValueError(f"Unknown CSV export mode: {mode}")

    def _export_profiles_csv(self, task_name: str, results: Dict[str, Any]) -> str:
        path = self._make_path(task_name, "_profiles.csv")
        x = results["x"]
        y = results["y"]
        u = results["u"]
        v = results["v"]
        ny, nx = u.shape
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["x", "y", "u", "v"])
            for i in range(nx):
                for j in range(ny):
                    writer.writerow([
                        f"{x[i]:.6e}",
                        f"{y[j]:.6e}",
                        f"{u[j, i]:.6e}",
                        f"{v[j, i]:.6e}",
                    ])
        return path

    def _export_boundary_params_csv(self, task_name: str, results: Dict[str, Any]) -> str:
        path = self._make_path(task_name, "_boundary_params.csv")
        x = results["x"]
        cf = results["skin_friction"]
        delta_star = results["displacement_thickness"]
        theta = results["momentum_thickness"]
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["x", "skin_friction_coeff",
                             "displacement_thickness", "momentum_thickness"])
            for i in range(len(x)):
                writer.writerow([
                    f"{x[i]:.6e}",
                    f"{cf[i]:.6e}",
                    f"{delta_star[i]:.6e}",
                    f"{theta[i]:.6e}",
                ])
        return path

    def _export_residual_csv(self, task_name: str, results: Dict[str, Any]) -> str:
        path = self._make_path(task_name, "_residual.csv")
        res = results["residual_history"]
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["station", "residual"])
            step = max(1, len(res) // 500)
            for idx in range(0, len(res), step):
                writer.writerow([idx, f"{res[idx]:.6e}"])
            if len(res) > 0 and (len(res) - 1) % step != 0:
                writer.writerow([len(res) - 1, f"{res[-1]:.6e}"])
        return path

    def export_json(self, task_name: str, results: Dict[str, Any],
                    include_field: bool = False) -> str:
        path = self._make_path(task_name, ".json")
        data = {
            "task_name": task_name,
            "iterations": results.get("iterations", 0),
            "x": np.array(results["x"], dtype=np.float32).tolist(),
            "y": np.array(results["y"], dtype=np.float32).tolist(),
            "skin_friction": np.array(results["skin_friction"], dtype=np.float32).tolist(),
            "displacement_thickness": np.array(results["displacement_thickness"], dtype=np.float32).tolist(),
            "momentum_thickness": np.array(results["momentum_thickness"], dtype=np.float32).tolist(),
            "residual_history": np.array(results["residual_history"], dtype=np.float32).tolist(),
        }
        if include_field:
            data["u_field"] = np.array(results["u"], dtype=np.float32).tolist()
            data["v_field"] = np.array(results["v"], dtype=np.float32).tolist()
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, separators=(",", ":"), ensure_ascii=False)
        return path

    def export_npy(self, task_name: str, results: Dict[str, Any]) -> str:
        path = self._make_path(task_name, ".npz")
        save_dict = {
            "x": np.asarray(results["x"], dtype=np.float32),
            "y": np.asarray(results["y"], dtype=np.float32),
            "u": np.asarray(results["u"], dtype=np.float32),
            "v": np.asarray(results["v"], dtype=np.float32),
            "cf": np.asarray(results["skin_friction"], dtype=np.float32),
            "ds": np.asarray(results["displacement_thickness"], dtype=np.float32),
            "th": np.asarray(results["momentum_thickness"], dtype=np.float32),
            "res": np.asarray(results["residual_history"], dtype=np.float32),
        }
        np.savez_compressed(path, **save_dict)
        return path

    def export_all(self, task_name: str, results: Dict[str, Any]) -> Dict[str, str]:
        exported = {}
        exported["boundary_csv"] = self.export_csv(task_name, results, mode="boundary_params")
        exported["json"] = self.export_json(task_name, results)
        exported["npz"] = self.export_npy(task_name, results)
        return exported

    @staticmethod
    def load_npy(path: str) -> Dict[str, np.ndarray]:
        data = np.load(path)
        mapping = {
            "x": "x", "y": "y", "u": "u", "v": "v",
            "cf": "skin_friction", "ds": "displacement_thickness",
            "th": "momentum_thickness", "res": "residual_history",
        }
        return {mapping.get(k, k): data[k] for k in data.files}
