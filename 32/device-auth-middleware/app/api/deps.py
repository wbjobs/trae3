import json
import uuid
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AccessControlService, RateLimitService, TenantIsolationService
from app.database import get_db
from app.models.tenant import TenantModel
from app.schemas.common import TenantContext


async def get_tenant_context(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TenantContext:
    api_key = request.headers.get("X-API-Key")
    api_secret = request.headers.get("X-API-Secret")

    if not api_key or not api_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key or secret in headers",
        )

    tenant_ctx = await TenantIsolationService.authenticate_tenant(db, api_key, api_secret)
    if tenant_ctx is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key or secret",
        )

    return tenant_ctx


async def check_rate_limit(
    request: Request,
    tenant_ctx: TenantContext = Depends(get_tenant_context),
) -> TenantContext:
    endpoint = request.url.path
    allowed, headers = await RateLimitService.check_rate_limit(
        tenant_ctx.tenant_id, endpoint
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded",
            headers=headers,
        )
    request.state.ratelimit_headers = headers
    return tenant_ctx


async def check_ip_access(
    request: Request,
    tenant_ctx: TenantContext = Depends(check_rate_limit),
    db: AsyncSession = Depends(get_db),
) -> TenantContext:
    ip = get_client_ip(request)
    allowed, reason = await AccessControlService.check_ip_access(db, tenant_ctx, ip)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied: IP blocked by {reason}",
        )
    return tenant_ctx


async def get_tenant_db(
    request: Request,
    tenant_ctx: TenantContext = Depends(check_ip_access),
    db: AsyncSession = Depends(get_db),
) -> tuple[TenantContext, AsyncSession, Request]:
    return tenant_ctx, db, request


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def build_response_meta(request: Request) -> dict:
    meta = {
        "node_id": getattr(request.state, "node_id", None),
        "request_id": getattr(request.state, "request_id", None),
    }
    rl_headers = getattr(request.state, "ratelimit_headers", None)
    if rl_headers:
        meta["ratelimit_limit"] = rl_headers.get("X-RateLimit-Limit")
        meta["ratelimit_remaining"] = rl_headers.get("X-RateLimit-Remaining")
    return meta
