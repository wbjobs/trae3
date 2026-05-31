from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import os
from app.core.database import get_db
from app.models.schemas import ReportCreate, ReportResponse
from app.services.crud_service import CRUDService
from app.services.report_service import ReportService

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("/generate")
def generate_report(report_data: ReportCreate, db: Session = Depends(get_db)):
    service = ReportService(db)
    try:
        file_path = service.generate_report(report_data)
        return {"message": "Report generated successfully", "file_path": file_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=list[ReportResponse])
def get_reports(
    report_type: str = None,
    device_code: str = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    crud = CRUDService(db)
    return crud.get_reports(report_type, device_code, skip, limit)


@router.get("/download/{report_id}")
def download_report(report_id: int, db: Session = Depends(get_db)):
    crud = CRUDService(db)
    report = crud.get_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    if not os.path.exists(report.file_path):
        raise HTTPException(status_code=404, detail="Report file not found")

    return FileResponse(
        path=report.file_path,
        filename=os.path.basename(report.file_path),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
