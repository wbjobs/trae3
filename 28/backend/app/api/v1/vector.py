from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_active_user
from app.models import User
from app.schemas import (
    VectorStoreRequest,
    VectorSearchRequest,
    VectorSearchResponse,
    VectorStoreResponse,
    VectorDeleteRequest,
    VectorStatsResponse,
    ResponseBase,
)
from app.services import vector_service

router = APIRouter(prefix="/vectors", tags=["向量存储与搜索"])


@router.post("/store", response_model=ResponseBase[List[VectorStoreResponse]])
async def store_vector(
    request: VectorStoreRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    vectors = vector_service.store_text(db, request)

    return ResponseBase(
        code=200,
        message=f"成功存储 {len(vectors)} 个向量",
        data=[VectorStoreResponse.model_validate(v) for v in vectors],
    )


@router.post("/search", response_model=ResponseBase[List[VectorSearchResponse]])
async def search_vectors(
    request: VectorSearchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    results = vector_service.search(db, request)

    response_data = []
    for score, vec in results:
        vec_data = VectorSearchResponse.model_validate(vec)
        vec_data.score = score
        response_data.append(vec_data)

    return ResponseBase(
        code=200,
        message=f"找到 {len(results)} 个相关结果",
        data=response_data,
    )


@router.get("/stats", response_model=ResponseBase[VectorStatsResponse])
async def get_vector_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    stats = vector_service.get_stats(db)

    return ResponseBase(
        code=200,
        message="success",
        data=VectorStatsResponse(**stats),
    )


@router.get("/{vector_id}", response_model=ResponseBase[VectorStoreResponse])
async def get_vector(
    vector_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    vec = vector_service.get_by_vector_id(db, vector_id)
    if not vec:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="向量不存在",
        )

    return ResponseBase(
        code=200,
        message="success",
        data=VectorStoreResponse.model_validate(vec),
    )


@router.get("/paper/{paper_id}", response_model=ResponseBase[List[VectorStoreResponse]])
async def get_vectors_by_paper(
    paper_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    vectors = vector_service.get_by_paper_id(db, paper_id)

    return ResponseBase(
        code=200,
        message=f"找到 {len(vectors)} 个向量",
        data=[VectorStoreResponse.model_validate(v) for v in vectors],
    )


@router.delete("/paper/{paper_id}", response_model=ResponseBase[bool])
async def delete_vectors_by_paper(
    paper_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    deleted = vector_service.delete_by_paper_id(db, paper_id)

    return ResponseBase(
        code=200,
        message="删除成功" if deleted else "没有找到需要删除的向量",
        data=deleted,
    )


@router.delete("/{vector_id}", response_model=ResponseBase[bool])
async def delete_vector(
    vector_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    deleted = vector_service.delete_by_vector_id(db, vector_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="向量不存在",
        )

    return ResponseBase(
        code=200,
        message="删除成功",
        data=True,
    )


@router.post("/rebuild", response_model=ResponseBase[int])
async def rebuild_index(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理员权限",
        )

    count = vector_service.rebuild_index(db)

    return ResponseBase(
        code=200,
        message=f"成功重建索引，共 {count} 个向量",
        data=count,
    )


@router.delete("", response_model=ResponseBase[bool])
async def clear_all_vectors(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理员权限",
        )

    vector_service.clear_all(db)

    return ResponseBase(
        code=200,
        message="已清除所有向量",
        data=True,
    )


@router.get("/content-type/{content_type}", response_model=ResponseBase[List[VectorStoreResponse]])
async def get_vectors_by_content_type(
    content_type: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    from app.models.vector import CONTENT_TYPES
    if content_type not in CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"content_type 必须是以下值之一: {CONTENT_TYPES}",
        )

    vectors = vector_service.get_by_content_type(db, content_type)

    return ResponseBase(
        code=200,
        message=f"找到 {len(vectors)} 个向量",
        data=[VectorStoreResponse.model_validate(v) for v in vectors],
    )
