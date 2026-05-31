import os
import json
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy.orm import Session

from app.services.base import BaseService
from app.models.chart import Chart, ChartStatus, ChartType
from app.schemas.chart import ChartCreate, ChartUpdate


class ChartService(BaseService[Chart, ChartCreate, ChartUpdate]):
    def __init__(self):
        super().__init__(Chart)

    def create(self, db: Session, *, obj_in: ChartCreate) -> Chart:
        obj_in_data = obj_in.model_dump()

        extracted_data = obj_in_data.pop("extracted_data", None)
        if extracted_data is not None:
            obj_in_data["extracted_data"] = json.dumps(extracted_data, ensure_ascii=False)

        db_obj = self.model(**obj_in_data)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update(
        self,
        db: Session,
        *,
        db_obj: Chart,
        obj_in: ChartUpdate | Dict[str, Any],
    ) -> Chart:
        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.model_dump(exclude_unset=True)

        if "extracted_data" in update_data and update_data["extracted_data"] is not None:
            update_data["extracted_data"] = json.dumps(
                update_data["extracted_data"], ensure_ascii=False
            )

        for field, value in update_data.items():
            if hasattr(db_obj, field):
                setattr(db_obj, field, value)

        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def get_by_paper_id(
        self, db: Session, *, paper_id: int, skip: int = 0, limit: int = 100
    ) -> List[Chart]:
        return (
            db.query(self.model)
            .filter(
                self.model.paper_id == paper_id,
                self.model.is_active == True,
            )
            .order_by(self.model.page_number, self.model.figure_id)
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_by_paper_id_and_type(
        self,
        db: Session,
        *,
        paper_id: int,
        chart_type: ChartType,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Chart]:
        return (
            db.query(self.model)
            .filter(
                self.model.paper_id == paper_id,
                self.model.chart_type == chart_type,
                self.model.is_active == True,
            )
            .order_by(self.model.page_number, self.model.figure_id)
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_by_page(
        self,
        db: Session,
        *,
        paper_id: int,
        page_number: int,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Chart]:
        return (
            db.query(self.model)
            .filter(
                self.model.paper_id == paper_id,
                self.model.page_number == page_number,
                self.model.is_active == True,
            )
            .order_by(self.model.figure_id)
            .offset(skip)
            .limit(limit)
            .all()
        )

    def count_by_paper_id(self, db: Session, *, paper_id: int) -> int:
        return (
            db.query(self.model)
            .filter(
                self.model.paper_id == paper_id,
                self.model.is_active == True,
            )
            .count()
        )

    def count_by_status(self, db: Session, *, status: ChartStatus) -> int:
        return (
            db.query(self.model)
            .filter(
                self.model.status == status,
                self.model.is_active == True,
            )
            .count()
        )

    def get_extracted_data(self, db_obj: Chart) -> Optional[Dict[str, Any]]:
        if db_obj.extracted_data:
            try:
                return json.loads(db_obj.extracted_data)
            except (json.JSONDecodeError, TypeError):
                return None
        return None

    def get_image_bytes(self, db_obj: Chart) -> Optional[bytes]:
        if db_obj.image_data:
            return db_obj.image_data

        if db_obj.image_path and os.path.exists(db_obj.image_path):
            try:
                with open(db_obj.image_path, "rb") as f:
                    return f.read()
            except Exception:
                return None

        return None

    def update_status(
        self, db: Session, *, chart_id: int, status: ChartStatus
    ) -> Optional[Chart]:
        db_obj = self.get(db, id=chart_id)
        if not db_obj:
            return None

        db_obj.status = status
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def delete_by_paper_id(self, db: Session, *, paper_id: int) -> int:
        deleted_count = (
            db.query(self.model)
            .filter(
                self.model.paper_id == paper_id,
                self.model.is_active == True,
            )
            .update({"is_active": False})
        )
        db.commit()
        return deleted_count

    def get_chart_types_stats(
        self, db: Session, *, paper_id: Optional[int] = None
    ) -> Dict[str, int]:
        query = db.query(self.model.chart_type).filter(self.model.is_active == True)

        if paper_id is not None:
            query = query.filter(self.model.paper_id == paper_id)

        results = query.all()

        stats: Dict[str, int] = {}
        for (chart_type,) in results:
            type_name = chart_type.value if chart_type else ChartType.UNKNOWN.value
            stats[type_name] = stats.get(type_name, 0) + 1

        return stats


chart_service = ChartService()
