from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.tenant.dependencies import get_tenant_id
from app.scheduler.models import ScheduledTask
from app.scheduler.service import scheduler_service
from app.api.schemas import ScheduledTaskCreate, ScheduledTaskResponse

router = APIRouter(prefix="/scheduler", tags=["scheduler"])


@router.post("/tasks", response_model=ScheduledTaskResponse, status_code=status.HTTP_201_CREATED)
async def create_scheduled_task(
    task_data: ScheduledTaskCreate,
    tenant_id: str = Depends(get_tenant_id)
):
    task_id = await scheduler_service.schedule_task(
        tenant_id=tenant_id,
        task_name=task_data.task_name,
        task_type=task_data.task_type,
        payload=task_data.payload,
        priority=task_data.priority,
        cron_expression=task_data.cron_expression,
        run_once_at=task_data.run_once_at
    )

    db = next(get_db())
    task = db.query(ScheduledTask).filter(ScheduledTask.id == task_id).first()
    db.close()

    return task


@router.get("/tasks/{task_id}", response_model=ScheduledTaskResponse)
def get_scheduled_task(
    task_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    task = db.query(ScheduledTask).filter(
        ScheduledTask.id == task_id,
        ScheduledTask.tenant_id == tenant_id
    ).first()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    return task


@router.get("/tasks", response_model=List[ScheduledTaskResponse])
def list_scheduled_tasks(
    skip: int = 0,
    limit: int = 100,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    tasks = db.query(ScheduledTask).filter(
        ScheduledTask.tenant_id == tenant_id
    ).offset(skip).limit(limit).all()
    return tasks


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_scheduled_task(
    task_id: str,
    tenant_id: str = Depends(get_tenant_id)
):
    success = await scheduler_service.cancel_task(task_id, tenant_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )


@router.get("/stats")
def get_scheduler_stats(tenant_id: str = Depends(get_tenant_id)):
    return scheduler_service.get_task_stats(tenant_id=tenant_id)
