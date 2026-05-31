from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, Index
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()

class ConfigVersion(Base):
    __tablename__ = "config_versions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    app_id = Column(String(128), nullable=False, index=True)
    namespace = Column(String(128), nullable=False, index=True)
    version = Column(Integer, nullable=False, index=True)
    config_data = Column(JSON, nullable=False)
    config_hash = Column(String(64), index=True)
    change_type = Column(String(32), default="update")
    description = Column(String(512), default="")
    operator = Column(String(64), default="system")
    diff_summary = Column(JSON)
    created_at = Column(DateTime, default=datetime.now, index=True)

    __table_args__ = (
        Index("idx_app_namespace_version", "app_id", "namespace", "version", unique=True),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "app_id": self.app_id,
            "namespace": self.namespace,
            "version": self.version,
            "config_data": self.config_data,
            "config_hash": self.config_hash,
            "change_type": self.change_type,
            "description": self.description,
            "operator": self.operator,
            "diff_summary": self.diff_summary,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

class RollbackRecord(Base):
    __tablename__ = "rollback_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    app_id = Column(String(128), nullable=False, index=True)
    namespace = Column(String(128), nullable=False, index=True)
    from_version = Column(Integer, nullable=False)
    to_version = Column(Integer, nullable=False)
    task_id = Column(String(64), index=True)
    operator = Column(String(64), default="system")
    reason = Column(String(512), default="")
    status = Column(String(32), default="success")
    details = Column(JSON)
    created_at = Column(DateTime, default=datetime.now, index=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "app_id": self.app_id,
            "namespace": self.namespace,
            "from_version": self.from_version,
            "to_version": self.to_version,
            "task_id": self.task_id,
            "operator": self.operator,
            "reason": self.reason,
            "status": self.status,
            "details": self.details,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

class ConfigChangeLog(Base):
    __tablename__ = "config_change_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    app_id = Column(String(128), nullable=False, index=True)
    namespace = Column(String(128), nullable=False, index=True)
    version = Column(Integer, nullable=False, index=True)
    key_path = Column(String(256), nullable=False, index=True)
    change_type = Column(String(16), nullable=False)
    old_value = Column(Text)
    new_value = Column(Text)
    created_at = Column(DateTime, default=datetime.now)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "app_id": self.app_id,
            "namespace": self.namespace,
            "version": self.version,
            "key_path": self.key_path,
            "change_type": self.change_type,
            "old_value": self.old_value,
            "new_value": self.new_value,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
