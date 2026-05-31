import json

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AccessControlService, AuditLogService
from app.api.deps import build_response_meta, get_client_ip, get_tenant_db
from app.schemas.common import ResponseWithData, TenantContext
from app.schemas.access_control import (
    DeviceBlacklistRequest,
    DeviceBlacklistResponse,
    IPBlacklistRequest,
    IPBlacklistResponse,
)

router = APIRouter(prefix="/access-control", tags=["访问控制"])


@router.post("/ip-blacklist", response_model=ResponseWithData, status_code=status.HTTP_201_CREATED)
async def add_ip_blacklist(
    body: IPBlacklistRequest,
    request: Request,
    deps: tuple[TenantContext, AsyncSession, Request] = Depends(get_tenant_db),
):
    tenant_ctx, db, _ = deps

    entry = await AccessControlService.add_ip_to_blacklist(
        db, tenant_ctx, body.ip_address, body.ip_cidr, body.reason, body.expires_at,
    )

    await AuditLogService.log(
        db, tenant_ctx, actor_id=tenant_ctx.api_key,
        action="access.ip_blacklist_add", resource_type="ip_blacklist",
        resource_id=entry.id,
        detail=json.dumps({"ip_address": body.ip_address, "ip_cidr": body.ip_cidr}),
        ip_address=get_client_ip(request),
    )

    meta = build_response_meta(request)
    return ResponseWithData(data=IPBlacklistResponse.model_validate(entry).model_dump(), **meta)


@router.delete("/ip-blacklist/{ip_address}", response_model=ResponseWithData)
async def remove_ip_blacklist(
    ip_address: str,
    request: Request,
    deps: tuple[TenantContext, AsyncSession, Request] = Depends(get_tenant_db),
):
    tenant_ctx, db, _ = deps

    removed = await AccessControlService.remove_ip_from_blacklist(db, tenant_ctx, ip_address)
    if not removed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IP blacklist entry not found")

    await AuditLogService.log(
        db, tenant_ctx, actor_id=tenant_ctx.api_key,
        action="access.ip_blacklist_remove", resource_type="ip_blacklist",
        resource_id=ip_address,
        detail=json.dumps({"ip_address": ip_address}),
        ip_address=get_client_ip(request),
    )

    meta = build_response_meta(request)
    return ResponseWithData(message="IP removed from blacklist", **meta)


@router.post("/device-blacklist", response_model=ResponseWithData, status_code=status.HTTP_201_CREATED)
async def add_device_blacklist(
    body: DeviceBlacklistRequest,
    request: Request,
    deps: tuple[TenantContext, AsyncSession, Request] = Depends(get_tenant_db),
):
    tenant_ctx, db, _ = deps

    entry = await AccessControlService.add_device_to_blacklist(
        db, tenant_ctx, body.device_id, body.reason, body.expires_at,
    )

    await AuditLogService.log(
        db, tenant_ctx, actor_id=tenant_ctx.api_key,
        action="access.device_blacklist_add", resource_type="device_blacklist",
        resource_id=entry.id,
        detail=json.dumps({"device_id": body.device_id}),
        ip_address=get_client_ip(request),
    )

    meta = build_response_meta(request)
    return ResponseWithData(data=DeviceBlacklistResponse.model_validate(entry).model_dump(), **meta)


@router.delete("/device-blacklist/{device_id}", response_model=ResponseWithData)
async def remove_device_blacklist(
    device_id: str,
    request: Request,
    deps: tuple[TenantContext, AsyncSession, Request] = Depends(get_tenant_db),
):
    tenant_ctx, db, _ = deps

    removed = await AccessControlService.remove_device_from_blacklist(db, tenant_ctx, device_id)
    if not removed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device blacklist entry not found")

    await AuditLogService.log(
        db, tenant_ctx, actor_id=tenant_ctx.api_key,
        action="access.device_blacklist_remove", resource_type="device_blacklist",
        resource_id=device_id,
        detail=json.dumps({"device_id": device_id}),
        ip_address=get_client_ip(request),
    )

    meta = build_response_meta(request)
    return ResponseWithData(message="Device removed from blacklist", **meta)
