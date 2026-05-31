import uuid
from datetime import datetime, timezone

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLogModel
from app.schemas.common import TenantContext
from app.utils.config import get_config


class AuditLogService:

    @staticmethod
    async def log(
        db: AsyncSession,
        tenant_ctx: TenantContext,
        actor_id: str,
        action: str,
        resource_type: str,
        resource_id: str,
        detail: str | None = None,
        ip_address: str | None = None,
    ) -> AuditLogModel:
        cfg = get_config().get("cluster", {})
        node_id = cfg.get("node_id", "standalone")

        entry = AuditLogModel(
            id=str(uuid.uuid4()),
            tenant_id=tenant_ctx.tenant_id,
            actor_id=actor_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            detail=detail,
            ip_address=ip_address,
            node_id=node_id,
        )
        db.add(entry)
        await db.flush()
        return entry

    @staticmethod
    async def query_logs(
        db: AsyncSession,
        tenant_ctx: TenantContext,
        action: str | None = None,
        resource_type: str | None = None,
        resource_id: str | None = None,
        actor_id: str | None = None,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[AuditLogModel], int]:
        conditions = [AuditLogModel.tenant_id == tenant_ctx.tenant_id]
        if action:
            conditions.append(AuditLogModel.action == action)
        if resource_type:
            conditions.append(AuditLogModel.resource_type == resource_type)
        if resource_id:
            conditions.append(AuditLogModel.resource_id == resource_id)
        if actor_id:
            conditions.append(AuditLogModel.actor_id == actor_id)
        if start_time:
            conditions.append(AuditLogModel.created_at >= start_time)
        if end_time:
            conditions.append(AuditLogModel.created_at <= end_time)

        count_result = await db.execute(
            select(AuditLogModel).where(and_(*conditions))
        )
        total = len(count_result.scalars().all())

        result = await db.execute(
            select(AuditLogModel)
            .where(and_(*conditions))
            .order_by(AuditLogModel.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        logs = list(result.scalars().all())
        return logs, total
