from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from enum import Enum


class UserRole(str, Enum):
    admin = "admin"
    user = "user"


class DocumentStatus(str, Enum):
    uploading = "uploading"
    parsing = "parsing"
    completed = "completed"
    failed = "failed"


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserInfo"


class UserInfo(BaseModel):
    id: str
    username: str
    role: UserRole
    is_active: bool
    created_at: str


class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: UserRole = UserRole.user


class UpdateUserRequest(BaseModel):
    username: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class DocumentInfo(BaseModel):
    id: str
    filename: str
    file_type: str
    file_size: int
    status: DocumentStatus
    chunk_count: int
    created_at: str


class ChunkInfo(BaseModel):
    id: str
    content: str
    page_number: Optional[int] = None
    token_count: int
    content_hash: Optional[str] = None
    section: Optional[str] = None


class DocumentDetail(DocumentInfo):
    chunks: List[ChunkInfo] = []


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5
    threshold: float = 0.3


class SearchResult(BaseModel):
    chunk_id: str
    document_id: str
    filename: str
    content: str
    score: float
    page_number: Optional[int] = None


class SearchHistory(BaseModel):
    id: str
    query: str
    result_count: int
    created_at: str


class Source(BaseModel):
    chunk_id: str
    document_id: str
    filename: str
    content: str
    page_number: Optional[int] = None
    score: float


class ChatRequest(BaseModel):
    question: str
    conversation_id: Optional[str] = None


class Conversation(BaseModel):
    id: str
    title: str
    created_at: str
    updated_at: str


class Message(BaseModel):
    id: str
    role: str
    content: str
    sources: Optional[List[Source]] = None
    created_at: str


class StatsOverview(BaseModel):
    document_count: int
    vector_count: int
    query_count: int
    active_users: int


class PaginatedResponse(BaseModel):
    items: list
    total: int


LoginResponse.model_rebuild()
