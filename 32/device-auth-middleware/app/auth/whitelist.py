import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import DeviceModel, DeviceWhitelistModel
from app.schemas.common import TenantContext
from app.utils.config import get_config


class WhitelistService:

    @staticmethod
    async def add_to_whitelist(
        db: AsyncSession,
        tenant_ctx: TenantContext,
        device_id: str,
        expire_days: int | None = None,
    ) -> DeviceWhitelistModel:
        isolation = await _is_device_owned(db, tenant_ctx, device_id)
        if not isolation:
            raise ValueError("Device not found or not belongs to tenant")

        existing = await db.execute(
            select(DeviceWhitelistModel).where(
                and_(
                    DeviceWhitelistModel.tenant_id == tenant_ctx.tenant_id,
                    DeviceWhitelistModel.device_id == device_id,
                )
            )
        )
        entry = existing.scalar_one_or_none()
        if entry:
            entry.is_active = True
            if expire_days is not None:
                entry.expires_at = datetime.now(timezone.utc) + timedelta(days=expire_days)
            await db.flush()
            return entry

        cfg = get_config().get("whitelist", {})
        auto_expire = expire_days or cfg.get("auto_expire_days")

        entry = DeviceWhitelistModel(
            id=str(uuid.uuid4()),
            tenant_id=tenant_ctx.tenant_id,
            device_id=device_id,
            is_active=True,
            expires_at=(
                datetime.now(timezone.utc) + timedelta(days=auto_expire)
                if auto_expire
                else None
            ),
        )
        db.add(entry)
        await db.flush()
        return entry

    @staticmethod
    async def remove_from_whitelist(
        db: AsyncSession,
        tenant_ctx: TenantContext,
        device_id: str,
    ) -> bool:
        result = await db.execute(
            select(DeviceWhitelistModel).where(
                and_(
                    DeviceWhitelistModel.tenant_id == tenant_ctx.tenant_id,
                    DeviceWhitelistModel.device_id == device_id,
                    DeviceWhitelistModel.is_active.is_(True),
                )
            )
        )
        entry = result.scalar_one_or_none()
        if entry is None:
            return False
        entry.is_active = False
        await db.flush()
        return True

    @staticmethod
    async def check_whitelist(
        db: AsyncSession,
        tenant_ctx: TenantContext,
        device_id: str,
    ) -> bool:
        cfg = get_config().get("whitelist", {})
        if not cfg.get("enabled", True):
            return True

        result = await db.execute(
            select(DeviceWhitelistModel).where(
                and_(
                    DeviceWhitelistModel.tenant_id == tenant_ctx.tenant_id,
                    DeviceWhitelistModel.device_id == device_id,
                    DeviceWhitelistModel.is_active.is_(True),
                )
            )
        )
        entry = result.scalar_one_or_none()
        if entry is None:
            return False
        if entry.expires_at and entry.expires_at < datetime.now(timezone.utc):
            entry.is_active = False
            await db.flush()
            return False
        return True

    @staticmethod
    async def list_whitelist(
        db: AsyncSession,
        tenant_ctx: TenantContext,
    ) -> list[DeviceWhitelistModel]:
        result = await db.execute(
            select(DeviceWhitelistModel).where(
                DeviceWhitelistModel.tenant_id == tenant_ctx.tenant_id,
            )
        )
        return list(result.scalars().all())


async def _is_device_owned(
    db: AsyncSession, tenant_ctx: TenantContext, device_id: str
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
