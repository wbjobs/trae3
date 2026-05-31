import sys
import time
import numpy as np
from numba import njit, prange, set_num_threads
from config import SimulationConfig
from grid import BoundaryLayerGrid


@njit(cache=True)
def _thomas_solve_inplace(a, b, c, d, cp, dp, x, n):
    cp[0] = c[0] / b[0]
    dp[0] = d[0] / b[0]
    for i in range(1, n):
        denom = b[i] - a[i] * cp[i - 1]
        cp[i] = c[i] / denom
        dp[i] = (d[i] - a[i] * dp[i - 1]) / denom
    x[n - 1] = dp[n - 1]
    for i in range(n - 2, -1, -1):
        x[i] = dp[i] - cp[i] * x[i + 1]


@njit(cache=True)
def _solve_station_core(u_up, v_cur, dy_arr, dx, nu, u_inf, ny,
                         a_tri, b_tri, c_tri, d_tri, cp_buf, dp_buf, x_buf):
    n_int = ny - 2

    for idx in range(n_int):
        j = idx + 1
        dy_m = dy_arr[j - 1]
        dy_p = dy_arr[j] if j < ny - 1 else dy_arr[j - 1]
        dy_sum = dy_m + dy_p
        u_j = u_up[j]
        v_j = v_cur[j]

        D_m = 2.0 * nu / (dy_m * dy_sum)
        D_p = 2.0 * nu / (dy_p * dy_sum)
        D_j = D_m + D_p
        conv = u_j / dx

        aj = -D_m
        bj = D_j + conv
        cj = -D_p

        if v_j > 1e-30:
            aj -= v_j / dy_m
            bj += v_j / dy_m
        elif v_j < -1e-30:
            bj -= v_j / dy_p
            cj += v_j / dy_p

        a_tri[idx] = aj
        b_tri[idx] = bj
        c_tri[idx] = cj
        d_tri[idx] = u_j * u_j / dx

    d_tri[0] -= a_tri[0] * 0.0
    d_tri[n_int - 1] -= c_tri[n_int - 1] * u_inf

    _thomas_solve_inplace(a_tri, b_tri, c_tri, d_tri, cp_buf, dp_buf, x_buf, n_int)
    return x_buf


@njit(cache=True)
def _integrate_v(u_cur, u_up, dy_arr, dx, ny, v_out):
    v_out[0] = 0.0
    for j in range(1, ny - 1):
        dudx_j = (u_cur[j] - u_up[j]) / dx
        dudx_jm = (u_cur[j - 1] - u_up[j - 1]) / dx
        v_out[j] = v_out[j - 1] - 0.5 * (dudx_j + dudx_jm) * dy_arr[j - 1]
    v_out[ny - 1] = v_out[ny - 2]


@njit(cache=True)
def _march_station_nonlinear(u_up, v_up, dy_arr, dx, nu, u_inf, omega, ny,
                              max_inner, inner_tol,
                              a_tri, b_tri, c_tri, d_tri,
                              cp_buf, dp_buf, x_buf,
                              u_cur, v_cur, u_new, v_new):
    for j in range(ny):
        u_cur[j] = u_up[j]
        v_cur[j] = v_up[j]

    for _inner in range(max_inner):
        x_buf = _solve_station_core(
            u_up, v_cur, dy_arr, dx, nu, u_inf, ny,
            a_tri, b_tri, c_tri, d_tri, cp_buf, dp_buf, x_buf
        )
        n_int = ny - 2
        for idx in range(n_int):
            j = idx + 1
            u_new[j] = u_cur[j] + omega * (x_buf[idx] - u_cur[j])
        u_new[0] = 0.0
        u_new[ny - 1] = u_inf

        _integrate_v(u_new, u_up, dy_arr, dx, ny, v_new)

        max_change = 0.0
        for j in range(ny):
            change = abs(u_new[j] - u_cur[j])
            if change > max_change:
                max_change = change
            u_cur[j] = u_new[j]
            v_cur[j] = v_new[j]

        if max_change < inner_tol:
            break

    return u_cur, v_cur


@njit(cache=True)
def _solve_boundary_layer_parabolic(u, v, dy_arr, dx, nu, u_inf, nx, ny,
                                     omega, max_inner, inner_tol):
    residual_history = np.empty(nx, dtype=np.float64)
    residual_history[0] = 0.0

    n_int = ny - 2
    a_tri = np.empty(n_int, dtype=np.float64)
    b_tri = np.empty(n_int, dtype=np.float64)
    c_tri = np.empty(n_int, dtype=np.float64)
    d_tri = np.empty(n_int, dtype=np.float64)
    cp_buf = np.empty(n_int, dtype=np.float64)
    dp_buf = np.empty(n_int, dtype=np.float64)
    x_buf = np.empty(n_int, dtype=np.float64)

    u_up = np.empty(ny, dtype=np.float64)
    v_up = np.empty(ny, dtype=np.float64)
    u_cur = np.empty(ny, dtype=np.float64)
    v_cur = np.empty(ny, dtype=np.float64)
    u_new = np.empty(ny, dtype=np.float64)
    v_new = np.empty(ny, dtype=np.float64)

    for i in range(1, nx):
        for j in range(ny):
            u_up[j] = u[j, i - 1]
            v_up[j] = v[j, i - 1]

        u_result, v_result = _march_station_nonlinear(
            u_up, v_up, dy_arr, dx, nu, u_inf, omega, ny,
            max_inner, inner_tol,
            a_tri, b_tri, c_tri, d_tri,
            cp_buf, dp_buf, x_buf,
            u_cur, v_cur, u_new, v_new
        )

        max_change = 0.0
        for j in range(ny):
            change = abs(u_result[j] - u[j, i])
            if change > max_change:
                max_change = change
            u[j, i] = u_result[j]
            v[j, i] = v_result[j]
        residual_history[i] = max_change

    return u, v, residual_history


@njit(cache=True, parallel=True)
def _postprocess_all(u, y, dy_arr, nu, u_inf, nx, ny):
    cf = np.empty(nx, dtype=np.float64)
    delta_star = np.empty(nx, dtype=np.float64)
    theta_arr = np.empty(nx, dtype=np.float64)
    dy0 = dy_arr[0]

    for i in prange(nx):
        dudy = (-3.0 * u[0, i] + 4.0 * u[1, i] - u[2, i]) / (2.0 * dy0)
        cf[i] = 2.0 * nu * dudy / (u_inf * u_inf)

        ds = 0.0
        th = 0.0
        for j in range(ny - 1):
            dy = y[j + 1] - y[j]
            r_m = u[j, i] / u_inf
            r_p = u[j + 1, i] / u_inf
            ds += 0.5 * ((1.0 - r_m) + (1.0 - r_p)) * dy
            th += 0.5 * (r_m * (1.0 - r_m) + r_p * (1.0 - r_p)) * dy
        delta_star[i] = ds
        theta_arr[i] = th

    wall_shear = cf * u_inf * u_inf / (2.0 * nu)
    return wall_shear, cf, delta_star, theta_arr


class ProgressReporter:
    def __init__(self, total: int, prefix: str = "", report_interval: int = 10):
        self.total = total
        self.prefix = prefix
        self.report_interval = max(1, report_interval)
        self.current = 0
        self.t_start = time.time()

    def update(self, step: int):
        self.current = step
        if step % self.report_interval == 0 or step == self.total:
            elapsed = time.time() - self.t_start
            pct = step / self.total * 100.0
            if step > 0:
                rate = step / elapsed
                eta = (self.total - step) / rate
            else:
                eta = 0.0
            bar_len = 30
            filled = int(bar_len * step / self.total)
            bar = "█" * filled + "░" * (bar_len - filled)
            msg = f"\r  {self.prefix}[{bar}] {pct:5.1f}% ({step}/{self.total}) {rate:.0f} stn/s ETA {eta:.1f}s"
            sys.stdout.write(msg)
            sys.stdout.flush()
            if step == self.total:
                sys.stdout.write("\n")

    def finish(self):
        if self.current < self.total:
            self.update(self.total)


class BoundaryLayerSolver:
    def __init__(self, grid: BoundaryLayerGrid, config: SimulationConfig):
        self.grid = grid
        self.config = config
        self.ny = grid.ny
        self.nx = grid.nx
        self.u = np.zeros((self.ny, self.nx), dtype=np.float64)
        self.v = np.zeros((self.ny, self.nx), dtype=np.float64)
        self.residual_history = np.array([], dtype=np.float64)
        self.iterations = 0
        self._initialized = False
        self._progress = None
        num_threads = max(1, config.parallel.num_workers)
        set_num_threads(num_threads)

    def initialize(self):
        nu = self.config.flow.nu
        u_inf = self.config.flow.u_inf
        x = self.grid.get_x_1d()
        y = self.grid.get_y_1d()

        for i in range(self.nx):
            if x[i] < 1e-30:
                self.u[0, i] = 0.0
                self.u[1:, i] = u_inf
                continue
            Re_x = u_inf * x[i] / nu
            delta = 5.0 * x[i] / np.sqrt(Re_x)
            for j in range(self.ny):
                if y[j] <= delta:
                    eta = y[j] / delta
                    self.u[j, i] = u_inf * (2.0 * eta - 2.0 * eta ** 3 + eta ** 4)
                else:
                    self.u[j, i] = u_inf
            self.u[0, i] = 0.0
            self.u[self.ny - 1, i] = u_inf

        for i in range(1, self.nx):
            self.v[:, i] = 0.0
            for j in range(1, self.ny):
                dudx = (self.u[j, i] - self.u[j, i - 1]) / (x[i] - x[i - 1] + 1e-30)
                self.v[j, i] = self.v[j - 1, i] - dudx * self.grid.dy[j - 1]
        self._initialized = True

    def solve(self, use_parallel: bool = False, progress: bool = True) -> dict:
        if not self._initialized:
            self.initialize()

        nu = self.config.flow.nu
        u_inf = self.config.flow.u_inf
        dy_arr = self.grid.dy.copy()
        dx = self.grid.dx_scalar
        omega = self.config.solver.relaxation_factor
        max_inner = 10
        inner_tol = self.config.solver.convergence_tolerance * 0.1

        if progress:
            self._progress = ProgressReporter(
                self.nx - 1, prefix="Marching ", report_interval=max(1, (self.nx - 1) // 20)
            )

        self.u, self.v, self.residual_history = _solve_boundary_layer_parabolic(
            self.u, self.v, dy_arr, dx, nu, u_inf,
            self.nx, self.ny, omega, max_inner, inner_tol
        )
        self.iterations = self.nx - 1

        if self._progress:
            self._progress.finish()

        return self._compute_results(use_parallel=use_parallel)

    def _compute_results(self, use_parallel: bool = False) -> dict:
        y = self.grid.get_y_1d()
        dy_arr = self.grid.dy
        nu = self.config.flow.nu
        u_inf = self.config.flow.u_inf

        if use_parallel and self.nx > 50:
            wall_shear, cf, delta_star, theta = _postprocess_all(
                self.u, y, dy_arr, nu, u_inf, self.nx, self.ny
            )
        else:
            wall_shear, cf, delta_star, theta = _postprocess_all(
                self.u, y, dy_arr, nu, u_inf, self.nx, self.ny
            )

        return {
            "u": self.u.astype(np.float32),
            "v": self.v.astype(np.float32),
            "x": self.grid.get_x_1d().astype(np.float32),
            "y": self.grid.get_y_1d().astype(np.float32),
            "wall_shear": wall_shear,
            "skin_friction": cf,
            "displacement_thickness": delta_star,
            "momentum_thickness": theta,
            "residual_history": self.residual_history.copy(),
            "iterations": self.iterations,
        }


def warmup_jit():
    _tiny_u = np.zeros(5, dtype=np.float64)
    _tiny_v = np.zeros(5, dtype=np.float64)
    _tiny_dy = np.ones(4, dtype=np.float64)
    _u_2d = np.zeros((5, 3), dtype=np.float64)
    _v_2d = np.zeros((5, 3), dtype=np.float64)
    _res = np.empty(3, dtype=np.float64)

    _thomas_solve_inplace(
        np.zeros(3, dtype=np.float64), np.ones(3, dtype=np.float64),
        np.zeros(3, dtype=np.float64), np.ones(3, dtype=np.float64),
        np.empty(3, dtype=np.float64), np.empty(3, dtype=np.float64),
        np.empty(3, dtype=np.float64), 3
    )
    _solve_boundary_layer_parabolic(
        _u_2d, _v_2d, _tiny_dy, 0.01, 1e-5, 1.0, 3, 5, 1.2, 5, 1e-7
    )
    _postprocess_all(_u_2d, _tiny_u, _tiny_dy, 1e-5, 1.0, 3, 5)
