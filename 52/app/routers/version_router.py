from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import VersionStatus
from app.schemas import ApiResponse, FirmwareVersionCreate, FirmwareVersionOut, VersionStatusUpdate
from app.services import version_service

router = APIRouter(prefix="/api/v1/versions", tags=["版本管理"])


@router.post("", response_model=ApiResponse)
def create_version(data: FirmwareVersionCreate, db: Session = Depends(get_db)):
    existing = version_service.get_version_by_code(db, data.version_code)
    if existing:
        raise HTTPException(status_code=400, detail="Version code already exists")
    version = version_service.create_version(db, data)
    return ApiResponse(data=FirmwareVersionOut.model_validate(version).model_dump())


@router.get("", response_model=ApiResponse)
def list_versions(
    product_model: str | None = Query(None),
    status: VersionStatus | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    versions = version_service.list_versions(db, product_model, status, skip, limit)
    return ApiResponse(data=[FirmwareVersionOut.model_validate(v).model_dump() for v in versions])


@router.get("/{version_id}", response_model=ApiResponse)
def get_version(version_id: str, db: Session = Depends(get_db)):
    version = version_service.get_version(db, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    return ApiResponse(data=FirmwareVersionOut.model_validate(version).model_dump())


@router.get("/code/{version_code}", response_model=ApiResponse)
def get_version_by_code(version_code: str, db: Session = Depends(get_db)):
    version = version_service.get_version_by_code(db, version_code)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    return ApiResponse(data=FirmwareVersionOut.model_validate(version).model_dump())


@router.patch("/{version_id}/status", response_model=ApiResponse)
def update_version_status(version_id: str, data: VersionStatusUpdate, db: Session = Depends(get_db)):
    try:
        version = version_service.update_version_status(db, version_id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    return ApiResponse(data=FirmwareVersionOut.model_validate(version).model_dump())


@router.delete("/{version_id}", response_model=ApiResponse)
def delete_version(version_id: str, db: Session = Depends(get_db)):
    try:
        deleted = version_service.delete_version(db, version_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not deleted:
        raise HTTPException(status_code=404, detail="Version not found")
    return ApiResponse(message="Version deleted")
