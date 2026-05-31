from fastapi import APIRouter
from datetime import datetime

from app.schemas.document import HealthResponse
from app.db.database import database

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check():
    db_status = await database.check_connection()
    
    return HealthResponse(
        status="healthy" if db_status else "degraded",
        timestamp=datetime.utcnow()
    )
