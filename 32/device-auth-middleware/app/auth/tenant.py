import uuid
from datetime import datetime, timezone

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import DeviceModel
from app.models.tenant import TenantModel
from app.schemas.common import TenantContext
from app.utils.security import hash_secret, verify_secret


class TenantIsolationService:

    @staticmethod
    async def authenticate_tenant(
        db: AsyncSession, api_key: str, api_secret: str
    ) -> TenantContext | None:
        result = await db.execute(
            select(TenantModel).where(
                and_(
                    TenantModel.api_key == api_key,
                    TenantModel.status == "active",
                )
            )
        )
        tenant = result.scalar_one_or_none()
        if tenant is None:
            return None
        if not verify_secret(api_secret, tenant.api_secret_hash):
            return None
        return TenantContext(
            tenant_id=tenant.id,
            api_key=tenant.api_key,
            isolation_level=tenant.isolation_level,
        )

    @staticmethod
    async def create_tenant(
        db: AsyncSession,
        name: str,
        isolation_level: str = "strict",
        device_quota: int = 1000,
    ) -> TenantModel:
        conflict = await db.execute(
            select(TenantModel).where(TenantModel.name == name)
        )
        if conflict.scalar_one_or_none():
            raise ValueError(f"Tenant name already exists: {name}")

        api_key = TenantModel.generate_api_key()
        api_secret = f"sk_{uuid.uuid4().hex[:32]}"

        tenant = TenantModel(
            id=str(uuid.uuid4()),
            name=name,
            api_key=api_key,
            api_secret_hash=hash_secret(api_secret),
            isolation_level=isolation_level,
            device_quota=str(device_quota),
            status="active",
        )
        db.add(tenant)
        await db.flush()
        tenant._plain_secret = api_secret
        return tenant

    @staticmethod
    async def check_device_quota(
        db: AsyncSession, tenant_ctx: TenantContext
    ) -> bool:
        result = await db.execute(
            select(func.count()).where(
                DeviceModel.tenant_id == tenant_ctx.tenant_id
            )
        )
        current_count = result.scalar() or 0

        tenant_result = await db.execute(
            select(TenantModel).where(TenantModel.id == tenant_ctx.tenant_id)
        )
        tenant = tenant_result.scalar_one_or_none()
        if tenant is None:
            return False

        quota = int(tenant.device_quota)
        return current_count < quota

    @staticmethod
    async def enforce_isolation(
        db: AsyncSession,
        tenant_ctx: TenantContext,
        device_id: str,
    ) -> bool:
        result = await db.execute(
            select(DeviceModel).where(
                and_(
                    DeviceModel.id == device_id,
                    DeviceModel.tenant_id == tenant_ctx.tenant_id,
                )
            )
        )
        return result.scalar_one_or_none() is not None

    @staticmethod
    async def get_tenant_config(
        db: AsyncSession, tenant_ctx: TenantContext
    ) -> TenantModel | None:
        result = await db.execute(
            select(TenantModel).where(TenantModel.id == tenant_ctx.tenant_id)
        )
        return result.scalar_one_or_none()
