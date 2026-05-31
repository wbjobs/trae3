import asyncio
import serial
from typing import Optional, Dict, Any
import threading
import time

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.logger import get_logger
from protocols.base import ProtocolAdapter, JSONParser, ProtocolParser
from protocols.models import ProtocolType, ProtocolMessage, SerialProtocolConfig

logger = get_logger(__name__)


class SerialAdapter(ProtocolAdapter):
    def __init__(
        self,
        config: SerialProtocolConfig,
        parser: Optional[ProtocolParser] = None
    ):
        super().__init__(config.name)
        self.config = config
        self.parser = parser or JSONParser()
        self._serial: Optional[serial.Serial] = None
        self._receive_task: Optional[threading.Thread] = None
        self._running = False
        self._buffer = bytearray()
        self._delimiter = b'\n'

    async def connect(self) -> bool:
        try:
            parity_map = {'N': serial.PARITY_NONE, 'E': serial.PARITY_EVEN, 'O': serial.PARITY_ODD}
            stopbits_map = {1: serial.STOPBITS_ONE, 1.5: serial.STOPBITS_ONE_POINT_FIVE, 2: serial.STOPBITS_TWO}
            bytesize_map = {5: serial.FIVEBITS, 6: serial.SIXBITS, 7: serial.SEVENBITS, 8: serial.EIGHTBITS}

            self._serial = serial.Serial(
                port=self.config.port,
                baudrate=self.config.baudrate,
                parity=parity_map.get(self.config.parity, serial.PARITY_NONE),
                stopbits=stopbits_map.get(self.config.stopbits, serial.STOPBITS_ONE),
                bytesize=bytesize_map.get(self.config.bytesize, serial.EIGHTBITS),
                timeout=self.config.timeout
            )
            self._connected = True
            self._running = True
            self._start_receive_thread()
            logger.info(f"Serial port {self.config.port} connected successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to connect serial port {self.config.port}: {e}")
            self._connected = False
            return False

    def _start_receive_thread(self) -> None:
        def receive_loop():
            while self._running and self._connected:
                try:
                    if self._serial and self._serial.in_waiting > 0:
                        data = self._serial.read(self._serial.in_waiting)
                        self._process_data(data)
                    else:
                        time.sleep(0.01)
                except Exception as e:
                    logger.error(f"Serial receive error: {e}")
                    self._notify_error(e)
                    time.sleep(1)

        self._receive_task = threading.Thread(target=receive_loop, daemon=True)
        self._receive_task.start()

    def _process_data(self, data: bytes) -> None:
        self._buffer.extend(data)
        
        while self._delimiter in self._buffer:
            frame_end = self._buffer.index(self._delimiter) + len(self._delimiter)
            frame = bytes(self._buffer[:frame_end])
            self._buffer = self._buffer[frame_end:]
            
            payload = self.parser.parse(frame.rstrip(self._delimiter))
            if payload:
                message = self._create_message(
                    protocol=ProtocolType.SERIAL,
                    payload=payload,
                    raw_data=frame
                )
                self._notify_message(message)

    async def disconnect(self) -> None:
        self._running = False
        if self._receive_task:
            self._receive_task.join(timeout=2)
        if self._serial and self._serial.is_open:
            self._serial.close()
        self._connected = False
        logger.info(f"Serial port {self.config.port} disconnected")

    async def send(self, message: ProtocolMessage) -> bool:
        if not self._connected or not self._serial:
            logger.error("Serial port not connected")
            return False
        
        try:
            raw_data = self.parser.serialize(message.payload) + self._delimiter
            self._serial.write(raw_data)
            logger.debug(f"Serial sent: {raw_data}")
            return True
        except Exception as e:
            logger.error(f"Serial send error: {e}")
            self._notify_error(e)
            return False

    async def receive(self) -> Optional[ProtocolMessage]:
        return None
