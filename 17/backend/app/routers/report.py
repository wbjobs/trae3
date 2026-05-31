from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import Optional, List
import os

from ..database import get_db
from ..schemas import ApiResponse, OperationReportCreate
from ..services.report_generator import report_generator_service

router = APIRouter(prefix="/report", tags=["报表中心"])


@router.get("/", response_model=ApiResponse)
def get_report_list(
    status: Optional[str] = None,
    report_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    try:
        status_list = status.split(",") if status else None
        type_list = report_type.split(",") if report_type else None

        reports = report_generator_service.get_report_list(
            db=db,
            status=status_list,
            report_type=type_list
        )

        return ApiResponse(data=reports)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate", response_model=ApiResponse)
async def generate_report(
    report_data: OperationReportCreate,
    db: Session = Depends(get_db)
):
    try:
        report = await report_generator_service.generate_report(
            db=db,
            report_data=report_data
        )
        return ApiResponse(data=report)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download/{report_id}")
def download_report(report_id: str, db: Session = Depends(get_db)):
    try:
        file_path = report_generator_service.download_report(db, report_id)
        if not file_path:
            raise HTTPException(status_code=404, detail="Report not found or file missing")

        filename = os.path.basename(file_path)
        return FileResponse(
            file_path,
            media_type="application/octet-stream",
            filename=filename
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{report_id}", response_model=ApiResponse)
def delete_report(report_id: str, db: Session = Depends(get_db)):
    try:
        from ..models import OperationReport

        report = db.query(OperationReport).filter(OperationReport.id == report_id).first()
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")

        if report.file_path and os.path.exists(report.file_path):
            os.remove(report.file_path)

        db.delete(report)
        db.commit()

        return ApiResponse(message="Report deleted successfully")
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
