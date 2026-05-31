from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import Optional, List
import logging
import os
import csv
from io import StringIO
from datetime import datetime
from ...core.database import get_db
from ...core.config import settings
from ...services.database_service import database_service
from ...schemas.record import (
    NameplateRecordResponse,
    NameplateRecordUpdate,
    RecordListResponse,
    ManualCorrection,
    CorrectionResponse,
    BatchExportRequest
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=RecordListResponse)
def get_records(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(10, ge=1, le=100, description="每页数量"),
    keyword: Optional[str] = Query(None, description="搜索关键词"),
    status: Optional[str] = Query(None, description="状态筛选"),
    db: Session = Depends(get_db)
):
    try:
        total, records = database_service.list_records(
            db=db,
            page=page,
            page_size=page_size,
            keyword=keyword,
            status=status
        )

        return RecordListResponse(
            total=total,
            page=page,
            page_size=page_size,
            records=[NameplateRecordResponse.model_validate(r) for r in records]
        )
    except Exception as e:
        logger.error(f"获取记录列表失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取记录列表失败: {str(e)}")


@router.get("/{record_id}", response_model=NameplateRecordResponse)
def get_record(record_id: int, db: Session = Depends(get_db)):
    try:
        record = database_service.get_record(record_id, db)
        if not record:
            raise HTTPException(status_code=404, detail="记录不存在")
        return NameplateRecordResponse.model_validate(record)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取记录失败 (ID={record_id}): {e}")
        raise HTTPException(status_code=500, detail=f"获取记录失败: {str(e)}")


@router.put("/{record_id}", response_model=NameplateRecordResponse)
def update_record(
    record_id: int,
    record_update: NameplateRecordUpdate,
    db: Session = Depends(get_db)
):
    try:
        updated_record = database_service.update_record(record_id, record_update)
        if not updated_record:
            raise HTTPException(status_code=404, detail="记录不存在")

        try:
            database_service.create_backup()
        except Exception as e:
            logger.warning(f"更新后创建备份失败: {e}")

        return NameplateRecordResponse.model_validate(updated_record)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新记录失败 (ID={record_id}): {e}")
        raise HTTPException(status_code=500, detail=f"更新记录失败: {str(e)}")


@router.delete("/{record_id}")
def delete_record(record_id: int, db: Session = Depends(get_db)):
    try:
        success = database_service.delete_record(record_id)
        if not success:
            raise HTTPException(status_code=404, detail="记录不存在")

        try:
            database_service.create_backup()
        except Exception as e:
            logger.warning(f"删除后创建备份失败: {e}")

        return {"success": True, "message": "删除成功"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除记录失败 (ID={record_id}): {e}")
        raise HTTPException(status_code=500, detail=f"删除记录失败: {str(e)}")


@router.get("/statistics/summary")
def get_statistics(db: Session = Depends(get_db)):
    try:
        return database_service.get_statistics(db)
    except Exception as e:
        logger.error(f"获取统计数据失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取统计数据失败: {str(e)}")


@router.get("/integrity/check")
def check_integrity(db: Session = Depends(get_db)):
    try:
        result = database_service.check_database_integrity(db)
        return {
            "success": True,
            "data": result,
            "message": f"完整性检查完成，完整度: {result['integrity_score']:.2%}"
        }
    except Exception as e:
        logger.error(f"完整性检查失败: {e}")
        raise HTTPException(status_code=500, detail=f"完整性检查失败: {str(e)}")


@router.post("/backup/create")
def create_backup():
    try:
        backup_path = database_service.create_backup()
        if backup_path:
            return {
                "success": True,
                "backup_path": backup_path,
                "message": "数据库备份创建成功"
            }
        return {
            "success": False,
            "message": "数据库备份创建失败"
        }
    except Exception as e:
        logger.error(f"创建备份失败: {e}")
        raise HTTPException(status_code=500, detail=f"创建备份失败: {str(e)}")
