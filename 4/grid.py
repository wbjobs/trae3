import numpy as np
from numba import njit
from config import GridConfig


@njit(cache=True)
def _generate_uniform_x(nx, x_length):
    x = np.empty(nx, dtype=np.float64)
    dx = x_length / (nx - 1)
    for i in range(nx):
        x[i] = i * dx
    return x, dx


@njit(cache=True)
def _generate_stretched_y(ny, y_length, stretching_factor):
    y = np.empty(ny, dtype=np.float64)
    eta = np.linspace(0.0, 1.0, ny)
    s = stretching_factor
    for j in range(ny):
        y[j] = y_length * (np.exp(s * eta[j]) - 1.0) / (np.exp(s) - 1.0)
    return y


@njit(cache=True)
def _compute_dy(y):
    ny = y.shape[0]
    dy = np.empty(ny - 1, dtype=np.float64)
    for j in range(ny - 1):
        dy[j] = y[j + 1] - y[j]
    return dy


@njit(cache=True)
def _build_2d_grid(x, y):
    nx = x.shape[0]
    ny = y.shape[0]
    X = np.empty((ny, nx), dtype=np.float64)
    Y = np.empty((ny, nx), dtype=np.float64)
    for j in range(ny):
        for i in range(nx):
            X[j, i] = x[i]
            Y[j, i] = y[j]
    return X, Y


@njit(cache=True)
def _compute_cell_metrics(X, Y):
    ny, nx = X.shape
    dxdx = np.empty((ny, nx), dtype=np.float64)
    dydy = np.empty((ny, nx), dtype=np.float64)
    dx = np.empty(nx - 1, dtype=np.float64)
    dy = np.empty(ny - 1, dtype=np.float64)
    for i in range(nx - 1):
        dx[i] = X[0, i + 1] - X[0, i]
    for j in range(ny - 1):
        dy[j] = Y[j + 1, 0] - Y[j, 0]
    return dx, dy


class BoundaryLayerGrid:
    def __init__(self, grid_config: GridConfig):
        self.cfg = grid_config
        self.x = None
        self.y = None
        self.X = None
        self.Y = None
        self.dx = None
        self.dy = None
        self._generate()

    def _generate(self):
        self.x, dx_uniform = _generate_uniform_x(self.cfg.nx, self.cfg.x_length)
        self.y = _generate_stretched_y(
            self.cfg.ny, self.cfg.y_length, self.cfg.stretching_factor
        )
        self.dy = _compute_dy(self.y)
        self.X, self.Y = _build_2d_grid(self.x, self.y)
        self.dx_arr, self.dy_arr = _compute_cell_metrics(self.X, self.Y)
        self.dx_scalar = self.cfg.x_length / (self.cfg.nx - 1)

    @property
    def shape(self):
        return (self.cfg.ny, self.cfg.nx)

    @property
    def nx(self):
        return self.cfg.nx

    @property
    def ny(self):
        return self.cfg.ny

    def get_x_1d(self) -> np.ndarray:
        return self.x.copy()

    def get_y_1d(self) -> np.ndarray:
        return self.y.copy()

    def get_2d_coordinates(self):
        return self.X.copy(), self.Y.copy()

    def info(self) -> dict:
        return {
            "nx": self.cfg.nx,
            "ny": self.cfg.ny,
            "x_range": (float(self.x[0]), float(self.x[-1])),
            "y_range": (float(self.y[0]), float(self.y[-1])),
            "dx_min": float(self.dx_scalar),
            "dy_min": float(np.min(self.dy)),
            "dy_max": float(np.max(self.dy)),
            "stretching_factor": self.cfg.stretching_factor,
        }
