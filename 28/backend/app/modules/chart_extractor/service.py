import os
import json
import uuid
import asyncio
from datetime import datetime
from typing import List, Optional, Dict, Any, Tuple
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.chart import ChartStatus
from app.schemas.chart import (
    ChartExtractRequest,
    ChartExtractResult,
    ChartCreate,
    ChartExtractTaskResponse,
)
from app.modules.chart_extractor.pdf_chart_extractor import PDFChartExtractor
from app.services.chart_service import chart_service


@dataclass
class ExtractTask:
    task_id: str
    paper_id: int
    pdf_path: str
    status: str = "pending"
    total_pages: int = 0
    processed_pages: int = 0
    charts_found: int = 0
    created_at: datetime = field(default_factory=datetime.utcnow)
    results: List[ChartExtractResult] = field(default_factory=list)
    error: Optional[str] = None


class ChartExtractorService:
    def __init__(self):
        self.extractor = PDFChartExtractor()
        self._tasks: Dict[str, ExtractTask] = {}

    def create_extract_task(self, request: ChartExtractRequest) -> ExtractTask:
        task_id = uuid.uuid4().hex

        task = ExtractTask(
            task_id=task_id,
            paper_id=request.paper_id,
            pdf_path=request.pdf_path,
            created_at=datetime.utcnow(),
        )

        self._tasks[task_id] = task
        return task

    async def extract_charts_async(
        self,
        task: ExtractTask,
        db: Session,
        start_page: Optional[int] = None,
        end_page: Optional[int] = None,
        dpi: int = 300,
    ) -> List[ChartExtractResult]:
        task.status = "running"

        try:
            results = await asyncio.to_thread(
                self._extract_charts_sync,
                task,
                db,
                start_page,
                end_page,
                dpi,
            )
            task.status = "completed"
            task.charts_found = len(results)
            return results
        except Exception as e:
            task.status = "failed"
            task.error = str(e)
            raise

    def _extract_charts_sync(
        self,
        task: ExtractTask,
        db: Session,
        start_page: Optional[int],
        end_page: Optional[int],
        dpi: int,
    ) -> List[ChartExtractResult]:
        import fitz

        if not os.path.exists(task.pdf_path):
            raise FileNotFoundError(f"PDF文件不存在: {task.pdf_path}")

        doc = fitz.open(task.pdf_path)
        task.total_pages = len(doc)
        doc.close()

        self.extractor.dpi = dpi
        results = self.extractor.extract_charts(
            pdf_path=task.pdf_path,
            paper_id=task.paper_id,
            start_page=start_page,
            end_page=end_page,
        )

        task.results = results
        task.processed_pages = task.total_pages

        for result in results:
            self._save_chart_result(db, task.paper_id, result)

        return results

    def _save_chart_result(
        self, db: Session, paper_id: int, result: ChartExtractResult
    ) -> None:
        import cv2

        image_data = None
        if result.image_path and os.path.exists(result.image_path):
            try:
                with open(result.image_path, "rb") as f:
                    image_data = f.read()
            except Exception:
                pass

        extracted_data_json = None
        if result.extracted_data:
            extracted_data_json = json.dumps(result.extracted_data, ensure_ascii=False)

        chart_create = ChartCreate(
            paper_id=paper_id,
            figure_id=result.figure_id,
            caption=result.caption,
            page_number=result.page_number,
            image_path=result.image_path,
            image_data=image_data,
            chart_type=result.chart_type,
            extracted_data=result.extracted_data,
            status=ChartStatus.SUCCESS,
        )

        try:
            chart_service.create(db, obj_in=chart_create)
        except Exception as e:
            pass

    def get_task_status(self, task_id: str) -> Optional[ExtractTask]:
        return self._tasks.get(task_id)

    def get_task_response(self, task_id: str) -> Optional[ChartExtractTaskResponse]:
        task = self.get_task_status(task_id)
        if not task:
            return None

        return ChartExtractTaskResponse(
            task_id=task.task_id,
            paper_id=task.paper_id,
            status=task.status,
            total_pages=task.total_pages,
            processed_pages=task.processed_pages,
            charts_found=task.charts_found,
            created_at=task.created_at,
        )

    def extract_charts_sync(
        self,
        db: Session,
        pdf_path: str,
        paper_id: int,
        start_page: Optional[int] = None,
        end_page: Optional[int] = None,
        dpi: int = 300,
    ) -> Tuple[int, List[ChartExtractResult]]:
        request = ChartExtractRequest(
            paper_id=paper_id,
            pdf_path=pdf_path,
            start_page=start_page,
            end_page=end_page,
            dpi=dpi,
        )

        task = self.create_extract_task(request)
        task.status = "running"

        try:
            results = self._extract_charts_sync(task, db, start_page, end_page, dpi)
            task.status = "completed"
            task.charts_found = len(results)
            return len(results), results
        except Exception as e:
            task.status = "failed"
            task.error = str(e)
            raise


chart_extractor_service = ChartExtractorService()
