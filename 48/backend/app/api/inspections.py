import os
import uuid
import json
import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, UploadFile, File, Form, Query, HTTPException
from fastapi.responses import FileResponse

from ..database import get_db
from ..modules.preprocessing import preprocess_image, draw_annotations
from ..modules.inference import simulate_detection, extract_feature_vector, get_inference_stats, DEFECT_NAMES
from ..modules.vector_store import store_vector, batch_store_vectors, get_vector_store_stats
from ..modules.report import (
    generate_single_report,
    generate_batch_report,
    ReportDefect,
    ReportInspection,
    ReportSummary,
    REPORT_DIR,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/inspections", tags=["inspections"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")

_executor = ThreadPoolExecutor(max_workers=4)

_processing_tasks: dict = {}


def _process_single_image(inspection_id: str, original_path: str, filename: str):
    try:
        processed_path = preprocess_image(original_path)
        from PIL import Image
        img = Image.open(processed_path)
        image_size = img.size
        img.close()
        detections = simulate_detection(image_size, image_path=original_path)
        annotated_path = draw_annotations(processed_path, detections)
        conn = get_db()
        conn.execute(
            "UPDATE inspection SET processed_path=?, annotated_path=?, status='completed', updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (processed_path, annotated_path, inspection_id),
        )
        defect_records = []
        for det in detections:
            defect_id = str(uuid.uuid4())
            vector_id = str(uuid.uuid4())
            feature_vector = extract_feature_vector(det, image_size)
            store_result = store_vector(
                vector_id,
                feature_vector,
                {
                    "defect_id": defect_id,
                    "type": det["type"],
                    "severity": det["severity"],
                    "confidence": det["confidence"],
                    "inspection_id": inspection_id,
                },
            )
            if not store_result:
                logger.warning(f"Vector storage failed for defect {defect_id}, proceeding without vector")
            relative_image = f"/uploads/{os.path.basename(annotated_path)}"
            conn.execute(
                "INSERT INTO defect (id, inspection_id, type, severity, confidence, bbox, description, vector_id, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    defect_id,
                    inspection_id,
                    det["type"],
                    det["severity"],
                    det["confidence"],
                    json.dumps(det["bbox"]),
                    det.get("description", ""),
                    vector_id,
                    relative_image,
                ),
            )
            defect_records.append({
                "id": defect_id,
                "type": det["type"],
                "type_name": det.get("type_name", ""),
                "severity": det["severity"],
                "confidence": det["confidence"],
                "bbox": det["bbox"],
                "description": det.get("description", ""),
                "vector_id": vector_id,
            })
        conn.commit()
        conn.close()
        _processing_tasks[inspection_id] = "completed"
        logger.info(f"Inspection {inspection_id} completed with {len(defect_records)} defects")
    except Exception as e:
        logger.error(f"Inspection {inspection_id} failed: {e}")
        conn = get_db()
        conn.execute("UPDATE inspection SET status='failed', updated_at=CURRENT_TIMESTAMP WHERE id=?", (inspection_id,))
        conn.commit()
        conn.close()
        _processing_tasks[inspection_id] = "failed"


@router.post("/upload")
async def upload_images(files: list[UploadFile] = File(...)):
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    task_ids = []
    for f in files:
        inspection_id = str(uuid.uuid4())
        filename = f.filename or "unknown.jpg"
        original_path = os.path.join(UPLOAD_DIR, f"orig_{inspection_id[:8]}_{filename}")
        with open(original_path, "wb") as out:
            content = await f.read()
            out.write(content)
        conn = get_db()
        conn.execute(
            "INSERT INTO inspection (id, filename, original_path, status) VALUES (?, ?, ?, ?)",
            (inspection_id, filename, original_path, "processing"),
        )
        conn.commit()
        conn.close()
        _processing_tasks[inspection_id] = "processing"
        loop = asyncio.get_event_loop()
        loop.run_in_executor(_executor, _process_single_image, inspection_id, original_path, filename)
        task_ids.append(inspection_id)
    if len(task_ids) == 1:
        return {"task_id": task_ids[0], "status": "processing"}
    return {"task_ids": task_ids, "status": "processing"}


@router.get("/{task_id}")
async def get_inspection(task_id: str):
    conn = get_db()
    row = conn.execute("SELECT * FROM inspection WHERE id=?", (task_id,)).fetchone()
    conn.close()
    if not row:
        return {"id": task_id, "status": "failed", "defects": [], "filename": "", "annotated_image_url": "", "created_at": ""}
    defects = _get_defects_for_inspection(task_id)
    annotated_url = f"/uploads/{os.path.basename(row['annotated_path'])}" if row["annotated_path"] else ""
    current_status = _processing_tasks.get(task_id, row["status"])
    return {
        "id": row["id"],
        "filename": row["filename"],
        "status": current_status,
        "defects": defects,
        "annotated_image_url": annotated_url,
        "created_at": row["created_at"],
    }


@router.get("")
async def list_inspections(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    defect_type: Optional[str] = None,
):
    conn = get_db()
    query = "SELECT * FROM inspection WHERE 1=1"
    params = []
    if status:
        query += " AND status=?"
        params.append(status)
    if defect_type:
        query += " AND id IN (SELECT inspection_id FROM defect WHERE type=?)"
        params.append(defect_type)
    count_query = query.replace("SELECT *", "SELECT COUNT(*)", 1)
    total = conn.execute(count_query, params).fetchone()[0]
    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params.extend([page_size, (page - 1) * page_size])
    rows = conn.execute(query, params).fetchall()
    conn.close()
    items = []
    for row in rows:
        defects = _get_defects_for_inspection(row["id"])
        annotated_url = f"/uploads/{os.path.basename(row['annotated_path'])}" if row["annotated_path"] else ""
        current_status = _processing_tasks.get(row["id"], row["status"])
        items.append({
            "id": row["id"],
            "filename": row["filename"],
            "status": current_status,
            "defects": defects,
            "annotated_image_url": annotated_url,
            "created_at": row["created_at"],
        })
    return {"items": items, "total": total}


def _get_defects_for_inspection(inspection_id: str) -> list:
    conn = get_db()
    rows = conn.execute("SELECT * FROM defect WHERE inspection_id=?", (inspection_id,)).fetchall()
    conn.close()
    result = []
    for r in rows:
        bbox = r["bbox"]
        if isinstance(bbox, str):
            try:
                bbox = json.loads(bbox)
            except Exception:
                bbox = {}
        result.append({
            "x": bbox.get("x", 0) if isinstance(bbox, dict) else 0,
            "y": bbox.get("y", 0) if isinstance(bbox, dict) else 0,
            "width": bbox.get("width", 0) if isinstance(bbox, dict) else 0,
            "height": bbox.get("height", 0) if isinstance(bbox, dict) else 0,
            "confidence": r["confidence"],
            "label": r["type"],
            "type": r["type"],
            "severity": r["severity"],
        })
    return result


def _build_report_inspection(inspection_row) -> ReportInspection:
    conn = get_db()
    defect_rows = conn.execute(
        "SELECT * FROM defect WHERE inspection_id=?",
        (inspection_row["id"],),
    ).fetchall()
    conn.close()

    defects = []
    for r in defect_rows:
        bbox = json.loads(r["bbox"]) if isinstance(r["bbox"], str) else r["bbox"]
        defects.append(
            ReportDefect(
                type=r["type"],
                type_name=DEFECT_NAMES.get(r["type"], r["type"]),
                severity=r["severity"],
                confidence=r["confidence"],
                description=r["description"] or "",
                bbox=bbox if isinstance(bbox, dict) else {"x": 0, "y": 0, "width": 0, "height": 0},
                image_path=None,
            )
        )

    annotated_path = inspection_row["annotated_path"]
    return ReportInspection(
        id=inspection_row["id"],
        filename=inspection_row["filename"],
        created_at=inspection_row["created_at"],
        status=inspection_row["status"],
        annotated_image_path=annotated_path,
        defects=defects,
    )


@router.get("/{inspection_id}/report")
async def generate_inspection_report(inspection_id: str):
    conn = get_db()
    row = conn.execute("SELECT * FROM inspection WHERE id=?", (inspection_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Inspection not found")

    report_inspection = _build_report_inspection(row)
    try:
        report_path = generate_single_report(report_inspection)
        filename = f"report_{inspection_id}.pdf"
        return FileResponse(
            report_path,
            media_type="application/pdf",
            filename=filename,
        )
    except Exception as e:
        logger.error(f"Failed to generate report: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate report")


@router.post("/batch-report")
async def generate_batch_report_endpoint(body: Dict[str, Any]):
    inspection_ids = body.get("inspection_ids", [])
    if not inspection_ids:
        raise HTTPException(status_code=400, detail="No inspection IDs provided")

    conn = get_db()
    placeholders = ", ".join(["?"] * len(inspection_ids))
    rows = conn.execute(
        f"SELECT * FROM inspection WHERE id IN ({placeholders})",
        inspection_ids,
    ).fetchall()
    conn.close()

    if not rows:
        raise HTTPException(status_code=404, detail="No inspections found")

    report_inspections = [_build_report_inspection(r) for r in rows]

    total_defects = sum(len(ri.defects) for ri in report_inspections)
    severity_distribution: Dict[str, int] = {}
    type_distribution: Dict[str, int] = {}
    for ri in report_inspections:
        for d in ri.defects:
            severity_distribution[d.severity] = severity_distribution.get(d.severity, 0) + 1
            type_distribution[d.type] = type_distribution.get(d.type, 0) + 1

    summary = ReportSummary(
        total_inspections=len(report_inspections),
        total_defects=total_defects,
        severity_distribution=severity_distribution,
        type_distribution=type_distribution,
        defect_rate=total_defects / max(len(report_inspections), 1),
    )

    try:
        report_path = generate_batch_report(report_inspections, summary)
        filename = f"batch_report_{len(report_inspections)}_inspections.pdf"
        return FileResponse(
            report_path,
            media_type="application/pdf",
            filename=filename,
        )
    except Exception as e:
        logger.error(f"Failed to generate batch report: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate report")


@router.get("/stats/overview")
async def get_system_stats():
    conn = get_db()
    total_inspections = conn.execute("SELECT COUNT(*) FROM inspection").fetchone()[0]
    total_defects = conn.execute("SELECT COUNT(*) FROM defect").fetchone()[0]
    completed = conn.execute("SELECT COUNT(*) FROM inspection WHERE status='completed'").fetchone()[0]
    processing = conn.execute("SELECT COUNT(*) FROM inspection WHERE status='processing'").fetchone()[0]
    failed = conn.execute("SELECT COUNT(*) FROM inspection WHERE status='failed'").fetchone()[0]
    conn.close()

    inference_stats = get_inference_stats()
    vector_stats = get_vector_store_stats()

    return {
        "inspections": {
            "total": total_inspections,
            "completed": completed,
            "processing": processing,
            "failed": failed,
            "total_defects": total_defects,
        },
        "inference_engine": inference_stats,
        "vector_store": vector_stats,
    }
