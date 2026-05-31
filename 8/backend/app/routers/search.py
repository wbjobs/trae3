from fastapi import APIRouter, Depends, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.models.schemas import SearchRequest, SearchResult, SearchHistory
from app.services.vector_service import semantic_search, save_search_history, get_search_history
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/search", tags=["search"])
security = HTTPBearer()


@router.post("")
async def search(
    request: SearchRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    user = await get_current_user(credentials)
    results = semantic_search(request.query, request.top_k, request.threshold)
    save_search_history(request.query, len(results), user.id)
    return {"results": results}


@router.get("/history")
async def search_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    user = await get_current_user(credentials)
    histories, total = get_search_history(user.id, page, page_size)
    return {"items": histories, "total": total}