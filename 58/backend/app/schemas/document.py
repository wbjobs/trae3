from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime


class OCRLine(BaseModel):
    text: str
    confidence: float
    bbox: List[List[float]]


class StructuredField(BaseModel):
    name: str
    value: str
    confidence: float


class DocumentStruct(BaseModel):
    title: str = ""
    date: str = ""
    sender: str = ""
    receiver: str = ""
    signature: str = ""
    content: str = ""
    keywords: List[str] = Field(default_factory=list)
    custom_fields: List[StructuredField] = Field(default_factory=list)


class OCRResult(BaseModel):
    raw_text: str
    lines: List[OCRLine]
    confidence: float


class ProcessResult(BaseModel):
    id: str
    filename: str
    original_image: str
    preprocessed_image: str
    ocr_result: OCRResult
    structured_data: DocumentStruct
    created_at: datetime
    processing_time: float


class DocumentRecord(BaseModel):
    id: str = Field(alias="_id")
    filename: str
    ocr_result: OCRResult
    structured_data: DocumentStruct
    created_at: datetime
    processing_time: float
    
    class Config:
        populate_by_name = True


class PaginatedResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[DocumentRecord]


class HealthResponse(BaseModel):
    status: str
    timestamp: datetime


class CorrectionRequest(BaseModel):
    ocr_result: Optional[OCRResult] = None
    structured_data: Optional[DocumentStruct] = None
    correction_note: Optional[str] = Field(None, max_length=500)


class BatchExportRequest(BaseModel):
    ids: List[str] = Field(default_factory=list)
    format: str = Field("json", pattern="^(json|csv|excel)$")
    include_images: bool = False
    keyword: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class BatchOperationResult(BaseModel):
    success_count: int
    failed_count: int
    failed_ids: List[str] = Field(default_factory=list)


class DbStats(BaseModel):
    total_documents: int
    avg_confidence: float
    avg_processing_time: float
    date_range: Dict[str, Optional[datetime]]
    query_count: int


class OcrStats(BaseModel):
    cache_hit_rate: float
    precision: str
    use_quantization: bool
    max_batch_size: int


class SystemStatsResponse(BaseModel):
    db_stats: DbStats
    ocr_stats: OcrStats

