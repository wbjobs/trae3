import logging
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db, get_device_db, get_message_log_db
from app.tenant.context import get_current_tenant_id, is_tenant_verified
from app.tenant.models import Tenant
from app.device.models import Device
from app.message_log.models import MessageLog

logger = logging.getLogger(__name__)


async def get_tenant_id() -> str:
    tenant_id = get_current_tenant_id()
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tenant ID is required"
        )
    if not is_tenant_verified():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant identity could not be verified"
        )
    return tenant_id


async def get_current_tenant(
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
) -> Tenant:
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found"
        )
    if not tenant.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant is not active"
        )
    return tenant


class TenantQuotaChecker:
    def __init__(self):
        self._cache: dict = {}
        self._cache_ttl = 30

    def check_device_quota(self, tenant: Tenant, db: Session) -> None:
        current_count = db.query(Device).filter(Device.tenant_id == tenant.id).count()
        if current_count >= tenant.max_devices:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Device quota exceeded: {current_count}/{tenant.max_devices}"
            )

    def check_message_rate(self, tenant_id: str, db: Session, max_per_minute: int = 100) -> None:
        from datetime import datetime, timedelta
        cutoff = datetime.now() - timedelta(minutes=1)
        recent_count = db.query(MessageLog).filter(
            MessageLog.tenant_id == tenant_id,
            MessageLog.created_at >= cutoff
        ).count()
        if recent_count >= max_per_minute:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Message rate limit exceeded: {recent_count}/{max_per_minute} per minute"
            )


quota_checker = TenantQuotaChecker()
