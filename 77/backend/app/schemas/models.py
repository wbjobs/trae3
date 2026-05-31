from typing import Optional, Dict, List, Any
from pydantic import BaseModel, Field


class MetricData(BaseModel):
    timestamp: int = Field(..., description="UNIX时间戳(毫秒)")
    metric: str = Field(..., description="指标名称")
    value: float = Field(..., description="指标值")
    source: str = Field(..., description="数据源")
    tags: Optional[Dict[str, Any]] = Field(default=None, description="标签")
    is_anomaly: Optional[int] = Field(default=0, description="是否异常")


class MetricDataBatch(BaseModel):
    data: List[MetricData]


class AlertEvent(BaseModel):
    id: str
    timestamp: int
    metric: str
    source: str
    level: str = Field(..., pattern="^(critical|warning|info)$")
    alert_type: str
    value: float
    threshold: float
    duration: Optional[float] = None
    description: Optional[str] = None
    acknowledged: Optional[int] = 0


class QueryParams(BaseModel):
    startTime: int
    endTime: int
    metrics: Optional[List[str]] = None
    sources: Optional[List[str]] = None
    aggregation: Optional[str] = Field(default="raw", pattern="^(raw|1m|5m|15m|1h)$")
    onlyAnomalies: Optional[bool] = False
    limit: Optional[int] = 10000


class MetricDefinition(BaseModel):
    name: str
    display_name: str
    unit: Optional[str] = None
    warn_threshold: Optional[float] = None
    crit_threshold: Optional[float] = None
    description: Optional[str] = None


class DataSource(BaseModel):
    name: str
    display_name: str
    type: str
    status: str = "active"


class MetricStats(BaseModel):
    metric: str
    source: Optional[str] = None
    count: int
    min: float
    max: float
    avg: float
    p50: float
    p95: float
    p99: float
    anomaly_count: int


class AlertStats(BaseModel):
    by_level: Dict[str, int]
    total: int
    top_metrics: List[Dict[str, Any]]


class ApiResponse(BaseModel):
    code: int = 200
    message: str = "success"
    data: Optional[Any] = None


class AnomalyResult(BaseModel):
    is_anomaly: bool
    level: Optional[str] = None
    alert_type: Optional[str] = None
    threshold: Optional[float] = None
    description: Optional[str] = None
    score: Optional[float] = None


class PressureAnalysisResult(BaseModel):
    is_anomaly: bool
    level: str
    type: str
    drop_rate: float
    duration_minutes: int
    affected_region: str
    confidence: float
    recommended_action: str


class PipelineData(BaseModel):
    id: str
    name: str
    region: str
    pressure: float
    flow_rate: float
    temperature: Optional[float] = None
    status: str
    last_update: int
    coordinates: List[float]


class RegionData(BaseModel):
    id: str
    name: str
    pipelines: List[str]
    avg_pressure: float
    avg_flow: Optional[float] = None
    avg_temperature: Optional[float] = None
    pressure_drop_rate: float
    warning_count: int
    critical_count: int
    status: str
    color: str


class CorrelationResult(BaseModel):
    metric_a: str
    metric_b: str
    correlation: float
    lag: int
    p_value: float
    significance: str


class HeatmapPoint(BaseModel):
    x: float
    y: float
    value: float
    region: str
    metric: str


class ArchiveStats(BaseModel):
    hot_data_count: int
    warm_data_count: int
    cold_data_count: int
    total_size_mb: float
    last_archived_at: Optional[int] = None


class ArchiveRequest(BaseModel):
    tier: Optional[str] = "hot"
    startTime: Optional[int] = None
    endTime: Optional[int] = None
    metrics: Optional[List[str]] = None
    sources: Optional[List[str]] = None
    aggregation: Optional[str] = "5m"
    limit: Optional[int] = 5000


class StreamMetrics(BaseModel):
    processed_count: int
    dropped_count: int
    error_count: int
    avg_processing_time_ms: float
    current_queue_size: int
    max_queue_size: int
    backpressure_level: str
