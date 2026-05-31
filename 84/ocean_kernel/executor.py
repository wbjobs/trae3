from typing import Optional, Dict, Any, List, Union, Tuple
import numpy as np
import time
from dataclasses import asdict

from common.models import (
    GridConfig,
    TemperatureField,
    SalinityField,
    DensityField,
    SimulationParams,
    SimulationResult,
    BoundaryCondition,
)
from common.exceptions import (
    OceanKernelError,
    ParameterValidationError,
    DimensionMismatchError,
    BoundaryConditionError,
)
from ocean_kernel.thermohaline import (
    ThermohalineSolver,
    calculate_density,
    calculate_vertical_mixing_coefficient,
)


def _validate_grid_config(grid: GridConfig) -> None:
    if grid.nx <= 0 or grid.ny <= 0:
        raise ParameterValidationError("grid.nx/ny", "must be positive integers")
    
    if grid.is_3d and grid.nz <= 0:
        raise ParameterValidationError("grid.nz", "must be positive for 3D grid")
    
    if grid.dx <= 0 or grid.dy <= 0:
        raise ParameterValidationError("grid.dx/dy", "must be positive")
    
    if grid.is_3d and grid.dz <= 0:
        raise ParameterValidationError("grid.dz", "must be positive for 3D grid")


def _validate_simulation_params(params: SimulationParams) -> None:
    if params.dt <= 0:
        raise ParameterValidationError("dt", "must be positive")
    
    if params.total_time <= 0:
        raise ParameterValidationError("total_time", "must be positive")
    
    if params.thermal_diffusivity <= 0:
        raise ParameterValidationError("thermal_diffusivity", "must be positive")
    
    if params.salinity_diffusivity <= 0:
        raise ParameterValidationError("salinity_diffusivity", "must be positive")
    
    if params.thermal_expansion <= 0:
        raise ParameterValidationError("thermal_expansion", "must be positive")
    
    if params.haline_contraction <= 0:
        raise ParameterValidationError("haline_contraction", "must be positive")
    
    if params.reference_density <= 0:
        raise ParameterValidationError("reference_density", "must be positive")
    
    if params.gravity <= 0:
        raise ParameterValidationError("gravity", "must be positive")
    
    if params.viscosity <= 0:
        raise ParameterValidationError("viscosity", "must be positive")
    
    if params.max_iterations <= 0:
        raise ParameterValidationError("max_iterations", "must be positive")
    
    if params.tolerance <= 0:
        raise ParameterValidationError("tolerance", "must be positive")
    
    valid_solvers = ["jacobi", "gauss_seidel"]
    if params.solver_type not in valid_solvers:
        raise ParameterValidationError(
            "solver_type", f"must be one of {valid_solvers}"
        )
    
    if params.num_processes is not None and params.num_processes <= 0:
        raise ParameterValidationError("num_processes", "must be positive or None")


def _validate_boundary_conditions(
    boundary_conditions: List[BoundaryCondition],
    grid: GridConfig,
) -> None:
    valid_boundaries_2d = ["left", "right", "bottom", "top"]
    valid_boundaries_3d = valid_boundaries_2d + ["front", "back"]
    valid_types = ["dirichlet", "neumann"]
    
    expected_boundaries = valid_boundaries_3d if grid.is_3d else valid_boundaries_2d
    provided_boundaries = [bc.boundary for bc in boundary_conditions]
    
    for boundary in expected_boundaries:
        if boundary not in provided_boundaries:
            raise BoundaryConditionError(
                boundary, f"Missing boundary condition for '{boundary}'"
            )
    
    for bc in boundary_conditions:
        if bc.boundary not in expected_boundaries:
            raise BoundaryConditionError(
                bc.boundary, 
                f"Invalid boundary '{bc.boundary}' for {'3D' if grid.is_3d else '2D'} grid. "
                f"Expected one of {expected_boundaries}"
            )
        
        if bc.type not in valid_types:
            raise BoundaryConditionError(
                bc.type, 
                f"Invalid type '{bc.type}'. Use one of {valid_types}"
            )
        
        if isinstance(bc.value, np.ndarray):
            if bc.value.shape != grid.shape:
                raise DimensionMismatchError(
                    grid.shape, bc.value.shape, 
                    f"Boundary condition '{bc.boundary}' value shape mismatch"
                )


def _validate_initial_conditions(
    temperature: TemperatureField,
    salinity: SalinityField,
    grid: GridConfig,
) -> None:
    if temperature.data.shape != grid.shape:
        raise DimensionMismatchError(
            grid.shape, temperature.data.shape, "Initial temperature field shape mismatch"
        )
    
    if salinity.data.shape != grid.shape:
        raise DimensionMismatchError(
            grid.shape, salinity.data.shape, "Initial salinity field shape mismatch"
        )
    
    if temperature.time != salinity.time:
        raise ParameterValidationError(
            "time", 
            f"Initial temperature time ({temperature.time}) does not match "
            f"salinity time ({salinity.time})"
        )
    
    if np.any(np.isnan(temperature.data)):
        raise ParameterValidationError(
            "temperature", "contains NaN values"
        )
    
    if np.any(np.isnan(salinity.data)):
        raise ParameterValidationError(
            "salinity", "contains NaN values"
        )
    
    if np.any(np.isinf(temperature.data)):
        raise ParameterValidationError(
            "temperature", "contains infinite values"
        )
    
    if np.any(np.isinf(salinity.data)):
        raise ParameterValidationError(
            "salinity", "contains infinite values"
        )


def _validate_velocity_fields(
    velocity_u: np.ndarray,
    velocity_v: np.ndarray,
    velocity_w: Optional[np.ndarray],
    grid: GridConfig,
) -> None:
    if velocity_u.shape != grid.shape:
        raise DimensionMismatchError(
            grid.shape, velocity_u.shape, "Velocity u field shape mismatch"
        )
    
    if velocity_v.shape != grid.shape:
        raise DimensionMismatchError(
            grid.shape, velocity_v.shape, "Velocity v field shape mismatch"
        )
    
    if grid.is_3d:
        if velocity_w is None:
            raise ParameterValidationError(
                "velocity_w", "3D simulation requires w velocity component"
            )
        if velocity_w.shape != grid.shape:
            raise DimensionMismatchError(
                grid.shape, velocity_w.shape, "Velocity w field shape mismatch"
            )
    
    if np.any(np.isnan(velocity_u)) or np.any(np.isnan(velocity_v)):
        raise ParameterValidationError(
            "velocity", "contains NaN values"
        )
    
    if np.any(np.isinf(velocity_u)) or np.any(np.isinf(velocity_v)):
        raise ParameterValidationError(
            "velocity", "contains infinite values"
        )
    
    if velocity_w is not None:
        if np.any(np.isnan(velocity_w)):
            raise ParameterValidationError(
                "velocity_w", "contains NaN values"
            )
        if np.any(np.isinf(velocity_w)):
            raise ParameterValidationError(
                "velocity_w", "contains infinite values"
            )


class OceanKernelExecutor:
    def __init__(
        self,
        grid: GridConfig,
        params: SimulationParams,
        boundary_conditions: List[BoundaryCondition],
    ):
        self._grid = grid
        self._params = params
        self._boundary_conditions = boundary_conditions
        self._solver: Optional[ThermohalineSolver] = None
        self._initialized = False
        
        self._validate_all()
        self._initialize_solver()
    
    def _validate_all(self) -> None:
        _validate_grid_config(self._grid)
        _validate_simulation_params(self._params)
        _validate_boundary_conditions(self._boundary_conditions, self._grid)
    
    def _initialize_solver(self) -> None:
        self._solver = ThermohalineSolver(
            params=self._params,
            grid=self._grid,
            boundary_conditions=self._boundary_conditions,
        )
        self._initialized = True
    
    def _parse_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        required_keys = ["temperature", "salinity", "velocity_u", "velocity_v"]
        for key in required_keys:
            if key not in task:
                raise ParameterValidationError(key, f"Missing required key '{key}' in task")
        
        parsed = {}
        
        temp_data = task["temperature"]
        if isinstance(temp_data, np.ndarray):
            parsed["temperature"] = TemperatureField(
                data=temp_data,
                grid=self._grid,
                time=task.get("initial_time", 0.0),
            )
        elif isinstance(temp_data, TemperatureField):
            parsed["temperature"] = temp_data
        else:
            raise ParameterValidationError(
                "temperature", 
                f"Invalid type: {type(temp_data)}. Expected np.ndarray or TemperatureField"
            )
        
        sal_data = task["salinity"]
        if isinstance(sal_data, np.ndarray):
            parsed["salinity"] = SalinityField(
                data=sal_data,
                grid=self._grid,
                time=task.get("initial_time", 0.0),
            )
        elif isinstance(sal_data, SalinityField):
            parsed["salinity"] = sal_data
        else:
            raise ParameterValidationError(
                "salinity", 
                f"Invalid type: {type(sal_data)}. Expected np.ndarray or SalinityField"
            )
        
        vel_u = task["velocity_u"]
        if not isinstance(vel_u, np.ndarray):
            raise ParameterValidationError(
                "velocity_u", 
                f"Invalid type: {type(vel_u)}. Expected np.ndarray"
            )
        parsed["velocity_u"] = vel_u
        
        vel_v = task["velocity_v"]
        if not isinstance(vel_v, np.ndarray):
            raise ParameterValidationError(
                "velocity_v", 
                f"Invalid type: {type(vel_v)}. Expected np.ndarray"
            )
        parsed["velocity_v"] = vel_v
        
        if "velocity_w" in task:
            vel_w = task["velocity_w"]
            if not isinstance(vel_w, np.ndarray):
                raise ParameterValidationError(
                    "velocity_w", 
                    f"Invalid type: {type(vel_w)}. Expected np.ndarray"
                )
            parsed["velocity_w"] = vel_w
        else:
            parsed["velocity_w"] = None
        
        if "dt" in task:
            parsed["dt"] = task["dt"]
        
        return parsed
    
    def _execute_single_step(
        self,
        temperature: TemperatureField,
        salinity: SalinityField,
        velocity_u: np.ndarray,
        velocity_v: np.ndarray,
        velocity_w: Optional[np.ndarray] = None,
        dt: Optional[float] = None,
    ) -> Tuple[TemperatureField, SalinityField, DensityField, np.ndarray, Dict[str, Any]]:
        if not self._initialized or self._solver is None:
            raise OceanKernelError("Executor not initialized")
        
        _validate_initial_conditions(temperature, salinity, self._grid)
        _validate_velocity_fields(velocity_u, velocity_v, velocity_w, self._grid)
        
        return self._solver.step(
            temperature=temperature,
            salinity=salinity,
            velocity_u=velocity_u,
            velocity_v=velocity_v,
            velocity_w=velocity_w,
            dt=dt,
        )
    
    def _execute_full_simulation(
        self,
        temperature: TemperatureField,
        salinity: SalinityField,
        velocity_u: np.ndarray,
        velocity_v: np.ndarray,
        velocity_w: Optional[np.ndarray] = None,
    ) -> Tuple[TemperatureField, SalinityField, DensityField, np.ndarray, Dict[str, Any]]:
        if not self._initialized or self._solver is None:
            raise OceanKernelError("Executor not initialized")
        
        _validate_initial_conditions(temperature, salinity, self._grid)
        _validate_velocity_fields(velocity_u, velocity_v, velocity_w, self._grid)
        
        return self._solver.solve(
            initial_temperature=temperature,
            initial_salinity=salinity,
            velocity_u=velocity_u,
            velocity_v=velocity_v,
            velocity_w=velocity_w,
        )
    
    def _package_result(
        self,
        temperature: TemperatureField,
        salinity: SalinityField,
        density: DensityField,
        vertical_mixing: np.ndarray,
        convergence_history: Dict[str, Any],
        start_time: float,
        end_time: float,
    ) -> SimulationResult:
        metadata = {
            "execution_time": end_time - start_time,
            "grid_info": asdict(self._grid),
            "params": asdict(self._params),
            "solver_type": self._params.solver_type,
            "parallel": self._params.use_parallel,
            "num_processes": self._params.num_processes,
        }
        
        return SimulationResult(
            temperature=temperature,
            salinity=salinity,
            density=density,
            vertical_mixing=vertical_mixing,
            params=self._params,
            grid=self._grid,
            time=temperature.time,
            convergence_history=convergence_history,
            metadata=metadata,
        )
    
    def run_step(
        self,
        task: Dict[str, Any],
    ) -> SimulationResult:
        start_time = time.time()
        
        parsed = self._parse_task(task)
        
        T, S, rho, vm, conv = self._execute_single_step(
            temperature=parsed["temperature"],
            salinity=parsed["salinity"],
            velocity_u=parsed["velocity_u"],
            velocity_v=parsed["velocity_v"],
            velocity_w=parsed["velocity_w"],
            dt=parsed.get("dt"),
        )
        
        end_time = time.time()
        
        return self._package_result(T, S, rho, vm, conv, start_time, end_time)
    
    def run_simulation(
        self,
        task: Dict[str, Any],
    ) -> SimulationResult:
        start_time = time.time()
        
        parsed = self._parse_task(task)
        
        T, S, rho, vm, conv = self._execute_full_simulation(
            temperature=parsed["temperature"],
            salinity=parsed["salinity"],
            velocity_u=parsed["velocity_u"],
            velocity_v=parsed["velocity_v"],
            velocity_w=parsed["velocity_w"],
        )
        
        end_time = time.time()
        
        return self._package_result(T, S, rho, vm, conv, start_time, end_time)
    
    def run(
        self,
        task: Dict[str, Any],
        mode: str = "full",
    ) -> SimulationResult:
        valid_modes = ["step", "full"]
        if mode not in valid_modes:
            raise ParameterValidationError(
                "mode", f"Invalid mode '{mode}'. Use one of {valid_modes}"
            )
        
        if mode == "step":
            return self.run_step(task)
        else:
            return self.run_simulation(task)
    
    @property
    def grid(self) -> GridConfig:
        return self._grid
    
    @property
    def params(self) -> SimulationParams:
        return self._params
    
    @property
    def boundary_conditions(self) -> List[BoundaryCondition]:
        return self._boundary_conditions.copy()
    
    @property
    def is_initialized(self) -> bool:
        return self._initialized


def execute_simulation(
    grid: GridConfig,
    params: SimulationParams,
    boundary_conditions: List[BoundaryCondition],
    initial_temperature: Union[np.ndarray, TemperatureField],
    initial_salinity: Union[np.ndarray, SalinityField],
    velocity_u: np.ndarray,
    velocity_v: np.ndarray,
    velocity_w: Optional[np.ndarray] = None,
    mode: str = "full",
) -> SimulationResult:
    executor = OceanKernelExecutor(grid, params, boundary_conditions)
    
    if isinstance(initial_temperature, np.ndarray):
        temp_field = TemperatureField(
            data=initial_temperature,
            grid=grid,
            time=0.0,
        )
    else:
        temp_field = initial_temperature
    
    if isinstance(initial_salinity, np.ndarray):
        sal_field = SalinityField(
            data=initial_salinity,
            grid=grid,
            time=0.0,
        )
    else:
        sal_field = initial_salinity
    
    task = {
        "temperature": temp_field,
        "salinity": sal_field,
        "velocity_u": velocity_u,
        "velocity_v": velocity_v,
        "velocity_w": velocity_w,
    }
    
    return executor.run(task, mode=mode)
