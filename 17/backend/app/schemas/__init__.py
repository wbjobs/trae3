from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime, date


class ApiResponse(BaseModel):
    code: int = Field(default=200, description="响应状态码")
    message: str = Field(default="success", description="响应消息")
    data: Optional[Any] = Field(default=None, description="响应数据")
    timestamp: int = Field(default_factory=lambda: int(datetime.utcnow().timestamp() * 1000))

    model_config = ConfigDict(from_attributes=True)


class TimeSeriesPoint(BaseModel):
    timestamp: int = Field(description="时间戳(毫秒)")
    value: float = Field(description="数值")


class ComponentBase(BaseModel):
    id: str
    array_id: str
    name: str
    row_position: int
    col_position: int
    rated_voltage: Optional[float] = 36.5
    rated_current: Optional[float] = 9.5
    max_temperature: Optional[float] = 85.0
    status: Optional[str] = "normal"
    installed_at: Optional[datetime] = None


class Component(ComponentBase):
    model_config = ConfigDict(from_attributes=True)


class ComponentData(BaseModel):
    component_id: str
    array_id: str
    group_id: Optional[str] = None
    voltage: List[TimeSeriesPoint] = Field(default_factory=list)
    current: List[TimeSeriesPoint] = Field(default_factory=list)
    temperature: List[TimeSeriesPoint] = Field(default_factory=list)


class KeyMetrics(BaseModel):
    total_generation: float = Field(description="总发电量(kWh)")
    current_power: float = Field(description="当前功率(kW)")
    efficiency: float = Field(description="转换效率(%)")
    online_rate: float = Field(description="在线率(%)")
    fault_count: int = Field(description="故障数量")
    temperature_avg: float = Field(description="平均温度(°C)")


class TimeSeriesQueryParams(BaseModel):
    component_ids: List[str] = Field(description="组件ID列表")
    metrics: List[str] = Field(description="指标类型: voltage, current, temperature")
    start_time: int = Field(description="开始时间戳(毫秒)")
    end_time: int = Field(description="结束时间戳(毫秒)")
    step: Optional[str] = Field(default="5m", description="采样间隔")
    downsample: Optional[bool] = Field(default=True, description="是否降采样")
    pre_aggregate: Optional[str] = Field(default=None, description="预聚合级别: hour, day")
    offset: Optional[int] = Field(default=0, description="分页偏移量")
    limit: Optional[int] = Field(default=None, description="分页限制")


class FaultRecordBase(BaseModel):
    component_id: str
    fault_type: str = Field(description="故障类型: voltage_abnormal, current_abnormal, temperature_high, offline, short_circuit")
    severity: Optional[str] = Field(default="medium", description="严重程度: low, medium, high, critical")
    start_time: datetime
    end_time: Optional[datetime] = None
    status: Optional[str] = Field(default="active", description="状态: active, resolved, ignored")
    description: Optional[str] = None
    threshold_value: Optional[float] = None
    actual_value: Optional[float] = None


class FaultRecord(FaultRecordBase):
    id: str
    location: Optional[Dict[str, int]] = None

    model_config = ConfigDict(from_attributes=True)


class FaultQueryParams(BaseModel):
    start_time: Optional[int] = None
    end_time: Optional[int] = None
    severity: Optional[List[str]] = None
    fault_type: Optional[List[str]] = None
    status: Optional[List[str]] = None
    component_id: Optional[str] = None
    page: Optional[int] = Field(default=1, ge=1)
    page_size: Optional[int] = Field(default=20, ge=1, le=1000)


class FaultStatisticsItem(BaseModel):
    name: str
    value: int
    percentage: Optional[float] = None


class FaultStatistics(BaseModel):
    total: int
    by_type: List[FaultStatisticsItem] = Field(default_factory=list)
    by_severity: List[FaultStatisticsItem] = Field(default_factory=list)
    by_component: List[FaultStatisticsItem] = Field(default_factory=list)
    by_time: List[Dict[str, Any]] = Field(default_factory=list)


class FaultHeatmapData(BaseModel):
    row: int
    col: int
    fault_count: int
    fault_types: List[str]
    component_id: str


class ArrayGroupBase(BaseModel):
    name: str
    description: Optional[str] = None
    component_ids: List[str] = Field(default_factory=list)


class ArrayGroupCreate(ArrayGroupBase):
    pass


class ArrayGroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    component_ids: Optional[List[str]] = None


class ArrayGroup(ArrayGroupBase):
    id: str
    created_at: datetime
    updated_at: datetime
    array_ids: List[str] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class GroupStatisticsData(BaseModel):
    group_id: str
    group_name: str
    start_time: datetime
    end_time: datetime
    total_generation: float
    avg_efficiency: float
    fault_count: int
    avg_temperature: float
    online_rate: float
    component_count: int


class GroupComparisonItem(BaseModel):
    group_id: str
    group_name: str
    metrics: Dict[str, float]


class OperationReportBase(BaseModel):
    name: str
    type: str = Field(description="报表类型: daily, weekly, monthly, yearly, custom")
    format: str = Field(description="报表格式: pdf, excel")
    start_time: int
    end_time: int
    group_ids: Optional[List[str]] = None


class OperationReportCreate(OperationReportBase):
    pass


class OperationReport(OperationReportBase):
    id: str
    status: str = Field(description="状态: generating, completed, failed")
    download_url: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DataCleaningParams(BaseModel):
    component_ids: Optional[List[str]] = None
    start_time: int
    end_time: int
    remove_outliers: Optional[bool] = True
    fill_missing: Optional[bool] = True
    fill_method: Optional[str] = Field(default="linear", description="插值方法: linear, time, nearest")
    smooth_data: Optional[bool] = False
    smooth_window: Optional[int] = 5


class CleaningResult(BaseModel):
    component_id: str
    original_points: int
    cleaned_points: int
    removed_outliers: int
    filled_missing: int
    data_quality_score: float
