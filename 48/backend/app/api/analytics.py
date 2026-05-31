from typing import Optional
from fastapi import APIRouter, Query

from ..database import get_db

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

TYPE_NAME_MAP = {
    "CRACK": "裂纹",
    "RUST": "锈蚀",
    "DEFORM": "变形",
    "MISSING": "缺失",
    "LEAK": "渗漏",
    "WEAR": "磨损",
    "LOOSE": "松动",
    "ABNORMAL": "异响",
}


@router.get("/distribution")
async def get_distribution(
    group_by: str = Query("type"),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    conn = get_db()
    query = "SELECT {group}, COUNT(*) as cnt FROM defect WHERE 1=1"
    params = []
    if start_date:
        query += " AND created_at >= ?"
        params.append(start_date)
    if end_date:
        query += " AND created_at <= ?"
        params.append(end_date)
    query += " GROUP BY {group} ORDER BY cnt DESC"
    if group_by == "type":
        query = query.format(group="type")
    elif group_by == "severity":
        query = query.format(group="severity")
    else:
        query = query.format(group="type")
    rows = conn.execute(query, params).fetchall()
    conn.close()
    labels = []
    values = []
    for r in rows:
        label = r[0]
        if group_by == "type" and label in TYPE_NAME_MAP:
            label = label
        labels.append(label)
        values.append(r[1])
    return {"labels": labels, "values": values}


@router.get("/trend")
async def get_trend(
    granularity: str = Query("day"),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    conn = get_db()
    if granularity == "week":
        date_expr = "strftime('%Y-W%W', created_at)"
    elif granularity == "month":
        date_expr = "strftime('%Y-%m', created_at)"
    else:
        date_expr = "strftime('%Y-%m-%d', created_at)"
    query = f"SELECT {date_expr} as period, COUNT(*) as cnt FROM defect WHERE 1=1"
    params = []
    if start_date:
        query += " AND created_at >= ?"
        params.append(start_date)
    if end_date:
        query += " AND created_at <= ?"
        params.append(end_date)
    query += " GROUP BY period ORDER BY period"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    dates = [r[0] for r in rows]
    counts = [r[1] for r in rows]
    if not dates:
        from datetime import datetime, timedelta
        today = datetime.now().strftime("%Y-%m-%d")
        dates = [today]
        counts = [0]
    return {"dates": dates, "counts": counts}


@router.get("/summary")
async def get_summary():
    conn = get_db()
    total_inspections = conn.execute("SELECT COUNT(*) FROM inspection").fetchone()[0]
    total_defects = conn.execute("SELECT COUNT(*) FROM defect").fetchone()[0]
    defect_rate = total_defects / max(total_inspections, 1)
    sev_rows = conn.execute("SELECT severity, COUNT(*) as cnt FROM defect GROUP BY severity").fetchall()
    severity_distribution = {}
    for r in sev_rows:
        severity_distribution[r[0]] = r[1]
    conn.close()
    return {
        "total_inspections": total_inspections,
        "total_defects": total_defects,
        "defect_rate": round(defect_rate, 4),
        "severity_distribution": severity_distribution,
    }
