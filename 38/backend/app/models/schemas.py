from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class Entity(BaseModel):
    id: str
    name: str
    type: str
    description: Optional[str] = ""
    source_doc: Optional[str] = ""
    confidence: Optional[float] = 0.0


class Relation(BaseModel):
    id: str
    source: str
    target: str
    relation_type: str
    description: Optional[str] = ""
    confidence: Optional[float] = 0.0


class ParsedContent(BaseModel):
    doc_id: str
    filename: str
    text_content: str
    images: list[str] = []
    page_count: int = 0
    parsed_at: datetime = datetime.now()


class ExtractionResult(BaseModel):
    doc_id: str
    entities: list[Entity] = []
    relations: list[Relation] = []
    extracted_at: datetime = datetime.now()


class GraphData(BaseModel):
    nodes: list[dict] = []
    edges: list[dict] = []


class UploadResponse(BaseModel):
    doc_id: str
    filename: str
    status: str
    message: str


class BatchUploadResponse(BaseModel):
    results: list[UploadResponse] = []
    total: int
    success_count: int
    fail_count: int


class TaskStatus(BaseModel):
    task_id: str
    status: str
    progress: float = 0.0
    message: str = ""
    result: Optional[dict] = None


class EntityUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None


class RelationUpdate(BaseModel):
    source: Optional[str] = None
    target: Optional[str] = None
    relation_type: Optional[str] = None
    description: Optional[str] = None
