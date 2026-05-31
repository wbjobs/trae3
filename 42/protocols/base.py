from abc import ABC, abstractmethod
from typing import Any, Callable, Dict, Optional
from datetime import datetime
import uuid

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.logger import get_logger
from protocols.models import ProtocolMessage, ProtocolType, MessageType

logger = get_logger(__name__)


class ProtocolAdapter(ABC):
    def __init__(self, name: str):
        self.name = name
        self._connected = False
        self._message_callbacks: list = []
        self._error_callbacks: list = []

    @abstractmethod
    async def connect(self) -> bool:
        pass

    @abstractmethod
    async def disconnect(self) -> None:
        pass

    @abstractmethod
    async def send(self, message: ProtocolMessage) -> bool:
        pass

    @abstractmethod
    async def receive(self) -> Optional[ProtocolMessage]:
        pass

    @property
    def is_connected(self) -> bool:
        return self._connected

    def on_message(self, callback: Callable[[ProtocolMessage], None]) -> None:
        self._message_callbacks.append(callback)

    def on_error(self, callback: Callable[[Exception], None]) -> None:
        self._error_callbacks.append(callback)

    def _notify_message(self, message: ProtocolMessage) -> None:
        for callback in self._message_callbacks:
            try:
                callback(message)
            except Exception as e:
                logger.error(f"Message callback error: {e}")

    def _notify_error(self, error: Exception) -> None:
        for callback in self._error_callbacks:
            try:
                callback(error)
            except Exception as e:
                logger.error(f"Error callback error: {e}")

    def _create_message(
        self,
        protocol: ProtocolType,
        payload: Dict[str, Any],
        message_type: MessageType = MessageType.DATA,
        topic: Optional[str] = None,
        raw_data: Optional[bytes] = None
    ) -> ProtocolMessage:
        raw_data_str = raw_data.decode('utf-8', errors='replace') if raw_data else None
        return ProtocolMessage(
            protocol=protocol,
            message_type=message_type,
            source=self.name,
            topic=topic,
            payload=payload,
            timestamp=datetime.now(),
            raw_data=raw_data_str
        )


class ProtocolParser(ABC):
    @abstractmethod
    def parse(self, raw_data: bytes) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    def serialize(self, data: Dict[str, Any]) -> bytes:
        pass


class JSONParser(ProtocolParser):
    def parse(self, raw_data: bytes) -> Optional[Dict[str, Any]]:
        import json
        try:
            return json.loads(raw_data.decode('utf-8'))
        except Exception as e:
            logger.error(f"JSON parse error: {e}")
            return None

    def serialize(self, data: Dict[str, Any]) -> bytes:
        import json
        return json.dumps(data).encode('utf-8')
