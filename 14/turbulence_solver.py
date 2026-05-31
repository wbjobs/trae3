import numpy as np
import logging
import pickle
import os
import time
import threading
import config
from grid_mesh import GridMesh

logger = logging.getLogger(__name__)


class SimulationMonitor:
    def __init__(self, report_interval=1.0):
        self._report_interval = report_interval
        self._last_report_time = 0.0
        self._wall_start = 0.0
        self._callbacks = []
        self._lock = threading.Lock()
        self._latest = None
        self._progress = 0.0

    def add_callback(self, cb):
        self._callbacks.append(cb)

    def start(self, total_steps):
        self._wall_start = time.time()
        self._last_report_time = self._wall_start
        self._total_steps = total_steps
        self._progress = 0.0

    def update(self, step, time_val, dt, summary):
        self._latest = summary
        self._progress = step / max(self._total_steps, 1)
        now = time.time()
        elapsed_total = now - self._wall_start
        summary["wall_elapsed"] = elapsed_total
        summary["progress"] = self._progress

        if self._total_steps > 0 and step > 0:
            eta = elapsed_total / step * (self._total_steps - step)
            summary["eta_seconds"] = max(0.0, eta)
        else:
            summary["eta_seconds"] = 0.0

        if now - self._last_report_time >= self._report_interval:
            self._last_report_time = now
            self._emit(summary)

    def _emit(self, summary):
        with self._lock:
            for cb in self._callbacks:
                try:
                    cb(summary)
                except Exception:
                    pass

    def get_latest(self):
        return self._latest

    def get_progress(self):
        return self._progress


class TurbulenceSolver:
    def __init__(self, grid, meteo_params, solver_config=None):
        self.grid = grid
        self.meteo = meteo_params
        self.cfg = solver_config or {}

        self.method = self.cfg.get("method", config.SOLVER_METHOD)
        self.turb_model = self.cfg.get("turbulence_model", config.TURBULENCE_MODEL)
        self.max_iter = self.cfg.get("max_iterations", config.SOLVER_MAX_ITER)
        self.tol = self.cfg.get("tolerance", config.SOLVER_TOLERANCE)
        self.omega = self.cfg.get("relaxation", config.SOLVER_RELAXATION)
        self.cfl = self.cfg.get("cfl", config.SOLVER_CFL)
        self.dt = self.cfg.get("dt", config.SOLVER_DT)
        self.t_end = self.cfg.get("t_end", config.SOLVER_T_END)

        self.nu = 1.5e-5
        self.rho = 1.225
        self.nu_min_sgs = 0.05

        nx, ny, nz = grid.nx, grid.ny, grid.nz
        self.nx, self.ny, self.nz = nx, ny, nz

        self.u = np.zeros((nx, ny, nz))
        self.v = np.zeros((nx, ny, nz))
        self.w = np.zeros((nx, ny, nz))
        self.p = np.zeros((nx, ny, nz))
        self.tke = np.zeros((nx, ny, nz))
        self.nu_sgs = np.full((nx, ny, nz), self.nu_min_sgs)

        self._mean_u = np.zeros(nz)
        self._mean_v = np.zeros(nz)
        self._u_star = 0.0

        self._dx = self.grid.dx[:, None, None]
        self._dy = self.grid.dy[None, :, None]
        self._dz = self.grid.dz[None, None, :]
        self._idx2 = 1.0 / (self._dx ** 2)
        self._idy2 = 1.0 / (self._dy ** 2)
        self._idz2 = 1.0 / (self._dz ** 2)

        self._poisson_denom = 2.0 * (self._idx2 + self._idy2 + self._idz2)

        cs = config.SMAGORINSKY_CS
        self._delta = np.power(
            np.maximum(self._dx * self._dy * self._dz, 1e-30),
            1.0 / 3.0,
        )
        self._cs_delta_sq = (cs * self._delta) ** 2

        self._buf_dfdx = np.zeros((nx, ny, nz))
        self._buf_dfdy = np.zeros((nx, ny, nz))
        self._buf_dfdz = np.zeros((nx, ny, nz))
        self._buf_lap = np.zeros((nx, ny, nz))
        self._buf_adv = np.zeros((nx, ny, nz))
        self._buf_u_star = np.zeros((nx, ny, nz))
        self._buf_v_star = np.zeros((nx, ny, nz))
        self._buf_w_star = np.zeros((nx, ny, nz))
        self._buf_div = np.zeros((nx, ny, nz))
        self._buf_p_old = np.zeros((nx, ny, nz))
        self._buf_speed = np.zeros((nx, ny, nz))

        self._dx_min = np.min(self.grid.dx)
        self._dy_min = np.min(self.grid.dy)
        self._dz_min = np.min(self.grid.dz)
        self._dx_min_dim = min(self._dx_min, self._dy_min, self._dz_min)

        self.step = 0
        self.time = 0.0
        self.converged = False
        self.history = []

        self._rng = np.random.default_rng(42)
        self._spectral_params = None

        self.monitor = SimulationMonitor(report_interval=1.0)

    def initialize(self):
        logger.info("Initializing turbulence solver [%s / %s]", self.method, self.turb_model)
        self._compute_mean_profiles()
        self._init_velocity_field()
        self._compute_sgs_viscosity()
        self.tke = self._compute_tke_field()
        self._apply_boundary_conditions()
        logger.info("Solver initialized: dt=%.6f, t_end=%.2f, nu_min_sgs=%.4f",
                     self.dt, self.t_end, self.nu_min_sgs)

    def _compute_mean_profiles(self):
        u_ref = self.meteo.get("wind_speed", 5.0)
        z0 = self.meteo.get("roughness_length", 0.01)
        von_karman = 0.41
        self._u_star = u_ref * von_karman / max(np.log(100.0 / z0), 1.0)

        z_centers = self.grid.cell_centers[2]
        for k in range(self.grid.nz):
            z = z_centers[0, 0, k]
            if z > z0:
                self._mean_u[k] = (self._u_star / von_karman) * np.log(z / z0)
            else:
                self._mean_u[k] = 0.0

        wind_dir = self.meteo.get("wind_direction", 0.0)
        rad = np.deg2rad(wind_dir)
        u_orig = self._mean_u.copy()
        self._mean_u = u_orig * np.cos(rad)
        self._mean_v = u_orig * np.sin(rad)

    def _init_velocity_field(self):
        self.u[:, :, :] = self._mean_u[None, None, :]
        self.v[:, :, :] = self._mean_v[None, None, :]

        self._spectral_params = self._build_spectral_params()
        perturbation = self._evaluate_spectral(0.0)

        z3d = self.grid.cell_centers[2]
        z0 = self.meteo.get("roughness_length", 0.01)
        damping = np.where(z3d > z0, 1.0 - np.exp(-z3d / (5.0 * z0)), 0.0)

        self.u += perturbation[0] * damping
        self.v += perturbation[1] * damping
        self.w = perturbation[2] * damping

        u_ref = self.meteo.get("wind_speed", 5.0)
        max_allowed = max(2.0 * u_ref, 10.0)
        self._clip_velocity(max_allowed)
        self._sanitize_fields()

    def _build_spectral_params(self):
        nx, ny, nz = self.grid.nx, self.grid.ny, self.grid.nz
        n_modes = min(nx * ny * nz // 4, 200)

        kx = self._rng.uniform(0.02, 0.3, n_modes)
        ky = self._rng.uniform(0.02, 0.3, n_modes)
        kz = self._rng.uniform(0.05, 1.5, n_modes)
        wavenumbers = np.stack([kx, ky, kz], axis=1)

        phases = np.stack([
            self._rng.uniform(0, 2 * np.pi, n_modes),
            self._rng.uniform(0, 2 * np.pi, n_modes),
            self._rng.uniform(0, 2 * np.pi, n_modes),
        ], axis=1)

        k_mag = np.sqrt(np.sum(wavenumbers ** 2, axis=1))
        k_mag = np.maximum(k_mag, 1e-6)
        omega_adv = k_mag * self._u_star * 3.0

        u_star = self._u_star
        L = 100.0
        C = 3.2 * u_star ** 2 * L / (2 * np.pi)
        E_k = C / (1 + (1.5 * L * k_mag) ** 2) ** (5.0 / 6.0)
        dk = 0.01
        amplitudes = np.sqrt(2.0 * E_k * dk)

        scale = 0.02 * max(np.max(np.abs(self._mean_u)), 0.5)
        amplitudes *= scale / (np.max(amplitudes) + 1e-15)

        return {
            "n_modes": n_modes,
            "wavenumbers": wavenumbers,
            "phases": phases,
            "amplitudes": amplitudes,
            "omega_adv": omega_adv,
        }

    def _evaluate_spectral(self, t):
        sp = self._spectral_params
        x_c = self.grid.cell_centers[0]
        y_c = self.grid.cell_centers[1]
        z_c = self.grid.cell_centers[2]

        wm = sp["wavenumbers"]
        ph = sp["phases"]
        amp = sp["amplitudes"]
        omega = sp["omega_adv"]
        n = sp["n_modes"]

        base_args = wm[:, 0, None, None, None] * x_c[None] \
                   + wm[:, 1, None, None, None] * y_c[None] \
                   + wm[:, 2, None, None, None] * z_c[None]

        scale_factors = np.array([1.0, 0.7, 0.3])
        result = []
        for c in range(3):
            args = base_args + (ph[:, c] + omega * t)[:, None, None, None]
            cos_vals = np.cos(args)
            field = np.einsum("i,ijkl->jkl", amp, cos_vals)
            result.append(field)

        return result

    def _compute_adaptive_dt(self):
        np.abs(self.u, out=self._buf_speed)
        u_max = max(np.max(self._buf_speed), 1e-10)
        np.abs(self.v, out=self._buf_speed)
        v_max = max(np.max(self._buf_speed), 1e-10)
        np.abs(self.w, out=self._buf_speed)
        w_max = max(np.max(self._buf_speed), 1e-10)
        dt_adv = min(self._dx_min / u_max, self._dy_min / v_max, self._dz_min / w_max)
        nu_eff_max = self.nu + max(np.max(self.nu_sgs), self.nu_min_sgs)
        dt_diff = 0.2 * self._dx_min_dim ** 2 / max(nu_eff_max, 1e-15)
        return self.cfl * min(dt_adv, dt_diff)

    def _compute_gradient(self, f, dfdx, dfdy, dfdz):
        dfdx[1:-1, :, :] = (f[2:, :, :] - f[:-2, :, :]) * 0.5
        dfdx[0, :, :] = f[1, :, :] - f[0, :, :]
        dfdx[-1, :, :] = f[-1, :, :] - f[-2, :, :]
        dfdx /= self._dx

        dfdy[:, 1:-1, :] = (f[:, 2:, :] - f[:, :-2, :]) * 0.5
        dfdy[:, 0, :] = f[:, 1, :] - f[:, 0, :]
        dfdy[:, -1, :] = f[:, -1, :] - f[:, -2, :]
        dfdy /= self._dy

        dfdz[:, :, 1:-1] = (f[:, :, 2:] - f[:, :, :-2]) * 0.5
        dfdz[:, :, 0] = f[:, :, 1] - f[:, :, 0]
        dfdz[:, :, -1] = f[:, :, -1] - f[:, :, -2]
        dfdz /= self._dz

    def _compute_upwind_advection(self, vel, u, v, w, out):
        out[:] = 0.0

        bwd = self._buf_dfdx
        fwd = self._buf_dfdy

        bwd[1:, :, :] = (vel[1:, :, :] - vel[:-1, :, :]) / self._dx[1:, :, :]
        fwd[:-1, :, :] = (vel[1:, :, :] - vel[:-1, :, :]) / self._dx[:-1, :, :]
        bwd[0, :, :] = fwd[0, :, :]
        fwd[-1, :, :] = bwd[-1, :, :]
        np.maximum(u, 0.0, out=self._buf_dfdz)
        out += self._buf_dfdz * bwd
        np.minimum(u, 0.0, out=self._buf_dfdz)
        out += self._buf_dfdz * fwd

        bwd[:, 1:, :] = (vel[:, 1:, :] - vel[:, :-1, :]) / self._dy[:, 1:, :]
        fwd[:, :-1, :] = (vel[:, 1:, :] - vel[:, :-1, :]) / self._dy[:, :-1, :]
        bwd[:, 0, :] = fwd[:, 0, :]
        fwd[:, -1, :] = bwd[:, -1, :]
        np.maximum(v, 0.0, out=self._buf_dfdz)
        out += self._buf_dfdz * bwd
        np.minimum(v, 0.0, out=self._buf_dfdz)
        out += self._buf_dfdz * fwd

        bwd[:, :, 1:] = (vel[:, :, 1:] - vel[:, :, :-1]) / self._dz[:, :, 1:]
        fwd[:, :, :-1] = (vel[:, :, 1:] - vel[:, :, :-1]) / self._dz[:, :, :-1]
        bwd[:, :, 0] = fwd[:, :, 0]
        fwd[:, :, -1] = bwd[:, :, -1]
        np.maximum(w, 0.0, out=self._buf_dfdz)
        out += self._buf_dfdz * bwd
        np.minimum(w, 0.0, out=self._buf_dfdz)
        out += self._buf_dfdz * fwd

    def _compute_laplacian(self, f, out):
        out[:] = 0.0
        out[1:-1, :, :] += (
            (f[2:, :, :] - 2 * f[1:-1, :, :] + f[:-2, :, :])
            * self._idx2[1:-1, :, :]
        )
        out[:, 1:-1, :] += (
            (f[:, 2:, :] - 2 * f[:, 1:-1, :] + f[:, :-2, :])
            * self._idy2[:, 1:-1, :]
        )
        out[:, :, 1:-1] += (
            (f[:, :, 2:] - 2 * f[:, :, 1:-1] + f[:, :, :-2])
            * self._idz2[:, :, 1:-1]
        )

    def solve_step(self):
        dt_adaptive = self._compute_adaptive_dt()
        self.dt = min(dt_adaptive, self.dt)
        self.dt = max(self.dt, 1e-6)

        nu_eff = self.nu + self.nu_sgs

        self._compute_gradient(self.p, self._buf_dfdx, self._buf_dfdy, self._buf_dfdz)
        dp_dx = self._buf_dfdx
        dp_dy = self._buf_dfdy
        dp_dz = self._buf_dfdz

        self._compute_upwind_advection(self.u, self.u, self.v, self.w, self._buf_adv)
        self._compute_laplacian(self.u, self._buf_lap)
        self._buf_u_star[:] = self.u + self.dt * (-self._buf_adv + nu_eff * self._buf_lap - dp_dx / self.rho)

        self._compute_upwind_advection(self.v, self.u, self.v, self.w, self._buf_adv)
        self._compute_laplacian(self.v, self._buf_lap)
        self._buf_v_star[:] = self.v + self.dt * (-self._buf_adv + nu_eff * self._buf_lap - dp_dy / self.rho)

        self._compute_upwind_advection(self.w, self.u, self.v, self.w, self._buf_adv)
        self._compute_laplacian(self.w, self._buf_lap)
        self._buf_w_star[:] = self.w + self.dt * (-self._buf_adv + nu_eff * self._buf_lap - dp_dz / self.rho)

        self._compute_gradient(self._buf_u_star, self._buf_dfdx, self._buf_dfdy, self._buf_dfdz)
        self._buf_div[:] = self._buf_dfdx + self._buf_dfdy + self._buf_dfdz
        rhs = (self.rho / self.dt) * self._buf_div

        p_corr = self.p
        p_old = self._buf_p_old
        p_corr[:] = 0.0

        sl_i = slice(1, -1)
        sl_j = slice(1, -1)
        sl_k = slice(1, -1)

        for _ in range(150):
            p_old[:] = p_corr

            numer = (
                self._idx2[sl_i, :, :] * (p_corr[2:, sl_j, sl_k] + p_corr[:-2, sl_j, sl_k])
                + self._idy2[:, sl_j, :] * (p_corr[sl_i, 2:, sl_k] + p_corr[sl_i, :-2, sl_k])
                + self._idz2[:, :, sl_k] * (p_corr[sl_i, sl_j, 2:] + p_corr[sl_i, sl_j, :-2])
                - rhs[sl_i, sl_j, sl_k]
            ) / self._poisson_denom[sl_i, sl_j, sl_k]

            p_corr[sl_i, sl_j, sl_k] = self.omega * numer + (1.0 - self.omega) * p_old[sl_i, sl_j, sl_k]

            p_corr[0, :, :] = p_corr[1, :, :]
            p_corr[-1, :, :] = p_corr[-2, :, :]
            p_corr[:, 0, :] = p_corr[:, 1, :]
            p_corr[:, -1, :] = p_corr[:, -2, :]
            p_corr[:, :, 0] = p_corr[:, :, 1]
            p_corr[:, :, -1] = 0.0

            diff = p_corr - p_old
            residual = np.max(np.abs(diff))
            if residual < self.tol * 1e-2:
                break

        np.nan_to_num(p_corr, copy=False, nan=0.0, posinf=0.0, neginf=0.0)

        self._compute_gradient(p_corr, self._buf_dfdx, self._buf_dfdy, self._buf_dfdz)
        coeff = self.dt / self.rho
        self.u[:] = self._buf_u_star - coeff * self._buf_dfdx
        self.v[:] = self._buf_v_star - coeff * self._buf_dfdy
        self.w[:] = self._buf_w_star - coeff * self._buf_dfdz
        self.p += p_corr
        self.p[:] = 0.0

        self._apply_boundary_conditions()
        self._enforce_stability()

        self._compute_sgs_viscosity()
        self.tke = self._compute_tke_field()

        self.step += 1
        self.time += self.dt

        summary = self._compute_step_summary()
        self.history.append(summary)
        return summary

    def _compute_sgs_viscosity(self):
        self._compute_gradient(self.u, self._buf_dfdx, self._buf_dfdy, self._buf_dfdz)
        dudx = self._buf_dfdx.copy()
        dudy = self._buf_dfdy.copy()
        dudz = self._buf_dfdz.copy()

        self._compute_gradient(self.v, self._buf_dfdx, self._buf_dfdy, self._buf_dfdz)
        dvdx = self._buf_dfdx.copy()
        dvdy = self._buf_dfdy.copy()
        dvdz = self._buf_dfdz.copy()

        self._compute_gradient(self.w, self._buf_dfdx, self._buf_dfdy, self._buf_dfdz)
        dwdx = self._buf_dfdx
        dwdy = self._buf_dfdy
        dwdz = self._buf_dfdz

        s_mag_sq = (
            dudx ** 2 + dvdy ** 2 + dwdz ** 2
            + 0.5 * ((dudy + dvdx) ** 2 + (dudz + dwdx) ** 2 + (dvdz + dwdy) ** 2)
        )
        np.maximum(s_mag_sq, 0.0, out=s_mag_sq)
        np.sqrt(2.0 * s_mag_sq, out=s_mag_sq)
        np.nan_to_num(s_mag_sq, copy=False, nan=0.0, posinf=0.0, neginf=0.0)

        np.maximum(self._cs_delta_sq * s_mag_sq, self.nu_min_sgs, out=self.nu_sgs)
        np.clip(self.nu_sgs, self.nu_min_sgs, 50.0, out=self.nu_sgs)

    def _compute_tke_field(self):
        u_fluct = self.u - self._mean_u[None, None, :]
        v_fluct = self.v - self._mean_v[None, None, :]
        return 0.5 * (u_fluct ** 2 + v_fluct ** 2 + self.w ** 2)

    def _apply_boundary_conditions(self):
        self.u[0, :, :] = self.u[1, :, :]
        self.u[-1, :, :] = self.u[-2, :, :]
        self.v[:, 0, :] = self.v[:, 1, :]
        self.v[:, -1, :] = self.v[:, -2, :]
        self.w[:, :, 0] = 0.0
        self.w[:, :, -1] = 0.0
        self.u[:, :, 0] = 0.0
        self.v[:, :, 0] = 0.0
        self.p[:, :, -1] = 0.0
        self.p[0, :, :] = self.p[1, :, :]
        self.p[-1, :, :] = self.p[-2, :, :]
        self.p[:, 0, :] = self.p[:, 1, :]
        self.p[:, -1, :] = self.p[:, -2, :]

    def _clip_velocity(self, max_allowed):
        np.sqrt(self.u ** 2 + self.v ** 2 + self.w ** 2, out=self._buf_speed)
        mask = self._buf_speed > max_allowed
        if np.any(mask):
            scale = max_allowed / self._buf_speed[mask]
            self.u[mask] *= scale
            self.v[mask] *= scale
            self.w[mask] *= scale

    def _sanitize_fields(self):
        np.nan_to_num(self.u, copy=False, nan=0.0, posinf=0.0, neginf=0.0)
        np.nan_to_num(self.v, copy=False, nan=0.0, posinf=0.0, neginf=0.0)
        np.nan_to_num(self.w, copy=False, nan=0.0, posinf=0.0, neginf=0.0)
        np.nan_to_num(self.p, copy=False, nan=0.0, posinf=0.0, neginf=0.0)

    def _enforce_stability(self):
        u_ref = self.meteo.get("wind_speed", 5.0)
        max_allowed = max(3.0 * u_ref, 30.0)
        self._clip_velocity(max_allowed)
        self._sanitize_fields()

    def _compute_step_summary(self):
        np.sqrt(self.u ** 2 + self.v ** 2 + self.w ** 2, out=self._buf_speed)
        return {
            "step": self.step,
            "time": self.time,
            "dt": self.dt,
            "avg_wind_speed": float(np.mean(self._buf_speed)),
            "avg_tke": float(np.mean(self.tke)),
            "max_velocity": float(np.max(self._buf_speed)),
            "min_velocity": float(np.min(self._buf_speed)),
        }

    def solve(self, callback=None, monitor_interval=None):
        logger.info("Starting solver: method=%s, model=%s, t_end=%.2f",
                     self.method, self.turb_model, self.t_end)
        self.initialize()
        n_steps = max(1, int(self.t_end / self.dt))

        if monitor_interval is not None:
            self.monitor._report_interval = monitor_interval
        self.monitor.start(n_steps)

        if callback:
            self.monitor.add_callback(callback)

        log_interval = max(1, n_steps // 20)
        last_history_keep = max(1, n_steps // 100)
        history_sample_counter = 0

        for i in range(n_steps):
            summary = self.solve_step()

            self.monitor.update(self.step, self.time, self.dt, summary)

            if i % log_interval == 0:
                logger.info(
                    "Step %d/%d  t=%.4f  dt=%.6f  avg_speed=%.4f  avg_tke=%.6f  max_v=%.4f",
                    self.step, n_steps, self.time, self.dt,
                    summary["avg_wind_speed"], summary["avg_tke"],
                    summary["max_velocity"],
                )

            if self.step > 20:
                recent = [h["avg_wind_speed"] for h in self.history[-10:]]
                variation = (max(recent) - min(recent)) / (max(recent) + 1e-15)
                if variation < self.tol:
                    self.converged = True
                    logger.info("Converged at step %d (variation=%.2e)", self.step, variation)
                    break

            if np.any(np.isnan(self.u)) or np.any(np.isinf(self.u)):
                logger.warning("NaN/Inf detected at step %d, stopping", self.step)
                self._sanitize_fields()
                break

        logger.info("Solver finished: step=%d, time=%.4f, converged=%s",
                     self.step, self.time, self.converged)
        return self.get_result()

    def get_result(self):
        return {
            "u": self.u.copy(),
            "v": self.v.copy(),
            "w": self.w.copy(),
            "p": self.p.copy(),
            "tke": self.tke.copy(),
            "nu_sgs": self.nu_sgs.copy(),
            "grid": self.grid.to_dict(),
            "history": self.history,
            "metadata": {
                "method": self.method,
                "turbulence_model": self.turb_model,
                "total_steps": self.step,
                "final_time": self.time,
                "converged": self.converged,
                "dt_final": self.dt,
            },
        }

    def get_lightweight_result(self):
        speed = np.sqrt(self.u ** 2 + self.v ** 2 + self.w ** 2)
        return {
            "metadata": {
                "method": self.method,
                "turbulence_model": self.turb_model,
                "total_steps": self.step,
                "final_time": self.time,
                "converged": self.converged,
                "dt_final": self.dt,
                "nx": self.nx, "ny": self.ny, "nz": self.nz,
            },
            "summary": {
                "avg_wind_speed": float(np.mean(speed)),
                "avg_tke": float(np.mean(self.tke)),
                "max_velocity": float(np.max(speed)),
            },
            "history": self.history,
        }

    def save_result(self, filepath):
        result = self.get_result()
        os.makedirs(os.path.dirname(filepath) or ".", exist_ok=True)
        with open(filepath, "wb") as f:
            pickle.dump(result, f, protocol=pickle.HIGHEST_PROTOCOL)
        logger.info("Result saved to %s", filepath)

    def save_lightweight_result(self, filepath):
        result = self.get_lightweight_result()
        os.makedirs(os.path.dirname(filepath) or ".", exist_ok=True)
        with open(filepath, "wb") as f:
            pickle.dump(result, f, protocol=pickle.HIGHEST_PROTOCOL)
        logger.info("Lightweight result saved to %s", filepath)
