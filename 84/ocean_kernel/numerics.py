from typing import Optional, Tuple, Union, Callable, List
import numpy as np
from common.models import GridConfig, BoundaryCondition
from common.exceptions import (
    NumericalError,
    BoundaryConditionError,
    DimensionMismatchError,
    ConvergenceError,
)


def central_difference(
    field: np.ndarray,
    dx: float,
    axis: int = 0,
    order: int = 1,
) -> np.ndarray:
    if order not in (1, 2):
        raise NumericalError("central_difference", f"Unsupported order: {order}. Use 1 or 2.")
    
    if axis < 0 or axis >= field.ndim:
        raise NumericalError("central_difference", f"Invalid axis {axis} for {field.ndim}-dimensional field")
    
    if field.shape[axis] < 3:
        raise NumericalError("central_difference", f"Field size along axis {axis} must be at least 3")
    
    if order == 1:
        slices = [slice(None)] * field.ndim
        slices_plus = slices.copy()
        slices_minus = slices.copy()
        slices_plus[axis] = slice(2, None)
        slices_minus[axis] = slice(None, -2)
        result = np.zeros_like(field)
        interior = [slice(None)] * field.ndim
        interior[axis] = slice(1, -1)
        result[tuple(interior)] = (field[tuple(slices_plus)] - field[tuple(slices_minus)]) / (2 * dx)
        return result
    else:
        slices = [slice(None)] * field.ndim
        slices_plus = slices.copy()
        slices_minus = slices.copy()
        slices_center = slices.copy()
        slices_plus[axis] = slice(2, None)
        slices_minus[axis] = slice(None, -2)
        slices_center[axis] = slice(1, -1)
        result = np.zeros_like(field)
        interior = [slice(None)] * field.ndim
        interior[axis] = slice(1, -1)
        result[tuple(interior)] = (field[tuple(slices_plus)] - 2 * field[tuple(slices_center)] + field[tuple(slices_minus)]) / (dx * dx)
        return result


def upwind_difference(
    field: np.ndarray,
    velocity: np.ndarray,
    dx: float,
    axis: int = 0,
) -> np.ndarray:
    if axis < 0 or axis >= field.ndim:
        raise NumericalError("upwind_difference", f"Invalid axis {axis} for {field.ndim}-dimensional field")
    
    if field.shape != velocity.shape:
        raise DimensionMismatchError(field.shape, velocity.shape, "upwind_difference")
    
    if field.shape[axis] < 3:
        raise NumericalError("upwind_difference", f"Field size along axis {axis} must be at least 3")
    
    result = np.zeros_like(field)
    
    interior = [slice(None)] * field.ndim
    interior[axis] = slice(1, -1)
    
    forward_minus = [slice(None)] * field.ndim
    forward_minus[axis] = slice(1, -1)
    forward_plus = [slice(None)] * field.ndim
    forward_plus[axis] = slice(2, None)
    
    backward_minus = [slice(None)] * field.ndim
    backward_minus[axis] = slice(None, -2)
    backward_plus = [slice(None)] * field.ndim
    backward_plus[axis] = slice(1, -1)
    
    field_forward = np.zeros_like(field)
    field_backward = np.zeros_like(field)
    field_forward[tuple(interior)] = (field[tuple(forward_plus)] - field[tuple(forward_minus)]) / dx
    field_backward[tuple(interior)] = (field[tuple(backward_plus)] - field[tuple(backward_minus)]) / dx
    
    result = np.where(velocity > 0, field_backward, field_forward)
    return result


def jacobi_iteration(
    coefficient_matrix: np.ndarray,
    rhs: np.ndarray,
    initial_guess: Optional[np.ndarray] = None,
    max_iterations: int = 10000,
    tolerance: float = 1e-6,
) -> Tuple[np.ndarray, dict]:
    if coefficient_matrix.ndim != 2:
        raise NumericalError("jacobi_iteration", "Coefficient matrix must be 2-dimensional")
    
    if coefficient_matrix.shape[0] != coefficient_matrix.shape[1]:
        raise NumericalError("jacobi_iteration", "Coefficient matrix must be square")
    
    n = coefficient_matrix.shape[0]
    if rhs.shape[0] != n:
        raise DimensionMismatchError((n,), rhs.shape, "jacobi_iteration RHS")
    
    if initial_guess is None:
        x = np.zeros(n, dtype=np.float64)
    else:
        if initial_guess.shape[0] != n:
            raise DimensionMismatchError((n,), initial_guess.shape, "jacobi_iteration initial guess")
        x = initial_guess.astype(np.float64).copy()
    
    D = np.diag(np.diag(coefficient_matrix))
    L_plus_U = coefficient_matrix - D
    D_inv = np.diag(1.0 / np.diag(D))
    
    convergence_history = {
        "iterations": 0,
        "residuals": [],
        "converged": False,
    }
    
    for iteration in range(max_iterations):
        x_new = D_inv @ (rhs - L_plus_U @ x)
        residual = np.linalg.norm(x_new - x)
        convergence_history["residuals"].append(residual)
        convergence_history["iterations"] = iteration + 1
        
        if residual < tolerance:
            convergence_history["converged"] = True
            return x_new, convergence_history
        
        x = x_new
    
    raise ConvergenceError(max_iterations, tolerance, "jacobi_iteration")


def gauss_seidel_iteration(
    coefficient_matrix: np.ndarray,
    rhs: np.ndarray,
    initial_guess: Optional[np.ndarray] = None,
    max_iterations: int = 10000,
    tolerance: float = 1e-6,
) -> Tuple[np.ndarray, dict]:
    if coefficient_matrix.ndim != 2:
        raise NumericalError("gauss_seidel_iteration", "Coefficient matrix must be 2-dimensional")
    
    if coefficient_matrix.shape[0] != coefficient_matrix.shape[1]:
        raise NumericalError("gauss_seidel_iteration", "Coefficient matrix must be square")
    
    n = coefficient_matrix.shape[0]
    if rhs.shape[0] != n:
        raise DimensionMismatchError((n,), rhs.shape, "gauss_seidel_iteration RHS")
    
    if initial_guess is None:
        x = np.zeros(n, dtype=np.float64)
    else:
        if initial_guess.shape[0] != n:
            raise DimensionMismatchError((n,), initial_guess.shape, "gauss_seidel_iteration initial guess")
        x = initial_guess.astype(np.float64).copy()
    
    D = np.diag(np.diag(coefficient_matrix))
    L = np.tril(coefficient_matrix, -1)
    U = np.triu(coefficient_matrix, 1)
    D_plus_L = D + L
    D_plus_L_inv = np.linalg.inv(D_plus_L)
    
    convergence_history = {
        "iterations": 0,
        "residuals": [],
        "converged": False,
    }
    
    for iteration in range(max_iterations):
        x_new = D_plus_L_inv @ (rhs - U @ x)
        residual = np.linalg.norm(x_new - x)
        convergence_history["residuals"].append(residual)
        convergence_history["iterations"] = iteration + 1
        
        if residual < tolerance:
            convergence_history["converged"] = True
            return x_new, convergence_history
        
        x = x_new
    
    raise ConvergenceError(max_iterations, tolerance, "gauss_seidel_iteration")


class FiniteDifference:
    def __init__(self, grid: GridConfig):
        self.grid = grid
        self._dx = grid.dx
        self._dy = grid.dy
        self._dz = grid.dz
        self._is_3d = grid.is_3d
    
    def gradient(self, field: np.ndarray, axis: int) -> np.ndarray:
        if field.shape != self.grid.shape:
            raise DimensionMismatchError(self.grid.shape, field.shape, "FiniteDifference.gradient")
        
        if self._is_3d:
            if axis == 0:
                return central_difference(field, self._dz, axis=0)
            elif axis == 1:
                return central_difference(field, self._dy, axis=1)
            elif axis == 2:
                return central_difference(field, self._dx, axis=2)
            else:
                raise NumericalError("FiniteDifference.gradient", f"Invalid axis {axis} for 3D grid")
        else:
            if axis == 0:
                return central_difference(field, self._dy, axis=0)
            elif axis == 1:
                return central_difference(field, self._dx, axis=1)
            else:
                raise NumericalError("FiniteDifference.gradient", f"Invalid axis {axis} for 2D grid")
    
    def laplacian(self, field: np.ndarray) -> np.ndarray:
        if field.shape != self.grid.shape:
            raise DimensionMismatchError(self.grid.shape, field.shape, "FiniteDifference.laplacian")
        
        result = np.zeros_like(field)
        if self._is_3d:
            result += central_difference(field, self._dz, axis=0, order=2)
            result += central_difference(field, self._dy, axis=1, order=2)
            result += central_difference(field, self._dx, axis=2, order=2)
        else:
            result += central_difference(field, self._dy, axis=0, order=2)
            result += central_difference(field, self._dx, axis=1, order=2)
        return result
    
    def divergence(self, u: np.ndarray, v: np.ndarray, w: Optional[np.ndarray] = None) -> np.ndarray:
        if u.shape != self.grid.shape or v.shape != self.grid.shape:
            raise DimensionMismatchError(self.grid.shape, u.shape, "FiniteDifference.divergence")
        
        result = self.gradient(v, axis=0) + self.gradient(u, axis=1)
        if self._is_3d and w is not None:
            if w.shape != self.grid.shape:
                raise DimensionMismatchError(self.grid.shape, w.shape, "FiniteDifference.divergence w component")
            result += self.gradient(w, axis=0)
        return result
    
    def advection(self, field: np.ndarray, u: np.ndarray, v: np.ndarray, w: Optional[np.ndarray] = None) -> np.ndarray:
        if field.shape != self.grid.shape or u.shape != self.grid.shape or v.shape != self.grid.shape:
            raise DimensionMismatchError(self.grid.shape, field.shape, "FiniteDifference.advection")
        
        result = np.zeros_like(field)
        
        if self._is_3d:
            if w is None:
                raise NumericalError("FiniteDifference.advection", "w component is required for 3D advection")
            if w.shape != self.grid.shape:
                raise DimensionMismatchError(self.grid.shape, w.shape, "FiniteDifference.advection w component")
            
            result += w * upwind_difference(field, w, self._dz, axis=0)
            result += v * upwind_difference(field, v, self._dy, axis=1)
            result += u * upwind_difference(field, u, self._dx, axis=2)
        else:
            result += v * upwind_difference(field, v, self._dy, axis=0)
            result += u * upwind_difference(field, u, self._dx, axis=1)
        
        return result


class IterativeSolver:
    def __init__(
        self,
        method: str = "jacobi",
        max_iterations: int = 10000,
        tolerance: float = 1e-6,
    ):
        valid_methods = ["jacobi", "gauss_seidel"]
        if method not in valid_methods:
            raise NumericalError("IterativeSolver", f"Invalid method '{method}'. Use one of {valid_methods}")
        
        self._method = method
        self._max_iterations = max_iterations
        self._tolerance = tolerance
        self._solver_func: Callable = {
            "jacobi": jacobi_iteration,
            "gauss_seidel": gauss_seidel_iteration,
        }[method]
    
    def solve(
        self,
        coefficient_matrix: np.ndarray,
        rhs: np.ndarray,
        initial_guess: Optional[np.ndarray] = None,
    ) -> Tuple[np.ndarray, dict]:
        return self._solver_func(
            coefficient_matrix,
            rhs,
            initial_guess=initial_guess,
            max_iterations=self._max_iterations,
            tolerance=self._tolerance,
        )
    
    def solve_poisson(
        self,
        rhs: np.ndarray,
        grid: GridConfig,
        boundary_conditions: List[BoundaryCondition],
        initial_guess: Optional[np.ndarray] = None,
    ) -> Tuple[np.ndarray, dict]:
        if rhs.shape != grid.shape:
            raise DimensionMismatchError(grid.shape, rhs.shape, "IterativeSolver.solve_poisson")
        
        handler = BoundaryHandler(grid)
        n = np.prod(grid.shape)
        A = np.zeros((n, n), dtype=np.float64)
        b = rhs.flatten().astype(np.float64)
        
        if initial_guess is None:
            x0 = np.zeros(n, dtype=np.float64)
        else:
            if initial_guess.shape != grid.shape:
                raise DimensionMismatchError(grid.shape, initial_guess.shape, "IterativeSolver.solve_poisson initial guess")
            x0 = initial_guess.flatten().astype(np.float64)
        
        idx = 0
        if grid.is_3d:
            for k in range(grid.nz):
                for j in range(grid.ny):
                    for i in range(grid.nx):
                        is_boundary = handler.is_boundary_point_3d(i, j, k)
                        if is_boundary:
                            bc = handler.get_boundary_condition_3d(i, j, k, boundary_conditions)
                            if bc.type == "dirichlet":
                                A[idx, idx] = 1.0
                                b[idx] = bc.value if isinstance(bc.value, (int, float)) else bc.value[k, j, i]
                            elif bc.type == "neumann":
                                A[idx, idx] = 1.0
                                b[idx] = x0[idx]
                        else:
                            A[idx, idx] = -2.0 / (grid.dx**2) - 2.0 / (grid.dy**2) - 2.0 / (grid.dz**2)
                            A[idx, idx + 1] = 1.0 / (grid.dx**2)
                            A[idx, idx - 1] = 1.0 / (grid.dx**2)
                            A[idx, idx + grid.nx] = 1.0 / (grid.dy**2)
                            A[idx, idx - grid.nx] = 1.0 / (grid.dy**2)
                            A[idx, idx + grid.nx * grid.ny] = 1.0 / (grid.dz**2)
                            A[idx, idx - grid.nx * grid.ny] = 1.0 / (grid.dz**2)
                        idx += 1
        else:
            for j in range(grid.ny):
                for i in range(grid.nx):
                    is_boundary = handler.is_boundary_point_2d(i, j)
                    if is_boundary:
                        bc = handler.get_boundary_condition_2d(i, j, boundary_conditions)
                        if bc.type == "dirichlet":
                            A[idx, idx] = 1.0
                            b[idx] = bc.value if isinstance(bc.value, (int, float)) else bc.value[j, i]
                        elif bc.type == "neumann":
                            A[idx, idx] = 1.0
                            b[idx] = x0[idx]
                    else:
                        A[idx, idx] = -2.0 / (grid.dx**2) - 2.0 / (grid.dy**2)
                        A[idx, idx + 1] = 1.0 / (grid.dx**2)
                        A[idx, idx - 1] = 1.0 / (grid.dx**2)
                        A[idx, idx + grid.nx] = 1.0 / (grid.dy**2)
                        A[idx, idx - grid.nx] = 1.0 / (grid.dy**2)
                    idx += 1
        
        solution, convergence = self.solve(A, b, x0)
        return solution.reshape(grid.shape), convergence


class BoundaryHandler:
    def __init__(self, grid: GridConfig):
        self._grid = grid
        self._valid_boundaries = ["left", "right", "bottom", "top", "front", "back"]
        self._valid_types = ["dirichlet", "neumann"]
    
    def is_boundary_point_2d(self, i: int, j: int) -> bool:
        return i == 0 or i == self._grid.nx - 1 or j == 0 or j == self._grid.ny - 1
    
    def is_boundary_point_3d(self, i: int, j: int, k: int) -> bool:
        return (i == 0 or i == self._grid.nx - 1 or 
                j == 0 or j == self._grid.ny - 1 or 
                k == 0 or k == self._grid.nz - 1)
    
    def get_boundary_point_location_2d(self, i: int, j: int) -> str:
        if i == 0:
            return "left"
        elif i == self._grid.nx - 1:
            return "right"
        elif j == 0:
            return "bottom"
        elif j == self._grid.ny - 1:
            return "top"
        else:
            raise BoundaryConditionError("interior", "Point is not on boundary")
    
    def get_boundary_point_location_3d(self, i: int, j: int, k: int) -> str:
        if i == 0:
            return "left"
        elif i == self._grid.nx - 1:
            return "right"
        elif j == 0:
            return "bottom"
        elif j == self._grid.ny - 1:
            return "top"
        elif k == 0:
            return "front"
        elif k == self._grid.nz - 1:
            return "back"
        else:
            raise BoundaryConditionError("interior", "Point is not on boundary")
    
    def get_boundary_condition_2d(
        self,
        i: int,
        j: int,
        boundary_conditions: List[BoundaryCondition],
    ) -> BoundaryCondition:
        location = self.get_boundary_point_location_2d(i, j)
        for bc in boundary_conditions:
            if bc.boundary == location:
                return bc
        raise BoundaryConditionError(location, f"No boundary condition specified for {location}")
    
    def get_boundary_condition_3d(
        self,
        i: int,
        j: int,
        k: int,
        boundary_conditions: List[BoundaryCondition],
    ) -> BoundaryCondition:
        location = self.get_boundary_point_location_3d(i, j, k)
        for bc in boundary_conditions:
            if bc.boundary == location:
                return bc
        raise BoundaryConditionError(location, f"No boundary condition specified for {location}")
    
    def apply_boundary_conditions(
        self,
        field: np.ndarray,
        boundary_conditions: List[BoundaryCondition],
    ) -> np.ndarray:
        if field.shape != self._grid.shape:
            raise DimensionMismatchError(self._grid.shape, field.shape, "BoundaryHandler.apply_boundary_conditions")
        
        result = field.copy()
        
        for bc in boundary_conditions:
            if bc.boundary not in self._valid_boundaries:
                raise BoundaryConditionError(bc.boundary, f"Invalid boundary. Use one of {self._valid_boundaries}")
            
            if bc.type not in self._valid_types:
                raise BoundaryConditionError(bc.type, f"Invalid type. Use one of {self._valid_types}")
            
            value = bc.value
            if isinstance(value, (int, float)):
                value_array = np.full_like(result, value)
            elif isinstance(value, np.ndarray):
                if value.shape != self._grid.shape:
                    raise DimensionMismatchError(self._grid.shape, value.shape, f"Boundary condition {bc.boundary}")
                value_array = value
            else:
                raise BoundaryConditionError(bc.type, f"Invalid value type: {type(value)}")
            
            if bc.type == "dirichlet":
                result = self._apply_dirichlet_2d(result, value_array, bc.boundary) if not self._grid.is_3d else \
                         self._apply_dirichlet_3d(result, value_array, bc.boundary)
            elif bc.type == "neumann":
                result = self._apply_neumann_2d(result, value_array, bc.boundary) if not self._grid.is_3d else \
                         self._apply_neumann_3d(result, value_array, bc.boundary)
        
        return result
    
    def _apply_dirichlet_2d(self, field: np.ndarray, value: np.ndarray, boundary: str) -> np.ndarray:
        result = field.copy()
        if boundary == "left":
            result[:, 0] = value[:, 0]
        elif boundary == "right":
            result[:, -1] = value[:, -1]
        elif boundary == "bottom":
            result[0, :] = value[0, :]
        elif boundary == "top":
            result[-1, :] = value[-1, :]
        return result
    
    def _apply_dirichlet_3d(self, field: np.ndarray, value: np.ndarray, boundary: str) -> np.ndarray:
        result = field.copy()
        if boundary == "left":
            result[:, :, 0] = value[:, :, 0]
        elif boundary == "right":
            result[:, :, -1] = value[:, :, -1]
        elif boundary == "bottom":
            result[:, 0, :] = value[:, 0, :]
        elif boundary == "top":
            result[:, -1, :] = value[:, -1, :]
        elif boundary == "front":
            result[0, :, :] = value[0, :, :]
        elif boundary == "back":
            result[-1, :, :] = value[-1, :, :]
        return result
    
    def _apply_neumann_2d(self, field: np.ndarray, gradient: np.ndarray, boundary: str) -> np.ndarray:
        result = field.copy()
        dx, dy = self._grid.dx, self._grid.dy
        if boundary == "left":
            result[:, 0] = result[:, 1] - gradient[:, 0] * dx
        elif boundary == "right":
            result[:, -1] = result[:, -2] + gradient[:, -1] * dx
        elif boundary == "bottom":
            result[0, :] = result[1, :] - gradient[0, :] * dy
        elif boundary == "top":
            result[-1, :] = result[-2, :] + gradient[-1, :] * dy
        return result
    
    def _apply_neumann_3d(self, field: np.ndarray, gradient: np.ndarray, boundary: str) -> np.ndarray:
        result = field.copy()
        dx, dy, dz = self._grid.dx, self._grid.dy, self._grid.dz
        if boundary == "left":
            result[:, :, 0] = result[:, :, 1] - gradient[:, :, 0] * dx
        elif boundary == "right":
            result[:, :, -1] = result[:, :, -2] + gradient[:, :, -1] * dx
        elif boundary == "bottom":
            result[:, 0, :] = result[:, 1, :] - gradient[:, 0, :] * dy
        elif boundary == "top":
            result[:, -1, :] = result[:, -2, :] + gradient[:, -1, :] * dy
        elif boundary == "front":
            result[0, :, :] = result[1, :, :] - gradient[0, :, :] * dz
        elif boundary == "back":
            result[-1, :, :] = result[-2, :, :] + gradient[-1, :, :] * dz
        return result
