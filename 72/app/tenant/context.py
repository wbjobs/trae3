import logging
from contextvars import ContextVar
from datetime import datetime
from typing import Optional, Dict, Any
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class TenantInfo:
    tenant_id: str
    verified: bool = False
    set_at: datetime = field(default_factory=datetime.now)
    source: str = "header"
    request_id: Optional[str] = None


tenant_context: ContextVar[Optional[TenantInfo]] = ContextVar("tenant_info", default=None)


def get_current_tenant_id() -> Optional[str]:
    info = tenant_context.get()
    return info.tenant_id if info else None


def get_tenant_info() -> Optional[TenantInfo]:
    return tenant_context.get()


def set_tenant_info(tenant_id: str, verified: bool = False, source: str = "header", request_id: Optional[str] = None):
    info = TenantInfo(
        tenant_id=tenant_id,
        verified=verified,
        source=source,
        request_id=request_id
    )
    tenant_context.set(info)


def is_tenant_verified() -> bool:
    info = tenant_context.get()
    return info.verified if info else False
