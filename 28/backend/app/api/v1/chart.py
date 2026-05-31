import os
from typing import Optional, List
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
    Query,
    BackgroundTasks,
    Request,
)
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_active_user
from app.models import User, ChartType
from app.schemas import (
    ChartCreate,
    ChartUpdate,
    ChartResponse,
    ChartExtractRequest,
    ChartExtractResult,
    ChartExtractTaskResponse,
    ResponseBase,
    PaginatedResponse,
)
from app.services import chart_service
from app.modules.chart_extractor import chart_extractor_service
from app.core.url_utils import path_to_static_url, chart_image_url

router = APIRouter(prefix="/charts", tags=["图表管理"])


def _enrich_chart_url(chart_data: ChartResponse, request: Request) -> ChartResponse:
    chart_data.chart_url = str(request.base_url).rstrip("/") + chart_image_url(
        paper_id=chart_data.paper_id, chart_id=chart_data.id
    )
    if chart_data.image_path:
        chart_data.image_url = str(request.base_url).rstrip("/") + path_to_static_url(chart_data.image_path) if path_to_static_url(chart_data.image_path) else None
    return chart_data


@router.post("/extract", response_model=ResponseBase[ChartExtractTaskResponse])
async def extract_charts(
    request: ChartExtractRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if not os.path.exists(request.pdf_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"PDF文件不存在: {request.pdf_path}",
        )

    task = chart_extractor_service.create_extract_task(request)

    background_tasks.add_task(
        chart_extractor_service.extract_charts_async,
        task,
        db,
        request.start_page,
        request.end_page,
        request.dpi,
    )

    task_response = chart_extractor_service.get_task_response(task.task_id)
    return ResponseBase(
        code=200,
        message="图表提取任务已启动",
        data=task_response,
    )


@router.post("/extract/sync", response_model=ResponseBase[List[ChartExtractResult]])
async def extract_charts_sync(
    request: ChartExtractRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if not os.path.exists(request.pdf_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"PDF文件不存在: {request.pdf_path}",
        )

    try:
        count, results = chart_extractor_service.extract_charts_sync(
            db=db,
            pdf_path=request.pdf_path,
            paper_id=request.paper_id,
            start_page=request.start_page,
            end_page=request.end_page,
            dpi=request.dpi,
        )

        return ResponseBase(
            code=200,
            message=f"成功提取 {count} 个图表",
            data=results,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"图表提取失败: {str(e)}",
        )


@router.get("/task/{task_id}", response_model=ResponseBase[ChartExtractTaskResponse])
async def get_extract_task_status(
    task_id: str,
    current_user: User = Depends(get_current_active_user),
):
    task_response = chart_extractor_service.get_task_response(task_id)
    if not task_response:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="任务不存在",
        )

    return ResponseBase(
        code=200,
        message="success",
        data=task_response,
    )


@router.get("/paper/{paper_id}", response_model=PaginatedResponse[ChartResponse])
async def get_charts_by_paper(
    paper_id: int,
    request: Request,
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(10, ge=1, le=100, description="每页数量"),
    chart_type: Optional[ChartType] = Query(None, description="图表类型"),
    page_number: Optional[int] = Query(None, description="页码筛选"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    skip = (page - 1) * page_size

    if chart_type:
        charts = chart_service.get_by_paper_id_and_type(
            db, paper_id=paper_id, chart_type=chart_type, skip=skip, limit=page_size
        )
    elif page_number:
        charts = chart_service.get_by_page(
            db, paper_id=paper_id, page_number=page_number, skip=skip, limit=page_size
        )
    else:
        charts = chart_service.get_by_paper_id(
            db, paper_id=paper_id, skip=skip, limit=page_size
        )

    total = chart_service.count_by_paper_id(db, paper_id=paper_id)
    total_pages = (total + page_size - 1) // page_size

    return PaginatedResponse(
        code=200,
        message="success",
        items=[_enrich_chart_url(ChartResponse.model_validate(c), request) for c in charts],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/{chart_id}", response_model=ResponseBase[ChartResponse])
async def get_chart(
    chart_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    chart = chart_service.get(db, id=chart_id)
    if not chart or not chart.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="图表不存在",
        )

    chart_data = ChartResponse.model_validate(chart)
    chart_data = _enrich_chart_url(chart_data, request)

    return ResponseBase(
        code=200,
        message="success",
        data=chart_data,
    )


@router.get("/{chart_id}/image")
async def get_chart_image(
    chart_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    chart = chart_service.get(db, id=chart_id)
    if not chart or not chart.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="图表不存在",
        )

    image_bytes = chart_service.get_image_bytes(chart)
    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="图表图片不存在",
        )

    return Response(
        content=image_bytes,
        media_type="image/png",
        headers={
            "Content-Disposition": f'inline; filename="chart_{chart_id}.png"',
        },
    )


@router.get("/{chart_id}/data", response_model=ResponseBase[dict])
async def get_chart_extracted_data(
    chart_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    chart = chart_service.get(db, id=chart_id)
    if not chart or not chart.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="图表不存在",
        )

    extracted_data = chart_service.get_extracted_data(chart)

    return ResponseBase(
        code=200,
        message="success",
        data=extracted_data,
    )


@router.post("", response_model=ResponseBase[ChartResponse])
async def create_chart(
    chart_in: ChartCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    chart = chart_service.create(db, obj_in=chart_in)

    return ResponseBase(
        code=200,
        message="创建成功",
        data=ChartResponse.model_validate(chart),
    )


@router.put("/{chart_id}", response_model=ResponseBase[ChartResponse])
async def update_chart(
    chart_id: int,
    chart_in: ChartUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    chart = chart_service.get(db, id=chart_id)
    if not chart or not chart.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="图表不存在",
        )

    chart = chart_service.update(db, db_obj=chart, obj_in=chart_in)

    return ResponseBase(
        code=200,
        message="更新成功",
        data=ChartResponse.model_validate(chart),
    )


@router.delete("/{chart_id}", response_model=ResponseBase[ChartResponse])
async def delete_chart(
    chart_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    chart = chart_service.get(db, id=chart_id)
    if not chart or not chart.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="图表不存在",
        )

    if chart.image_path and os.path.exists(chart.image_path):
        try:
            os.remove(chart.image_path)
        except Exception:
            pass

    chart = chart_service.remove(db, id=chart_id)

    return ResponseBase(
        code=200,
        message="删除成功",
        data=ChartResponse.model_validate(chart),
    )


@router.delete("/paper/{paper_id}", response_model=ResponseBase[int])
async def delete_charts_by_paper(
    paper_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    deleted_count = chart_service.delete_by_paper_id(db, paper_id=paper_id)

    return ResponseBase(
        code=200,
        message=f"已删除 {deleted_count} 个图表",
        data=deleted_count,
    )


@router.get("/stats/paper/{paper_id}", response_model=ResponseBase[dict])
async def get_paper_chart_stats(
    paper_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    total = chart_service.count_by_paper_id(db, paper_id=paper_id)
    type_stats = chart_service.get_chart_types_stats(db, paper_id=paper_id)

    stats = {
        "total": total,
        "by_type": type_stats,
        "paper_id": paper_id,
    }

    return ResponseBase(
        code=200,
        message="success",
        data=stats,
    )


@router.get("/types", response_model=ResponseBase[List[str]])
async def get_chart_types():
    types = [t.value for t in ChartType]
    return ResponseBase(
        code=200,
        message="success",
        data=types,
    )
