from datetime import datetime
from enum import Enum
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field, field_serializer, field_validator
import json
import uuid


class ProtocolType(str, Enum):
    SERIAL = "serial"
    MQTT = "mqtt"
    HTTP = "http"


class MessageType(str, Enum):
    DATA = "data"
    CONTROL = "control"
    STATUS = "status"
    COMMAND = "command"


class ProtocolMessage(BaseModel):
    protocol: ProtocolType
    message_type: MessageType = MessageType.DATA
    source: str
    target: Optional[str] = None
    topic: Optional[str] = None
    payload: Dict[str, Any]
    timestamp: datetime = Field(default_factory=datetime.now)
    message_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    headers: Dict[str, str] = Field(default_factory=dict)
    raw_data: Optional[str] = None

    class Config:
        arbitrary_types_allowed = True

    @field_serializer('timestamp')
    def serialize_timestamp(self, value: datetime) -> str:
        return value.isoformat()

    @field_validator('payload', mode='before')
    @classmethod
    def validate_payload(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return {"raw": v}
        return v

    def to_dict(self) -> Dict[str, Any]:
        return {
            "protocol": self.protocol,
            "message_type": self.message_type,
            "source": self.source,
            "target": self.target,
            "topic": self.topic,
            "payload": self.payload,
            "timestamp": self.timestamp.isoformat(),
            "message_id": self.message_id,
            "headers": self.headers,
            "raw_data": self.raw_data
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ProtocolMessage':
        if isinstance(data.get('timestamp'), str):
            data['timestamp'] = datetime.fromisoformat(data['timestamp'])
        return cls(**data)


class ProtocolConfig(BaseModel):
    name: str
    enabled: bool = True


class SerialProtocolConfig(ProtocolConfig):
    port: str
    baudrate: int = 9600
    timeout: int = 1
    parity: str = "N"
    stopbits: int = 1
    bytesize: int = 8


class MQTTProtocolConfig(ProtocolConfig):
    host: str
    port: int = 1883
    username: Optional[str] = None
    password: Optional[str] = None
    keepalive: int = 60
    topics: list = Field(default_factory=list)


class HTTPProtocolConfig(ProtocolConfig):
    base_url: str
    timeout: int = 30
    headers: Dict[str, str] = Field(default_factory=dict)
