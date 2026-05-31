import json
import logging

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.permission import PermissionModel
from app.models.tenant import TenantModel
from app.redis import get_redis
from app.schemas.common import TenantContext

logger = logging.getLogger(__name__)

_TENANT_CACHE_TTL = 300
_PERMISSION_CACHE_TTL = 30


class CacheService:

    @staticmethod
    async def get_tenant_config(
        db: AsyncSession,
        tenant_ctx: TenantContext,
    ) -> TenantModel | None:
        redis = get_redis()
        cache_key = f"tenant:{tenant_ctx.tenant_id}"
        cached = await redis.get(cache_key)
        if cached:
            data = json.loads(cached)
            return TenantModel(**data)

        result = await db.execute(
            select(TenantModel).where(TenantModel.id == tenant_ctx.tenant_id)
        )
        tenant = result.scalar_one_or_none()
        if tenant:
            await redis.setex(
                cache_key,
                _TENANT_CACHE_TTL,
                json.dumps({
                    "id": tenant.id,
                    "name": tenant.name,
                    "api_key": tenant.api_key,
                    "api_secret_hash": tenant.api_secret_hash,
                    "isolation_level": tenant.isolation_level,
                    "device_quota": tenant.device_quota,
                    "status": tenant.status,
                }),
            )
        return tenant

    @staticmethod
    async def check_permission_cached(
        db: AsyncSession,
        tenant_ctx: TenantContext,
        device_id: str,
        subject_id: str,
        action: str = "*",
    ) -> PermissionModel | None:
        redis = get_redis()
        cache_key = f"perm:{tenant_ctx.tenant_id}:{device_id}:{subject_id}:{action}"
        cached = await redis.get(cache_key)
        if cached:
            if cached == "none":
                return None
            data = json.loads(cached)
            return PermissionModel(**data)

        conditions = [
            PermissionModel.tenant_id == tenant_ctx.tenant_id,
            PermissionModel.device_id == device_id,
            PermissionModel.subject_id == subject_id,
            PermissionModel.status == "active",
        ]
        if action != "*":
            conditions.append(
                PermissionModel.action.in_([action, "*"])
            )

        result = await db.execute(
            select(PermissionModel).where(and_(*conditions))
        )
        permission = result.scalar_one_or_none()

        if permission:
            if permission.expires_at:
                await redis.setex(cache_key, _PERMISSION_CACHE_TTL, json.dumps({
                    "id": permission.id,
                    "tenant_id": permission.tenant_id,
                    "device_id": permission.device_id,
                    "subject_id": permission.subject_id,
                    "permission_level": permission.permission_level,
                    "action": permission.action,
                    "resource_scope": permission.resource_scope,
                    "status": permission.status,
                }))
            else:
                await redis.setex(cache_key, _PERMISSION_CACHE_TTL * 2, json.dumps({
                    "id": permission.id,
                    "tenant_id": permission.tenant_id,
                    "device_id": permission.device_id,
                    "subject_id": permission.subject_id,
                    "permission_level": permission.permission_level,
                    "action": permission.action,
                    "resource_scope": permission.resource_scope,
                    "status": permission.status,
                }))
        else:
            await redis.setex(cache_key, _PERMISSION_CACHE_TTL, "none")

        return permission

    @staticmethod
    async def invalidate_permission_cache(
        tenant_ctx: TenantContext,
        device_id: str,
        subject_id: str,
    ):
        redis = get_redis()
        pattern = f"perm:{tenant_ctx.tenant_id}:{device_id}:{subject_id}:*"
        keys = []
        async for key in redis.scan_iter(match=pattern):
            keys.append(key)
        if keys:
            await redis.delete(*keys)

    @staticmethod
    async def invalidate_tenant_cache(tenant_id: str):
        redis = get_redis()
        await redis.delete(f"tenant:{tenant_id}")
