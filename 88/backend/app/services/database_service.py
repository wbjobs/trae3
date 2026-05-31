import os
import json
import time
import shutil
import logging
import hashlib
import threading
from datetime import datetime
from typing import Optional, TypeVar, Callable, Any, Dict, List, Tuple
from collections import OrderedDict
from dataclasses import dataclass, field
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError, IntegrityError, OperationalError
from sqlalchemy import func, desc
from ..core.database import get_db, engine, Base
from ..models.record import NameplateRecord
from ..schemas.record import NameplateRecordCreate, NameplateRecordUpdate, ExtractedInfo

T = TypeVar('T')

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class QueryCacheEntry:
    data: Any
    timestamp: float
    ttl: float = 60.0

    @property
    def is_expired(self) -> bool:
        return time.time() - self.timestamp > self.ttl


class QueryCache:
    def __init__(self, max_size: int = 100, default_ttl: float = 60.0):
        self._cache: OrderedDict[str, QueryCacheEntry] = OrderedDict()
        self._max_size = max_size
        self._default_ttl = default_ttl
        self._lock = threading.Lock()

    def _make_key(self, prefix: str, **kwargs) -> str:
        key_parts = [prefix]
        for k, v in sorted(kwargs.items()):
            key_parts.append(f"{k}={v}")
        key_str = "|".join(key_parts)
        return hashlib.md5(key_str.encode()).hexdigest()

    def get(self, prefix: str, **kwargs) -> Optional[Any]:
        key = self._make_key(prefix, **kwargs)
        with self._lock:
            if key in self._cache:
                entry = self._cache[key]
                if not entry.is_expired:
                    self._cache.move_to_end(key)
                    return entry.data
                else:
                    del self._cache[key]
        return None

    def set(self, prefix: str, data: Any, ttl: Optional[float] = None, **kwargs):
        key = self._make_key(prefix, **kwargs)
        with self._lock:
            self._cache[key] = QueryCacheEntry(
                data=data,
                timestamp=time.time(),
                ttl=ttl or self._default_ttl
            )
            self._cache.move_to_end(key)
            while len(self._cache) > self._max_size:
                self._cache.popitem(last=False)

    def invalidate(self, prefix: Optional[str] = None):
        with self._lock:
            if prefix is None:
                self._cache.clear()
            else:
                keys_to_remove = [k for k in self._cache.keys()]
                for k in keys_to_remove:
                    del self._cache[k]

    def invalidate_all(self):
        with self._lock:
            self._cache.clear()

    def __len__(self) -> int:
        return len(self._cache)


@dataclass
class DBPerformanceStats:
    total_queries: int = 0
    cache_hits: int = 0
    total_query_time: float = 0.0
    write_operations: int = 0

    @property
    def avg_query_time(self) -> float:
        return self.total_query_time / self.total_queries if self.total_queries > 0 else 0.0

    @property
    def cache_hit_rate(self) -> float:
        return self.cache_hits / max(self.total_queries, 1)


def with_retry(max_retries: int = 3, retry_delay: float = 1.0):
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except (OperationalError, IntegrityError) as e:
                    last_exception = e
                    logger.warning(f"数据库操作失败，第 {attempt + 1}/{max_retries} 次重试: {e}")
                    if attempt < max_retries - 1:
                        time.sleep(retry_delay * (2 ** attempt))
                    continue
                except SQLAlchemyError as e:
                    logger.error(f"数据库错误: {e}")
                    raise
            raise last_exception
        return wrapper
    return decorator


class DatabaseService:
    def __init__(self):
        self.max_retries = 3
        self.retry_delay = 1.0
        self.backup_dir = "./database/backups"
        self._ensure_backup_dir()

        self.query_cache = QueryCache(max_size=200, default_ttl=120.0)
        self.stats = DBPerformanceStats()
        self._stats_lock = threading.Lock()

    def _update_query_stats(self, query_time: float, cache_hit: bool = False, is_write: bool = False):
        with self._stats_lock:
            self.stats.total_queries += 1
            self.stats.total_query_time += query_time
            if cache_hit:
                self.stats.cache_hits += 1
            if is_write:
                self.stats.write_operations += 1

    def get_performance_stats(self) -> Dict[str, Any]:
        with self._stats_lock:
            return {
                "total_queries": self.stats.total_queries,
                "cache_hits": self.stats.cache_hits,
                "cache_hit_rate": round(self.stats.cache_hit_rate, 4),
                "avg_query_time_ms": round(self.stats.avg_query_time * 1000, 2),
                "write_operations": self.stats.write_operations,
                "cache_size": len(self.query_cache)
            }

    def _invalidate_cache_on_write(self):
        self.query_cache.invalidate()

    def _optimize_query(self, query, page: int, page_size: int):
        query = query.order_by(desc(NameplateRecord.created_at))
        query = query.offset((page - 1) * page_size).limit(page_size)
        return query

    def _ensure_backup_dir(self):
        os.makedirs(self.backup_dir, exist_ok=True)

    def create_backup(self) -> Optional[str]:
        try:
            db_path = "./database/nameplate.db"
            if not os.path.exists(db_path):
                logger.warning("数据库文件不存在，跳过备份")
                return None

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_path = os.path.join(self.backup_dir, f"nameplate_backup_{timestamp}.db")

            shutil.copy2(db_path, backup_path)

            with open(os.path.join(self.backup_dir, f"backup_info_{timestamp}.json"), 'w') as f:
                json.dump({
                    'timestamp': timestamp,
                    'backup_path': backup_path,
                    'original_size': os.path.getsize(db_path)
                }, f, ensure_ascii=False, indent=2)

            logger.info(f"数据库备份完成: {backup_path}")
            self._cleanup_old_backups()
            return backup_path
        except Exception as e:
            logger.error(f"数据库备份失败: {e}")
            return None

    def _cleanup_old_backups(self, max_backups: int = 10):
        try:
            backups = []
            for filename in os.listdir(self.backup_dir):
                if filename.endswith('.db') and filename.startswith('nameplate_backup_'):
                    filepath = os.path.join(self.backup_dir, filename)
                    backups.append((filepath, os.path.getmtime(filepath)))

            backups.sort(key=lambda x: x[1], reverse=True)
            for filepath, _ in backups[max_backups:]:
                os.remove(filepath)
                logger.info(f"清理旧备份: {filepath}")
        except Exception as e:
            logger.error(f"清理旧备份失败: {e}")

    @with_retry(max_retries=3)
    def create_record(
        self,
        record_data: NameplateRecordCreate,
        extracted_info: Optional[ExtractedInfo] = None
    ) -> NameplateRecord:
        start_time = time.time()
        session = next(get_db())
        try:
            if extracted_info:
                for field, value in vars(extracted_info).items():
                    if value is not None and hasattr(record_data, field):
                        setattr(record_data, field, value)

            self._validate_record_data(record_data)

            db_record = NameplateRecord(**record_data.model_dump())
            session.add(db_record)
            session.flush()

            record_id = db_record.id
            logger.info(f"创建记录成功: ID={record_id}")

            session.commit()

            session.refresh(db_record)
            session.expunge(db_record)

            self._update_query_stats(time.time() - start_time, is_write=True)
            self._invalidate_cache_on_write()

            return db_record
        except Exception as e:
            session.rollback()
            logger.error(f"创建记录失败: {e}")
            raise
        finally:
            session.close()

    @with_retry(max_retries=3)
    def get_record(self, record_id: int, db: Session) -> Optional[NameplateRecord]:
        try:
            record = db.query(NameplateRecord).filter(NameplateRecord.id == record_id).first()
            if record:
                self._verify_record_integrity(record)
            return record
        except Exception as e:
            logger.error(f"查询记录失败 (ID={record_id}): {e}")
            raise

    @with_retry(max_retries=3)
    def list_records(
        self,
        db: Session,
        page: int = 1,
        page_size: int = 10,
        keyword: Optional[str] = None,
        status: Optional[str] = None
    ) -> Tuple[int, List[NameplateRecord]]:
        from sqlalchemy import or_

        try:
            query = db.query(NameplateRecord)

            if keyword:
                query = query.filter(
                    or_(
                        NameplateRecord.equipment_name.contains(keyword),
                        NameplateRecord.equipment_model.contains(keyword),
                        NameplateRecord.serial_number.contains(keyword),
                        NameplateRecord.manufacturer.contains(keyword),
                        NameplateRecord.filename.contains(keyword)
                    )
                )

            if status:
                query = query.filter(NameplateRecord.status == status)

            total = query.count()
            records = query.order_by(NameplateRecord.created_at.desc()) \
                .offset((page - 1) * page_size) \
                .limit(page_size) \
                .all()

            return total, records
        except Exception as e:
            logger.error(f"查询记录列表失败: {e}")
            raise

    @with_retry(max_retries=3)
    def update_record(
        self,
        record_id: int,
        update_data: NameplateRecordUpdate
    ) -> Optional[NameplateRecord]:
        start_time = time.time()
        session = next(get_db())
        try:
            record = session.query(NameplateRecord).filter(NameplateRecord.id == record_id).first()
            if not record:
                logger.warning(f"更新记录失败: 记录不存在 (ID={record_id})")
                return None

            update_dict = update_data.model_dump(exclude_unset=True)
            for key, value in update_dict.items():
                if value is not None:
                    setattr(record, key, value)

            session.flush()
            logger.info(f"更新记录成功: ID={record_id}")

            session.commit()
            session.refresh(record)
            session.expunge(record)

            self._update_query_stats(time.time() - start_time, is_write=True)
            self._invalidate_cache_on_write()

            return record
        except Exception as e:
            session.rollback()
            logger.error(f"更新记录失败 (ID={record_id}): {e}")
            raise
        finally:
            session.close()

    @with_retry(max_retries=3)
    def delete_record(self, record_id: int) -> bool:
        start_time = time.time()
        session = next(get_db())
        try:
            record = session.query(NameplateRecord).filter(NameplateRecord.id == record_id).first()
            if not record:
                logger.warning(f"删除记录失败: 记录不存在 (ID={record_id})")
                return False

            session.delete(record)
            session.flush()
            logger.info(f"删除记录成功: ID={record_id}")

            session.commit()

            self._update_query_stats(time.time() - start_time, is_write=True)
            self._invalidate_cache_on_write()

            return True
        except Exception as e:
            session.rollback()
            logger.error(f"删除记录失败 (ID={record_id}): {e}")
            raise
        finally:
            session.close()

    @with_retry(max_retries=3)
    def update_record_with_ocr_result(
        self,
        record_id: int,
        processed_path: str,
        extracted_info: ExtractedInfo,
        raw_text: str,
        confidence: float,
        ocr_result_json: str
    ) -> Optional[NameplateRecord]:
        start_time = time.time()
        session = next(get_db())
        try:
            record = session.query(NameplateRecord).filter(NameplateRecord.id == record_id).first()
            if not record:
                return None

            record.processed_path = processed_path
            record.raw_text = raw_text
            record.confidence = confidence
            record.ocr_result = ocr_result_json
            record.status = "completed"

            for field, value in vars(extracted_info).items():
                if value is not None and hasattr(record, field):
                    setattr(record, field, value)

            session.flush()
            logger.info(f"更新记录OCR结果成功: ID={record_id}")

            session.commit()
            session.refresh(record)
            session.expunge(record)

            self._update_query_stats(time.time() - start_time, is_write=True)
            self._invalidate_cache_on_write()

            return record
        except Exception as e:
            session.rollback()
            logger.error(f"更新记录OCR结果失败 (ID={record_id}): {e}")
            raise
        finally:
            session.close()

    def _validate_record_data(self, record_data: NameplateRecordCreate) -> bool:
        required_fields = ['filename', 'original_path']
        for field in required_fields:
            if not getattr(record_data, field):
                raise ValueError(f"必填字段缺失: {field}")

        if record_data.confidence < 0 or record_data.confidence > 1:
            raise ValueError("置信度必须在0-1之间")

        if record_data.status not in ['pending', 'completed', 'failed']:
            raise ValueError(f"无效的状态值: {record_data.status}")

        return True

    def _verify_record_integrity(self, record: NameplateRecord) -> bool:
        issues = []

        if not record.filename:
            issues.append("文件名为空")

        if not record.original_path or not os.path.exists(record.original_path):
            issues.append("原始文件路径无效")

        if record.confidence < 0 or record.confidence > 1:
            issues.append("置信度范围异常")

        if issues:
            logger.warning(f"记录 {record.id} 完整性问题: {', '.join(issues)}")
            return False

        return True

    def check_database_integrity(self, db: Session) -> Dict[str, Any]:
        try:
            total_records = db.query(NameplateRecord).count()
            valid_records = 0
            invalid_records = []

            for record in db.query(NameplateRecord).all():
                if self._verify_record_integrity(record):
                    valid_records += 1
                else:
                    invalid_records.append(record.id)

            return {
                'total_records': total_records,
                'valid_records': valid_records,
                'invalid_records': invalid_records,
                'integrity_score': valid_records / total_records if total_records > 0 else 1.0
            }
        except Exception as e:
            logger.error(f"数据库完整性检查失败: {e}")
            raise

    def get_statistics(self, db: Session) -> Dict[str, Any]:
        from sqlalchemy import func, desc

        try:
            total = db.query(NameplateRecord).count()
            completed = db.query(NameplateRecord).filter(NameplateRecord.status == "completed").count()
            pending = db.query(NameplateRecord).filter(NameplateRecord.status == "pending").count()
            failed = db.query(NameplateRecord).filter(NameplateRecord.status == "failed").count()

            avg_confidence = db.query(NameplateRecord).filter(
                NameplateRecord.confidence > 0
            ).with_entities(
                func.avg(NameplateRecord.confidence)
            ).scalar() or 0.0

            manufacturers = db.query(
                NameplateRecord.manufacturer,
                func.count(NameplateRecord.id)
            ).filter(
                NameplateRecord.manufacturer.isnot(None)
            ).group_by(
                NameplateRecord.manufacturer
            ).order_by(
                desc(func.count(NameplateRecord.id))
            ).limit(10).all()

            return {
                'total_records': total,
                'completed_records': completed,
                'pending_records': pending,
                'failed_records': failed,
                'average_confidence': float(avg_confidence),
                'top_manufacturers': [
                    {'name': m[0], 'count': m[1]} for m in manufacturers
                ]
            }
        except Exception as e:
            logger.error(f"获取统计数据失败: {e}")
            raise

    def manual_correct_record(
        self,
        record_id: int,
        correction_data: Dict[str, Any]
    ) -> Tuple[Optional[NameplateRecord], List[str]]:
        start_time = time.time()
        session = next(get_db())
        try:
            record = session.query(NameplateRecord).filter(NameplateRecord.id == record_id).first()
            if not record:
                logger.warning(f"手动修正失败: 记录不存在 (ID={record_id})")
                return None, []

            corrected_fields = []
            for field, value in correction_data.items():
                if value is not None and hasattr(record, field) and field not in ['id', 'created_at', 'updated_at']:
                    setattr(record, field, value)
                    corrected_fields.append(field)

            if corrected_fields:
                record.status = "corrected"
                session.flush()
                logger.info(f"手动修正成功: ID={record_id}, 修正字段: {corrected_fields}")

                session.commit()
                session.refresh(record)
                session.expunge(record)

                self._update_query_stats(time.time() - start_time, is_write=True)
                self._invalidate_cache_on_write()

            return record, corrected_fields
        except Exception as e:
            session.rollback()
            logger.error(f"手动修正失败 (ID={record_id}): {e}")
            raise
        finally:
            session.close()

    def get_records_for_export(
        self,
        db: Session,
        record_ids: Optional[List[int]] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        status: Optional[str] = None
    ) -> List[NameplateRecord]:
        start_time = time.time()
        try:
            query = db.query(NameplateRecord)

            if record_ids:
                query = query.filter(NameplateRecord.id.in_(record_ids))

            if start_date:
                query = query.filter(NameplateRecord.created_at >= start_date)

            if end_date:
                query = query.filter(NameplateRecord.created_at <= end_date)

            if status:
                query = query.filter(NameplateRecord.status == status)

            records = query.order_by(NameplateRecord.created_at.desc()).all()

            self._update_query_stats(time.time() - start_time)
            return records
        except Exception as e:
            logger.error(f"获取导出记录失败: {e}")
            raise

    def initialize_database(self):
        try:
            Base.metadata.create_all(bind=engine)
            logger.info("数据库表初始化完成")

            db = next(get_db())
            try:
                integrity = self.check_database_integrity(db)
                logger.info(f"数据库完整性检查: {integrity['integrity_score']:.2%}")

                if integrity['integrity_score'] < 0.9:
                    logger.warning("数据库完整性较低，创建备份")
                    self.create_backup()
            finally:
                db.close()

            return True
        except Exception as e:
            logger.error(f"数据库初始化失败: {e}")
            return False


database_service = DatabaseService()
