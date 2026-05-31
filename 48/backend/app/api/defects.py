import os
import json
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, UploadFile, File, Form, Query, HTTPException

from ..database import get_db
from ..modules.inference import extract_text_vector, extract_feature_vector, DEFECT_NAMES
from ..modules.vector_store import search_similar, store_vector
from ..modules.preprocessing import draw_annotations_bytes

router = APIRouter(prefix="/api/defects", tags=["defects"])


@router.get("")
async def list_defects(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    type: Optional[str] = None,
    severity: Optional[str] = None,
    confirmed: Optional[bool] = None,
):
    conn = get_db()
    query = "SELECT d.*, i.filename as inspection_filename FROM defect d LEFT JOIN inspection i ON d.inspection_id = i.id WHERE 1=1"
    params = []
    if type:
        query += " AND d.type=?"
        params.append(type)
    if severity:
        query += " AND d.severity=?"
        params.append(severity)
    if confirmed is not None:
        query += " AND d.confirmed=?"
        params.append(1 if confirmed else 0)
    count_query = query.replace("SELECT d.*, i.filename as inspection_filename", "SELECT COUNT(*)", 1)
    total = conn.execute(count_query, params).fetchone()[0]
    query += " ORDER BY d.created_at DESC LIMIT ? OFFSET ?"
    params.extend([page_size, (page - 1) * page_size])
    rows = conn.execute(query, params).fetchall()
    conn.close()
    items = []
    for r in rows:
        items.append(_defect_row_to_dict(r))
    return {"items": items, "total": total}


@router.get("/types")
async def list_defect_types():
    conn = get_db()
    rows = conn.execute("SELECT dt.*, (SELECT COUNT(*) FROM defect WHERE type=dt.code) as count FROM defect_type dt").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.get("/{defect_id}")
async def get_defect(defect_id: str):
    conn = get_db()
    row = conn.execute("SELECT d.*, i.filename as inspection_filename FROM defect d LEFT JOIN inspection i ON d.inspection_id = i.id WHERE d.id=?", (defect_id,)).fetchone()
    conn.close()
    if not row:
        return {"error": "Defect not found"}
    return _defect_row_to_dict(row)


@router.put("/{defect_id}/confirm")
async def confirm_defect(defect_id: str, body: dict):
    confirmed = body.get("confirmed", True)
    note = body.get("note", "")
    conn = get_db()
    conn.execute(
        "UPDATE defect SET confirmed=?, confirmed_by=? WHERE id=?",
        (1 if confirmed else -1, note, defect_id),
    )
    conn.commit()
    row = conn.execute("SELECT d.*, i.filename as inspection_filename FROM defect d LEFT JOIN inspection i ON d.inspection_id = i.id WHERE d.id=?", (defect_id,)).fetchone()
    conn.close()
    if not row:
        return {"error": "Defect not found"}
    return _defect_row_to_dict(row)


@router.post("/search")
async def search_defects(
    query: Optional[str] = Form(None),
    image_file: Optional[UploadFile] = File(None),
    top_k: int = Form(10),
):
    if query:
        query_vector = extract_text_vector(query)
    elif image_file:
        from PIL import Image
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            content = await image_file.read()
            tmp.write(content)
            tmp_path = tmp.name
        try:
            img = Image.open(tmp_path)
            image_size = img.size
            img.close()
            dummy_defect = {
                "type": "UNKNOWN",
                "bbox": {"x": 0, "y": 0, "width": image_size[0], "height": image_size[1]},
                "confidence": 0.8,
                "severity": "medium",
            }
            query_vector = extract_feature_vector(dummy_defect, image_size)
        finally:
            os.unlink(tmp_path)
    else:
        return {"results": []}

    similar = search_similar(query_vector, top_k)
    if not similar:
        return {"results": []}

    conn = get_db()
    results = []
    for item in similar:
        vid = item["vector_id"]
        row = conn.execute("SELECT d.*, i.filename as inspection_filename FROM defect d LEFT JOIN inspection i ON d.inspection_id = i.id WHERE d.vector_id=?", (vid,)).fetchone()
        if row:
            d = _defect_row_to_dict(row)
            d["similarity"] = item["similarity"]
            results.append(d)
    conn.close()
    return {"results": results}


def _defect_row_to_dict(r) -> dict:
    defect_type = r["type"]
    return {
        "id": r["id"],
        "type": defect_type,
        "type_name": DEFECT_NAMES.get(defect_type, defect_type),
        "severity": r["severity"],
        "confidence": r["confidence"],
        "description": r["description"] or "",
        "confirmed": bool(r["confirmed"]),
        "confirmed_by": r["confirmed_by"],
        "vector_id": r["vector_id"] or "",
        "image_url": r["image_url"] or "",
        "inspection_id": r["inspection_id"],
        "created_at": r["created_at"],
    }


@router.put("/{defect_id}/annotation")
async def update_defect_annotation(defect_id: str, body: Dict[str, Any]):
    conn = get_db()
    row = conn.execute("SELECT * FROM defect WHERE id=?", (defect_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Defect not found")

    updates = []
    params = []

    if "bbox" in body:
        updates.append("bbox=?")
        params.append(json.dumps(body["bbox"]))
    if "type" in body:
        updates.append("type=?")
        params.append(body["type"])
    if "severity" in body:
        updates.append("severity=?")
        params.append(body["severity"])
    if "description" in body:
        updates.append("description=?")
        params.append(body["description"])
    if "confidence" in body:
        updates.append("confidence=?")
        params.append(body["confidence"])

    if not updates:
        return _defect_row_to_dict(row)

    updates.append("updated_at=CURRENT_TIMESTAMP")
    params.append(defect_id)
    update_sql = f"UPDATE defect SET {', '.join(updates)} WHERE id=?"
    conn.execute(update_sql, params)

    if "type" in body or "severity" in body or "confidence" in body or "bbox" in body:
        updated_bbox = body.get("bbox", json.loads(row["bbox"]) if isinstance(row["bbox"], str) else row["bbox"])
        updated_type = body.get("type", row["type"])
        updated_severity = body.get("severity", row["severity"])
        updated_confidence = body.get("confidence", row["confidence"])
        updated_info = {
            "type": updated_type,
            "severity": updated_severity,
            "confidence": updated_confidence,
            "bbox": updated_bbox,
        }
        inspection_row = conn.execute(
            "SELECT processed_path FROM inspection WHERE id=?",
            (row["inspection_id"],),
        ).fetchone()
        if inspection_row and inspection_row["processed_path"]:
            from PIL import Image
            try:
                with Image.open(inspection_row["processed_path"]) as img:
                    image_size = img.size
                new_feature = extract_feature_vector(updated_info, image_size)
                if row["vector_id"]:
                    store_vector(row["vector_id"], new_feature, {
                        "defect_id": defect_id,
                        "type": updated_type,
                        "severity": updated_severity,
                        "confidence": updated_confidence,
                        "inspection_id": row["inspection_id"],
                    })
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"Failed to update vector: {e}")

    conn.commit()
    updated_row = conn.execute(
        "SELECT d.*, i.filename as inspection_filename FROM defect d LEFT JOIN inspection i ON d.inspection_id = i.id WHERE d.id=?",
        (defect_id,),
    ).fetchone()
    conn.close()
    return _defect_row_to_dict(updated_row)


@router.post("/{defect_id}/redraw")
async def redraw_defect_annotations(defect_id: str):
    conn = get_db()
    row = conn.execute(
        "SELECT d.*, i.processed_path, i.annotated_path FROM defect d "
        "LEFT JOIN inspection i ON d.inspection_id = i.id WHERE d.id=?",
        (defect_id,),
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Defect not found")
    if not row["processed_path"] or not os.path.exists(row["processed_path"]):
        raise HTTPException(status_code=400, detail="Processed image not available")

    bbox = json.loads(row["bbox"]) if isinstance(row["bbox"], str) else row["bbox"]
    defect_info = [{
        "type": row["type"],
        "severity": row["severity"],
        "confidence": row["confidence"],
        "bbox": bbox,
    }]
    from PIL import Image
    with open(row["processed_path"], "rb") as f:
        image_bytes = f.read()
    annotated_bytes = draw_annotations_bytes(image_bytes, defect_info)
    import base64
    return {
        "image_base64": base64.b64encode(annotated_bytes).decode("utf-8"),
        "defect_id": defect_id,
    }


@router.post("/add-to-inspection/{inspection_id}")
async def add_defect_to_inspection(inspection_id: str, body: Dict[str, Any]):
    conn = get_db()
    insp_row = conn.execute("SELECT * FROM inspection WHERE id=?", (inspection_id,)).fetchone()
    if not insp_row:
        raise HTTPException(status_code=404, detail="Inspection not found")
    import uuid
    defect_id = str(uuid.uuid4())
    vector_id = str(uuid.uuid4())
    bbox = body.get("bbox", {"x": 0, "y": 0, "width": 0, "height": 0})
    defect_type = body.get("type", "UNKNOWN")
    severity = body.get("severity", "medium")
    confidence = body.get("confidence", 1.0)
    description = body.get("description", "")

    if insp_row["processed_path"]:
        from PIL import Image
        try:
            with Image.open(insp_row["processed_path"]) as img:
                image_size = img.size
            feature = extract_feature_vector(
                {"type": defect_type, "severity": severity, "confidence": confidence, "bbox": bbox},
                image_size,
            )
            store_vector(
                vector_id,
                feature,
                {
                    "defect_id": defect_id,
                    "type": defect_type,
                    "severity": severity,
                    "confidence": confidence,
                    "inspection_id": inspection_id,
                },
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Failed to create vector: {e}")

    relative_image = f"/uploads/{os.path.basename(insp_row['annotated_path'])}" if insp_row["annotated_path"] else ""
    conn.execute(
        "INSERT INTO defect (id, inspection_id, type, severity, confidence, bbox, description, vector_id, image_url, confirmed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
        (
            defect_id,
            inspection_id,
            defect_type,
            severity,
            confidence,
            json.dumps(bbox),
            description,
            vector_id,
            relative_image,
        ),
    )
    conn.commit()
    new_row = conn.execute(
        "SELECT d.*, i.filename as inspection_filename FROM defect d LEFT JOIN inspection i ON d.inspection_id = i.id WHERE d.id=?",
        (defect_id,),
    ).fetchone()
    conn.close()
    return _defect_row_to_dict(new_row)
