from datetime import datetime
from typing import List, Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)

try:
    from bson.objectid import ObjectId
    BSON_AVAILABLE = True
except ImportError:
    ObjectId = None
    BSON_AVAILABLE = False


def safe_str(value: Any, default: str = "") -> str:
    try:
        if value is None:
            return default
        return str(value)
    except Exception:
        return default


def safe_datetime(value: Any) -> Any:
    try:
        if value is None:
            return datetime.utcnow()
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace('Z', '+00:00'))
            except:
                return datetime.utcnow()
        return datetime.utcnow()
    except Exception:
        return datetime.utcnow()


def safe_list(value: Any, default: List = None) -> List:
    try:
        if value is None:
            return default or []
        if isinstance(value, list):
            return value
        return list(value)
    except Exception:
        return default or []


def safe_dict(value: Any, default: Dict = None) -> Dict:
    try:
        if value is None:
            return default or {}
        if isinstance(value, dict):
            return value
        return dict(value)
    except Exception:
        return default or {}


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except Exception:
        return default


def serialize_for_db(data: Any) -> Any:
    try:
        if isinstance(data, dict):
            return {k: serialize_for_db(v) for k, v in data.items()}
        elif isinstance(data, list):
            return [serialize_for_db(item) for item in data]
        elif isinstance(data, datetime):
            return data
        elif hasattr(data, 'model_dump'):
            return serialize_for_db(data.model_dump())
        elif hasattr(data, 'dict'):
            return serialize_for_db(data.dict())
        else:
            return data
    except Exception as e:
        logger.error(f"数据序列化失败: {e}")
        return None


class DocumentModel:
    @staticmethod
    def create_document(
        filename: str,
        ocr_result: Dict[str, Any],
        structured_data: Dict[str, Any],
        processing_time: float
    ) -> Dict[str, Any]:
        try:
            ocr_result = safe_dict(ocr_result, {
                "raw_text": "",
                "lines": [],
                "confidence": 0.0
            })
            
            structured_data = safe_dict(structured_data, {
                "title": "",
                "date": "",
                "sender": "",
                "receiver": "",
                "signature": "",
                "content": "",
                "keywords": [],
                "custom_fields": []
            })
            
            ocr_lines = safe_list(ocr_result.get("lines", []))
            validated_lines = []
            for line in ocr_lines:
                line_dict = safe_dict(line)
                validated_line = {
                    "text": safe_str(line_dict.get("text", "")),
                    "confidence": safe_float(line_dict.get("confidence", 0.0)),
                    "bbox": safe_list(line_dict.get("bbox", [[0, 0], [0, 0], [0, 0], [0, 0]]))
                }
                validated_lines.append(validated_line)
            ocr_result["lines"] = validated_lines
            
            ocr_result["raw_text"] = safe_str(ocr_result.get("raw_text", ""))
            ocr_result["confidence"] = safe_float(ocr_result.get("confidence", 0.0))
            
            custom_fields = safe_list(structured_data.get("custom_fields", []))
            validated_fields = []
            for field in custom_fields:
                field_dict = safe_dict(field)
                validated_field = {
                    "name": safe_str(field_dict.get("name", "")),
                    "value": safe_str(field_dict.get("value", "")),
                    "confidence": safe_float(field_dict.get("confidence", 0.0))
                }
                if validated_field["name"]:
                    validated_fields.append(validated_field)
            structured_data["custom_fields"] = validated_fields
            
            structured_data["title"] = safe_str(structured_data.get("title", ""))
            structured_data["date"] = safe_str(structured_data.get("date", ""))
            structured_data["sender"] = safe_str(structured_data.get("sender", ""))
            structured_data["receiver"] = safe_str(structured_data.get("receiver", ""))
            structured_data["signature"] = safe_str(structured_data.get("signature", ""))
            structured_data["content"] = safe_str(structured_data.get("content", ""))
            structured_data["keywords"] = safe_list(structured_data.get("keywords", []))
            
            doc = {
                "filename": safe_str(filename, "unknown"),
                "ocr_result": ocr_result,
                "structured_data": structured_data,
                "processing_time": safe_float(processing_time, 0.0),
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            
            logger.info(f"文档数据验证完成 - 文件名: {doc['filename']}, OCR行数: {len(ocr_result['lines'])}")
            return doc
            
        except Exception as e:
            logger.error(f"创建文档数据失败: {e}", exc_info=True)
            return {
                "filename": safe_str(filename, "unknown"),
                "ocr_result": {"raw_text": "", "lines": [], "confidence": 0.0},
                "structured_data": {
                    "title": "", "date": "", "sender": "", "receiver": "",
                    "signature": "", "content": "", "keywords": [], "custom_fields": []
                },
                "processing_time": safe_float(processing_time, 0.0),
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
    
    @staticmethod
    def to_response(doc: Dict[str, Any]) -> Dict[str, Any]:
        try:
            if not doc:
                return {
                    "_id": "",
                    "filename": "",
                    "ocr_result": {"raw_text": "", "lines": [], "confidence": 0.0},
                    "structured_data": {
                        "title": "", "date": "", "sender": "", "receiver": "",
                        "signature": "", "content": "", "keywords": [], "custom_fields": []
                    },
                    "created_at": "",
                    "processing_time": 0.0
                }
            
            doc_id = doc.get("_id")
            if doc_id is not None and ObjectId is not None and isinstance(doc_id, ObjectId):
                doc_id = str(doc_id)
            elif doc_id is not None:
                doc_id = str(doc_id)
            else:
                doc_id = ""
            
            created_at = doc.get("created_at")
            if isinstance(created_at, datetime):
                created_at = created_at.isoformat()
            elif created_at is not None:
                created_at = str(created_at)
            else:
                created_at = ""
            
            ocr_result = safe_dict(doc.get("ocr_result", {}), {
                "raw_text": "", "lines": [], "confidence": 0.0
            })
            
            structured_data = safe_dict(doc.get("structured_data", {}), {
                "title": "", "date": "", "sender": "", "receiver": "",
                "signature": "", "content": "", "keywords": [], "custom_fields": []
            })
            
            return {
                "_id": doc_id,
                "filename": safe_str(doc.get("filename", "")),
                "ocr_result": ocr_result,
                "structured_data": structured_data,
                "created_at": created_at,
                "processing_time": safe_float(doc.get("processing_time", 0.0))
            }
            
        except Exception as e:
            logger.error(f"转换响应数据失败: {e}", exc_info=True)
            return {
                "_id": str(doc.get("_id", "")) if doc else "",
                "filename": safe_str(doc.get("filename", "")) if doc else "",
                "ocr_result": {"raw_text": "", "lines": [], "confidence": 0.0},
                "structured_data": {
                    "title": "", "date": "", "sender": "", "receiver": "",
                    "signature": "", "content": "", "keywords": [], "custom_fields": []
                },
                "created_at": "",
                "processing_time": 0.0
            }
