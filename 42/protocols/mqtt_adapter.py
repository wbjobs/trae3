import asyncio
import paho.mqtt.client as mqtt
from typing import Optional, Dict, Any
import threading

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.logger import get_logger
from protocols.base import ProtocolAdapter, JSONParser, ProtocolParser
from protocols.models import ProtocolType, ProtocolMessage, MQTTProtocolConfig, MessageType

logger = get_logger(__name__)


class MQTTAdapter(ProtocolAdapter):
    def __init__(
        self,
        config: MQTTProtocolConfig,
        parser: Optional[ProtocolParser] = None
    ):
        super().__init__(config.name)
        self.config = config
        self.parser = parser or JSONParser()
        self._client: Optional[mqtt.Client] = None
        self._loop_thread: Optional[threading.Thread] = None
        self._running = False

    async def connect(self) -> bool:
        try:
            self._client = mqtt.Client(client_id=self.config.name)
            
            if self.config.username and self.config.password:
                self._client.username_pw_set(
                    self.config.username,
                    self.config.password
                )
            
            self._client.on_connect = self._on_connect
            self._client.on_message = self._on_message
            self._client.on_disconnect = self._on_disconnect
            self._client.on_error = self._on_error

            self._client.connect(
                self.config.host,
                self.config.port,
                self.config.keepalive
            )

            self._running = True
            self._loop_thread = threading.Thread(target=self._loop_forever, daemon=True)
            self._loop_thread.start()

            await asyncio.sleep(1)
            
            if self._connected:
                logger.info(f"MQTT client {self.config.name} connected to {self.config.host}:{self.config.port}")
                return True
            else:
                logger.error(f"MQTT client {self.config.name} connection timeout")
                return False
                
        except Exception as e:
            logger.error(f"Failed to connect MQTT: {e}")
            self._connected = False
            return False

    def _loop_forever(self) -> None:
        while self._running:
            try:
                self._client.loop(timeout=1.0)
            except Exception as e:
                logger.error(f"MQTT loop error: {e}")
                if not self._connected:
                    break

    def _on_connect(self, client, userdata, flags, rc) -> None:
        if rc == 0:
            self._connected = True
            logger.info(f"MQTT connected with result code {rc}")
            for topic in self.config.topics:
                client.subscribe(topic)
                logger.info(f"Subscribed to topic: {topic}")
        else:
            logger.error(f"MQTT connection failed with result code {rc}")
            self._connected = False

    def _on_message(self, client, userdata, msg) -> None:
        try:
            payload = self.parser.parse(msg.payload)
            if payload:
                message_type = self._detect_message_type(msg.topic)
                message = self._create_message(
                    protocol=ProtocolType.MQTT,
                    payload=payload,
                    message_type=message_type,
                    topic=msg.topic,
                    raw_data=msg.payload
                )
                self._notify_message(message)
        except Exception as e:
            logger.error(f"MQTT message processing error: {e}")

    def _detect_message_type(self, topic: str) -> MessageType:
        topic_lower = topic.lower()
        if 'status' in topic_lower:
            return MessageType.STATUS
        elif 'command' in topic_lower:
            return MessageType.COMMAND
        elif 'control' in topic_lower:
            return MessageType.CONTROL
        else:
            return MessageType.DATA

    def _on_disconnect(self, client, userdata, rc) -> None:
        self._connected = False
        logger.warning(f"MQTT disconnected with result code {rc}")

    def _on_error(self, client, userdata, rc) -> None:
        logger.error(f"MQTT error: {rc}")
        self._notify_error(Exception(f"MQTT error: {rc}"))

    async def disconnect(self) -> None:
        self._running = False
        if self._client:
            self._client.disconnect()
        if self._loop_thread:
            self._loop_thread.join(timeout=2)
        self._connected = False
        logger.info(f"MQTT client {self.config.name} disconnected")

    async def send(self, message: ProtocolMessage) -> bool:
        if not self._connected or not self._client:
            logger.error("MQTT client not connected")
            return False
        
        try:
            topic = message.topic or f"device/{message.target}/data"
            raw_data = self.parser.serialize(message.payload)
            result = self._client.publish(topic, raw_data)
            
            if result.rc == mqtt.MQTT_ERR_SUCCESS:
                logger.debug(f"MQTT published to {topic}: {raw_data}")
                return True
            else:
                logger.error(f"MQTT publish failed with code {result.rc}")
                return False
        except Exception as e:
            logger.error(f"MQTT send error: {e}")
            self._notify_error(e)
            return False

    async def receive(self) -> Optional[ProtocolMessage]:
        return None

    def subscribe(self, topic: str) -> None:
        if self._client and self._connected:
            self._client.subscribe(topic)
            logger.info(f"Subscribed to topic: {topic}")

    def unsubscribe(self, topic: str) -> None:
        if self._client and self._connected:
            self._client.unsubscribe(topic)
            logger.info(f"Unsubscribed from topic: {topic}")
