from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import uuid
from datetime import datetime
from typing import List, Optional

from ..database import get_db
from ..models import ArrayGroup, GroupComponent, Component
from ..schemas import ApiResponse, ArrayGroupCreate, ArrayGroupUpdate, GroupStatisticsData
from ..services.data_processor import data_processor_service

router = APIRouter(prefix="/group", tags=["阵列分组"])


@router.get("/", response_model=ApiResponse)
def get_groups(db: Session = Depends(get_db)):
    try:
        groups = db.query(ArrayGroup).all()
        result = []
        for group in groups:
            component_ids = [gc.component_id for gc in group.components]
            array_ids = list(set([
                gc.component.array_id for gc in group.components if gc.component
            ]))
            result.append({
                "id": group.id,
                "name": group.name,
                "description": group.description,
                "component_ids": component_ids,
                "array_ids": array_ids,
                "createdAt": int(group.created_at.timestamp() * 1000),
                "updatedAt": int(group.updated_at.timestamp() * 1000)
            })
        return ApiResponse(data=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/", response_model=ApiResponse)
def create_group(group_data: ArrayGroupCreate, db: Session = Depends(get_db)):
    try:
        group_id = str(uuid.uuid4())
        group = ArrayGroup(
            id=group_id,
            name=group_data.name,
            description=group_data.description
        )
        db.add(group)
        db.flush()

        for component_id in group_data.component_ids:
            gc = GroupComponent(
                group_id=group_id,
                component_id=component_id
            )
            db.add(gc)

        db.commit()

        return ApiResponse(data={
            "id": group_id,
            "name": group_data.name,
            "description": group_data.description,
            "component_ids": group_data.component_ids,
            "array_ids": [],
            "createdAt": int(datetime.utcnow().timestamp() * 1000),
            "updatedAt": int(datetime.utcnow().timestamp() * 1000)
        })
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{group_id}", response_model=ApiResponse)
def update_group(group_id: str, group_data: ArrayGroupUpdate, db: Session = Depends(get_db)):
    try:
        group = db.query(ArrayGroup).filter(ArrayGroup.id == group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")

        if group_data.name is not None:
            group.name = group_data.name
        if group_data.description is not None:
            group.description = group_data.description
        if group_data.component_ids is not None:
            db.query(GroupComponent).filter(GroupComponent.group_id == group_id).delete()
            for component_id in group_data.component_ids:
                gc = GroupComponent(group_id=group_id, component_id=component_id)
                db.add(gc)

        group.updated_at = datetime.utcnow()
        db.commit()

        component_ids = [gc.component_id for gc in group.components]
        return ApiResponse(data={
            "id": group_id,
            "name": group.name,
            "description": group.description,
            "component_ids": component_ids,
            "array_ids": [],
            "createdAt": int(group.created_at.timestamp() * 1000),
            "updatedAt": int(group.updated_at.timestamp() * 1000)
        })
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{group_id}", response_model=ApiResponse)
def delete_group(group_id: str, db: Session = Depends(get_db)):
    try:
        group = db.query(ArrayGroup).filter(ArrayGroup.id == group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")

        db.query(GroupComponent).filter(GroupComponent.group_id == group_id).delete()
        db.delete(group)
        db.commit()

        return ApiResponse(message="Group deleted successfully")
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{group_id}/statistics", response_model=ApiResponse)
async def get_group_statistics(
    group_id: str,
    start_time: int,
    end_time: int,
    db: Session = Depends(get_db)
):
    try:
        group = db.query(ArrayGroup).filter(ArrayGroup.id == group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")

        component_ids = [gc.component_id for gc in group.components]

        metrics = await data_processor_service.get_key_metrics(
            time_range="24h",
            group_id=group_id
        )

        stats = GroupStatisticsData(
            group_id=group_id,
            group_name=group.name,
            start_time=datetime.fromtimestamp(start_time / 1000),
            end_time=datetime.fromtimestamp(end_time / 1000),
            total_generation=metrics.total_generation,
            avg_efficiency=metrics.efficiency,
            fault_count=metrics.fault_count,
            avg_temperature=metrics.temperature_avg,
            online_rate=metrics.online_rate,
            component_count=len(component_ids)
        )

        return ApiResponse(data=stats)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/compare", response_model=ApiResponse)
async def compare_groups(
    group_ids: List[str],
    start_time: int,
    end_time: int,
    metrics: List[str] = ["total_generation", "efficiency", "fault_count"],
    db: Session = Depends(get_db)
):
    try:
        result = []

        for group_id in group_ids:
            group = db.query(ArrayGroup).filter(ArrayGroup.id == group_id).first()
            if not group:
                continue

            group_metrics = await data_processor_service.get_key_metrics(
                time_range="24h",
                group_id=group_id
            )

            metric_values = {}
            for metric in metrics:
                if hasattr(group_metrics, metric):
                    metric_values[metric] = getattr(group_metrics, metric)

            result.append({
                "group_id": group_id,
                "group_name": group.name,
                "metrics": metric_values
            })

        return ApiResponse(data=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/init-mock", response_model=ApiResponse)
def init_mock_groups(db: Session = Depends(get_db)):
    try:
        mock_groups = [
            {"name": "东区阵列组", "description": "屋顶东区所有光伏组件", "components": range(1, 50)},
            {"name": "西区阵列组", "description": "屋顶西区所有光伏组件", "components": range(50, 100)},
            {"name": "核心监控组", "description": "重点监控的关键组件", "components": range(1, 20)}
        ]

        for group_data in mock_groups:
            group_id = str(uuid.uuid4())
            group = ArrayGroup(
                id=group_id,
                name=group_data["name"],
                description=group_data["description"]
            )
            db.add(group)

            for i in group_data["components"]:
                gc = GroupComponent(
                    group_id=group_id,
                    component_id=f"comp_{i:03d}"
                )
                db.add(gc)

        db.commit()
        return ApiResponse(message="Mock groups created successfully")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
