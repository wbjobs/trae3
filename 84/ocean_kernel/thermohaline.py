from typing import Optional, Tuple, List, Dict, Any
import numpy as np
from multiprocessing import Pool, cpu_count

from common.models import (
    GridConfig,
    TemperatureField,
    SalinityField,
    DensityField,
    SimulationParams,
    BoundaryCondition,
)
from common.exceptions import (
    ParameterValidationError,
    DimensionMismatchError,
    NumericalError,
)
from ocean_kernel.numerics import FiniteDifference, BoundaryHandler, IterativeSolver


def calculate_density(
    temperature: np.ndarray,
    salinity: np.ndarray,
    params: SimulationParams,
) -> np.ndarray:
    if temperature.shape != salinity.shape:
        raise DimensionMismatchError(
            temperature.shape, salinity.shape, "calculate_density"
        )
    
    alpha = params.thermal_expansion
    beta = params.haline_contraction
    rho0 = params.reference_density
    T0 = params.reference_temperature
    S0 = params.reference_salinity
    
    density = rho0 * (1.0 - alpha * (temperature - T0) + beta * (salinity - S0))
    return density


def calculate_vertical_mixing_coefficient(
    temperature: np.ndarray,
    salinity: np.ndarray,
    density: np.ndarray,
    params: SimulationParams,
    grid: GridConfig,
) -> np.ndarray:
    if not grid.is_3d:
        mixing = np.full_like(temperature, params.viscosity)
        return mixing
    
    if temperature.shape != density.shape:
        raise DimensionMismatchError(
            temperature.shape, density.shape, "calculate_vertical_mixing_coefficient"
        )
    
    nz, ny, nx = grid.nz, grid.ny, grid.nx
    dz = grid.dz
    g = params.gravity
    rho0 = params.reference_density
    nu0 = params.viscosity
    
    mixing = np.full((nz, ny, nx), nu0, dtype=np.float64)
    
    for k in range(1, nz - 1):
        for j in range(ny):
            for i in range(nx):
                rho_above = density[k - 1, j, i]
                rho_below = density[k + 1, j, i]
                drho_dz = (rho_below - rho_above) / (2.0 * dz)
                
                if drho_dz < 0:
                    N2 = -g / rho0 * drho_dz
                    if N2 > 0:
                        Ri = N2 / (nu0 / (dz * dz) + 1e-10)
                        mixing_factor = 1.0 / (1.0 + 5.0 * Ri)
                        mixing[k, j, i] = nu0 * (1.0 + 100.0 * max(0.0, -drho_dz / rho0))
                    else:
                        mixing[k, j, i] = nu0 * 10.0
                else:
                    N2 = -g / rho0 * drho_dz
                    Ri = max(0.0, N2) / (nu0 / (dz * dz) + 1e-10)
                    mixing_factor = 1.0 / (1.0 + 10.0 * Ri)
                    mixing[k, j, i] = nu0 * mixing_factor
    
    return mixing


def calculate_temperature_field(
    temperature: np.ndarray,
    salinity: np.ndarray,
    velocity_u: np.ndarray,
    velocity_v: np.ndarray,
    velocity_w: Optional[np.ndarray],
    params: SimulationParams,
    grid: GridConfig,
    boundary_conditions: List[BoundaryCondition],
    dt: Optional[float] = None,
) -> Tuple[np.ndarray, Dict[str, Any]]:
    if temperature.shape != grid.shape:
        raise DimensionMismatchError(
            grid.shape, temperature.shape, "calculate_temperature_field"
        )
    
    if salinity.shape != grid.shape:
        raise DimensionMismatchError(
            grid.shape, salinity.shape, "calculate_temperature_field"
        )
    
    if velocity_u.shape != grid.shape or velocity_v.shape != grid.shape:
        raise DimensionMismatchError(
            grid.shape, velocity_u.shape, "calculate_temperature_field velocity"
        )
    
    if grid.is_3d and velocity_w is None:
        raise ParameterValidationError(
            "velocity_w", "3D simulation requires w velocity component"
        )
    
    if grid.is_3d and velocity_w is not None and velocity_w.shape != grid.shape:
        raise DimensionMismatchError(
            grid.shape, velocity_w.shape, "calculate_temperature_field velocity_w"
        )
    
    dt_val = dt if dt is not None else params.dt
    if dt_val <= 0:
        raise ParameterValidationError("dt", "must be positive")
    
    fd = FiniteDifference(grid)
    bh = BoundaryHandler(grid)
    solver = IterativeSolver(
        method=params.solver_type,
        max_iterations=params.max_iterations,
        tolerance=params.tolerance,
    )
    
    kappa_T = params.thermal_diffusivity
    
    T = temperature.copy()
    T = bh.apply_boundary_conditions(T, boundary_conditions)
    
    diffusion = kappa_T * fd.laplacian(T)
    advection = fd.advection(T, velocity_u, velocity_v, velocity_w)
    
    dT_dt = diffusion - advection
    
    T_new = T + dt_val * dT_dt
    
    T_new = bh.apply_boundary_conditions(T_new, boundary_conditions)
    
    convergence = {
        "method": "explicit_euler",
        "max_change": np.max(np.abs(T_new - T)),
        "mean_change": np.mean(np.abs(T_new - T)),
    }
    
    return T_new, convergence


def calculate_salinity_field(
    salinity: np.ndarray,
    temperature: np.ndarray,
    velocity_u: np.ndarray,
    velocity_v: np.ndarray,
    velocity_w: Optional[np.ndarray],
    params: SimulationParams,
    grid: GridConfig,
    boundary_conditions: List[BoundaryCondition],
    dt: Optional[float] = None,
) -> Tuple[np.ndarray, Dict[str, Any]]:
    if salinity.shape != grid.shape:
        raise DimensionMismatchError(
            grid.shape, salinity.shape, "calculate_salinity_field"
        )
    
    if temperature.shape != grid.shape:
        raise DimensionMismatchError(
            grid.shape, temperature.shape, "calculate_salinity_field"
        )
    
    if velocity_u.shape != grid.shape or velocity_v.shape != grid.shape:
        raise DimensionMismatchError(
            grid.shape, velocity_u.shape, "calculate_salinity_field velocity"
        )
    
    if grid.is_3d and velocity_w is None:
        raise ParameterValidationError(
            "velocity_w", "3D simulation requires w velocity component"
        )
    
    if grid.is_3d and velocity_w is not None and velocity_w.shape != grid.shape:
        raise DimensionMismatchError(
            grid.shape, velocity_w.shape, "calculate_salinity_field velocity_w"
        )
    
    dt_val = dt if dt is not None else params.dt
    if dt_val <= 0:
        raise ParameterValidationError("dt", "must be positive")
    
    fd = FiniteDifference(grid)
    bh = BoundaryHandler(grid)
    
    kappa_S = params.salinity_diffusivity
    
    S = salinity.copy()
    S = bh.apply_boundary_conditions(S, boundary_conditions)
    
    diffusion = kappa_S * fd.laplacian(S)
    advection = fd.advection(S, velocity_u, velocity_v, velocity_w)
    
    dS_dt = diffusion - advection
    
    S_new = S + dt_val * dS_dt
    
    S_new = bh.apply_boundary_conditions(S_new, boundary_conditions)
    
    convergence = {
        "method": "explicit_euler",
        "max_change": np.max(np.abs(S_new - S)),
        "mean_change": np.mean(np.abs(S_new - S)),
    }
    
    return S_new, convergence


def _solve_temperature_chunk(
    args: Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, Optional[np.ndarray], 
                SimulationParams, GridConfig, List[BoundaryCondition], float, slice]
) -> Tuple[np.ndarray, Dict[str, Any]]:
    T_chunk, S, u, v, w, params, grid, bcs, dt, slc = args
    
    chunk_grid = GridConfig(
        nx=grid.nx,
        ny=grid.shape[slc][0] if grid.is_3d else grid.shape[slc][0],
        nz=1 if not grid.is_3d else grid.shape[slc][0],
        dx=grid.dx,
        dy=grid.dy,
        dz=grid.dz,
        is_3d=False,
    )
    
    if grid.is_3d:
        T_2d = T_chunk.reshape(chunk_grid.shape)
        S_2d = S[slc].reshape(chunk_grid.shape)
        u_2d = u[slc].reshape(chunk_grid.shape)
        v_2d = v[slc].reshape(chunk_grid.shape)
        w_2d = w[slc].reshape(chunk_grid.shape) if w is not None else None
    else:
        T_2d = T_chunk
        S_2d = S
        u_2d = u
        v_2d = v
        w_2d = None
    
    result, conv = calculate_temperature_field(
        T_2d, S_2d, u_2d, v_2d, w_2d, params, chunk_grid, bcs, dt
    )
    
    return result, conv


def _solve_salinity_chunk(
    args: Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, Optional[np.ndarray], 
                SimulationParams, GridConfig, List[BoundaryCondition], float, slice]
) -> Tuple[np.ndarray, Dict[str, Any]]:
    S_chunk, T, u, v, w, params, grid, bcs, dt, slc = args
    
    chunk_grid = GridConfig(
        nx=grid.nx,
        ny=grid.shape[slc][0] if grid.is_3d else grid.shape[slc][0],
        nz=1 if not grid.is_3d else grid.shape[slc][0],
        dx=grid.dx,
        dy=grid.dy,
        dz=grid.dz,
        is_3d=False,
    )
    
    if grid.is_3d:
        S_2d = S_chunk.reshape(chunk_grid.shape)
        T_2d = T[slc].reshape(chunk_grid.shape)
        u_2d = u[slc].reshape(chunk_grid.shape)
        v_2d = v[slc].reshape(chunk_grid.shape)
        w_2d = w[slc].reshape(chunk_grid.shape) if w is not None else None
    else:
        S_2d = S_chunk
        T_2d = T
        u_2d = u
        v_2d = v
        w_2d = None
    
    result, conv = calculate_salinity_field(
        S_2d, T_2d, u_2d, v_2d, w_2d, params, chunk_grid, bcs, dt
    )
    
    return result, conv


class ThermohalineSolver:
    def __init__(
        self,
        params: SimulationParams,
        grid: GridConfig,
        boundary_conditions: List[BoundaryCondition],
    ):
        self._params = params
        self._grid = grid
        self._boundary_conditions = boundary_conditions
        self._fd = FiniteDifference(grid)
        self._bh = BoundaryHandler(grid)
        self._solver = IterativeSolver(
            method=params.solver_type,
            max_iterations=params.max_iterations,
            tolerance=params.tolerance,
        )
        
        self._num_processes = params.num_processes or cpu_count()
        
        if params.dt <= 0:
            raise ParameterValidationError("dt", "must be positive")
        
        if params.total_time <= 0:
            raise ParameterValidationError("total_time", "must be positive")
    
    def _create_chunks(self, field: np.ndarray) -> List[Tuple[np.ndarray, slice]]:
        if not self._params.use_parallel or self._num_processes <= 1:
            return [(field, slice(None))]
        
        num_procs = min(self._num_processes, self._grid.shape[0])
        chunk_size = self._grid.shape[0] // num_procs
        
        chunks = []
        for i in range(num_procs):
            start = i * chunk_size
            end = start + chunk_size if i < num_procs - 1 else self._grid.shape[0]
            slc = slice(start, end)
            chunks.append((field[slc].copy(), slc))
        
        return chunks
    
    def _parallel_solve_temperature(
        self,
        T: np.ndarray,
        S: np.ndarray,
        u: np.ndarray,
        v: np.ndarray,
        w: Optional[np.ndarray],
        dt: float,
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        chunks = self._create_chunks(T)
        
        args_list = []
        for chunk_data, slc in chunks:
            args_list.append((chunk_data, S, u, v, w, self._params, self._grid, 
                            self._boundary_conditions, dt, slc))
        
        with Pool(processes=self._num_processes) as pool:
            results = pool.map(_solve_temperature_chunk, args_list)
        
        T_new = np.zeros_like(T)
        max_change = 0.0
        mean_change = 0.0
        
        for (result, conv), (_, slc) in zip(results, chunks):
            if self._grid.is_3d:
                T_new[slc] = result.reshape(T[slc].shape)
            else:
                T_new[slc] = result
            max_change = max(max_change, conv["max_change"])
            mean_change += conv["mean_change"]
        
        mean_change /= len(results)
        
        convergence = {
            "method": "parallel_explicit_euler",
            "max_change": max_change,
            "mean_change": mean_change,
            "num_processes": self._num_processes,
        }
        
        return T_new, convergence
    
    def _parallel_solve_salinity(
        self,
        S: np.ndarray,
        T: np.ndarray,
        u: np.ndarray,
        v: np.ndarray,
        w: Optional[np.ndarray],
        dt: float,
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        chunks = self._create_chunks(S)
        
        args_list = []
        for chunk_data, slc in chunks:
            args_list.append((chunk_data, T, u, v, w, self._params, self._grid, 
                            self._boundary_conditions, dt, slc))
        
        with Pool(processes=self._num_processes) as pool:
            results = pool.map(_solve_salinity_chunk, args_list)
        
        S_new = np.zeros_like(S)
        max_change = 0.0
        mean_change = 0.0
        
        for (result, conv), (_, slc) in zip(results, chunks):
            if self._grid.is_3d:
                S_new[slc] = result.reshape(S[slc].shape)
            else:
                S_new[slc] = result
            max_change = max(max_change, conv["max_change"])
            mean_change += conv["mean_change"]
        
        mean_change /= len(results)
        
        convergence = {
            "method": "parallel_explicit_euler",
            "max_change": max_change,
            "mean_change": mean_change,
            "num_processes": self._num_processes,
        }
        
        return S_new, convergence
    
    def step(
        self,
        temperature: TemperatureField,
        salinity: SalinityField,
        velocity_u: np.ndarray,
        velocity_v: np.ndarray,
        velocity_w: Optional[np.ndarray] = None,
        dt: Optional[float] = None,
    ) -> Tuple[TemperatureField, SalinityField, DensityField, np.ndarray, Dict[str, Any]]:
        if temperature.data.shape != self._grid.shape:
            raise DimensionMismatchError(
                self._grid.shape, temperature.data.shape, "ThermohalineSolver.step temperature"
            )
        
        if salinity.data.shape != self._grid.shape:
            raise DimensionMismatchError(
                self._grid.shape, salinity.data.shape, "ThermohalineSolver.step salinity"
            )
        
        if velocity_u.shape != self._grid.shape or velocity_v.shape != self._grid.shape:
            raise DimensionMismatchError(
                self._grid.shape, velocity_u.shape, "ThermohalineSolver.step velocity"
            )
        
        if self._grid.is_3d and velocity_w is None:
            raise ParameterValidationError(
                "velocity_w", "3D simulation requires w velocity component"
            )
        
        if self._grid.is_3d and velocity_w is not None and velocity_w.shape != self._grid.shape:
            raise DimensionMismatchError(
                self._grid.shape, velocity_w.shape, "ThermohalineSolver.step velocity_w"
            )
        
        dt_val = dt if dt is not None else self._params.dt
        
        T = temperature.data.copy()
        S = salinity.data.copy()
        
        if self._params.use_parallel and self._num_processes > 1:
            T_new, t_conv = self._parallel_solve_temperature(T, S, velocity_u, velocity_v, velocity_w, dt_val)
            S_new, s_conv = self._parallel_solve_salinity(S, T, velocity_u, velocity_v, velocity_w, dt_val)
        else:
            T_new, t_conv = calculate_temperature_field(
                T, S, velocity_u, velocity_v, velocity_w,
                self._params, self._grid, self._boundary_conditions, dt_val
            )
            S_new, s_conv = calculate_salinity_field(
                S, T, velocity_u, velocity_v, velocity_w,
                self._params, self._grid, self._boundary_conditions, dt_val
            )
        
        rho_new = calculate_density(T_new, S_new, self._params)
        vm_new = calculate_vertical_mixing_coefficient(T_new, S_new, rho_new, self._params, self._grid)
        
        new_time = temperature.time + dt_val
        
        T_field = TemperatureField(data=T_new, grid=self._grid, time=new_time)
        S_field = SalinityField(data=S_new, grid=self._grid, time=new_time)
        rho_field = DensityField(data=rho_new, grid=self._grid, time=new_time)
        
        convergence = {
            "temperature": t_conv,
            "salinity": s_conv,
            "dt": dt_val,
            "time": new_time,
        }
        
        return T_field, S_field, rho_field, vm_new, convergence
    
    def solve(
        self,
        initial_temperature: TemperatureField,
        initial_salinity: SalinityField,
        velocity_u: np.ndarray,
        velocity_v: np.ndarray,
        velocity_w: Optional[np.ndarray] = None,
    ) -> Tuple[TemperatureField, SalinityField, DensityField, np.ndarray, Dict[str, Any]]:
        T = initial_temperature
        S = initial_salinity
        
        current_time = 0.0
        total_time = self._params.total_time
        dt = self._params.dt
        
        convergence_history = {
            "temperature_changes": [],
            "salinity_changes": [],
            "times": [],
        }
        
        while current_time < total_time:
            step_dt = min(dt, total_time - current_time)
            
            T, S, rho, vm, conv = self.step(T, S, velocity_u, velocity_v, velocity_w, step_dt)
            
            convergence_history["temperature_changes"].append(conv["temperature"]["max_change"])
            convergence_history["salinity_changes"].append(conv["salinity"]["max_change"])
            convergence_history["times"].append(conv["time"])
            
            current_time = conv["time"]
        
        convergence_history["final_time"] = current_time
        convergence_history["num_steps"] = len(convergence_history["times"])
        
        return T, S, rho, vm, convergence_history
