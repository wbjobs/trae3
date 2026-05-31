import uuid
from datetime import datetime
from typing import Dict, Any, Optional, List
import logging
import time

from app.db.models import DocumentModel, serialize_for_db, safe_str, safe_float, safe_list, safe_dict

logger = logging.getLogger(__name__)


class InMemoryRepository:
    def __init__(self):
        self._storage: Dict[str, Dict[str, Any]] = {}
        self._query_stats = {
            "total_queries": 0,
            "total_time_ms": 0,
            "slow_queries": 0
        }
    
    async def create(self, doc_data: Dict[str, Any]) -> str:
        try:
            doc_data = serialize_for_db(doc_data)
            
            if not doc_data:
                raise ValueError("序列化后的数据为空")
            
            doc_id = str(uuid.uuid4())
            doc_data["_id"] = doc_id
            if "created_at" not in doc_data:
                doc_data["created_at"] = datetime.utcnow()
            if "updated_at" not in doc_data:
                doc_data["updated_at"] = datetime.utcnow()
            
            self._storage[doc_id] = doc_data
            logger.info(f"内存存储: 文档保存成功，ID: {doc_id}")
            return doc_id
        except Exception as e:
            logger.error(f"内存存储: 保存文档失败: {e}", exc_info=True)
            raise
    
    async def get_by_id(self, doc_id: str) -> Optional[Dict[str, Any]]:
        start_time = time.time()
        try:
            doc = self._storage.get(doc_id)
            if doc:
                return DocumentModel.to_response(doc)
            return None
        except Exception as e:
            logger.error(f"内存存储: 获取文档失败: {e}")
            return None
        finally:
            self._record_query(start_time, "get_by_id")
    
    async def list(
        self,
        keyword: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        min_confidence: Optional[float] = None,
        sender: Optional[str] = None,
        page: int = 1,
        page_size: int = 10,
        sort_by: str = "created_at",
        sort_order: int = -1
    ) -> Dict[str, Any]:
        start_time = time.time()
        try:
            items = list(self._storage.values())
            
            if keyword:
                keyword = keyword.lower()
                filtered_items = []
                for doc in items:
                    filename = safe_str(doc.get("filename", "")).lower()
                    raw_text = safe_str(doc.get("ocr_result", {}).get("raw_text", "")).lower()
                    title = safe_str(doc.get("structured_data", {}).get("title", "")).lower()
                    sender_name = safe_str(doc.get("structured_data", {}).get("sender", "")).lower()
                    if (keyword in filename or keyword in raw_text or 
                        keyword in title or keyword in sender_name):
                        filtered_items.append(doc)
                items = filtered_items
            
            if start_date:
                try:
                    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
                    items = [
                        doc for doc in items
                        if isinstance(doc.get("created_at"), datetime) and doc["created_at"] >= start_dt
                    ]
                except Exception as e:
                    logger.warning(f"日期过滤失败: {e}")
            
            if end_date:
                try:
                    end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
                    items = [
                        doc for doc in items
                        if isinstance(doc.get("created_at"), datetime) and doc["created_at"] <= end_dt
                    ]
                except Exception as e:
                    logger.warning(f"日期过滤失败: {e}")
            
            if min_confidence is not None and 0 <= min_confidence <= 1:
                items = [
                    doc for doc in items
                    if safe_float(doc.get("ocr_result", {}).get("confidence", 0)) >= min_confidence
                ]
            
            if sender:
                sender = sender.lower()
                items = [
                    doc for doc in items
                    if sender in safe_str(doc.get("structured_data", {}).get("sender", "")).lower()
                ]
            
            valid_sort_fields = ["created_at", "confidence", "filename", "processing_time"]
            if sort_by not in valid_sort_fields:
                sort_by = "created_at"
            
            def sort_key_func(doc):
                if sort_by == "created_at":
                    return doc.get("created_at", datetime.min)
                elif sort_by == "confidence":
                    return safe_float(doc.get("ocr_result", {}).get("confidence", 0))
                elif sort_by == "filename":
                    return safe_str(doc.get("filename", ""))
                elif sort_by == "processing_time":
                    return safe_float(doc.get("processing_time", 0))
                return doc.get("created_at", datetime.min)
            
            items.sort(key=sort_key_func, reverse=(sort_order == -1))
            
            total = len(items)
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size
            paginated_items = items[start_idx:end_idx]
            
            return {
                "total": total,
                "page": page,
                "page_size": page_size,
                "items": [DocumentModel.to_response(doc) for doc in paginated_items],
                "sort_by": sort_by,
                "sort_order": sort_order
            }
        except Exception as e:
            logger.error(f"内存存储: 查询列表失败: {e}", exc_info=True)
            return {
                "total": 0,
                "page": page,
                "page_size": page_size,
                "items": [],
                "error": str(e)
            }
        finally:
            self._record_query(start_time, "list")
    
    async def get_by_ids(self, doc_ids: List[str]) -> List[Dict[str, Any]]:
        start_time = time.time()
        try:
            items = []
            for doc_id in doc_ids:
                doc = self._storage.get(doc_id)
                if doc:
                    items.append(DocumentModel.to_response(doc))
            return items
        except Exception as e:
            logger.error(f"内存存储: 批量获取文档失败: {e}", exc_info=True)
            return []
        finally:
            self._record_query(start_time, "get_by_ids")
    
    async def update_document(
        self,
        doc_id: str,
        ocr_result: Optional[Dict[str, Any]] = None,
        structured_data: Optional[Dict[str, Any]] = None,
        correction_note: Optional[str] = None
    ) -> bool:
        try:
            if doc_id not in self._storage:
                return False
            
            update_data = {
                "updated_at": datetime.utcnow()
            }
            
            if ocr_result:
                update_data["ocr_result"] = serialize_for_db(ocr_result)
            
            if structured_data:
                update_data["structured_data"] = serialize_for_db(structured_data)
            
            if correction_note:
                update_data["corrections"] = {
                    "note": correction_note,
                    "corrected_at": datetime.utcnow()
                }
            
            self._storage[doc_id].update(update_data)
            logger.info(f"内存存储: 文档更新成功，ID: {doc_id}")
            return True
        except Exception as e:
            logger.error(f"内存存储: 更新文档失败: {e}", exc_info=True)
            return False
    
    async def delete(self, doc_id: str) -> bool:
        try:
            if doc_id in self._storage:
                del self._storage[doc_id]
                logger.info(f"内存存储: 文档删除成功，ID: {doc_id}")
                return True
            return False
        except Exception as e:
            logger.error(f"内存存储: 删除文档失败: {e}")
            return False
    
    async def update(self, doc_id: str, update_data: Dict[str, Any]) -> bool:
        try:
            if doc_id in self._storage:
                update_data = serialize_for_db(update_data) or {}
                update_data["updated_at"] = datetime.utcnow()
                self._storage[doc_id].update(update_data)
                logger.info(f"内存存储: 文档更新成功，ID: {doc_id}")
                return True
            return False
        except Exception as e:
            logger.error(f"内存存储: 更新文档失败: {e}")
            return False
    
    async def get_stats(self) -> Dict[str, Any]:
        try:
            total_docs = len(self._storage)
            query_count = self._query_stats.get("total_queries", 0)
            
            if total_docs > 0:
                confidences = [safe_float(doc.get("ocr_result", {}).get("confidence", 0)) for doc in self._storage.values()]
                processing_times = [safe_float(doc.get("processing_time", 0)) for doc in self._storage.values()]
                dates = [doc.get("created_at") for doc in self._storage.values() if isinstance(doc.get("created_at"), datetime)]
                
                return {
                    "total_documents": total_docs,
                    "avg_confidence": sum(confidences) / len(confidences) if confidences else 0,
                    "avg_processing_time": sum(processing_times) / len(processing_times) if processing_times else 0,
                    "date_range": {
                        "min": min(dates) if dates else None,
                        "max": max(dates) if dates else None
                    },
                    "query_count": query_count
                }
            
            return {
                "total_documents": total_docs,
                "avg_confidence": 0,
                "avg_processing_time": 0,
                "date_range": {"min": None, "max": None},
                "query_count": query_count
            }
        except Exception as e:
            logger.error(f"内存存储: 获取统计信息失败: {e}")
            return {
                "total_documents": len(self._storage),
                "avg_confidence": 0,
                "avg_processing_time": 0,
                "date_range": {"min": None, "max": None},
                "query_count": 0,
                "error": str(e)
            }
    
    def _record_query(self, start_time: float, query_type: str):
        elapsed = (time.time() - start_time) * 1000
        self._query_stats["total_queries"] += 1
        self._query_stats["total_time_ms"] += elapsed
        
        if elapsed > 1000:
            self._query_stats["slow_queries"] += 1
            logger.warning(f"慢查询警告: {query_type} 耗时 {elapsed:.2f}ms")


_memory_repo = InMemoryRepository()


def get_memory_repository() -> InMemoryRepository:
    return _memory_repo
