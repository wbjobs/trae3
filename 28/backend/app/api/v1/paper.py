from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_active_user
from app.models import User, PaperStatus
from app.schemas import (
    PaperCreate,
    PaperUpdate,
    PaperResponse,
    PaperParseResult,
    ResponseBase,
    PaginatedResponse,
)
from app.services import paper_service, file_service
from app.modules.paper_parser import paper_parser_service

router = APIRouter(prefix="/papers", tags=["论文管理"])


@router.post("/upload", response_model=ResponseBase[PaperResponse])
async def upload_paper(
    file: UploadFile = File(..., description="论文文件"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    file_path, _, file_size = await file_service.save_upload_file(file, sub_dir="papers")

    paper_in = PaperCreate(
        file_path=file_path,
        file_size=file_size,
        created_by=current_user.id,
    )
    paper = paper_service.create(db, obj_in=paper_in)

    return ResponseBase(
        code=200,
        message="上传成功",
        data=PaperResponse.model_validate(paper),
    )


@router.post("/{paper_id}/parse", response_model=ResponseBase[PaperResponse])
async def parse_paper(
    paper_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    paper = paper_service.get(db, paper_id)
    if not paper:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="论文不存在",
        )

    if paper.created_by and paper.created_by != current_user.id and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权限操作此论文",
        )

    if not paper_parser_service.is_supported(paper.file_path):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的文件格式，支持格式: {paper_parser_service.get_supported_formats()}",
        )

    paper = paper_service.parse_paper(db, paper_id=paper_id)

    if paper.status == PaperStatus.FAILED:
        return ResponseBase(
            code=500,
            message="解析失败",
            data=PaperResponse.model_validate(paper),
        )

    return ResponseBase(
        code=200,
        message="解析成功",
        data=PaperResponse.model_validate(paper),
    )


@router.get("", response_model=PaginatedResponse[PaperResponse])
async def get_papers(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(10, ge=1, le=100, description="每页数量"),
    status: Optional[PaperStatus] = Query(None, description="解析状态"),
    keyword: Optional[str] = Query(None, description="搜索关键词"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    skip = (page - 1) * page_size

    if keyword:
        papers = paper_service.search(db, keyword=keyword, skip=skip, limit=page_size)
        total = len(paper_service.search(db, keyword=keyword))
    elif status:
        papers = paper_service.get_by_status(db, status=status, skip=skip, limit=page_size)
        total = paper_service.count(db, filters={"status": status})
    else:
        papers = paper_service.get_by_user(db, user_id=current_user.id, skip=skip, limit=page_size)
        total = paper_service.count(db, filters={"created_by": current_user.id})

    total_pages = (total + page_size - 1) // page_size

    return PaginatedResponse(
        code=200,
        message="success",
        items=[PaperResponse.model_validate(p) for p in papers],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/{paper_id}", response_model=ResponseBase[PaperResponse])
async def get_paper(
    paper_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    paper = paper_service.get(db, paper_id)
    if not paper:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="论文不存在",
        )

    if paper.created_by and paper.created_by != current_user.id and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权限查看此论文",
        )

    parse_result = paper_service.get_parse_result(db, paper_id=paper_id)
    paper_response = PaperResponse.model_validate(paper)
    paper_response.parse_result = parse_result

    return ResponseBase(
        code=200,
        message="success",
        data=paper_response,
    )


@router.get("/{paper_id}/parse-result", response_model=ResponseBase[PaperParseResult])
async def get_parse_result(
    paper_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    paper = paper_service.get(db, paper_id)
    if not paper:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="论文不存在",
        )

    if paper.created_by and paper.created_by != current_user.id and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权限查看此论文",
        )

    parse_result = paper_service.get_parse_result(db, paper_id=paper_id)
    if not parse_result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="解析结果不存在或论文尚未解析",
        )

    return ResponseBase(
        code=200,
        message="success",
        data=parse_result,
    )


@router.put("/{paper_id}", response_model=ResponseBase[PaperResponse])
async def update_paper(
    paper_id: int,
    paper_in: PaperUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    paper = paper_service.get(db, paper_id)
    if not paper:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="论文不存在",
        )

    if paper.created_by and paper.created_by != current_user.id and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权限修改此论文",
        )

    paper = paper_service.update(db, db_obj=paper, obj_in=paper_in)

    return ResponseBase(
        code=200,
        message="更新成功",
        data=PaperResponse.model_validate(paper),
    )


@router.delete("/{paper_id}", response_model=ResponseBase[PaperResponse])
async def delete_paper(
    paper_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    paper = paper_service.get(db, paper_id)
    if not paper:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="论文不存在",
        )

    if paper.created_by and paper.created_by != current_user.id and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权限删除此论文",
        )

    file_service.delete_file(paper.file_path)
    paper = paper_service.remove(db, id=paper_id)

    return ResponseBase(
        code=200,
        message="删除成功",
        data=PaperResponse.model_validate(paper),
    )


@router.get("/formats/supported", response_model=ResponseBase[list[str]])
async def get_supported_formats():
    formats = paper_parser_service.get_supported_formats()
    return ResponseBase(
        code=200,
        message="success",
        data=formats,
    )
