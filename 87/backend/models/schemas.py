from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class SensorData(BaseModel):
    timestamp: Optional[str] = None
    device_id: str
    temperature: float
    vibration: float
    pressure: float
    rpm: float
    current: float


class DataQuery(BaseModel):
    device_id: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    parameters: Optional[List[str]] = None
    limit: int = 500


class MetricResult(BaseModel):
    device_id: str
    parameter: str
    mean: float
    std: float
    min_val: float
    max_val: float
    trend: str
    zscore_anomalies: int
    window_seconds: int
    computed_at: str


class FaultAlert(BaseModel):
    id: Optional[str] = None
    device_id: str
    fault_type: str
    parameter: str
    value: float
    threshold: float
    severity: str
    message: str
    timestamp: str
    acknowledged: bool = False


class FilterParams(BaseModel):
    device_id: Optional[str] = None
    fault_type: Optional[str] = None
    severity: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    acknowledged: Optional[bool] = None
