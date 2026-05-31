from fastapi import APIRouter, UploadFile, File, HTTPException, Query, Depends, Body
from fastapi.responses import StreamingResponse
from typing import Optional, List, Union, Any
from datetime import datetime
import time
import base64
import uuid
import logging
import json
import io
import csv

from app.schemas.document import (
    ProcessResult,
    DocumentRecord,
    PaginatedResponse,
    CorrectionRequest,
    BatchExportRequest,
    BatchOperationResult,
    SystemStatsResponse,
    DbStats,
    OcrStats
)
from app.services.preprocess import preprocessor
from app.services.ocr_service import ocr_service
from app.services.structurize import structurize_service
from app.db.database import get_document_repository
from app.db.repository import DocumentRepository
from app.db.models import DocumentModel, serialize_for_db
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])

RepositoryType = Union[DocumentRepository, Any]


@router.post("/process", response_model=ProcessResult)
async def process_document(
    file: UploadFile = File(...),
    preprocess_mode: str = Query("balanced", pattern="^(fast|balanced|accurate)$"),
    repo: RepositoryType = Depends(get_document_repository)
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="请上传图片文件")
    
    try:
        file_content = await file.read()
        
        if len(file_content) > settings.max_file_size:
            raise HTTPException(status_code=400, detail="文件大小超过限制")
        
        start_time = time.time()
        
        original_b64 = base64.b64encode(file_content).decode('utf-8')
        original_b64 = f"data:{file.content_type};base64,{original_b64}"
        
        processed_bytes, processed_img, preprocess_stats = preprocessor.process(
            file_content, mode=preprocess_mode
        )
        processed_b64 = base64.b64encode(processed_bytes).decode('utf-8')
        processed_b64 = f"data:image/png;base64,{processed_b64}"
        
        ocr_result = ocr_service.recognize(processed_img)
        structured_data = structurize_service.process(ocr_result)
        
        processing_time = time.time() - start_time
        
        try:
            doc_data = DocumentModel.create_document(
                filename=file.filename or str(uuid.uuid4()),
                ocr_result=ocr_result.model_dump(),
                structured_data=structured_data.model_dump(),
                processing_time=processing_time
            )
            doc_id = await repo.create(doc_data)
        except Exception as e:
            logger.warning(f"保存到数据库失败，使用临时ID: {e}")
            doc_id = str(uuid.uuid4())
        
        return ProcessResult(
            id=doc_id,
            filename=file.filename or str(uuid.uuid4()),
            original_image=original_b64,
            preprocessed_image=processed_b64,
            ocr_result=ocr_result,
            structured_data=structured_data,
            created_at=datetime.utcnow(),
            processing_time=processing_time
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"处理文档失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"处理失败: {str(e)}")


@router.get("/{doc_id}", response_model=DocumentRecord)
async def get_document(
    doc_id: str,
    repo: RepositoryType = Depends(get_document_repository)
):
    doc = await repo.get_by_id(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    return DocumentRecord(**doc)


@router.get("", response_model=PaginatedResponse)
async def list_documents(
    keyword: Optional[str] = Query(None, description="搜索关键词"),
    start_date: Optional[str] = Query(None, description="开始日期 YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="结束日期 YYYY-MM-DD"),
    min_confidence: Optional[float] = Query(None, ge=0, le=1, description="最小置信度"),
    sender: Optional[str] = Query(None, description="发件人"),
    sort_by: str = Query("created_at", description="排序字段"),
    sort_order: int = Query(-1, description="排序方向 1升序 -1降序"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(10, ge=1, le=100, description="每页数量"),
    repo: RepositoryType = Depends(get_document_repository)
):
    try:
        result = await repo.list(
            keyword=keyword,
            start_date=start_date,
            end_date=end_date,
            min_confidence=min_confidence,
            sender=sender,
            sort_by=sort_by,
            sort_order=sort_order,
            page=page,
            page_size=page_size
        )
        return PaginatedResponse(**result)
    except Exception as e:
        logger.error(f"查询文档列表失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


@router.put("/{doc_id}", response_model=DocumentRecord)
async def update_document(
    doc_id: str,
    correction: CorrectionRequest,
    repo: RepositoryType = Depends(get_document_repository)
):
    doc = await repo.get_by_id(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    ocr_result_dict = correction.ocr_result.model_dump() if correction.ocr_result else None
    structured_dict = correction.structured_data.model_dump() if correction.structured_data else None
    
    success = await repo.update_document(
        doc_id=doc_id,
        ocr_result=ocr_result_dict,
        structured_data=structured_dict,
        correction_note=correction.correction_note
    )
    
    if not success:
        raise HTTPException(status_code=500, detail="更新失败")
    
    updated_doc = await repo.get_by_id(doc_id)
    if not updated_doc:
        raise HTTPException(status_code=500, detail="更新后获取文档失败")
    
    logger.info(f"文档 {doc_id} 已更新，修正备注: {correction.correction_note}")
    return DocumentRecord(**updated_doc)


@router.post("/export")
async def export_documents(
    export_request: BatchExportRequest,
    repo: RepositoryType = Depends(get_document_repository)
):
    try:
        if export_request.ids:
            documents = await repo.get_by_ids(export_request.ids)
        else:
            all_docs = []
            page = 1
            page_size = 100
            while True:
                result = await repo.list(
                    keyword=export_request.keyword,
                    start_date=export_request.start_date,
                    end_date=export_request.end_date,
                    page=page,
                    page_size=page_size
                )
                all_docs.extend(result["items"])
                if len(result["items"]) < page_size:
                    break
                page += 1
            documents = all_docs
        
        def safe_get(obj, key, default=""):
            if isinstance(obj, dict):
                return obj.get(key, default)
            return getattr(obj, key, default)
        
        def to_dict(item):
            if hasattr(item, 'model_dump'):
                return item.model_dump()
            elif hasattr(item, 'dict'):
                return item.dict()
            return item
        
        export_data = []
        for doc in documents:
            doc_dict = to_dict(doc)
            ocr_result = safe_get(doc_dict, "ocr_result", {})
            ocr_result_dict = to_dict(ocr_result)
            structured_data = safe_get(doc_dict, "structured_data", {})
            structured_data_dict = to_dict(structured_data)
            
            custom_fields = safe_get(structured_data_dict, "custom_fields", [])
            custom_fields_dicts = [to_dict(f) for f in custom_fields]
            
            item = {
                "id": str(safe_get(doc_dict, "_id", "")),
                "filename": safe_get(doc_dict, "filename", ""),
                "created_at": str(safe_get(doc_dict, "created_at", "")),
                "processing_time": safe_get(doc_dict, "processing_time", 0),
                "ocr_confidence": safe_get(ocr_result_dict, "confidence", 0),
                "raw_text": safe_get(ocr_result_dict, "raw_text", ""),
                "structured_title": safe_get(structured_data_dict, "title", ""),
                "structured_date": safe_get(structured_data_dict, "date", ""),
                "structured_sender": safe_get(structured_data_dict, "sender", ""),
                "structured_receiver": safe_get(structured_data_dict, "receiver", ""),
                "structured_content": safe_get(structured_data_dict, "content", ""),
                "keywords": ", ".join(safe_get(structured_data_dict, "keywords", [])),
                "custom_fields": json.dumps(custom_fields_dicts, ensure_ascii=False) if custom_fields_dicts else ""
            }
            
            if export_request.include_images:
                lines = safe_get(ocr_result_dict, "lines", [])
                lines_dicts = [to_dict(l) for l in lines]
                item["ocr_lines"] = json.dumps(lines_dicts, ensure_ascii=False)
            
            export_data.append(item)
        
        if export_request.format == "json":
            content = json.dumps(export_data, ensure_ascii=False, indent=2)
            media_type = "application/json"
            filename = f"documents_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        
        elif export_request.format == "csv":
            output = io.StringIO()
            if export_data:
                fieldnames = list(export_data[0].keys())
                writer = csv.DictWriter(output, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(export_data)
            content = output.getvalue()
            media_type = "text/csv; charset=utf-8-sig"
            content = '\ufeff' + content
            filename = f"documents_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        
        elif export_request.format == "excel":
            try:
                import pandas as pd
                import openpyxl
                df = pd.DataFrame(export_data)
                output = io.BytesIO()
                with pd.ExcelWriter(output, engine='openpyxl') as writer:
                    df.to_excel(writer, index=False, sheet_name='识别结果')
                content = output.getvalue()
                media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                filename = f"documents_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
            except ImportError as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"Excel 导出需要安装 pandas 和 openpyxl: pip install pandas openpyxl. 错误: {str(e)}"
                )
            except Exception as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"Excel 导出失败（依赖版本不兼容）: {str(e)}. 请尝试重新安装: pip install --upgrade pandas openpyxl numpy"
                )
        
        else:
            raise HTTPException(status_code=400, detail="不支持的导出格式")
        
        return StreamingResponse(
            iter([content]) if isinstance(content, (str, bytes)) else content,
            media_type=media_type,
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{filename}"
            }
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"导出失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"导出失败: {str(e)}")


@router.delete("/batch", response_model=BatchOperationResult)
async def delete_batch(
    ids: List[str] = Body(..., embed=True),
    repo: RepositoryType = Depends(get_document_repository)
):
    success_count = 0
    failed_count = 0
    failed_ids = []
    
    for doc_id in ids:
        try:
            result = await repo.delete(doc_id)
            if result:
                success_count += 1
            else:
                failed_count += 1
                failed_ids.append(doc_id)
        except Exception as e:
            logger.error(f"批量删除失败 {doc_id}: {e}")
            failed_count += 1
            failed_ids.append(doc_id)
    
    message = f"成功删除 {success_count} 条，失败 {failed_count} 条"
    logger.info(message)
    
    return BatchOperationResult(
        success_count=success_count,
        failed_count=failed_count,
        failed_ids=failed_ids
    )


@router.delete("/{doc_id}")
async def delete_document(
    doc_id: str,
    repo: RepositoryType = Depends(get_document_repository)
):
    success = await repo.delete(doc_id)
    if not success:
        raise HTTPException(status_code=404, detail="文档不存在")
    return {"message": "删除成功"}


@router.get("/stats/system", response_model=SystemStatsResponse)
async def get_system_stats(
    repo: RepositoryType = Depends(get_document_repository)
):
    try:
        db_stats = await repo.get_stats()
        ocr_stats = ocr_service.get_system_stats()
        
        return SystemStatsResponse(
            db_stats=DbStats(**db_stats),
            ocr_stats=OcrStats(**ocr_stats)
        )
    except Exception as e:
        logger.error(f"获取统计信息失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取统计失败: {str(e)}")
