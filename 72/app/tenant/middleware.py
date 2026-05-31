import logging
import uuid
import time
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.config import settings
from app.tenant.context import tenant_context, set_tenant_info

logger = logging.getLogger(__name__)

_WHITELIST_PATHS = {"/health", "/health/detailed", "/docs", "/openapi.json", "/redoc", "/metrics"}
_TENANT_CACHE: dict = {}
_TENANT_CACHE_TTL = 60


class TenantMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())[:8]
        tenant_id = request.headers.get(settings.TENANT_HEADER)

        if self._is_public_path(request.url.path):
            if tenant_id:
                set_tenant_info(tenant_id, verified=False, source="header", request_id=request_id)
            token = tenant_context.set(tenant_context.get())
            try:
                response = await call_next(request)
                return response
            finally:
                tenant_context.reset(token)

        if not tenant_id:
            return JSONResponse(
                status_code=400,
                content={
                    "detail": f"Missing required header: {settings.TENANT_HEADER}",
                    "request_id": request_id
                }
            )

        is_valid = self._validate_tenant_cached(tenant_id)
        if not is_valid:
            logger.warning(f"Invalid tenant {tenant_id} attempted access from {request.client.host}")
            return JSONResponse(
                status_code=403,
                content={
                    "detail": "Tenant is not active or does not exist",
                    "request_id": request_id
                }
            )

        set_tenant_info(tenant_id, verified=True, source="header", request_id=request_id)

        start = time.time()
        try:
            response = await call_next(request)
            elapsed = (time.time() - start) * 1000
            logger.info(
                f"[{request_id}] tenant={tenant_id} {request.method} "
                f"{request.url.path} {response.status_code} {elapsed:.1f}ms"
            )
            return response
        finally:
            tenant_context.set(None)

    def _is_public_path(self, path: str) -> bool:
        if path in _WHITELIST_PATHS:
            return True
        if path.startswith("/api/v1/public"):
            return True
        if path.startswith("/admin/"):
            return True
        return False

    def _validate_tenant_cached(self, tenant_id: str) -> bool:
        now = time.time()
        cached = _TENANT_CACHE.get(tenant_id)
        if cached and now - cached["ts"] < _TENANT_CACHE_TTL:
            return cached["valid"]

        valid = self._do_validate_tenant(tenant_id)
        _TENANT_CACHE[tenant_id] = {"valid": valid, "ts": now}
        return valid

    def _do_validate_tenant(self, tenant_id: str) -> bool:
        from app.database import get_db
        from app.tenant.models import Tenant
        db = next(get_db(), None)
        if not db:
            return True
        try:
            tenant = db.query(Tenant).filter(
                Tenant.id == tenant_id,
                Tenant.is_active == True
            ).first()
            if not tenant:
                return False
            if tenant.expired_at and tenant.expired_at < __import__("datetime").datetime.now(__import__("datetime").timezone.utc):
                return False
            return True
        except Exception as e:
            logger.error(f"Tenant validation error: {e}")
            return True
        finally:
            db.close()
