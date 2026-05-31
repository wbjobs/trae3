import uuid
import math
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from ..config import settings
from ..models import FaultRecord, Component
from ..schemas import FaultQueryParams, FaultStatistics, FaultStatisticsItem, FaultHeatmapData
from .victoria_metrics import victoria_metrics_client


class FaultDetectorService:
    def __init__(self):
        self.vm_client = victoria_metrics_client
        self.thresholds = settings.FAULT_DETECTION_THRESHOLDS

    def get_fault_list(
        self,
        db: Session,
        params: FaultQueryParams
    ) -> Tuple[List[Dict[str, Any]], int]:
        query = db.query(FaultRecord, Component).outerjoin(
            Component, FaultRecord.component_id == Component.id
        )

        if params.start_time:
            start_dt = datetime.fromtimestamp(params.start_time / 1000)
            query = query.filter(FaultRecord.start_time >= start_dt)

        if params.end_time:
            end_dt = datetime.fromtimestamp(params.end_time / 1000)
            query = query.filter(FaultRecord.start_time <= end_dt)

        if params.severity:
            query = query.filter(FaultRecord.severity.in_(params.severity))

        if params.fault_type:
            query = query.filter(FaultRecord.fault_type.in_(params.fault_type))

        if params.status:
            query = query.filter(FaultRecord.status.in_(params.status))

        if params.component_id:
            query = query.filter(FaultRecord.component_id == params.component_id)

        total = query.count()

        page = max(1, params.page)
        page_size = max(1, min(100, params.page_size))
        offset = (page - 1) * page_size

        results = query.order_by(FaultRecord.start_time.desc()).offset(offset).limit(page_size).all()

        fault_list = []
        for fault, component in results:
            if fault is None:
                continue
            fault_dict = {
                "id": fault.id,
                "component_id": fault.component_id,
                "fault_type": fault.fault_type,
                "severity": fault.severity,
                "start_time": int(fault.start_time.timestamp() * 1000),
                "end_time": int(fault.end_time.timestamp() * 1000) if fault.end_time else None,
                "status": fault.status,
                "description": fault.description,
                "threshold_value": float(fault.threshold_value) if fault.threshold_value else None,
                "actual_value": float(fault.actual_value) if fault.actual_value else None,
                "location": {
                    "row": component.row_position if component else 0,
                    "col": component.col_position if component else 0,
                } if component else None,
            }
            fault_list.append(fault_dict)

        return fault_list, total

    def get_fault_statistics(
        self,
        db: Session,
        start_time: int,
        end_time: int,
        group_by: str = "all"
    ) -> Dict[str, Any]:
        start_dt = datetime.fromtimestamp(start_time / 1000)
        end_dt = datetime.fromtimestamp(end_time / 1000)

        query = db.query(FaultRecord).filter(
            FaultRecord.start_time >= start_dt,
            FaultRecord.start_time <= end_dt
        )

        total = query.count()

        if total == 0:
            return self._get_empty_statistics(start_dt, end_dt)

        active_count = query.filter(FaultRecord.status == "active").count()
        resolved_count = query.filter(FaultRecord.status == "resolved").count()
        ignored_count = query.filter(FaultRecord.status == "ignored").count()

        if total > 0:
            resolution_rate = round((resolved_count / total) * 100, 2)
            active_rate = round((active_count / total) * 100, 2)
        else:
            resolution_rate = 0.0
            active_rate = 0.0

        by_type = self._group_by_field(db, start_dt, end_dt, "fault_type", total)
        by_severity = self._group_by_field(db, start_dt, end_dt, "severity", total)
        by_component = self._group_by_field(db, start_dt, end_dt, "component_id", total, limit=10)
        by_status = self._group_by_field(db, start_dt, end_dt, "status", total)
        by_time = self._group_by_time(db, start_dt, end_dt)

        mttr = self._calculate_mttr(db, start_dt, end_dt)
        mtbf = self._calculate_mtbf(db, start_dt, end_dt)

        severity_weights = {"low": 1, "medium": 2, "high": 3, "critical": 4}
        weighted_score = 0
        for item in by_severity:
            name_lower = item.name.lower()
            for key, weight in severity_weights.items():
                if key in name_lower:
                    weighted_score += item.value * weight
                    break

        return {
            "total": total,
            "active": active_count,
            "resolved": resolved_count,
            "ignored": ignored_count,
            "resolution_rate": resolution_rate,
            "active_rate": active_rate,
            "mttr_hours": mttr,
            "mtbf_hours": mtbf,
            "weighted_severity_score": weighted_score,
            "time_range": {
                "start": int(start_dt.timestamp() * 1000),
                "end": int(end_dt.timestamp() * 1000),
            },
            "by_type": by_type,
            "by_severity": by_severity,
            "by_component": by_component,
            "by_status": by_status,
            "trend": by_time,
        }

    def _get_empty_statistics(self, start_dt: datetime, end_dt: datetime) -> Dict[str, Any]:
        return {
            "total": 0,
            "active": 0,
            "resolved": 0,
            "ignored": 0,
            "resolution_rate": 0.0,
            "active_rate": 0.0,
            "mttr_hours": 0.0,
            "mtbf_hours": 0.0,
            "weighted_severity_score": 0,
            "time_range": {
                "start": int(start_dt.timestamp() * 1000),
                "end": int(end_dt.timestamp() * 1000),
            },
            "by_type": [],
            "by_severity": [],
            "by_component": [],
            "by_status": [],
            "trend": [],
        }

    def get_fault_heatmap(
        self,
        db: Session,
        start_time: int,
        end_time: int
    ) -> List[FaultHeatmapData]:
        start_dt = datetime.fromtimestamp(start_time / 1000)
        end_dt = datetime.fromtimestamp(end_time / 1000)

        components = db.query(
            Component.id,
            Component.row_position,
            Component.col_position,
        ).filter(
            Component.row_position.isnot(None),
            Component.col_position.isnot(None)
        ).all()

        fault_counts = db.query(
            FaultRecord.component_id,
            FaultRecord.fault_type,
            func.count(FaultRecord.id).label("count")
        ).filter(
            FaultRecord.start_time >= start_dt,
            FaultRecord.start_time <= end_dt
        ).group_by(
            FaultRecord.component_id,
            FaultRecord.fault_type
        ).all()

        fault_map = {}
        for comp_id, fault_type, count in fault_counts:
            if comp_id not in fault_map:
                fault_map[comp_id] = {
                    "fault_count": 0,
                    "fault_types": set(),
                }
            fault_map[comp_id]["fault_count"] += count
            fault_map[comp_id]["fault_types"].add(fault_type)

        heatmap_data = []
        for comp_id, row, col in components:
            fault_info = fault_map.get(comp_id, {"fault_count": 0, "fault_types": set()})
            heatmap_data.append(FaultHeatmapData(
                row=row or 0,
                col=col or 0,
                value=fault_info["fault_count"],
                component_id=comp_id,
                fault_types=list(fault_info["fault_types"]),
            ))

        return heatmap_data

    async def detect_faults(
        self,
        component_ids: List[str],
        start_time: int,
        end_time: int
    ) -> List[Dict[str, Any]]:
        detected_faults = []
        metrics = ["voltage", "current", "temperature"]

        for component_id in component_ids:
            for metric in metrics:
                try:
                    query = self.vm_client.build_query(
                        metric=metric,
                        component_ids=[component_id]
                    )

                    response = await self.vm_client.query_range(
                        query=query,
                        start=start_time,
                        end=end_time,
                        step="1m"
                    )

                    if response.get("status") == "success":
                        results = response.get("data", {}).get("result", [])
                        if results:
                            values = results[0].get("values", [])
                            faults = self._analyze_metric_data(
                                component_id, metric, values
                            )
                            detected_faults.extend(faults)
                except Exception as e:
                    print(f"Error detecting faults for {component_id}/{metric}: {str(e)}")
                    continue

        return detected_faults

    def _group_by_field(
        self,
        db: Session,
        start_dt: datetime,
        end_dt: datetime,
        field: str,
        total: int,
        limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        model_field = getattr(FaultRecord, field)

        query = db.query(
            model_field,
            func.count(FaultRecord.id).label("count")
        ).filter(
            FaultRecord.start_time >= start_dt,
            FaultRecord.start_time <= end_dt
        ).group_by(model_field).order_by(func.count(FaultRecord.id).desc())

        if limit:
            query = query.limit(limit)

        results = query.all()

        items = []
        for name, count in results:
            if name is None:
                continue
            percentage = round((count / total) * 100, 2) if total > 0 else 0.0
            items.append({
                "name": str(name),
                "value": int(count),
                "percentage": percentage,
            })

        return items

    def _group_by_time(
        self,
        db: Session,
        start_dt: datetime,
        end_dt: datetime
    ) -> List[Dict[str, Any]]:
        time_span = end_dt - start_dt
        total_seconds = time_span.total_seconds()

        if total_seconds <= 86400:
            interval_seconds = 3600
            date_format = "%Y-%m-%d %H:00"
            label_format = "%H:%M"
        elif total_seconds <= 604800:
            interval_seconds = 86400
            date_format = "%Y-%m-%d"
            label_format = "%m-%d"
        elif total_seconds <= 2592000:
            interval_seconds = 86400
            date_format = "%Y-%m-%d"
            label_format = "%m-%d"
        else:
            interval_seconds = 86400 * 7
            date_format = "%Y-%m-%d"
            label_format = "%m/%d"

        results = db.query(
            func.strftime(date_format, FaultRecord.start_time).label("time_key"),
            func.count(FaultRecord.id).label("count")
        ).filter(
            FaultRecord.start_time >= start_dt,
            FaultRecord.start_time <= end_dt
        ).group_by("time_key").order_by("time_key").all()

        count_map = {time_key: count for time_key, count in results}

        trend_data = []
        current = datetime(start_dt.year, start_dt.month, start_dt.day,
                          start_dt.hour if interval_seconds < 86400 else 0, 0, 0)

        while current <= end_dt:
            time_key = current.strftime(date_format)
            label = current.strftime(label_format)
            count = count_map.get(time_key, 0)
            trend_data.append({
                "date": label,
                "value": int(count),
                "timestamp": int(current.timestamp() * 1000),
            })
            current += timedelta(seconds=interval_seconds)

        return trend_data

    def _calculate_mttr(
        self,
        db: Session,
        start_dt: datetime,
        end_dt: datetime
    ) -> float:
        resolved_faults = db.query(FaultRecord).filter(
            FaultRecord.start_time >= start_dt,
            FaultRecord.start_time <= end_dt,
            FaultRecord.end_time.isnot(None),
            FaultRecord.status == "resolved"
        ).all()

        if not resolved_faults:
            return 0.0

        total_duration = 0.0
        valid_count = 0

        for fault in resolved_faults:
            if fault.end_time and fault.end_time > fault.start_time:
                duration = (fault.end_time - fault.start_time).total_seconds() / 3600
                if duration > 0 and duration < 720:
                    total_duration += duration
                    valid_count += 1

        if valid_count == 0:
            return 0.0

        return round(total_duration / valid_count, 2)

    def _calculate_mtbf(
        self,
        db: Session,
        start_dt: datetime,
        end_dt: datetime
    ) -> float:
        faults = db.query(FaultRecord).filter(
            FaultRecord.start_time >= start_dt,
            FaultRecord.start_time <= end_dt
        ).order_by(FaultRecord.start_time).all()

        if len(faults) < 2:
            return 0.0

        total_operating_time = (end_dt - start_dt).total_seconds() / 3600
        fault_count = len(faults)

        if fault_count <= 1:
            return round(total_operating_time, 2)

        return round(total_operating_time / (fault_count - 1), 2)

    def _analyze_metric_data(
        self,
        component_id: str,
        metric: str,
        values: List[List[Any]]
    ) -> List[Dict[str, Any]]:
        faults = []

        if not values or len(values) < 3:
            return faults

        try:
            numeric_values = []
            for timestamp, value_str in values:
                try:
                    value = float(value_str)
                    numeric_values.append((int(float(timestamp)) * 1000, value))
                except (ValueError, TypeError):
                    continue

            if len(numeric_values) < 3:
                return faults

            values_only = [v for _, v in numeric_values]
            mean = sum(values_only) / len(values_only)
            std = (sum((v - mean) ** 2 for v in values_only) / len(values_only)) ** 0.5

            for ts_ms, value in numeric_values:
                fault_type = None
                severity = None
                threshold = None

                if metric == "voltage":
                    if value < self.thresholds["voltage_low"]:
                        fault_type = "voltage_abnormal"
                        severity = "medium"
                        threshold = self.thresholds["voltage_low"]
                    elif value > self.thresholds["voltage_high"]:
                        fault_type = "voltage_abnormal"
                        severity = "high"
                        threshold = self.thresholds["voltage_high"]

                elif metric == "current":
                    if value < self.thresholds["current_low"]:
                        fault_type = "current_abnormal"
                        severity = "medium"
                        threshold = self.thresholds["current_low"]
                    elif value > self.thresholds["current_high"]:
                        fault_type = "current_abnormal"
                        severity = "high"
                        threshold = self.thresholds["current_high"]

                elif metric == "temperature":
                    if value > self.thresholds["temperature_critical"]:
                        fault_type = "temperature_high"
                        severity = "critical"
                        threshold = self.thresholds["temperature_critical"]
                    elif value > self.thresholds["temperature_high"]:
                        fault_type = "temperature_high"
                        severity = "high"
                        threshold = self.thresholds["temperature_high"]

                if std > 0 and abs(value - mean) > 3 * std:
                    if not severity or severity in ["low", "medium"]:
                        severity = "high"

                if fault_type and severity and threshold:
                    faults.append({
                        "id": str(uuid.uuid4()),
                        "component_id": component_id,
                        "fault_type": fault_type,
                        "severity": severity,
                        "timestamp": ts_ms,
                        "threshold_value": float(threshold),
                        "actual_value": float(value),
                        "metric": metric,
                        "deviation": round(((value - threshold) / threshold) * 100, 2),
                    })

        except Exception as e:
            print(f"Error analyzing {metric} data for {component_id}: {str(e)}")

        return faults

    def create_mock_faults(self, db: Session, count: int = 20):
        import random

        fault_types = [
            "voltage_abnormal",
            "current_abnormal",
            "temperature_high",
            "offline",
            "short_circuit"
        ]
        severities = ["low", "medium", "high", "critical"]
        statuses = ["active", "resolved", "ignored"]

        now = datetime.utcnow()

        for i in range(count):
            component_num = random.randint(1, 200)
            days_ago = random.randint(0, 30)
            hours_ago = random.randint(0, 24)
            minutes_duration = random.randint(5, 180)

            start_time = now - timedelta(days=days_ago, hours=hours_ago)
            end_time = start_time + timedelta(minutes=minutes_duration)

            fault = FaultRecord(
                id=f"fault_{i:04d}",
                component_id=f"comp_{component_num:03d}",
                fault_type=random.choice(fault_types),
                severity=random.choice(severities),
                start_time=start_time,
                end_time=end_time if random.random() > 0.3 else None,
                status=random.choice(statuses),
                description=f"Mock fault #{i} for component {component_num}",
                threshold_value=random.uniform(20, 80),
                actual_value=random.uniform(10, 100)
            )
            db.add(fault)

        db.commit()


fault_detector_service = FaultDetectorService()
