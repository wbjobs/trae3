from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class TopicConfig(BaseModel):
    id: Optional[int] = Field(default=None)
    name: str
    partitions: int = Field(default=3)
    replicas: int = Field(default=1)
    retention_ms: int = Field(default=86400000)
    description: Optional[str] = Field(default=None)
    status: str = Field(default="active")
    created_at: Optional[datetime] = Field(default=None)
    updated_at: Optional[datetime] = Field(default=None)

    def to_dict(self) -> Dict[str, Any]:
        data = self.model_dump()
        if self.created_at:
            data['created_at'] = self.created_at.strftime('%Y-%m-%d %H:%M:%S')
        if self.updated_at:
            data['updated_at'] = self.updated_at.strftime('%Y-%m-%d %H:%M:%S')
        return data


class ConsumerConfig(BaseModel):
    id: Optional[int] = Field(default=None)
    group_id: str
    topic_name: str
    consumer_type: str = Field(default="regular")
    auto_commit: bool = Field(default=True)
    auto_commit_interval_ms: int = Field(default=5000)
    description: Optional[str] = Field(default=None)
    status: str = Field(default="active")
    created_at: Optional[datetime] = Field(default=None)
    updated_at: Optional[datetime] = Field(default=None)

    def to_dict(self) -> Dict[str, Any]:
        data = self.model_dump()
        if self.created_at:
            data['created_at'] = self.created_at.strftime('%Y-%m-%d %H:%M:%S')
        if self.updated_at:
            data['updated_at'] = self.updated_at.strftime('%Y-%m-%d %H:%M:%S')
        return data


class SystemConfig(BaseModel):
    id: Optional[int] = Field(default=None)
    key: str
    value: str
    description: Optional[str] = Field(default=None)
    created_at: Optional[datetime] = Field(default=None)
    updated_at: Optional[datetime] = Field(default=None)

    def to_dict(self) -> Dict[str, Any]:
        data = self.model_dump()
        if self.created_at:
            data['created_at'] = self.created_at.strftime('%Y-%m-%d %H:%M:%S')
        if self.updated_at:
            data['updated_at'] = self.updated_at.strftime('%Y-%m-%d %H:%M:%S')
        return data
