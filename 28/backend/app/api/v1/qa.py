from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import json

from app.api import deps
from app.models import User, QA
from app.schemas import (
    ResponseBase,
    PaginatedResponse,
)
from app.schemas.qa import (
    QAQuestion,
    QAResponse,
    QAOut,
    QASearchResult,
)
from app.services import qa_service

router = APIRouter()


def _safe_json_dumps(obj) -> str:
    return json.dumps(obj, ensure_ascii=False)


@router.post("/ask", response_model=ResponseBase[QAResponse])
async def ask_question(
    request: Request,
    question: QAQuestion,
    db: Session = Depends(deps.get_db),
    current_user: Optional[User] = Depends(deps.get_current_active_user),
):
    user_id = current_user.id if current_user else None

    if question.stream:
        stream_gen, rag_response = qa_service.ask_stream(
            db=db,
            question=question,
            user_id=user_id,
        )

        metadata_json = _safe_json_dumps(rag_response.model_dump())

        async def event_generator():
            yield f"data: {metadata_json}\n\n"
            for chunk in stream_gen:
                if isinstance(chunk, bytes):
                    chunk = chunk.decode("utf-8", errors="replace")
                content_json = _safe_json_dumps({"type": "content", "data": chunk})
                yield f"data: {content_json}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream; charset=utf-8",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    result = qa_service.ask(
        db=db,
        question=question,
        user_id=user_id,
    )

    return ResponseBase(
        code=200,
        message="问答成功",
        data=result,
    )


@router.post("/retrieve", response_model=ResponseBase[List[QASearchResult]])
async def retrieve_context(
    request: Request,
    question: str,
    top_k: int = Query(default=5, ge=1, le=50),
    paper_ids: Optional[str] = Query(None, description="论文ID列表，逗号分隔"),
    use_rerank: bool = Query(default=True),
    current_user: Optional[User] = Depends(deps.get_current_active_user),
):
    paper_id_list = None
    if paper_ids:
        paper_id_list = [pid.strip() for pid in paper_ids.split(",") if pid.strip()]

    results = qa_service.retrieve_only(
        question=question,
        top_k=top_k,
        paper_ids=paper_id_list,
        use_rerank=use_rerank,
    )

    return ResponseBase(
        code=200,
        message="检索成功",
        data=results,
    )


@router.get("/history", response_model=PaginatedResponse[QAOut])
async def get_qa_history(
    request: Request,
    page: int = 1,
    page_size: int = 10,
    keyword: Optional[str] = None,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    skip = (page - 1) * page_size

    if keyword:
        items = qa_service.search_qa_history(
            db=db,
            keyword=keyword,
            user_id=current_user.id,
            skip=skip,
            limit=page_size,
        )
        total = len(items)
    else:
        items = qa_service.get_by_user(
            db=db,
            user_id=current_user.id,
            skip=skip,
            limit=page_size,
        )
        total = qa_service.count_by_user(db=db, user_id=current_user.id)

    total_pages = (total + page_size - 1) // page_size

    return PaginatedResponse(
        code=200,
        message="获取问答历史成功",
        items=[QAOut.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/history/{qa_id}", response_model=ResponseBase[QAOut])
async def get_qa_detail(
    request: Request,
    qa_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    qa = qa_service.get(db, id=qa_id)
    if not qa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="问答记录不存在",
        )

    if qa.created_by != current_user.id and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权访问该记录",
        )

    return ResponseBase(
        code=200,
        message="获取问答详情成功",
        data=QAOut.model_validate(qa),
    )


@router.delete("/history/{qa_id}", response_model=ResponseBase)
async def delete_qa(
    request: Request,
    qa_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    qa = qa_service.get(db, id=qa_id)
    if not qa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="问答记录不存在",
        )

    if qa.created_by != current_user.id and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权删除该记录",
        )

    qa_service.remove(db, id=qa_id)

    return ResponseBase(
        code=200,
        message="删除成功",
    )


@router.get("/conversation/{conversation_id}", response_model=ResponseBase)
async def get_conversation(
    request: Request,
    conversation_id: str,
    current_user: User = Depends(deps.get_current_active_user),
):
    history = qa_service.get_conversation_history(conversation_id)
    return ResponseBase(
        code=200,
        message="获取会话历史成功",
        data={
            "conversation_id": conversation_id,
            "history": history,
        },
    )


@router.delete("/conversation/{conversation_id}", response_model=ResponseBase)
async def clear_conversation(
    request: Request,
    conversation_id: str,
    current_user: User = Depends(deps.get_current_active_user),
):
    qa_service.clear_conversation(conversation_id)
    return ResponseBase(
        code=200,
        message="清空会话成功",
    )


@router.post("/refresh-index", response_model=ResponseBase)
async def refresh_retriever_index(
    request: Request,
    current_user: User = Depends(deps.get_current_active_superuser),
):
    qa_service.refresh_retriever()
    return ResponseBase(
        code=200,
        message="索引刷新成功",
    )
