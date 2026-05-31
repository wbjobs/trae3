import os
import json
import hashlib
from typing import Any, Dict, List, Optional
from datetime import datetime
from configtool.utils import get_logger, DatabaseError, deep_diff
from .models import Base, ConfigVersion, RollbackRecord, ConfigChangeLog

logger = get_logger("version_db")

class VersionDB:
    def __init__(self, db_url: Optional[str] = None):
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker

        self.db_url = db_url or self._build_db_url()
        logger.debug(f"初始化版本数据库: {self.db_url}")

        try:
            self.engine = create_engine(self.db_url, pool_pre_ping=True, pool_recycle=3600)
            Base.metadata.create_all(self.engine)
            Session = sessionmaker(bind=self.engine)
            self.Session = Session
            logger.info("版本数据库连接成功")
        except Exception as e:
            raise DatabaseError(f"数据库连接失败: {e}")

    def _build_db_url(self) -> str:
        host = os.environ.get("DB_HOST", "localhost")
        port = os.environ.get("DB_PORT", "3306")
        user = os.environ.get("DB_USER", "root")
        password = os.environ.get("DB_PASSWORD", "")
        db_name = os.environ.get("DB_NAME", "config_version")
        charset = os.environ.get("DB_CHARSET", "utf8mb4")

        return f"mysql+pymysql://{user}:{password}@{host}:{port}/{db_name}?charset={charset}"

    def _get_session(self):
        return self.Session()

    def _calculate_hash(self, config_data: Dict[str, Any]) -> str:
        data_str = json.dumps(config_data, sort_keys=True, ensure_ascii=False)
        return hashlib.md5(data_str.encode("utf-8")).hexdigest()

    def get_next_version(self, app_id: str, namespace: str) -> int:
        session = self._get_session()
        try:
            from sqlalchemy import func
            max_version = (
                session.query(func.max(ConfigVersion.version))
                .filter(
                    ConfigVersion.app_id == app_id,
                    ConfigVersion.namespace == namespace,
                )
                .scalar()
            )
            return (max_version or 0) + 1
        finally:
            session.close()

    def save_config_version(
        self,
        app_id: str,
        namespace: str,
        config_data: Dict[str, Any],
        operator: str = "system",
        change_type: str = "update",
        description: str = "",
        previous_version: Optional[int] = None,
    ) -> int:
        session = self._get_session()
        try:
            config_hash = self._calculate_hash(config_data)

            last_version = self.get_latest_version(app_id, namespace)
            if last_version and last_version["config_hash"] == config_hash:
                logger.info(
                    f"配置未变更，跳过保存: app={app_id}, namespace={namespace}"
                )
                return last_version["version"]

            version = self.get_next_version(app_id, namespace)

            diff_summary = None
            if previous_version is None and last_version:
                previous_version = last_version["version"]

            if previous_version:
                prev_data = self.get_config_version(app_id, namespace, previous_version)
                if prev_data:
                    diffs = deep_diff(prev_data["config_data"], config_data)
                    diff_summary = {
                        "total_diffs": len(diffs),
                        "added": sum(1 for d in diffs if d[1] == "added"),
                        "removed": sum(1 for d in diffs if d[1] == "removed"),
                        "modified": sum(1 for d in diffs if d[1] == "modified"),
                    }

                    for key_path, change_type_str, old_val, new_val in diffs:
                        change_log = ConfigChangeLog(
                            app_id=app_id,
                            namespace=namespace,
                            version=version,
                            key_path=key_path,
                            change_type=change_type_str,
                            old_value=json.dumps(old_val, ensure_ascii=False) if old_val is not None else None,
                            new_value=json.dumps(new_val, ensure_ascii=False) if new_val is not None else None,
                        )
                        session.add(change_log)

            config_version = ConfigVersion(
                app_id=app_id,
                namespace=namespace,
                version=version,
                config_data=config_data,
                config_hash=config_hash,
                change_type=change_type,
                description=description,
                operator=operator,
                diff_summary=diff_summary,
            )
            session.add(config_version)
            session.commit()

            logger.info(
                f"配置版本已保存: app={app_id}, namespace={namespace}, "
                f"version={version}, operator={operator}"
            )

            return version
        except Exception as e:
            session.rollback()
            raise DatabaseError(f"保存配置版本失败: {e}")
        finally:
            session.close()

    def get_config_version(
        self,
        app_id: str,
        namespace: str,
        version: Optional[int] = None,
    ) -> Optional[Dict[str, Any]]:
        session = self._get_session()
        try:
            query = session.query(ConfigVersion).filter(
                ConfigVersion.app_id == app_id,
                ConfigVersion.namespace == namespace,
            )

            if version is not None:
                query = query.filter(ConfigVersion.version == version)
            else:
                query = query.order_by(ConfigVersion.version.desc())

            result = query.first()
            return result.to_dict() if result else None
        finally:
            session.close()

    def get_latest_version(
        self,
        app_id: str,
        namespace: str,
    ) -> Optional[Dict[str, Any]]:
        return self.get_config_version(app_id, namespace)

    def list_versions(
        self,
        app_id: str,
        namespace: str,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        session = self._get_session()
        try:
            from sqlalchemy import func

            query = session.query(ConfigVersion).filter(
                ConfigVersion.app_id == app_id,
                ConfigVersion.namespace == namespace,
            )

            total = query.count()
            results = (
                query.order_by(ConfigVersion.version.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
                .all()
            )

            return {
                "total": total,
                "page": page,
                "page_size": page_size,
                "total_pages": (total + page_size - 1) // page_size,
                "items": [r.to_dict() for r in results],
            }
        finally:
            session.close()

    def get_version_diff(
        self,
        app_id: str,
        namespace: str,
        version1: int,
        version2: Optional[int] = None,
    ) -> Dict[str, Any]:
        v1_data = self.get_config_version(app_id, namespace, version1)
        if not v1_data:
            raise DatabaseError(f"版本不存在: {version1}")

        if version2 is None:
            latest = self.get_latest_version(app_id, namespace)
            if not latest:
                raise DatabaseError("没有找到最新版本")
            version2 = latest["version"]

        v2_data = self.get_config_version(app_id, namespace, version2)
        if not v2_data:
            raise DatabaseError(f"版本不存在: {version2}")

        diffs = deep_diff(v1_data["config_data"], v2_data["config_data"])

        return {
            "app_id": app_id,
            "namespace": namespace,
            "from_version": version1,
            "to_version": version2,
            "total_diffs": len(diffs),
            "diffs": [
                {
                    "key_path": d[0],
                    "change_type": d[1],
                    "old_value": d[2],
                    "new_value": d[3],
                }
                for d in diffs
            ],
        }

    def record_rollback(
        self,
        app_id: str,
        namespace: str,
        from_version: int,
        to_version: int,
        task_id: str,
        operator: str = "system",
        reason: str = "",
        status: str = "success",
        details: Optional[Dict[str, Any]] = None,
    ) -> int:
        session = self._get_session()
        try:
            record = RollbackRecord(
                app_id=app_id,
                namespace=namespace,
                from_version=from_version,
                to_version=to_version,
                task_id=task_id,
                operator=operator,
                reason=reason,
                status=status,
                details=details,
            )
            session.add(record)
            session.commit()

            logger.info(
                f"回滚记录已保存: app={app_id}, namespace={namespace}, "
                f"from={from_version}, to={to_version}, status={status}"
            )

            return record.id
        except Exception as e:
            session.rollback()
            raise DatabaseError(f"保存回滚记录失败: {e}")
        finally:
            session.close()

    def list_rollback_records(
        self,
        app_id: Optional[str] = None,
        namespace: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        session = self._get_session()
        try:
            query = session.query(RollbackRecord)

            if app_id:
                query = query.filter(RollbackRecord.app_id == app_id)
            if namespace:
                query = query.filter(RollbackRecord.namespace == namespace)

            total = query.count()
            results = (
                query.order_by(RollbackRecord.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
                .all()
            )

            return {
                "total": total,
                "page": page,
                "page_size": page_size,
                "total_pages": (total + page_size - 1) // page_size,
                "items": [r.to_dict() for r in results],
            }
        finally:
            session.close()

    def get_change_logs(
        self,
        app_id: str,
        namespace: str,
        version: Optional[int] = None,
        page: int = 1,
        page_size: int = 100,
    ) -> Dict[str, Any]:
        session = self._get_session()
        try:
            query = session.query(ConfigChangeLog).filter(
                ConfigChangeLog.app_id == app_id,
                ConfigChangeLog.namespace == namespace,
            )

            if version is not None:
                query = query.filter(ConfigChangeLog.version == version)

            total = query.count()
            results = (
                query.order_by(ConfigChangeLog.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
                .all()
            )

            return {
                "total": total,
                "page": page,
                "page_size": page_size,
                "total_pages": (total + page_size - 1) // page_size,
                "items": [r.to_dict() for r in results],
            }
        finally:
            session.close()

    def check_connection(self) -> bool:
        try:
            session = self._get_session()
            session.execute("SELECT 1")
            session.close()
            return True
        except Exception as e:
            logger.error(f"数据库连接检查失败: {e}")
            return False

    def close(self) -> None:
        if hasattr(self, "engine"):
            self.engine.dispose()
            logger.debug("数据库连接已关闭")

    def __enter__(self) -> "VersionDB":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()
