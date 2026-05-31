import ipaddress
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.access_control import IPBlacklistModel, IPWhitelistModel, DeviceBlacklistModel
from app.redis import get_redis
from app.schemas.common import TenantContext

logger = logging.getLogger(__name__)

_IP_CACHE_TTL = 60
_DEVICE_BLACKLIST_CACHE_TTL = 60


class AccessControlService:

    @staticmethod
    async def check_ip_access(
        db: AsyncSession,
        tenant_ctx: TenantContext,
        ip_address: str,
    ) -> tuple[bool, str]:
        redis = get_redis()
        cache_key = f"ip_access:{tenant_ctx.tenant_id}:{ip_address}"
        cached = await redis.get(cache_key)
        if cached is not None:
            return cached == "1", "cache"

        wl_mode = await AccessControlService._get_ip_whitelist_mode(tenant_ctx)
        if wl_mode:
            wl = await db.execute(
                select(IPWhitelistModel).where(
                    and_(
                        IPWhitelistModel.tenant_id == tenant_ctx.tenant_id,
                        IPWhitelistModel.is_active.is_(True),
                    )
                )
            )
            wl_entries = wl.scalars().all()
            ip_allowed = False
            for entry in wl_entries:
                if AccessControlService._ip_matches(ip_address, entry.ip_address, entry.ip_cidr):
                    if entry.expires_at and entry.expires_at < datetime.now(timezone.utc):
                        continue
                    ip_allowed = True
                    break
            if not ip_allowed:
                await redis.setex(cache_key, _IP_CACHE_TTL, "0")
                return False, "ip_whitelist"

        bl = await db.execute(
            select(IPBlacklistModel).where(
                and_(
                    IPBlacklistModel.tenant_id == tenant_ctx.tenant_id,
                    IPBlacklistModel.is_active.is_(True),
                )
            )
        )
        bl_entries = bl.scalars().all()
        for entry in bl_entries:
            if AccessControlService._ip_matches(ip_address, entry.ip_address, entry.ip_cidr):
                if entry.expires_at and entry.expires_at < datetime.now(timezone.utc):
                    continue
                await redis.setex(cache_key, _IP_CACHE_TTL, "0")
                return False, "ip_blacklist"

        await redis.setex(cache_key, _IP_CACHE_TTL, "1")
        return True, "pass"

    @staticmethod
    async def check_device_blacklist(
        db: AsyncSession,
        tenant_ctx: TenantContext,
        device_id: str,
    ) -> bool:
        redis = get_redis()
        cache_key = f"device_bl:{tenant_ctx.tenant_id}:{device_id}"
        cached = await redis.get(cache_key)
        if cached is not None:
            return cached == "0"

        result = await db.execute(
            select(DeviceBlacklistModel).where(
                and_(
                    DeviceBlacklistModel.tenant_id == tenant_ctx.tenant_id,
                    DeviceBlacklistModel.device_id == device_id,
                    DeviceBlacklistModel.is_active.is_(True),
                )
            )
        )
        entry = result.scalar_one_or_none()
        if entry is None:
            await redis.setex(cache_key, _DEVICE_BLACKLIST_CACHE_TTL, "1")
            return True

        if entry.expires_at and entry.expires_at < datetime.now(timezone.utc):
            entry.is_active = False
            await db.flush()
            await redis.setex(cache_key, _DEVICE_BLACKLIST_CACHE_TTL, "1")
            return True

        await redis.setex(cache_key, _DEVICE_BLACKLIST_CACHE_TTL, "0")
        return False

    @staticmethod
    async def add_ip_to_blacklist(
        db: AsyncSession,
        tenant_ctx: TenantContext,
        ip_address: str,
        ip_cidr: str | None = None,
        reason: str | None = None,
        expires_at: datetime | None = None,
    ) -> IPBlacklistModel:
        existing = await db.execute(
            select(IPBlacklistModel).where(
                and_(
                    IPBlacklistModel.tenant_id == tenant_ctx.tenant_id,
                    IPBlacklistModel.ip_address == ip_address,
                    IPBlacklistModel.is_active.is_(True),
                )
            )
        )
        entry = existing.scalar_one_or_none()
        if entry:
            entry.reason = reason or entry.reason
            entry.expires_at = expires_at or entry.expires_at
            await db.flush()
            return entry

        entry = IPBlacklistModel(
            id=str(uuid.uuid4()),
            tenant_id=tenant_ctx.tenant_id,
            ip_address=ip_address,
            ip_cidr=ip_cidr,
            reason=reason,
            is_active=True,
            expires_at=expires_at,
        )
        db.add(entry)
        await db.flush()
        await AccessControlService._invalidate_ip_cache(tenant_ctx, ip_address)
        return entry

    @staticmethod
    async def add_device_to_blacklist(
        db: AsyncSession,
        tenant_ctx: TenantContext,
        device_id: str,
        reason: str | None = None,
        expires_at: datetime | None = None,
    ) -> DeviceBlacklistModel:
        existing = await db.execute(
            select(DeviceBlacklistModel).where(
                and_(
                    DeviceBlacklistModel.tenant_id == tenant_ctx.tenant_id,
                    DeviceBlacklistModel.device_id == device_id,
                    DeviceBlacklistModel.is_active.is_(True),
                )
            )
        )
        entry = existing.scalar_one_or_none()
        if entry:
            entry.reason = reason or entry.reason
            entry.expires_at = expires_at or entry.expires_at
            await db.flush()
            return entry

        entry = DeviceBlacklistModel(
            id=str(uuid.uuid4()),
            tenant_id=tenant_ctx.tenant_id,
            device_id=device_id,
            reason=reason,
            is_active=True,
            expires_at=expires_at,
        )
        db.add(entry)
        await db.flush()
        await AccessControlService._invalidate_device_bl_cache(tenant_ctx, device_id)
        return entry

    @staticmethod
    async def remove_ip_from_blacklist(
        db: AsyncSession,
        tenant_ctx: TenantContext,
        ip_address: str,
    ) -> bool:
        result = await db.execute(
            select(IPBlacklistModel).where(
                and_(
                    IPBlacklistModel.tenant_id == tenant_ctx.tenant_id,
                    IPBlacklistModel.ip_address == ip_address,
                    IPBlacklistModel.is_active.is_(True),
                )
            )
        )
        entry = result.scalar_one_or_none()
        if entry is None:
            return False
        entry.is_active = False
        await db.flush()
        await AccessControlService._invalidate_ip_cache(tenant_ctx, ip_address)
        return True

    @staticmethod
    async def remove_device_from_blacklist(
        db: AsyncSession,
        tenant_ctx: TenantContext,
        device_id: str,
    ) -> bool:
        result = await db.execute(
            select(DeviceBlacklistModel).where(
                and_(
                    DeviceBlacklistModel.tenant_id == tenant_ctx.tenant_id,
                    DeviceBlacklistModel.device_id == device_id,
                    DeviceBlacklistModel.is_active.is_(True),
                )
            )
        )
        entry = result.scalar_one_or_none()
        if entry is None:
            return False
        entry.is_active = False
        await db.flush()
        await AccessControlService._invalidate_device_bl_cache(tenant_ctx, device_id)
        return True

    @staticmethod
    async def _get_ip_whitelist_mode(tenant_ctx: TenantContext) -> bool:
        from app.utils.config import get_config
        return get_config().get("access_control", {}).get("ip_whitelist_mode", False)

    @staticmethod
    def _ip_matches(ip: str, rule_ip: str, rule_cidr: str | None) -> bool:
        try:
            target = ipaddress.ip_address(ip)
            if rule_cidr:
                return target in ipaddress.ip_network(rule_cidr, strict=False)
            return str(target) == rule_ip
        except ValueError:
            return ip == rule_ip

    @staticmethod
    async def _invalidate_ip_cache(tenant_ctx: TenantContext, ip_address: str):
        redis = get_redis()
        await redis.delete(f"ip_access:{tenant_ctx.tenant_id}:{ip_address}")

    @staticmethod
    async def _invalidate_device_bl_cache(tenant_ctx: TenantContext, device_id: str):
        redis = get_redis()
        await redis.delete(f"device_bl:{tenant_ctx.tenant_id}:{device_id}")
