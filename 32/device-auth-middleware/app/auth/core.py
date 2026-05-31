import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.access_control import AccessControlService
from app.auth.cache import CacheService
from app.models.device import DeviceModel, DeviceWhitelistModel
from app.models.permission import PermissionModel, TempAuthModel
from app.schemas.common import TenantContext
from app.schemas.permission import (
    BatchPermissionIssueRequest,
    PermissionIssueRequest,
    PermissionRevokeRequest,
    TempAuthRequest,
)
from app.utils.security import create_temp_token, hash_secret


class AuthCoreService:

    @staticmethod
    async def _validate_device_ownership(
        db: AsyncSession,
        tenant_ctx: TenantContext,
        device_id: str,
    ) -> DeviceModel:
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
            raise ValueError("Device not found or not belongs to tenant")
        return device

    @staticmethod
    async def _check_whitelist_strict(
        db: AsyncSession,
        tenant_ctx: TenantContext,
        device_id: str,
    ) -> None:
        if tenant_ctx.isolation_level != "strict":
            return
        wl_check = await db.execute(
            select(DeviceWhitelistModel).where(
                and_(
                    DeviceWhitelistModel.tenant_id == tenant_ctx.tenant_id,
                    DeviceWhitelistModel.device_id == device_id,
                    DeviceWhitelistModel.is_active.is_(True),
                )
            )
        )
        wl_entry = wl_check.scalar_one_or_none()
        if wl_entry is None:
            raise PermissionError("Device not in whitelist")
        if wl_entry.expires_at and wl_entry.expires_at < datetime.now(timezone.utc):
            raise PermissionError("Device whitelist entry expired")

    @staticmethod
    async def _check_device_blacklist(
        db: AsyncSession,
        tenant_ctx: TenantContext,
        device_id: str,
    ) -> None:
        allowed = await AccessControlService.check_device_blacklist(db, tenant_ctx, device_id)
        if not allowed:
            raise PermissionError("Device is blacklisted")

    @staticmethod
    async def issue_permission(
        db: AsyncSession,
        tenant_ctx: TenantContext,
        req: PermissionIssueRequest,
        issuer: str,
    ) -> PermissionModel:
        await AuthCoreService._validate_device_ownership(db, tenant_ctx, req.device_id)
        await AuthCoreService._check_device_blacklist(db, tenant_ctx, req.device_id)
        await AuthCoreService._check_whitelist_strict(db, tenant_ctx, req.device_id)

        action = req.action or "*"
        conflict = await db.execute(
            select(PermissionModel).where(
                and_(
                    PermissionModel.tenant_id == tenant_ctx.tenant_id,
                    PermissionModel.device_id == req.device_id,
                    PermissionModel.subject_id == req.subject_id,
                    PermissionModel.action == action,
                    PermissionModel.status == "active",
                )
            )
        )
        if conflict.scalar_one_or_none():
            raise ValueError("Active permission already exists for this device-subject-action pair")

        permission = PermissionModel(
            id=str(uuid.uuid4()),
            tenant_id=tenant_ctx.tenant_id,
            device_id=req.device_id,
            subject_id=req.subject_id,
            permission_level=req.permission_level,
            action=action,
            resource_scope=req.resource_scope,
            status="active",
            expires_at=req.expires_at,
            issued_by=issuer,
        )
        db.add(permission)
        await db.flush()

        await CacheService.invalidate_permission_cache(
            tenant_ctx, req.device_id, req.subject_id
        )
        return permission

    @staticmethod
    async def batch_issue_permissions(
        db: AsyncSession,
        tenant_ctx: TenantContext,
        req: BatchPermissionIssueRequest,
        issuer: str,
    ) -> list[PermissionModel]:
        device_ids = req.device_ids
        subject_ids = req.subject_ids
        action = req.action or "*"

        for device_id in device_ids:
            await AuthCoreService._validate_device_ownership(db, tenant_ctx, device_id)
            await AuthCoreService._check_device_blacklist(db, tenant_ctx, device_id)
            await AuthCoreService._check_whitelist_strict(db, tenant_ctx, device_id)

        existing = await db.execute(
            select(PermissionModel).where(
                and_(
                    PermissionModel.tenant_id == tenant_ctx.tenant_id,
                    PermissionModel.device_id.in_(device_ids),
                    PermissionModel.subject_id.in_(subject_ids),
                    PermissionModel.action == action,
                    PermissionModel.status == "active",
                )
            )
        )
        existing_set = {
            (p.device_id, p.subject_id) for p in existing.scalars().all()
        }

        now = datetime.now(timezone.utc)
        new_permissions = []
        for device_id in device_ids:
            for subject_id in subject_ids:
                if (device_id, subject_id) in existing_set:
                    continue
                perm = PermissionModel(
                    id=str(uuid.uuid4()),
                    tenant_id=tenant_ctx.tenant_id,
                    device_id=device_id,
                    subject_id=subject_id,
                    permission_level=req.permission_level,
                    action=action,
                    resource_scope=req.resource_scope,
                    status="active",
                    expires_at=req.expires_at,
                    issued_by=issuer,
                )
                new_permissions.append(perm)

        if new_permissions:
            db.add_all(new_permissions)
            await db.flush()

        for device_id in device_ids:
            for subject_id in subject_ids:
                await CacheService.invalidate_permission_cache(
                    tenant_ctx, device_id, subject_id
                )

        return new_permissions

    @staticmethod
    async def grant_temp_auth(
        db: AsyncSession,
        tenant_ctx: TenantContext,
        req: TempAuthRequest,
        issuer: str,
    ) -> tuple[TempAuthModel, str]:
        await AuthCoreService._validate_device_ownership(db, tenant_ctx, req.device_id)
        await AuthCoreService._check_device_blacklist(db, tenant_ctx, req.device_id)
        await AuthCoreService._check_whitelist_strict(db, tenant_ctx, req.device_id)

        action = req.action or "*"
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=req.expires_minutes)

        token_data = {
            "tenant_id": tenant_ctx.tenant_id,
            "device_id": req.device_id,
            "subject_id": req.subject_id,
            "permission_level": req.permission_level,
            "action": action,
            "scope": req.resource_scope or "*",
        }
        temp_token = create_temp_token(
            token_data, expires_delta=timedelta(minutes=req.expires_minutes)
        )

        temp_auth = TempAuthModel(
            id=str(uuid.uuid4()),
            tenant_id=tenant_ctx.tenant_id,
            device_id=req.device_id,
            subject_id=req.subject_id,
            token_hash=hash_secret(temp_token),
            permission_level=req.permission_level,
            action=action,
            resource_scope=req.resource_scope,
            status="active",
            expires_at=expires_at,
            issued_by=issuer,
        )
        db.add(temp_auth)
        await db.flush()
        return temp_auth, temp_token

    @staticmethod
    async def revoke_permission(
        db: AsyncSession,
        tenant_ctx: TenantContext,
        req: PermissionRevokeRequest,
        revoker: str,
    ) -> list[PermissionModel]:
        conditions = [
            PermissionModel.tenant_id == tenant_ctx.tenant_id,
            PermissionModel.status == "active",
        ]
        if req.permission_id:
            conditions.append(PermissionModel.id == req.permission_id)
        if req.device_id:
            await AuthCoreService._validate_device_ownership(
                db, tenant_ctx, req.device_id
            )
            conditions.append(PermissionModel.device_id == req.device_id)
        if req.subject_id:
            conditions.append(PermissionModel.subject_id == req.subject_id)
        if req.action:
            conditions.append(PermissionModel.action.in_([req.action, "*"]))

        result = await db.execute(
            select(PermissionModel).where(and_(*conditions))
        )
        permissions = list(result.scalars().all())

        if permissions:
            revoked_ids = [p.id for p in permissions]
            now = datetime.now(timezone.utc)
            await db.execute(
                update(PermissionModel)
                .where(PermissionModel.id.in_(revoked_ids))
                .values(
                    status="revoked",
                    revoked_at=now,
                    revoke_reason=req.reason,
                )
            )
            await db.flush()

        for p in permissions:
            await CacheService.invalidate_permission_cache(
                tenant_ctx, p.device_id, p.subject_id
            )

        return permissions

    @staticmethod
    async def check_action_permission(
        db: AsyncSession,
        tenant_ctx: TenantContext,
        device_id: str,
        subject_id: str,
        action: str,
    ) -> PermissionModel | None:
        await AuthCoreService._validate_device_ownership(db, tenant_ctx, device_id)

        cached = await CacheService.check_permission_cached(
            db, tenant_ctx, device_id, subject_id, action
        )
        if cached:
            if cached.expires_at and cached.expires_at < datetime.now(timezone.utc):
                cached.status = "expired"
                await db.flush()
                await CacheService.invalidate_permission_cache(
                    tenant_ctx, device_id, subject_id
                )
                return None
            return cached

        result = await db.execute(
            select(PermissionModel).where(
                and_(
                    PermissionModel.tenant_id == tenant_ctx.tenant_id,
                    PermissionModel.device_id == device_id,
                    PermissionModel.subject_id == subject_id,
                    PermissionModel.action.in_([action, "*"]),
                    PermissionModel.status == "active",
                )
            )
        )
        permission = result.scalar_one_or_none()
        if permission and permission.expires_at and permission.expires_at < datetime.now(timezone.utc):
            permission.status = "expired"
            await db.flush()
            await CacheService.invalidate_permission_cache(
                tenant_ctx, device_id, subject_id
            )
            return None
        return permission

    @staticmethod
    async def verify_temp_token(
        db: AsyncSession,
        tenant_ctx: TenantContext,
        token: str,
    ) -> TempAuthModel | None:
        from app.utils.security import decode_token, verify_secret

        payload = decode_token(token)
        if payload is None or payload.get("type") != "temp":
            return None
        if payload.get("tenant_id") != tenant_ctx.tenant_id:
            return None

        device_id = payload.get("device_id")
        subject_id = payload.get("subject_id")

        conditions = [
            TempAuthModel.tenant_id == tenant_ctx.tenant_id,
            TempAuthModel.status == "active",
        ]
        if device_id:
            conditions.append(TempAuthModel.device_id == device_id)
        if subject_id:
            conditions.append(TempAuthModel.subject_id == subject_id)

        result = await db.execute(
            select(TempAuthModel).where(and_(*conditions))
        )
        candidates = result.scalars().all()

        for ta in candidates:
            if verify_secret(token, ta.token_hash):
                if ta.expires_at and ta.expires_at < datetime.now(timezone.utc):
                    ta.status = "expired"
                    await db.flush()
                    return None
                return ta
        return None
