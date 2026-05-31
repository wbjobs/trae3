import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuditLogService, TenantIsolationService, ThirdPartyService, WhitelistService
from app.api.deps import build_response_meta, get_client_ip, get_tenant_db
from app.database import get_db
from app.models.device import DeviceModel
from app.schemas.common import ResponseWithData, TenantContext
from app.schemas.device import DeviceRegisterRequest, DeviceResponse, WhitelistEntryResponse

router = APIRouter(prefix="/devices", tags=["设备注册与管理"])


@router.post("", response_model=ResponseWithData, status_code=status.HTTP_201_CREATED)
async def register_device(
    body: DeviceRegisterRequest,
    request: Request,
    deps: tuple[TenantContext, AsyncSession, Request] = Depends(get_tenant_db),
):
    tenant_ctx, db, req = deps

    has_quota = await TenantIsolationService.check_device_quota(db, tenant_ctx)
    if not has_quota:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Device quota exceeded for this tenant",
        )

    conflict = await db.execute(
        select(DeviceModel).where(
            and_(
                DeviceModel.tenant_id == tenant_ctx.tenant_id,
                DeviceModel.device_sn == body.device_sn,
            )
        )
    )
    if conflict.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Device already registered: {body.device_sn}",
        )

    device = DeviceModel(
        id=str(uuid.uuid4()),
        tenant_id=tenant_ctx.tenant_id,
        device_sn=body.device_sn,
        device_name=body.device_name,
        device_type=body.device_type,
        fingerprint=body.fingerprint,
        status="registered",
        metadata_json=json.dumps(body.metadata) if body.metadata else None,
    )
    db.add(device)
    await db.flush()

    wl_cfg = _get_whitelist_config()
    if wl_cfg:
        await WhitelistService.add_to_whitelist(db, tenant_ctx, device.id)

    await ThirdPartyService.register_device_to_manager(
        tenant_ctx,
        device_id=device.id,
        device_sn=body.device_sn,
        device_type=body.device_type,
        metadata=body.metadata,
    )

    await AuditLogService.log(
        db,
        tenant_ctx,
        actor_id=tenant_ctx.api_key,
        action="device.register",
        resource_type="device",
        resource_id=device.id,
        detail=json.dumps({"device_sn": body.device_sn}),
        ip_address=get_client_ip(request),
    )

    meta = build_response_meta(request)
    return ResponseWithData(
        data=DeviceResponse.model_validate(device).model_dump(),
        **meta,
    )


@router.get("/{device_id}", response_model=ResponseWithData)
async def get_device(
    device_id: str,
    request: Request,
    deps: tuple[TenantContext, AsyncSession, Request] = Depends(get_tenant_db),
):
    tenant_ctx, db, _ = deps

    result = await db.execute(
        select(DeviceModel).where(
            and_(
                DeviceModel.id == device_id,
                DeviceModel.tenant_id == tenant_ctx.tenant_id,
            )
        )
    )
    device = result.scalar_one_or_none()
    if device is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found",
        )

    meta = build_response_meta(request)
    return ResponseWithData(
        data=DeviceResponse.model_validate(device).model_dump(),
        **meta,
    )


@router.get("", response_model=ResponseWithData)
async def list_devices(
    request: Request,
    skip: int = 0,
    limit: int = 50,
    deps: tuple[TenantContext, AsyncSession, Request] = Depends(get_tenant_db),
):
    tenant_ctx, db, _ = deps
    result = await db.execute(
        select(DeviceModel)
        .where(DeviceModel.tenant_id == tenant_ctx.tenant_id)
        .offset(skip)
        .limit(limit)
    )
    devices = result.scalars().all()
    meta = build_response_meta(request)
    return ResponseWithData(
        data=[DeviceResponse.model_validate(d).model_dump() for d in devices],
        **meta,
    )


@router.delete("/{device_id}", response_model=ResponseWithData)
async def delete_device(
    device_id: str,
    request: Request,
    deps: tuple[TenantContext, AsyncSession, Request] = Depends(get_tenant_db),
):
    tenant_ctx, db, _ = deps

    result = await db.execute(
        select(DeviceModel).where(
            and_(
                DeviceModel.id == device_id,
                DeviceModel.tenant_id == tenant_ctx.tenant_id,
            )
        )
    )
    device = result.scalar_one_or_none()
    if device is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found",
        )

    device.status = "deleted"
    await db.flush()

    await AuditLogService.log(
        db,
        tenant_ctx,
        actor_id=tenant_ctx.api_key,
        action="device.delete",
        resource_type="device",
        resource_id=device_id,
        ip_address=get_client_ip(request),
    )

    meta = build_response_meta(request)
    return ResponseWithData(message="Device deleted", **meta)


def _get_whitelist_config() -> bool:
    from app.utils.config import get_config
    return get_config().get("whitelist", {}).get("enabled", True)
