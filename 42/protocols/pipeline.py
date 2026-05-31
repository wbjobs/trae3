from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Callable
from datetime import datetime
from enum import Enum
import struct
import json

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.logger import get_logger
from protocols.models import ProtocolMessage, ProtocolType, MessageType

logger = get_logger(__name__)


class CodecType(str, Enum):
    JSON = "json"
    BINARY = "binary"
    CSV = "csv"
    RAW = "raw"
    CUSTOM = "custom"


class MessageTransformer(ABC):
    @abstractmethod
    def transform(self, message: ProtocolMessage) -> ProtocolMessage:
        pass

    @abstractmethod
    def reverse_transform(self, message: ProtocolMessage) -> ProtocolMessage:
        pass


class FieldMappingTransformer(MessageTransformer):
    def __init__(self, field_map: Dict[str, str], reverse_map: Optional[Dict[str, str]] = None):
        self.field_map = field_map
        self.reverse_map = reverse_map or {v: k for k, v in field_map.items()}

    def transform(self, message: ProtocolMessage) -> ProtocolMessage:
        new_payload = {}
        for src_field, dst_field in self.field_map.items():
            if src_field in message.payload:
                new_payload[dst_field] = message.payload[src_field]
            else:
                new_payload[src_field] = message.payload.get(src_field)
        for key, value in message.payload.items():
            if key not in self.field_map and key not in new_payload:
                new_payload[key] = value
        message.payload = new_payload
        return message

    def reverse_transform(self, message: ProtocolMessage) -> ProtocolMessage:
        new_payload = {}
        for src_field, dst_field in self.reverse_map.items():
            if src_field in message.payload:
                new_payload[dst_field] = message.payload[src_field]
        for key, value in message.payload.items():
            if key not in self.reverse_map and key not in new_payload:
                new_payload[key] = value
        message.payload = new_payload
        return message


class TimestampEnricherTransformer(MessageTransformer):
    def transform(self, message: ProtocolMessage) -> ProtocolMessage:
        message.payload["_ingest_timestamp"] = datetime.now().isoformat()
        message.payload["_source_protocol"] = message.protocol.value if hasattr(message.protocol, 'value') else str(message.protocol)
        return message

    def reverse_transform(self, message: ProtocolMessage) -> ProtocolMessage:
        message.payload.pop("_ingest_timestamp", None)
        message.payload.pop("_source_protocol", None)
        return message


class ProtocolConverterTransformer(MessageTransformer):
    def __init__(self, source_protocol: ProtocolType, target_protocol: ProtocolType):
        self.source_protocol = source_protocol
        self.target_protocol = target_protocol

    def transform(self, message: ProtocolMessage) -> ProtocolMessage:
        if message.protocol == self.source_protocol:
            message.headers["x-original-protocol"] = message.protocol.value if hasattr(message.protocol, 'value') else str(message.protocol)
            message.protocol = self.target_protocol
            if not message.topic and self.target_protocol == ProtocolType.MQTT:
                message.topic = f"converted/{message.source}/data"
            elif not message.headers.get("endpoint") and self.target_protocol == ProtocolType.HTTP:
                message.headers["endpoint"] = "/data"
                message.headers["method"] = "POST"
        return message

    def reverse_transform(self, message: ProtocolMessage) -> ProtocolMessage:
        original = message.headers.pop("x-original-protocol", None)
        if original:
            try:
                message.protocol = ProtocolType(original)
            except ValueError:
                pass
        return message


class Codec(ABC):
    @abstractmethod
    def encode(self, data: Dict[str, Any]) -> bytes:
        pass

    @abstractmethod
    def decode(self, raw_data: bytes) -> Optional[Dict[str, Any]]:
        pass

    @property
    @abstractmethod
    def codec_type(self) -> CodecType:
        pass


class JSONCodec(Codec):
    @property
    def codec_type(self) -> CodecType:
        return CodecType.JSON

    def encode(self, data: Dict[str, Any]) -> bytes:
        return json.dumps(data, ensure_ascii=False).encode('utf-8')

    def decode(self, raw_data: bytes) -> Optional[Dict[str, Any]]:
        try:
            return json.loads(raw_data.decode('utf-8'))
        except Exception as e:
            logger.error(f"JSON decode error: {e}")
            return None


class BinaryCodec(Codec):
    def __init__(self, format_string: str = "!I", field_names: Optional[List[str]] = None):
        self.format_string = format_string
        self.field_names = field_names or ["value"]

    @property
    def codec_type(self) -> CodecType:
        return CodecType.BINARY

    def encode(self, data: Dict[str, Any]) -> bytes:
        try:
            values = [data.get(name, 0) for name in self.field_names]
            return struct.pack(self.format_string, *values)
        except Exception as e:
            logger.error(f"Binary encode error: {e}")
            return b''

    def decode(self, raw_data: bytes) -> Optional[Dict[str, Any]]:
        try:
            expected_size = struct.calcsize(self.format_string)
            if len(raw_data) < expected_size:
                logger.error(f"Binary decode: insufficient data, got {len(raw_data)}, need {expected_size}")
                return None
            values = struct.unpack(self.format_string, raw_data[:expected_size])
            return dict(zip(self.field_names, values))
        except Exception as e:
            logger.error(f"Binary decode error: {e}")
            return None


class CSVCodec(Codec):
    def __init__(self, delimiter: str = ",", field_names: Optional[List[str]] = None):
        self.delimiter = delimiter
        self.field_names = field_names

    @property
    def codec_type(self) -> CodecType:
        return CodecType.CSV

    def encode(self, data: Dict[str, Any]) -> bytes:
        try:
            if self.field_names:
                values = [str(data.get(name, "")) for name in self.field_names]
            else:
                values = [str(v) for v in data.values()]
            return self.delimiter.join(values).encode('utf-8')
        except Exception as e:
            logger.error(f"CSV encode error: {e}")
            return b''

    def decode(self, raw_data: bytes) -> Optional[Dict[str, Any]]:
        try:
            text = raw_data.decode('utf-8').strip()
            values = text.split(self.delimiter)
            if self.field_names and len(self.field_names) == len(values):
                return dict(zip(self.field_names, values))
            return {f"field_{i}": v for i, v in enumerate(values)}
        except Exception as e:
            logger.error(f"CSV decode error: {e}")
            return None


class RawCodec(Codec):
    @property
    def codec_type(self) -> CodecType:
        return CodecType.RAW

    def encode(self, data: Dict[str, Any]) -> bytes:
        return data.get("raw", b"")

    def decode(self, raw_data: bytes) -> Optional[Dict[str, Any]]:
        return {"raw": raw_data.hex()}


class PipelineStage:
    def __init__(self, name: str, handler: Callable[[ProtocolMessage], ProtocolMessage], enabled: bool = True):
        self.name = name
        self.handler = handler
        self.enabled = enabled

    def process(self, message: ProtocolMessage) -> ProtocolMessage:
        if not self.enabled:
            return message
        return self.handler(message)


class ProtocolPipeline:
    def __init__(self, name: str, codec: Optional[Codec] = None):
        self.name = name
        self.codec = codec or JSONCodec()
        self._stages: List[PipelineStage] = []
        self._transformers: List[MessageTransformer] = []

    def add_stage(self, name: str, handler: Callable[[ProtocolMessage], ProtocolMessage]) -> 'ProtocolPipeline':
        self._stages.append(PipelineStage(name, handler))
        return self

    def add_transformer(self, transformer: MessageTransformer) -> 'ProtocolPipeline':
        self._transformers.append(transformer)
        return self

    def enable_stage(self, name: str) -> bool:
        for stage in self._stages:
            if stage.name == name:
                stage.enabled = True
                return True
        return False

    def disable_stage(self, name: str) -> bool:
        for stage in self._stages:
            if stage.name == name:
                stage.enabled = False
                return True
        return False

    def process_inbound(self, raw_data: bytes) -> Optional[ProtocolMessage]:
        payload = self.codec.decode(raw_data)
        if payload is None:
            logger.error(f"Pipeline {self.name}: codec decode failed")
            return None

        message = ProtocolMessage(
            protocol=ProtocolType.HTTP,
            source=self.name,
            payload=payload,
            raw_data=raw_data.decode('utf-8', errors='replace') if isinstance(raw_data, bytes) else raw_data
        )

        for transformer in self._transformers:
            try:
                message = transformer.transform(message)
            except Exception as e:
                logger.error(f"Pipeline {self.name}: transformer error: {e}")

        for stage in self._stages:
            try:
                message = stage.process(message)
            except Exception as e:
                logger.error(f"Pipeline {self.name}: stage {stage.name} error: {e}")

        return message

    def process_outbound(self, message: ProtocolMessage) -> Optional[bytes]:
        for i in range(len(self._transformers) - 1, -1, -1):
            try:
                message = self._transformers[i].reverse_transform(message)
            except Exception as e:
                logger.error(f"Pipeline {self.name}: reverse transformer error: {e}")

        return self.codec.encode(message.payload)

    def get_stage_info(self) -> List[Dict[str, Any]]:
        return [
            {"name": s.name, "enabled": s.enabled}
            for s in self._stages
        ]

    def get_transformer_info(self) -> List[str]:
        return [type(t).__name__ for t in self._transformers]


class PipelineRegistry:
    def __init__(self):
        self._pipelines: Dict[str, ProtocolPipeline] = {}

    def register(self, pipeline: ProtocolPipeline) -> None:
        self._pipelines[pipeline.name] = pipeline
        logger.info(f"Registered pipeline: {pipeline.name}")

    def unregister(self, name: str) -> bool:
        if name in self._pipelines:
            del self._pipelines[name]
            logger.info(f"Unregistered pipeline: {name}")
            return True
        return False

    def get(self, name: str) -> Optional[ProtocolPipeline]:
        return self._pipelines.get(name)

    def get_pipeline_for_protocol(self, protocol: ProtocolType) -> Optional[ProtocolPipeline]:
        pipeline = self._pipelines.get(protocol.value)
        if pipeline:
            return pipeline
        return self._pipelines.get("default")

    def list_pipelines(self) -> Dict[str, Dict[str, Any]]:
        result = {}
        for name, pipeline in self._pipelines.items():
            result[name] = {
                "codec": pipeline.codec.codec_type.value if hasattr(pipeline.codec, 'codec_type') else "unknown",
                "stages": pipeline.get_stage_info(),
                "transformers": pipeline.get_transformer_info()
            }
        return result

    @property
    def pipelines(self) -> Dict[str, ProtocolPipeline]:
        return self._pipelines.copy()
