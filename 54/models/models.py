import uuid
from datetime import datetime
from typing import Optional, Dict, List, Any
from enum import Enum
from pydantic import BaseModel, Field, field_validator


class TaskStatus(str, Enum):
    PENDING = "pending"
    QUEUED = "queued"
    SCHEDULED = "scheduled"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    RETRYING = "retrying"


class NodeStatus(str, Enum):
    IDLE = "idle"
    BUSY = "busy"
    OFFLINE = "offline"
    MAINTENANCE = "maintenance"
    ERROR = "error"


class Region(BaseModel):
    name: str
    min_latitude: float
    max_latitude: float
    min_longitude: float
    max_longitude: float

    @field_validator("min_latitude", "max_latitude")
    @classmethod
    def check_latitude_range(cls, v: float) -> float:
        if not (-90.0 <= v <= 90.0):
            raise ValueError("Latitude must be between -90 and 90")
        return v

    @field_validator("min_longitude", "max_longitude")
    @classmethod
    def check_longitude_range(cls, v: float) -> float:
        if not (-180.0 <= v <= 180.0):
            raise ValueError("Longitude must be between -180 and 180")
        return v

    @property
    def width(self) -> float:
        return self.max_longitude - self.min_longitude

    @property
    def height(self) -> float:
        return self.max_latitude - self.min_latitude

    @property
    def area(self) -> float:
        return (self.max_latitude - self.min_latitude) * (self.max_longitude - self.min_longitude)


class GridPoint(BaseModel):
    latitude: float
    longitude: float


class WeatherStationData(BaseModel):
    station_id: str
    latitude: float
    longitude: float
    timestamp: datetime
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    pressure: Optional[float] = None
    wind_speed: Optional[float] = None
    wind_direction: Optional[float] = None
    precipitation: Optional[float] = None
    elevation: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump()

    def get_value(self, variable: str) -> Optional[float]:
        return getattr(self, variable, None)


class InterpolationTask(BaseModel):
    task_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    region: Region
    variables: List[str]
    grid_resolution: float = 0.01
    interpolation_method: str = "kriging"
    priority: int = Field(default=5, ge=1, le=10)
    status: TaskStatus = TaskStatus.PENDING
    created_at: datetime = Field(default_factory=datetime.utcnow)
    scheduled_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    failed_at: Optional[datetime] = None
    assigned_node: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 3
    error_message: Optional[str] = None
    input_data_hash: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class InterpolationResult(BaseModel):
    result_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    task_id: str
    variable: str
    grid_points: List[GridPoint]
    values: List[float]
    uncertainties: Optional[List[float]] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    interpolation_method: str
    input_station_count: int
    quality_score: Optional[float] = None
    grid_resolution: float = 0.01
    metadata: Dict[str, Any] = Field(default_factory=dict)


class NodeInfo(BaseModel):
    node_id: str
    status: NodeStatus = NodeStatus.IDLE
    host: str
    port: int
    cpu_cores: int
    memory_gb: float
    gpu_available: bool = False
    current_task: Optional[str] = None
    tasks_completed: int = 0
    tasks_failed: int = 0
    last_heartbeat: datetime = Field(default_factory=datetime.utcnow)
    registered_at: datetime = Field(default_factory=datetime.utcnow)
    capabilities: List[str] = Field(default_factory=list)


class TaskResult(BaseModel):
    task_id: str
    status: TaskStatus
    results: List[InterpolationResult] = Field(default_factory=list)
    error: Optional[str] = None
    execution_time_seconds: Optional[float] = None
    node_id: Optional[str] = None
    completed_at: Optional[datetime] = None
