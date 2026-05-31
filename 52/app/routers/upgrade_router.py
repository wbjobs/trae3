from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import PushTaskStatus, RetryStatus, UpgradeStatus
from app.schemas import (
    ApiResponse,
    DeviceHeartbeat,
    DeviceOut,
    GrayscaleRuleCreate,
    GrayscaleRuleOut,
    GrayscaleRuleUpdate,
    PushRequest,
    PushTaskCreate,
    PushTaskOut,
    PushTaskStatusUpdate,
    RateLimitRuleCreate,
    RateLimitRuleOut,
    RetryQueueOut,
    RollbackRequest,
    UpgradeRecordOut,
    UpgradeStatusUpdate,
)
from app.services import grayscale_service, push_task_service, retry_service, upgrade_service

router = APIRouter(prefix="/api/v1/upgrades", tags=["升级推送"])


@router.post("/push", response_model=ApiResponse)
def push_upgrade(data: PushRequest, db: Session = Depends(get_db)):
    try:
        records = upgrade_service.push_upgrade(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ApiResponse(
        message=f"Pushed upgrade to {len(records)} devices",
        data=[UpgradeRecordOut.model_validate(r).model_dump() for r in records],
    )


@router.post("/rollback", response_model=ApiResponse)
def rollback_upgrade(data: RollbackRequest, db: Session = Depends(get_db)):
    try:
        records = upgrade_service.rollback_upgrade(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ApiResponse(
        message=f"Rolled back {len(records)} devices",
        data=[UpgradeRecordOut.model_validate(r).model_dump() for r in records],
    )


@router.get("/records", response_model=ApiResponse)
def list_upgrade_records(
    device_id: str | None = Query(None),
    version_id: str | None = Query(None),
    status: UpgradeStatus | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    records = upgrade_service.get_upgrade_records(db, device_id, version_id, status, skip, limit)
    return ApiResponse(data=[UpgradeRecordOut.model_validate(r).model_dump() for r in records])


@router.patch("/records/{record_id}/status", response_model=ApiResponse)
def update_record_status(record_id: str, data: UpgradeStatusUpdate, db: Session = Depends(get_db)):
    record = upgrade_service.update_upgrade_status(db, record_id, data)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    return ApiResponse(data=UpgradeRecordOut.model_validate(record).model_dump())


@router.post("/grayscale-rules", response_model=ApiResponse)
def create_grayscale_rule(data: GrayscaleRuleCreate, db: Session = Depends(get_db)):
    try:
        rule = grayscale_service.create_grayscale_rule(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ApiResponse(data=GrayscaleRuleOut.model_validate(rule).model_dump())


@router.get("/grayscale-rules/{version_id}", response_model=ApiResponse)
def get_grayscale_rules(version_id: str, db: Session = Depends(get_db)):
    rules = grayscale_service.get_grayscale_rules(db, version_id)
    return ApiResponse(data=[GrayscaleRuleOut.model_validate(r).model_dump() for r in rules])


@router.patch("/grayscale-rules/{rule_id}", response_model=ApiResponse)
def update_grayscale_rule(rule_id: str, data: GrayscaleRuleUpdate, db: Session = Depends(get_db)):
    rule = grayscale_service.update_grayscale_rule(db, rule_id, data)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return ApiResponse(data=GrayscaleRuleOut.model_validate(rule).model_dump())


@router.delete("/grayscale-rules/{rule_id}", response_model=ApiResponse)
def delete_grayscale_rule(rule_id: str, db: Session = Depends(get_db)):
    deleted = grayscale_service.delete_grayscale_rule(db, rule_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Rule not found")
    return ApiResponse(message="Rule deleted")


@router.post("/grayscale-match/{version_id}", response_model=ApiResponse)
def match_grayscale_devices(version_id: str, db: Session = Depends(get_db)):
    device_ids = grayscale_service.match_grayscale_devices(db, version_id)
    return ApiResponse(data={"version_id": version_id, "matched_device_ids": device_ids, "count": len(device_ids)})


@router.post("/tasks", response_model=ApiResponse)
def create_push_task(data: PushTaskCreate, db: Session = Depends(get_db)):
    try:
        task = push_task_service.create_push_task(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ApiResponse(data=PushTaskOut.model_validate(task).model_dump())


@router.get("/tasks", response_model=ApiResponse)
def list_push_tasks(
    status: PushTaskStatus | None = Query(None),
    version_id: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    tasks = push_task_service.list_push_tasks(db, status, version_id, skip, limit)
    return ApiResponse(data=[PushTaskOut.model_validate(t).model_dump() for t in tasks])


@router.get("/tasks/{task_id}", response_model=ApiResponse)
def get_push_task(task_id: str, db: Session = Depends(get_db)):
    task = push_task_service.get_push_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return ApiResponse(data=PushTaskOut.model_validate(task).model_dump())


@router.patch("/tasks/{task_id}/status", response_model=ApiResponse)
def update_push_task_status(task_id: str, data: PushTaskStatusUpdate, db: Session = Depends(get_db)):
    try:
        task = push_task_service.update_push_task_status(db, task_id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return ApiResponse(data=PushTaskOut.model_validate(task).model_dump())


@router.post("/tasks/{task_id}/refresh", response_model=ApiResponse)
def refresh_task_stats(task_id: str, db: Session = Depends(get_db)):
    task = push_task_service.refresh_task_stats(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return ApiResponse(data=PushTaskOut.model_validate(task).model_dump())


@router.post("/tasks/{task_id}/pause", response_model=ApiResponse)
def pause_push_task(task_id: str, db: Session = Depends(get_db)):
    try:
        task = push_task_service.update_push_task_status(
            db, task_id, PushTaskStatusUpdate(status=PushTaskStatus.PAUSED)
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return ApiResponse(message="Task paused", data=PushTaskOut.model_validate(task).model_dump())


@router.post("/tasks/{task_id}/resume", response_model=ApiResponse)
def resume_push_task(task_id: str, db: Session = Depends(get_db)):
    try:
        task = push_task_service.update_push_task_status(
            db, task_id, PushTaskStatusUpdate(status=PushTaskStatus.RUNNING)
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return ApiResponse(message="Task resumed", data=PushTaskOut.model_validate(task).model_dump())


@router.post("/heartbeat", response_model=ApiResponse)
def device_heartbeat(data: DeviceHeartbeat, db: Session = Depends(get_db)):
    device = retry_service.update_device_heartbeat(db, data.device_sn, data.is_online)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return ApiResponse(data=DeviceOut.model_validate(device).model_dump())


@router.get("/retry-queue", response_model=ApiResponse)
def get_retry_queue(
    device_id: str | None = Query(None),
    status: RetryStatus | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    items = retry_service.get_retry_queue(db, device_id, status, skip, limit)
    return ApiResponse(data=[RetryQueueOut.model_validate(item).model_dump() for item in items])


@router.post("/retry-queue/process", response_model=ApiResponse)
def process_retry_queue(batch_size: int = Query(100, ge=1, le=500), db: Session = Depends(get_db)):
    processed = retry_service.process_due_retries(db, batch_size)
    return ApiResponse(message=f"Processed {len(processed)} retry items", data=len(processed))


@router.post("/retry-queue/offline/{version_id}", response_model=ApiResponse)
def find_offline_for_retry(version_id: str, db: Session = Depends(get_db)):
    ids = retry_service.find_offline_devices_for_retry(db, version_id)
    return ApiResponse(message=f"Found {len(ids)} offline devices for retry", data={"device_ids": ids, "count": len(ids)})


@router.post("/rate-limit-rules", response_model=ApiResponse)
def create_rate_limit_rule(data: RateLimitRuleCreate, db: Session = Depends(get_db)):
    from app.repository import RateLimitRepository
    repo = RateLimitRepository(db)
    rule = repo.create(**data.model_dump())
    db.commit()
    db.refresh(rule)
    return ApiResponse(data=RateLimitRuleOut.model_validate(rule).model_dump())


@router.get("/rate-limit-rules", response_model=ApiResponse)
def list_rate_limit_rules(db: Session = Depends(get_db)):
    from app.repository import RateLimitRepository
    repo = RateLimitRepository(db)
    rules = repo.list_active()
    return ApiResponse(data=[RateLimitRuleOut.model_validate(r).model_dump() for r in rules])
