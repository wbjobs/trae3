import asyncio
import httpx
from typing import Optional, Dict, Any
from tenacity import retry, stop_after_attempt, wait_exponential

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.logger import get_logger
from core.config import get_config
from protocols.base import ProtocolAdapter, JSONParser, ProtocolParser
from protocols.models import ProtocolType, ProtocolMessage, HTTPProtocolConfig, MessageType

logger = get_logger(__name__)


class HTTPAdapter(ProtocolAdapter):
    def __init__(
        self,
        config: HTTPProtocolConfig,
        parser: Optional[ProtocolParser] = None
    ):
        super().__init__(config.name)
        self.config = config
        self.parser = parser or JSONParser()
        self._client: Optional[httpx.AsyncClient] = None
        self._timeout = httpx.Timeout(config.timeout)

    async def connect(self) -> bool:
        try:
            self._client = httpx.AsyncClient(
                base_url=self.config.base_url,
                headers=self.config.headers,
                timeout=self._timeout
            )
            self._connected = True
            logger.info(f"HTTP adapter {self.config.name} connected to {self.config.base_url}")
            return True
        except Exception as e:
            logger.error(f"Failed to create HTTP client: {e}")
            self._connected = False
            return False

    async def disconnect(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None
        self._connected = False
        logger.info(f"HTTP adapter {self.config.name} disconnected")

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10)
    )
    async def _request_with_retry(
        self,
        method: str,
        url: str,
        **kwargs
    ) -> httpx.Response:
        if not self._client:
            raise Exception("HTTP client not connected")
        return await self._client.request(method, url, **kwargs)

    async def send(self, message: ProtocolMessage) -> bool:
        if not self._connected or not self._client:
            logger.error("HTTP client not connected")
            return False

        try:
            endpoint = message.headers.get('endpoint', '/data')
            method = message.headers.get('method', 'POST').upper()
            
            response = await self._request_with_retry(
                method=method,
                url=endpoint,
                json=message.payload,
                headers=message.headers
            )

            if response.is_success:
                logger.debug(f"HTTP {method} {endpoint} succeeded: {response.status_code}")
                return True
            else:
                logger.error(f"HTTP {method} {endpoint} failed: {response.status_code} - {response.text}")
                return False

        except Exception as e:
            logger.error(f"HTTP send error: {e}")
            self._notify_error(e)
            return False

    async def receive(self) -> Optional[ProtocolMessage]:
        return None

    async def get(
        self,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None
    ) -> Optional[ProtocolMessage]:
        if not self._connected or not self._client:
            logger.error("HTTP client not connected")
            return None

        try:
            response = await self._request_with_retry(
                method='GET',
                url=endpoint,
                params=params,
                headers=headers or {}
            )

            if response.is_success:
                payload = response.json() if response.content else {}
                return self._create_message(
                    protocol=ProtocolType.HTTP,
                    payload=payload,
                    message_type=MessageType.DATA,
                    topic=endpoint,
                    raw_data=response.content
                )
            else:
                logger.error(f"HTTP GET {endpoint} failed: {response.status_code}")
                return None

        except Exception as e:
            logger.error(f"HTTP GET error: {e}")
            self._notify_error(e)
            return None

    async def post(
        self,
        endpoint: str,
        data: Dict[str, Any],
        headers: Optional[Dict[str, str]] = None
    ) -> Optional[ProtocolMessage]:
        if not self._connected or not self._client:
            logger.error("HTTP client not connected")
            return None

        try:
            response = await self._request_with_retry(
                method='POST',
                url=endpoint,
                json=data,
                headers=headers or {}
            )

            if response.is_success:
                payload = response.json() if response.content else {}
                return self._create_message(
                    protocol=ProtocolType.HTTP,
                    payload=payload,
                    message_type=MessageType.DATA,
                    topic=endpoint,
                    raw_data=response.content
                )
            else:
                logger.error(f"HTTP POST {endpoint} failed: {response.status_code}")
                return None

        except Exception as e:
            logger.error(f"HTTP POST error: {e}")
            self._notify_error(e)
            return None
