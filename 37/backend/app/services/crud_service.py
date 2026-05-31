from typing import List, Optional, Type, TypeVar, Dict, Any, Tuple
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc, func, text
from app.models.device import Device
from app.models.vibration_data import VibrationData
from app.models.analysis_result import AnalysisResult
from app.models.anomaly import AnomalyRecord
from app.models.report import Report
from app.models.schemas import (
    DeviceCreate, DeviceUpdate,
    VibrationDataCreate,
    AnomalyRecordCreate,
    ReportCreate
)
from app.services.query_cache import vibration_query_cache, cached_query

ModelType = TypeVar("ModelType")


class CRUDService:
    def __init__(self, db: Session):
        self.db = db

    def create_device(self, device_data: DeviceCreate) -> Device:
        db_device = Device(**device_data.model_dump())
        self.db.add(db_device)
        self.db.commit()
        self.db.refresh(db_device)
        return db_device

    def get_device(self, device_id: int) -> Optional[Device]:
        return self.db.query(Device).filter(Device.id == device_id).first()

    def get_device_by_code(self, device_code: str) -> Optional[Device]:
        return self.db.query(Device).filter(Device.device_code == device_code).first()

    def get_all_devices(self, skip: int = 0, limit: int = 100) -> List[Device]:
        return self.db.query(Device).offset(skip).limit(limit).all()

    def update_device(self, device_id: int, device_data: DeviceUpdate) -> Optional[Device]:
        db_device = self.get_device(device_id)
        if db_device:
            update_data = device_data.model_dump(exclude_unset=True)
            for key, value in update_data.items():
                setattr(db_device, key, value)
            self.db.commit()
            self.db.refresh(db_device)
        return db_device

    def delete_device(self, device_id: int) -> bool:
        db_device = self.get_device(device_id)
        if db_device:
            self.db.delete(db_device)
            self.db.commit()
            return True
        return False

    def create_vibration_data(self, data: VibrationDataCreate) -> VibrationData:
        db_data = VibrationData(**data.model_dump())
        self.db.add(db_data)
        self.db.commit()
        self.db.refresh(db_data)
        return db_data

    def create_vibration_data_batch(self, data_list: List[VibrationDataCreate]) -> int:
        db_objects = [VibrationData(**data.model_dump()) for data in data_list]
        self.db.bulk_save_objects(db_objects)
        self.db.commit()
        return len(db_objects)

    def get_vibration_data(
        self,
        device_code: str,
        start_time: datetime,
        end_time: datetime,
        skip: int = 0,
        limit: int = 10000,
        use_cache: bool = True
    ) -> Tuple[List[VibrationData], bool]:
        params = {
            "method": "get_vibration_data",
            "device_code": device_code,
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "skip": skip,
            "limit": limit
        }

        if use_cache:
            cached = vibration_query_cache.get(params)
            if cached is not None:
                return cached, True

        query = self.db.query(VibrationData).filter(
            and_(
                VibrationData.device_code == device_code,
                VibrationData.timestamp >= start_time,
                VibrationData.timestamp <= end_time
            )
        ).order_by(VibrationData.timestamp).offset(skip).limit(limit)

        result = query.all()

        if use_cache and len(result) > 0:
            vibration_query_cache.set(params, result)

        return result, False

    def get_vibration_data_streaming(
        self,
        device_code: str,
        start_time: datetime,
        end_time: datetime,
        chunk_size: int = 10000
    ):
        query = self.db.query(VibrationData).filter(
            and_(
                VibrationData.device_code == device_code,
                VibrationData.timestamp >= start_time,
                VibrationData.timestamp <= end_time
            )
        ).order_by(VibrationData.timestamp).yield_per(chunk_size)

        return query

    def get_vibration_data_count(
        self,
        device_code: str,
        start_time: datetime,
        end_time: datetime
    ) -> int:
        return self.db.query(func.count(VibrationData.id)).filter(
            and_(
                VibrationData.device_code == device_code,
                VibrationData.timestamp >= start_time,
                VibrationData.timestamp <= end_time
            )
        ).scalar()

    def get_vibration_data_paginated(
        self,
        device_code: str,
        start_time: datetime,
        end_time: datetime,
        page: int = 1,
        page_size: int = 10000
    ) -> Dict[str, Any]:
        total = self.get_vibration_data_count(device_code, start_time, end_time)
        skip = (page - 1) * page_size

        data, from_cache = self.get_vibration_data(
            device_code, start_time, end_time, skip, page_size
        )

        return {
            "data": data,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size,
            "from_cache": from_cache
        }

    def get_vibration_data_sampled(
        self,
        device_code: str,
        start_time: datetime,
        end_time: datetime,
        max_points: int = 2000
    ) -> List[VibrationData]:
        total = self.get_vibration_data_count(device_code, start_time, end_time)

        if total <= max_points:
            data, _ = self.get_vibration_data(device_code, start_time, end_time, 0, max_points)
            return data

        sample_rate = max(1, total // max_points)

        sql = text("""
            SELECT * FROM (
                SELECT *,
                       ROW_NUMBER() OVER (ORDER BY timestamp) as rn
                FROM vibration_data
                WHERE device_code = :device_code
                  AND timestamp >= :start_time
                  AND timestamp <= :end_time
            ) t
            WHERE rn % :sample_rate = 0
            ORDER BY timestamp
            LIMIT :max_points
        """)

        result = self.db.execute(
            sql,
            {
                "device_code": device_code,
                "start_time": start_time,
                "end_time": end_time,
                "sample_rate": sample_rate,
                "max_points": max_points
            }
        )

        return [VibrationData(**row._mapping) for row in result]

    def create_analysis_result(self, analysis_data: Dict[str, Any]) -> AnalysisResult:
        db_analysis = AnalysisResult(**analysis_data)
        self.db.add(db_analysis)
        self.db.commit()
        self.db.refresh(db_analysis)
        return db_analysis

    def get_analysis_results(
        self,
        device_code: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[AnalysisResult]:
        query = self.db.query(AnalysisResult)
        if device_code:
            query = query.filter(AnalysisResult.device_code == device_code)
        if start_time:
            query = query.filter(AnalysisResult.start_time >= start_time)
        if end_time:
            query = query.filter(AnalysisResult.end_time <= end_time)
        return query.order_by(desc(AnalysisResult.start_time)).offset(skip).limit(limit).all()

    def create_anomaly_record(self, anomaly_data: AnomalyRecordCreate) -> AnomalyRecord:
        db_anomaly = AnomalyRecord(**anomaly_data.model_dump())
        self.db.add(db_anomaly)
        self.db.commit()
        self.db.refresh(db_anomaly)
        return db_anomaly

    def get_anomaly_records(
        self,
        device_code: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        severity: Optional[str] = None,
        status: Optional[str] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[AnomalyRecord]:
        query = self.db.query(AnomalyRecord)
        if device_code:
            query = query.filter(AnomalyRecord.device_code == device_code)
        if start_time:
            query = query.filter(AnomalyRecord.timestamp >= start_time)
        if end_time:
            query = query.filter(AnomalyRecord.timestamp <= end_time)
        if severity:
            query = query.filter(AnomalyRecord.severity == severity)
        if status:
            query = query.filter(AnomalyRecord.status == status)
        return query.order_by(desc(AnomalyRecord.timestamp)).offset(skip).limit(limit).all()

    def handle_anomaly(self, anomaly_id: int, handled_by: str, notes: str) -> Optional[AnomalyRecord]:
        db_anomaly = self.db.query(AnomalyRecord).filter(AnomalyRecord.id == anomaly_id).first()
        if db_anomaly:
            db_anomaly.status = "handled"
            db_anomaly.handled_by = handled_by
            db_anomaly.handled_at = datetime.now()
            db_anomaly.handle_notes = notes
            self.db.commit()
            self.db.refresh(db_anomaly)
        return db_anomaly

    def create_report(self, report_data: ReportCreate, file_path: str, file_size: int) -> Report:
        report_dict = report_data.model_dump()
        report_dict["file_path"] = file_path
        report_dict["file_size"] = file_size
        db_report = Report(**report_dict)
        self.db.add(db_report)
        self.db.commit()
        self.db.refresh(db_report)
        return db_report

    def get_reports(
        self,
        report_type: Optional[str] = None,
        device_code: Optional[str] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[Report]:
        query = self.db.query(Report)
        if report_type:
            query = query.filter(Report.report_type == report_type)
        if device_code:
            query = query.filter(Report.device_code == device_code)
        return query.order_by(desc(Report.created_at)).offset(skip).limit(limit).all()

    def get_report(self, report_id: int) -> Optional[Report]:
        return self.db.query(Report).filter(Report.id == report_id).first()
