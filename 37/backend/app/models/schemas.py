from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class DeviceBase(BaseModel):
    device_code: str
    device_name: str
    device_type: Optional[str] = None
    location: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    status: Optional[str] = "running"
    description: Optional[str] = None


class DeviceCreate(DeviceBase):
    pass


class DeviceUpdate(BaseModel):
    device_name: Optional[str] = None
    device_type: Optional[str] = None
    location: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    status: Optional[str] = None
    description: Optional[str] = None


class DeviceResponse(DeviceBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class VibrationDataBase(BaseModel):
    device_code: str
    timestamp: datetime
    x_axis: float
    y_axis: float
    z_axis: float
    temperature: Optional[float] = None
    speed: Optional[float] = None
    sample_rate: Optional[int] = 1000


class VibrationDataCreate(VibrationDataBase):
    pass


class VibrationDataResponse(VibrationDataBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class AnalysisResultBase(BaseModel):
    device_code: str
    start_time: datetime
    end_time: datetime
    rms_x: Optional[float] = None
    rms_y: Optional[float] = None
    rms_z: Optional[float] = None
    peak_x: Optional[float] = None
    peak_y: Optional[float] = None
    peak_z: Optional[float] = None
    crest_factor_x: Optional[float] = None
    crest_factor_y: Optional[float] = None
    crest_factor_z: Optional[float] = None
    kurtosis_x: Optional[float] = None
    kurtosis_y: Optional[float] = None
    kurtosis_z: Optional[float] = None
    skewness_x: Optional[float] = None
    skewness_y: Optional[float] = None
    skewness_z: Optional[float] = None
    dominant_frequency_x: Optional[float] = None
    dominant_frequency_y: Optional[float] = None
    dominant_frequency_z: Optional[float] = None
    harmonic_data: Optional[Dict[str, Any]] = None
    fft_data: Optional[Dict[str, Any]] = None


class AnalysisResultResponse(AnalysisResultBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class AnomalyRecordBase(BaseModel):
    device_code: str
    timestamp: datetime
    anomaly_type: str
    severity: Optional[str] = "warning"
    axis: Optional[str] = None
    value: Optional[float] = None
    threshold: Optional[float] = None
    description: Optional[str] = None
    raw_data: Optional[Dict[str, Any]] = None
    status: Optional[str] = "pending"


class AnomalyRecordCreate(AnomalyRecordBase):
    pass


class AnomalyRecordResponse(AnomalyRecordBase):
    id: int
    created_at: datetime
    handled_by: Optional[str] = None
    handled_at: Optional[datetime] = None
    handle_notes: Optional[str] = None

    class Config:
        from_attributes = True


class ReportBase(BaseModel):
    report_name: str
    report_type: str
    device_code: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    file_format: Optional[str] = "xlsx"


class ReportCreate(ReportBase):
    parameters: Optional[Dict[str, Any]] = None


class ReportResponse(ReportBase):
    id: int
    file_path: Optional[str] = None
    file_size: Optional[int] = None
    created_by: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class TimeRangeQuery(BaseModel):
    device_code: str
    start_time: datetime
    end_time: datetime


class AnalysisQuery(BaseModel):
    device_code: str
    start_time: datetime
    end_time: datetime
    analysis_types: Optional[List[str]] = None


class PaginationResponse(BaseModel):
    total: int
    page: int
    page_size: int
    data: List[Any]
