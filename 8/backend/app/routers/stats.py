import sqlite3
from fastapi import APIRouter, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.models.schemas import StatsOverview
from app.config import DB_PATH
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/stats", tags=["stats"])
security = HTTPBearer()


@router.get("/overview", response_model=StatsOverview)
async def get_overview(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    await get_current_user(credentials)
    conn = sqlite3.connect(str(DB_PATH))
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM documents")
    doc_count = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM chunks")
    vector_count = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM search_history")
    query_count = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM users WHERE is_active = 1")
    active_users = c.fetchone()[0]
    conn.close()
    return StatsOverview(
        document_count=doc_count,
        vector_count=vector_count,
        query_count=query_count,
        active_users=active_users,
    )