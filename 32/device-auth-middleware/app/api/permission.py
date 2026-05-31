import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthCoreService, AuditLogService, ThirdPartyService
from app.api.deps import build_response_meta, get_client_ip, get_tenant_db
from app.models.permission import PermissionModel
from app.schemas.common import ResponseWithData, TenantContext
from app.schemas.permission import (
    BatchPermissionIssueRequest,
    PermissionCheckRequest,
    PermissionCheckResponse,
    PermissionIssueRequest,
    PermissionRevokeRequest,
    TempAuthRequest,
    PermissionResponse,
    TempAuthResponse,
)

router = APIRouter(prefix="/permissions", tags=["权限管理"])


@router.post("/issue", response_model=ResponseWithData, status_code=status.HTTP_201_CREATED)
async def issue_permission(
    body: PermissionIssueRequest,
    request: Request,
    deps: tuple[TenantContext, AsyncSession, Request] = Depends(get_tenant_db),
):
    tenant_ctx, db, _ = deps

    try:
        permission = await AuthCoreService.issue_permission(
            db, tenant_ctx, body, issuer=tenant_ctx.api_key
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))

    await ThirdPartyService.notify_permission_change(
        tenant_ctx,
        event="permission.issued",
        device_id=body.device_id,
        subject_id=body.subject_id,
        permission_level=body.permission_level,
        resource_scope=body.resource_scope,
    )

    await AuditLogService.log(
        db, tenant_ctx, actor_id=tenant_ctx.api_key,
        action="permission.issue", resource_type="permission",
        resource_id=permission.id,
        detail=json.dumps({"device_id": body.device_id, "subject_id": body.subject_id, "action": body.action or "*", "level": body.permission_level}),
        ip_address=get_client_ip(request),
    )

    meta = build_response_meta(request)
    return ResponseWithData(data=PermissionResponse.model_validate(permission).model_dump(), **meta)


@router.post("/batch-issue", response_model=ResponseWithData, status_code=status.HTTP_201_CREATED)
async def batch_issue_permissions(
    body: BatchPermissionIssueRequest,
    request: Request,
    deps: tuple[TenantContext, AsyncSession, Request] = Depends(get_tenant_db),
):
    tenant_ctx, db, _ = deps

    try:
        permissions = await AuthCoreService.batch_issue_permissions(
            db, tenant_ctx, body, issuer=tenant_ctx.api_key
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))

    await AuditLogService.log(
        db, tenant_ctx, actor_id=tenant_ctx.api_key,
        action="permission.batch_issue", resource_type="permission",
        resource_id="batch",
        detail=json.dumps({"device_count": len(body.device_ids), "subject_count": len(body.subject_ids), "created": len(permissions)}),
        ip_address=get_client_ip(request),
    )

    meta = build_response_meta(request)
    return ResponseWithData(
        data={
            "created_count": len(permissions),
            "permissions": [PermissionResponse.model_validate(p).model_dump() for p in permissions],
        },
        **meta,
    )


@router.post("/check", response_model=ResponseWithData)
async def check_permission(
    body: PermissionCheckRequest,
    request: Request,
    deps: tuple[TenantContext, AsyncSession, Request] = Depends(get_tenant_db),
):
    tenant_ctx, db, _ = deps

    try:
        permission = await AuthCoreService.check_action_permission(
            db, tenant_ctx, body.device_id, body.subject_id, body.action
        )
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")

    result = PermissionCheckResponse(
        allowed=permission is not None,
        permission_level=permission.permission_level if permission else None,
        action=permission.action if permission else None,
        resource_scope=permission.resource_scope if permission else None,
    )

    meta = build_response_meta(request)
    return ResponseWithData(data=result.model_dump(), **meta)


@router.post("/temp-auth", response_model=ResponseWithData, status_code=status.HTTP_201_CREATED)
async def grant_temp_auth(
    body: TempAuthRequest,
    request: Request,
    deps: tuple[TenantContext, AsyncSession, Request] = Depends(get_tenant_db),
):
    tenant_ctx, db, _ = deps

    try:
        temp_auth, temp_token = await AuthCoreService.grant_temp_auth(
            db, tenant_ctx, body, issuer=tenant_ctx.api_key
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))

    await ThirdPartyService.notify_permission_change(
        tenant_ctx, event="temp_auth.granted",
        device_id=body.device_id, subject_id=body.subject_id,
        permission_level=body.permission_level, resource_scope=body.resource_scope,
    )

    await AuditLogService.log(
        db, tenant_ctx, actor_id=tenant_ctx.api_key,
        action="permission.temp_auth", resource_type="temp_auth",
        resource_id=temp_auth.id,
        detail=json.dumps({"device_id": body.device_id, "subject_id": body.subject_id, "expires_minutes": body.expires_minutes}),
        ip_address=get_client_ip(request),
    )

    resp_data = TempAuthResponse.model_validate(temp_auth).model_dump()
    resp_data["temp_token"] = temp_token

    meta = build_response_meta(request)
    return ResponseWithData(data=resp_data, **meta)


@router.post("/revoke", response_model=ResponseWithData)
async def revoke_permission(
    body: PermissionRevokeRequest,
    request: Request,
    deps: tuple[TenantContext, AsyncSession, Request] = Depends(get_tenant_db),
):
    tenant_ctx, db, _ = deps

    if not body.permission_id and not body.device_id and not body.subject_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one of permission_id, device_id, or subject_id is required",
        )

    try:
        revoked_permissions = await AuthCoreService.revoke_permission(
            db, tenant_ctx, body, revoker=tenant_ctx.api_key
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    revoked_count = len(revoked_permissions)
    affected_devices = {p.device_id for p in revoked_permissions}

    for device_id in affected_devices:
        await ThirdPartyService.notify_permission_change(
            tenant_ctx, event="permission.revoked",
            device_id=device_id, subject_id=body.subject_id or "*",
        )

    await AuditLogService.log(
        db, tenant_ctx, actor_id=tenant_ctx.api_key,
        action="permission.revoke", resource_type="permission",
        resource_id=body.permission_id or "bulk",
        detail=json.dumps({"permission_id": body.permission_id, "device_id": body.device_id, "subject_id": body.subject_id, "revoked_count": revoked_count, "reason": body.reason}),
        ip_address=get_client_ip(request),
    )

    meta = build_response_meta(request)
    return ResponseWithData(data={"revoked_count": revoked_count}, message=f"Revoked {revoked_count} permission(s)", **meta)


@router.get("/{permission_id}", response_model=ResponseWithData)
async def get_permission(
    permission_id: str,
    request: Request,
    deps: tuple[TenantContext, AsyncSession, Request] = Depends(get_tenant_db),
):
    tenant_ctx, db, _ = deps

    result = await db.execute(
        select(PermissionModel).where(
            and_(
                PermissionModel.id == permission_id,
                PermissionModel.tenant_id == tenant_ctx.tenant_id,
            )
        )
    )
    permission = result.scalar_one_or_none()
    if permission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Permission not found")

    meta = build_response_meta(request)
    return ResponseWithData(data=PermissionResponse.model_validate(permission).model_dump(), **meta)
