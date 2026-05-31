from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class OCRLine(BaseModel):
    text: str
    confidence: float
    position: Optional[List[List[float]]] = None


class OCRResult(BaseModel):
    lines: List[OCRLine]
    raw_text: str
    average_confidence: float


class ExtractedInfo(BaseModel):
    equipment_name: Optional[str] = None
    equipment_model: Optional[str] = None
    serial_number: Optional[str] = None
    manufacturer: Optional[str] = None
    production_date: Optional[str] = None
    rated_power: Optional[str] = None
    rated_voltage: Optional[str] = None
    rated_current: Optional[str] = None
    weight: Optional[str] = None
    dimensions: Optional[str] = None
    inspection_cycle: Optional[str] = None


class NameplateRecordBase(BaseModel):
    filename: str
    original_path: str
    processed_path: Optional[str] = None
    equipment_name: Optional[str] = None
    equipment_model: Optional[str] = None
    serial_number: Optional[str] = None
    manufacturer: Optional[str] = None
    production_date: Optional[str] = None
    rated_power: Optional[str] = None
    rated_voltage: Optional[str] = None
    rated_current: Optional[str] = None
    weight: Optional[str] = None
    dimensions: Optional[str] = None
    inspection_cycle: Optional[str] = None
    raw_text: Optional[str] = None
    confidence: float = 0.0
    ocr_result: Optional[str] = None
    status: str = "pending"


class NameplateRecordCreate(NameplateRecordBase):
    pass


class NameplateRecordUpdate(BaseModel):
    equipment_name: Optional[str] = None
    equipment_model: Optional[str] = None
    serial_number: Optional[str] = None
    manufacturer: Optional[str] = None
    production_date: Optional[str] = None
    rated_power: Optional[str] = None
    rated_voltage: Optional[str] = None
    rated_current: Optional[str] = None
    weight: Optional[str] = None
    dimensions: Optional[str] = None
    inspection_cycle: Optional[str] = None
    status: Optional[str] = None


class NameplateRecordResponse(NameplateRecordBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class RecognitionResponse(BaseModel):
    success: bool
    record_id: int
    ocr_result: OCRResult
    extracted_info: ExtractedInfo
    message: str


class UploadResponse(BaseModel):
    success: bool
    file_id: str
    filename: str
    file_path: str
    message: str


class RecordListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    records: List[NameplateRecordResponse]


class ManualCorrection(BaseModel):
    equipment_name: Optional[str] = None
    equipment_model: Optional[str] = None
    serial_number: Optional[str] = None
    manufacturer: Optional[str] = None
    production_date: Optional[str] = None
    rated_power: Optional[str] = None
    rated_voltage: Optional[str] = None
    rated_current: Optional[str] = None
    weight: Optional[str] = None
    dimensions: Optional[str] = None
    inspection_cycle: Optional[str] = None
    corrected_by: Optional[str] = "system"
    correction_note: Optional[str] = None


class CorrectionResponse(BaseModel):
    success: bool
    record_id: int
    corrected_fields: List[str]
    message: str


class BatchExportRequest(BaseModel):
    record_ids: Optional[List[int]] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: Optional[str] = None
    export_format: str = "excel"


class ExportFileResponse(BaseModel):
    success: bool
    file_url: str
    filename: str
    total_records: int
    message: str
