from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional, Tuple, Union, Dict, Any, List
import numpy as np


@dataclass
class GridConfig:
    nx: int
    ny: int
    nz: int = 1
    dx: float = 1.0
    dy: float = 1.0
    dz: float = 1.0
    is_3d: bool = False

    @property
    def shape(self) -> Tuple[int, ...]:
        if self.is_3d:
            return (self.nz, self.ny, self.nx)
        return (self.ny, self.nx)

    @property
    def ndim(self) -> int:
        return 3 if self.is_3d else 2


@dataclass
class BoundaryCondition:
    type: str
    value: Union[float, np.ndarray]
    boundary: str
    params: Dict[str, Any] = field(default_factory=dict)


@dataclass
class TemperatureField:
    data: np.ndarray
    grid: GridConfig
    time: float = 0.0

    def __post_init__(self):
        if self.data.shape != self.grid.shape:
            raise ValueError(f"Temperature field shape {self.data.shape} does not match grid shape {self.grid.shape}")


@dataclass
class SalinityField:
    data: np.ndarray
    grid: GridConfig
    time: float = 0.0

    def __post_init__(self):
        if self.data.shape != self.grid.shape:
            raise ValueError(f"Salinity field shape {self.data.shape} does not match grid shape {self.grid.shape}")


@dataclass
class DensityField:
    data: np.ndarray
    grid: GridConfig
    time: float = 0.0

    def __post_init__(self):
        if self.data.shape != self.grid.shape:
            raise ValueError(f"Density field shape {self.data.shape} does not match grid shape {self.grid.shape}")


@dataclass
class SimulationParams:
    dt: float
    total_time: float
    thermal_diffusivity: float = 1e-4
    salinity_diffusivity: float = 1e-4
    thermal_expansion: float = 2e-4
    haline_contraction: float = 7e-4
    reference_density: float = 1025.0
    reference_temperature: float = 15.0
    reference_salinity: float = 35.0
    gravity: float = 9.81
    viscosity: float = 1e-6
    use_parallel: bool = False
    num_processes: Optional[int] = None
    max_iterations: int = 10000
    tolerance: float = 1e-6
    solver_type: str = "jacobi"


@dataclass
class SimulationResult:
    temperature: TemperatureField
    salinity: SalinityField
    density: DensityField
    vertical_mixing: np.ndarray
    params: SimulationParams
    grid: GridConfig
    time: float
    convergence_history: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)


class NodeStatus(str, Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    BUSY = "busy"
    IDLE = "idle"
    UNHEALTHY = "unhealthy"
    ISOLATED = "isolated"


class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class ResourceUsage:
    cpu_usage: float = 0.0
    memory_usage: float = 0.0
    memory_total: int = 0
    memory_used: int = 0
    gpu_usage: float = 0.0
    gpu_memory_usage: float = 0.0
    network_bandwidth: float = 0.0
    network_in: float = 0.0
    network_out: float = 0.0
    disk_usage: float = 0.0
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class Heartbeat:
    node_id: str
    timestamp: datetime
    resource_usage: ResourceUsage
    status: NodeStatus
    active_tasks: List[str] = field(default_factory=list)
    load_score: float = 0.0


@dataclass
class Task:
    task_id: str
    name: str
    node_id: Optional[str] = None
    status: TaskStatus = TaskStatus.PENDING
    priority: int = 0
    cpu_required: float = 0.0
    memory_required: int = 0
    gpu_required: float = 0.0
    parameters: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    progress: float = 0.0


@dataclass
class ComputeNode:
    node_id: str
    name: str
    ip_address: str
    port: int
    status: NodeStatus = NodeStatus.OFFLINE
    resource_usage: ResourceUsage = field(default_factory=ResourceUsage)
    total_resources: ResourceUsage = field(default_factory=ResourceUsage)
    last_heartbeat: Optional[datetime] = None
    registered_at: datetime = field(default_factory=datetime.now)
    active_tasks: List[str] = field(default_factory=list)
    completed_tasks: int = 0
    failed_tasks: int = 0
    load_score: float = 0.0
    tags: List[str] = field(default_factory=list)
    capabilities: List[str] = field(default_factory=list)
    heartbeat_timeout: int = 30
    consecutive_heartbeat_failures: int = 0
    max_heartbeat_failures: int = 3
