from typing import Dict, Optional, List, Callable
import asyncio

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.logger import get_logger
from core.config import get_config
from protocols.base import ProtocolAdapter
from protocols.models import (
    ProtocolMessage,
    ProtocolType,
    SerialProtocolConfig,
    MQTTProtocolConfig,
    HTTPProtocolConfig
)

try:
    from protocols.serial_adapter import SerialAdapter
except ImportError:
    SerialAdapter = None

try:
    from protocols.mqtt_adapter import MQTTAdapter
except ImportError:
    MQTTAdapter = None

try:
    from protocols.http_adapter import HTTPAdapter
except ImportError:
    HTTPAdapter = None

logger = get_logger(__name__)


class ProtocolManager:
    def __init__(self):
        self._adapters: Dict[str, ProtocolAdapter] = {}
        self._message_callbacks: List[Callable[[ProtocolMessage], None]] = []
        self._config = get_config()

    async def initialize(self) -> None:
        logger.info("Initializing protocol managers...")
        
        if SerialAdapter:
            for serial_config in self._config.serial.ports:
                await self.add_serial_adapter(serial_config)
        
        if MQTTAdapter:
            for mqtt_broker in self._config.mqtt.brokers:
                mqtt_config = MQTTProtocolConfig(
                    name=mqtt_broker.name,
                    host=mqtt_broker.host,
                    port=mqtt_broker.port,
                    username=mqtt_broker.username,
                    password=mqtt_broker.password,
                    keepalive=mqtt_broker.keepalive,
                    topics=self._config.mqtt.topics
                )
                await self.add_mqtt_adapter(mqtt_config)

        logger.info(f"Initialized {len(self._adapters)} protocol adapters")

    async def add_serial_adapter(self, config: SerialProtocolConfig) -> Optional[SerialAdapter]:
        if not SerialAdapter:
            logger.warning("SerialAdapter not available (pyserial not installed)")
            return None
        adapter = SerialAdapter(config)
        if await adapter.connect():
            adapter.on_message(self._on_message)
            adapter.on_error(self._on_error)
            self._adapters[config.name] = adapter
            return adapter
        return None

    async def add_mqtt_adapter(self, config: MQTTProtocolConfig) -> Optional[MQTTAdapter]:
        if not MQTTAdapter:
            logger.warning("MQTTAdapter not available (paho-mqtt not installed)")
            return None
        adapter = MQTTAdapter(config)
        if await adapter.connect():
            adapter.on_message(self._on_message)
            adapter.on_error(self._on_error)
            self._adapters[config.name] = adapter
            return adapter
        return None

    async def add_http_adapter(self, config: HTTPProtocolConfig) -> Optional[HTTPAdapter]:
        if not HTTPAdapter:
            logger.warning("HTTPAdapter not available (httpx/tenacity not installed)")
            return None
        adapter = HTTPAdapter(config)
        if await adapter.connect():
            adapter.on_message(self._on_message)
            adapter.on_error(self._on_error)
            self._adapters[config.name] = adapter
            return adapter
        return None

    def _on_message(self, message: ProtocolMessage) -> None:
        for callback in self._message_callbacks:
            try:
                callback(message)
            except Exception as e:
                logger.error(f"Message callback error: {e}")

    def _on_error(self, error: Exception) -> None:
        logger.error(f"Protocol error: {error}")

    def on_message(self, callback: Callable[[ProtocolMessage], None]) -> None:
        self._message_callbacks.append(callback)

    def get_adapter(self, name: str) -> Optional[ProtocolAdapter]:
        return self._adapters.get(name)

    def get_adapters_by_type(self, protocol_type: ProtocolType) -> List[ProtocolAdapter]:
        return [
            adapter for adapter in self._adapters.values()
            if adapter.name.startswith(protocol_type.value) or 
               hasattr(adapter, 'config') and 
               isinstance(adapter.config, (SerialProtocolConfig if protocol_type == ProtocolType.SERIAL 
                   else MQTTProtocolConfig if protocol_type == ProtocolType.MQTT 
                   else HTTPProtocolConfig))
        ]

    async def send(self, adapter_name: str, message: ProtocolMessage) -> bool:
        adapter = self.get_adapter(adapter_name)
        if not adapter:
            logger.error(f"Adapter {adapter_name} not found")
            return False
        return await adapter.send(message)

    async def broadcast(self, message: ProtocolMessage, adapter_names: Optional[List[str]] = None) -> Dict[str, bool]:
        results = {}
        adapters = adapter_names or list(self._adapters.keys())
        for name in adapters:
            results[name] = await self.send(name, message)
        return results

    async def shutdown(self) -> None:
        logger.info("Shutting down protocol managers...")
        for name, adapter in self._adapters.items():
            try:
                await adapter.disconnect()
                logger.info(f"Adapter {name} disconnected")
            except Exception as e:
                logger.error(f"Error disconnecting adapter {name}: {e}")
        self._adapters.clear()

    @property
    def adapters(self) -> Dict[str, ProtocolAdapter]:
        return self._adapters.copy()
