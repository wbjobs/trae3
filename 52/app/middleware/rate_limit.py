import time
from collections import defaultdict, deque
from typing import Callable
from ipaddress import ip_address, ip_network

from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.cache import limit_cache
from app.models import RateLimitDimension, RateLimitRule
from app.repository import RateLimitRepository


class SlidingWindowRateLimiter:
    def __init__(self):
        self._windows: dict[str, deque[float]] = defaultdict(deque)

    def _get_key(self, dimension: RateLimitDimension, request: Request, rule: RateLimitRule) -> str:
        path = request.url.path
        client_ip = request.client.host if request.client else "unknown"

        if dimension == RateLimitDimension.IP:
            return f"ip:{client_ip}"
        elif dimension == RateLimitDimension.PATH:
            return f"path:{rule.path_pattern or path}"
        elif dimension == RateLimitDimension.DEVICE:
            device_sn = request.headers.get("X-Device-SN", "")
            return f"device:{device_sn}" if device_sn else None
        elif dimension == RateLimitDimension.ENDPOINT:
            return f"endpoint:{path}:{client_ip}"
        return None

    def check(self, rule: RateLimitRule, request: Request) -> tuple[bool, int]:
        key = self._get_key(rule.dimension, request, rule)
        if not key:
            return True, 0

        full_key = f"limit:{rule.id}:{key}"
        cached = limit_cache.get(full_key)

        now = time.time()
        window_start = now - rule.window_seconds

        if cached is None:
            timestamps = deque()
        else:
            timestamps = deque(t for t in cached if t > window_start)

        while timestamps and timestamps[0] <= window_start:
            timestamps.popleft()

        current_count = len(timestamps)
        remaining = rule.limit - current_count - 1

        if remaining < 0:
            return False, 0

        timestamps.append(now)
        limit_cache.set(full_key, list(timestamps), ttl=rule.window_seconds)

        return True, max(0, remaining)


_rate_limiter = SlidingWindowRateLimiter()


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, get_db: Callable):
        super().__init__(app)
        self._get_db = get_db

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path in ["/health", "/docs", "/openapi.json", "/redoc"]:
            return await call_next(request)

        db = next(self._get_db())
        try:
            repo = RateLimitRepository(db)
            rules = repo.list_active()

            for rule in rules:
                if rule.path_pattern and rule.path_pattern not in path:
                    continue

                allowed, remaining = _rate_limiter.check(rule, request)

                if not allowed:
                    block_duration = rule.block_duration_seconds
                    headers = {
                        "X-RateLimit-Limit": str(rule.limit),
                        "X-RateLimit-Remaining": "0",
                        "X-RateLimit-Reset": str(int(time.time() + rule.window_seconds)),
                    }
                    if block_duration > 0:
                        headers["X-RateLimit-Block-For"] = str(block_duration)
                        limit_cache.set(
                            f"blocked:{rule.id}:{request.client.host if request.client else 'unknown'}",
                            True,
                            ttl=block_duration,
                        )
                    return JSONResponse(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        content={
                            "code": 429,
                            "message": "Rate limit exceeded",
                            "data": {"retry_after": rule.window_seconds},
                        },
                        headers=headers,
                    )

                if remaining >= 0:
                    response = await call_next(request)
                    response.headers["X-RateLimit-Limit"] = str(rule.limit)
                    response.headers["X-RateLimit-Remaining"] = str(remaining)
                    return response

        finally:
            db.close()

        return await call_next(request)
