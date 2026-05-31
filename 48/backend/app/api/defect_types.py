from fastapi import APIRouter

from ..database import get_db

router = APIRouter(prefix="/api/defect-types", tags=["defect-types"])


@router.get("")
async def list_defect_types():
    conn = get_db()
    rows = conn.execute("SELECT dt.*, (SELECT COUNT(*) FROM defect WHERE type=dt.code) as count FROM defect_type dt ORDER BY dt.id").fetchall()
    conn.close()
    return [dict(r) for r in rows]
