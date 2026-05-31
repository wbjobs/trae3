import os
import pickle
import logging
import numpy as np
import config

logger = logging.getLogger(__name__)


class ResultExporter:
    def __init__(self):
        self.result_dir = config.RESULT_DIR
        self.dpi = config.VIZ_FIGURE_DPI
        self.cmap = config.VIZ_COLORMAP

    def load_result(self, filepath):
        with open(filepath, "rb") as f:
            result = pickle.load(f)
        logger.info("Loaded result from %s", filepath)
        return result

    def export_vtk(self, result, filepath=None):
        try:
            import vtk
            from vtk.util.numpy_support import numpy_to_vtk
        except ImportError:
            logger.warning("VTK not installed, falling back to VTK ASCII export")
            return self._export_vtk_ascii(result, filepath)

        grid_data = result["grid"]
        nx, ny, nz = grid_data["nx"], grid_data["ny"], grid_data["nz"]
        x, y, z = grid_data["x"], grid_data["y"], grid_data["z"]

        vtk_grid = vtk.vtkRectilinearGrid()
        vtk_grid.SetDimensions(nx + 1, ny + 1, nz + 1)
        vtk_grid.SetXCoordinates(numpy_to_vtk(x, deep=True))
        vtk_grid.SetYCoordinates(numpy_to_vtk(y, deep=True))
        vtk_grid.SetZCoordinates(numpy_to_vtk(z, deep=True))

        for name, field in [("u", result["u"]), ("v", result["v"]),
                            ("w", result["w"]), ("p", result["p"]),
                            ("tke", result["tke"])]:
            flat = np.ascontiguousarray(field.ravel(), dtype=np.float64)
            arr = numpy_to_vtk(flat, deep=True)
            arr.SetName(name)
            vtk_grid.GetCellData().AddArray(arr)

        speed = np.sqrt(result["u"]**2 + result["v"]**2 + result["w"]**2)
        speed_flat = np.ascontiguousarray(speed.ravel(), dtype=np.float64)
        speed_arr = numpy_to_vtk(speed_flat, deep=True)
        speed_arr.SetName("wind_speed")
        vtk_grid.GetCellData().AddArray(speed_arr)
        vtk_grid.GetCellData().SetScalars(speed_arr)

        if filepath is None:
            filepath = os.path.join(self.result_dir, "result.vtk")
        writer = vtk.vtkDataSetWriter()
        writer.SetFileName(filepath)
        writer.SetInputData(vtk_grid)
        writer.Write()
        logger.info("VTK export: %s", filepath)
        return filepath

    def _export_vtk_ascii(self, result, filepath=None):
        grid_data = result["grid"]
        nx, ny, nz = grid_data["nx"], grid_data["ny"], grid_data["nz"]
        x, y, z = grid_data["x"], grid_data["y"], grid_data["z"]

        if filepath is None:
            filepath = os.path.join(self.result_dir, "result.vtk")
        n_cells = nx * ny * nz
        with open(filepath, "w") as f:
            f.write("# vtk DataFile Version 3.0\n")
            f.write("Meteo Turbulence Simulation Result\n")
            f.write("ASCII\n")
            f.write("DATASET RECTILINEAR_GRID\n")
            f.write(f"DIMENSIONS {nx+1} {ny+1} {nz+1}\n")
            f.write(f"X_COORDINATES {nx+1} double\n")
            f.write(" ".join(f"{xi:.6f}" for xi in x) + "\n")
            f.write(f"Y_COORDINATES {ny+1} double\n")
            f.write(" ".join(f"{yi:.6f}" for yi in y) + "\n")
            f.write(f"Z_COORDINATES {nz+1} double\n")
            f.write(" ".join(f"{zi:.6f}" for zi in z) + "\n")
            f.write(f"CELL_DATA {n_cells}\n")

            for name, field in [("u", result["u"]), ("v", result["v"]),
                                ("w", result["w"]), ("p", result["p"]),
                                ("tke", result["tke"])]:
                f.write(f"SCALARS {name} double 1\n")
                f.write("LOOKUP_TABLE default\n")
                for val in field.ravel():
                    f.write(f"{val:.8e}\n")

            speed = np.sqrt(result["u"]**2 + result["v"]**2 + result["w"]**2)
            f.write("SCALARS wind_speed double 1\n")
            f.write("LOOKUP_TABLE default\n")
            for val in speed.ravel():
                f.write(f"{val:.8e}\n")

        logger.info("VTK ASCII export: %s", filepath)
        return filepath

    def export_netcdf(self, result, filepath=None):
        try:
            import netCDF4 as nc
        except ImportError:
            logger.error("netCDF4 not installed; cannot export to NetCDF")
            return None

        if filepath is None:
            filepath = os.path.join(self.result_dir, "result.nc")

        grid_data = result["grid"]
        nx, ny, nz = grid_data["nx"], grid_data["ny"], grid_data["nz"]

        ds = nc.Dataset(filepath, "w", format="NETCDF4")
        try:
            ds.createDimension("x", nx)
            ds.createDimension("y", ny)
            ds.createDimension("z", nz)

            x_var = ds.createVariable("x", "f8", ("x",))
            y_var = ds.createVariable("y", "f8", ("y",))
            z_var = ds.createVariable("z", "f8", ("z",))
            x_var[:] = grid_data["x"][:-1] + np.diff(grid_data["x"]) * 0.5
            y_var[:] = grid_data["y"][:-1] + np.diff(grid_data["y"]) * 0.5
            z_var[:] = grid_data["z"][:-1] + np.diff(grid_data["z"]) * 0.5
            x_var.units = "m"
            y_var.units = "m"
            z_var.units = "m"

            for name, field in [("u", result["u"]), ("v", result["v"]),
                                ("w", result["w"]), ("p", result["p"]),
                                ("tke", result["tke"])]:
                var = ds.createVariable(name, "f8", ("x", "y", "z"),
                                        zlib=True, complevel=4)
                var[:] = field
                if name in ("u", "v", "w"):
                    var.units = "m/s"
                elif name == "p":
                    var.units = "Pa"
                elif name == "tke":
                    var.units = "m2/s2"

            speed = np.sqrt(result["u"]**2 + result["v"]**2 + result["w"]**2)
            spd_var = ds.createVariable("wind_speed", "f8", ("x", "y", "z"),
                                         zlib=True, complevel=4)
            spd_var[:] = speed
            spd_var.units = "m/s"

            meta = result.get("metadata", {})
            ds.method = meta.get("method", "")
            ds.turbulence_model = meta.get("turbulence_model", "")
            ds.total_steps = str(meta.get("total_steps", 0))
            ds.final_time = str(meta.get("final_time", 0.0))
            ds.converged = str(meta.get("converged", False))
        finally:
            ds.close()

        logger.info("NetCDF export: %s", filepath)
        return filepath

    def export_csv(self, result, filepath=None):
        if filepath is None:
            filepath = os.path.join(self.result_dir, "result_summary.csv")

        history = result.get("history", [])
        with open(filepath, "w", encoding="utf-8") as f:
            headers = ["step", "time", "avg_wind_speed", "avg_tke",
                       "max_velocity", "min_velocity"]
            f.write(",".join(headers) + "\n")
            for h in history:
                f.write(",".join(str(h.get(col, "")) for col in headers) + "\n")

        logger.info("CSV summary export: %s (%d rows)", filepath, len(history))
        return filepath

    def export_all(self, result, base_dir=None):
        base_dir = base_dir or self.result_dir
        os.makedirs(base_dir, exist_ok=True)
        exported = {}
        ext_map = {"vtk": "vtk", "netcdf": "nc", "csv": "csv"}
        for fmt in config.EXPORT_FORMATS:
            method = getattr(self, f"export_{fmt}", None)
            if method:
                ext = ext_map.get(fmt, fmt)
                filepath = os.path.join(base_dir, f"result.{ext}")
                try:
                    path = method(result, filepath)
                    if path:
                        exported[fmt] = path
                except Exception as e:
                    logger.warning("Failed to export %s: %s", fmt, e)
        logger.info("All formats exported: %s", list(exported.keys()))
        return exported


class ResultVisualizer:
    def __init__(self):
        self.dpi = config.VIZ_FIGURE_DPI
        self.cmap = config.VIZ_COLORMAP
        self.result_dir = config.RESULT_DIR

    def plot_wind_field_crosssection(self, result, plane="z", index=None,
                                      filepath=None):
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        u, v, w = result["u"], result["v"], result["w"]
        grid_data = result["grid"]
        speed = np.sqrt(u**2 + v**2 + w**2)

        if plane == "z":
            idx = index or result["grid"]["nz"] // 2
            data = speed[:, :, idx]
            x_coords = grid_data["x"]
            y_coords = grid_data["y"]
            xlabel, ylabel = "X (m)", "Y (m)"
            title = f"Wind Speed at Z={grid_data['z'][idx]:.1f}m"
        elif plane == "y":
            idx = index or result["grid"]["ny"] // 2
            data = speed[:, idx, :]
            x_coords = grid_data["x"]
            y_coords = grid_data["z"]
            xlabel, ylabel = "X (m)", "Z (m)"
            title = f"Wind Speed at Y={grid_data['y'][idx]:.1f}m"
        else:
            idx = index or result["grid"]["nx"] // 2
            data = speed[idx, :, :]
            x_coords = grid_data["y"]
            y_coords = grid_data["z"]
            xlabel, ylabel = "Y (m)", "Z (m)"
            title = f"Wind Speed at X={grid_data['x'][idx]:.1f}m"

        fig, ax = plt.subplots(1, 1, figsize=(10, 8))
        im = ax.pcolormesh(x_coords, y_coords, data.T, cmap=self.cmap, shading="auto")
        ax.set_xlabel(xlabel)
        ax.set_ylabel(ylabel)
        ax.set_title(title)
        fig.colorbar(im, ax=ax, label="Wind Speed (m/s)")
        fig.tight_layout()

        if filepath is None:
            filepath = os.path.join(self.result_dir, f"wind_crosssection_{plane}.png")
        fig.savefig(filepath, dpi=self.dpi)
        plt.close(fig)
        logger.info("Cross-section plot saved: %s", filepath)
        return filepath

    def plot_velocity_profile(self, result, filepath=None):
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        u, v, w = result["u"], result["v"], result["w"]
        z_centers = result["grid"]["z"][:-1] + np.diff(result["grid"]["z"]) * 0.5

        u_mean = np.mean(u, axis=(0, 1))
        v_mean = np.mean(v, axis=(0, 1))
        w_mean = np.mean(w, axis=(0, 1))
        speed_mean = np.sqrt(u_mean**2 + v_mean**2 + w_mean**2)
        tke_mean = np.mean(result["tke"], axis=(0, 1))

        fig, axes = plt.subplots(1, 3, figsize=(16, 8))

        axes[0].plot(u_mean, z_centers, "b-", label="U")
        axes[0].plot(v_mean, z_centers, "g-", label="V")
        axes[0].plot(w_mean, z_centers, "r-", label="W")
        axes[0].set_xlabel("Velocity (m/s)")
        axes[0].set_ylabel("Height (m)")
        axes[0].set_title("Mean Velocity Profiles")
        axes[0].legend()
        axes[0].grid(True, alpha=0.3)

        axes[1].plot(speed_mean, z_centers, "k-")
        axes[1].set_xlabel("Wind Speed (m/s)")
        axes[1].set_ylabel("Height (m)")
        axes[1].set_title("Mean Wind Speed Profile")
        axes[1].grid(True, alpha=0.3)

        axes[2].plot(tke_mean, z_centers, "m-")
        axes[2].set_xlabel("TKE (m²/s²)")
        axes[2].set_ylabel("Height (m)")
        axes[2].set_title("Mean TKE Profile")
        axes[2].grid(True, alpha=0.3)

        fig.tight_layout()
        if filepath is None:
            filepath = os.path.join(self.result_dir, "velocity_profile.png")
        fig.savefig(filepath, dpi=self.dpi)
        plt.close(fig)
        logger.info("Velocity profile plot saved: %s", filepath)
        return filepath

    def plot_convergence_history(self, result, filepath=None):
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        history = result.get("history", [])
        if not history:
            logger.warning("No history data to plot")
            return None

        steps = [h["step"] for h in history]
        avg_speed = [h["avg_wind_speed"] for h in history]
        avg_tke = [h["avg_tke"] for h in history]
        max_vel = [h["max_velocity"] for h in history]

        fig, axes = plt.subplots(3, 1, figsize=(12, 10), sharex=True)

        axes[0].plot(steps, avg_speed, "b-")
        axes[0].set_ylabel("Avg Wind Speed (m/s)")
        axes[0].set_title("Convergence History")
        axes[0].grid(True, alpha=0.3)

        axes[1].plot(steps, avg_tke, "r-")
        axes[1].set_ylabel("Avg TKE (m²/s²)")
        axes[1].grid(True, alpha=0.3)

        axes[2].plot(steps, max_vel, "g-")
        axes[2].set_ylabel("Max Velocity (m/s)")
        axes[2].set_xlabel("Iteration Step")
        axes[2].grid(True, alpha=0.3)

        fig.tight_layout()
        if filepath is None:
            filepath = os.path.join(self.result_dir, "convergence_history.png")
        fig.savefig(filepath, dpi=self.dpi)
        plt.close(fig)
        logger.info("Convergence history plot saved: %s", filepath)
        return filepath

    def plot_turbulence_intensity_map(self, result, filepath=None):
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        u, v, w = result["u"], result["v"], result["w"]
        speed = np.sqrt(u**2 + v**2 + w**2)
        tke = result["tke"]
        ti = np.sqrt(2.0 / 3.0 * tke) / np.maximum(speed, 1e-10)

        grid_data = result["grid"]
        z_idx = grid_data["nz"] // 2

        fig, ax = plt.subplots(1, 1, figsize=(10, 8))
        im = ax.pcolormesh(
            grid_data["x"], grid_data["y"],
            ti[:, :, z_idx].T, cmap="hot", shading="auto",
            vmin=0, vmax=min(1.0, np.percentile(ti, 99)),
        )
        ax.set_xlabel("X (m)")
        ax.set_ylabel("Y (m)")
        ax.set_title(f"Turbulence Intensity at Z={grid_data['z'][z_idx]:.1f}m")
        fig.colorbar(im, ax=ax, label="Turbulence Intensity")
        fig.tight_layout()

        if filepath is None:
            filepath = os.path.join(self.result_dir, "turbulence_intensity.png")
        fig.savefig(filepath, dpi=self.dpi)
        plt.close(fig)
        logger.info("Turbulence intensity map saved: %s", filepath)
        return filepath

    def visualize_all(self, result, output_dir=None):
        output_dir = output_dir or self.result_dir
        os.makedirs(output_dir, exist_ok=True)
        plots = {}
        try:
            p = self.plot_wind_field_crosssection(result, filepath=os.path.join(output_dir, "wind_xy.png"))
            plots["crosssection_z"] = p
        except Exception as e:
            logger.warning("Failed cross-section plot: %s", e)
        try:
            p = self.plot_velocity_profile(result, filepath=os.path.join(output_dir, "velocity_profile.png"))
            plots["velocity_profile"] = p
        except Exception as e:
            logger.warning("Failed velocity profile plot: %s", e)
        try:
            p = self.plot_convergence_history(result, filepath=os.path.join(output_dir, "convergence.png"))
            plots["convergence"] = p
        except Exception as e:
            logger.warning("Failed convergence plot: %s", e)
        try:
            p = self.plot_turbulence_intensity_map(result, filepath=os.path.join(output_dir, "turb_intensity.png"))
            plots["turbulence_intensity"] = p
        except Exception as e:
            logger.warning("Failed turbulence intensity plot: %s", e)
        logger.info("All visualizations generated: %s", list(plots.keys()))
        return plots
