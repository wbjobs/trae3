import hashlib
import json
import re
import time
from typing import Callable

from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest
from starlette.types import ASGIApp, Receive, Scope, Send

from app.cache import limit_cache
from app.repository import DeviceRepository
from app.database import get_db


_SQL_INJECTION_PATTERNS = [
    r"(?i)\b(union|select|insert|update|delete|drop|alter|create|truncate|exec|execute)\b",
    r"(?i)(--|;|/\*|\*/|xp_|sp_)",
    r"(?i)('|\").*(or|and).*=.*('|\")",
]

_XSS_PATTERNS = [
    r"(?i)<script[^>]*>.*?</script>",
    r"(?i)(javascript:|onclick=|onload=|onerror=|eval\()",
    r"(?i)<iframe[^>]*>.*?</iframe>",
]


class _CachedBodyRequest(StarletteRequest):
    def __init__(self, scope: Scope, receive: Receive, body: bytes):
        super().__init__(scope, receive)
        self._cached_body = body

    async def body(self) -> bytes:
        return self._cached_body


class SecurityMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path in ["/health", "/docs", "/openapi.json", "/redoc"]:
            return await call_next(request)

        body = await request.body()

        try:
            self._validate_request_sync(request, body)
        except HTTPException as e:
            return JSONResponse(
                status_code=e.status_code,
                content={"code": e.status_code, "message": e.detail, "data": None},
            )

        request_id = self._generate_request_id_sync(request, body)
        if self._is_duplicate_request_sync(request_id):
            return JSONResponse(
                status_code=status.HTTP_409_CONFLICT,
                content={"code": 409, "message": "Duplicate request", "data": {"request_id": request_id}},
            )

        async def cached_receive():
            return {"type": "http.request", "body": body, "more_body": False}

        new_request = Request(request.scope, receive=cached_receive)
        response = await call_next(new_request)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Content-Security-Policy"] = "default-src 'self'"
        return response

    def _validate_request_sync(self, request: Request, body: bytes) -> None:
        client_ip = request.client.host if request.client else "unknown"
        path = request.url.path

        if client_ip != "unknown":
            if self._is_ip_blocked_sync(client_ip):
                raise HTTPException(status_code=403, detail="IP blocked due to suspicious activity")

        if request.method in ["POST", "PUT", "PATCH"]:
            content_length = request.headers.get("content-length")
            if content_length and int(content_length) > 10 * 1024 * 1024:
                raise HTTPException(status_code=413, detail="Payload too large")

            if body:
                text = body.decode("utf-8", errors="ignore")
                for pattern in _SQL_INJECTION_PATTERNS:
                    if re.search(pattern, text):
                        self._block_ip_sync(client_ip, reason="SQL injection attempt")
                        raise HTTPException(status_code=400, detail="Invalid request content")
                for pattern in _XSS_PATTERNS:
                    if re.search(pattern, text):
                        self._block_ip_sync(client_ip, reason="XSS attempt")
                        raise HTTPException(status_code=400, detail="Invalid request content")

        device_sn = request.headers.get("X-Device-SN")
        if device_sn:
            is_management_api = (
                path.startswith("/api/v1/versions")
                or path.startswith("/api/v1/devices")
                or path.startswith("/api/v1/statistics")
                or path.startswith("/api/v1/upgrades/tasks")
                or path.startswith("/api/v1/upgrades/grayscale-rules")
                or path.startswith("/api/v1/upgrades/rate-limit-rules")
                or path.startswith("/api/v1/upgrades/retry-queue")
                or path.startswith("/api/v1/upgrades/grayscale-match")
                or path.startswith("/api/v1/upgrades/records")
                or path.endswith("/pause")
                or path.endswith("/resume")
                or path.endswith("/refresh")
            )
            is_device_api = (
                path.endswith("/heartbeat")
                or "/api/v1/upgrades/push" in path
                or "/api/v1/upgrades/records/" in path and "/status" in path
            )
            if is_device_api and not self._validate_device_sync(device_sn):
                raise HTTPException(status_code=401, detail="Invalid device")
            elif not is_management_api and not is_device_api:
                if not self._validate_device_sync(device_sn):
                    raise HTTPException(status_code=401, detail="Invalid device")

    def _generate_request_id_sync(self, request: Request, body: bytes) -> str:
        nonce = request.headers.get("X-Request-Nonce", "")
        timestamp = request.headers.get("X-Timestamp", str(int(time.time())))
        client_ip = request.client.host if request.client else "unknown"
        body_hash = hashlib.md5(body).hexdigest() if body else ""
        raw = f"{client_ip}:{timestamp}:{nonce}:{body_hash}:{request.url.path}"
        return hashlib.sha256(raw.encode()).hexdigest()

    def _is_duplicate_request_sync(self, request_id: str) -> bool:
        key = f"req:dup:{request_id}"
        if limit_cache.get(key):
            return True
        limit_cache.set(key, True, ttl=60)
        return False

    def _is_ip_blocked_sync(self, ip: str) -> bool:
        return limit_cache.get(f"blocked:ip:{ip}") is not None

    def _block_ip_sync(self, ip: str, reason: str = "", duration: int = 3600) -> None:
        limit_cache.set(f"blocked:ip:{ip}", reason, ttl=duration)

    def _validate_device_sync(self, device_sn: str) -> bool:
        cache_key = f"device:valid:{device_sn}"
        cached = limit_cache.get(cache_key)
        if cached is not None:
            return cached

        db = next(get_db())
        try:
            repo = DeviceRepository(db)
            device = repo.get_by_sn(device_sn)
            result = device is not None
            limit_cache.set(cache_key, result, ttl=300)
            return result
        finally:
            db.close()
