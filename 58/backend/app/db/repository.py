from typing import List, Optional, Dict, Any
from datetime import datetime, date
import logging
import time

from app.config import settings
from app.db.models import DocumentModel, serialize_for_db

logger = logging.getLogger(__name__)

try:
    from motor.motor_asyncio import AsyncIOMotorCollection
    from bson.objectid import ObjectId
    MONGO_AVAILABLE = True
except ImportError:
    AsyncIOMotorCollection = None
    ObjectId = None
    MONGO_AVAILABLE = False


class DocumentRepository:
    def __init__(self, db):
        if not MONGO_AVAILABLE:
            raise ImportError("MongoDB dependencies not available")
        
        self._collection = db["documents"]
        self._query_stats = {
            "total_queries": 0,
            "total_time_ms": 0,
            "slow_queries": 0
        }
        self._create_indexes()
    
    def _create_indexes(self):
        try:
            import asyncio
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(self._create_indexes_async())
            else:
                loop.run_until_complete(self._create_indexes_async())
        except Exception as e:
            logger.warning(f"创建索引失败: {e}")
    
    async def _create_indexes_async(self):
        try:
            existing_indexes = await self._collection.index_information()
            
            indexes_to_create = [
                ("created_at", -1),
                ("filename", 1),
                ("structured_data.date", 1),
                ("structured_data.sender", 1),
                ("ocr_result.confidence", -1),
                ([("ocr_result.raw_text", "text")], {"default_language": "chinese"})
            ]
            
            for index_key, index_options in indexes_to_create:
                if isinstance(index_key, list):
                    index_name = "text_search"
                else:
                    index_name = f"{index_key}_{index_options}"
                
                if index_name not in existing_indexes:
                    if isinstance(index_key, list):
                        await self._collection.create_index(
                            index_key,
                            default_language=index_options.get("default_language", "chinese"),
                            name=index_name
                        )
                    else:
                        await self._collection.create_index(
                            [(index_key, index_options)],
                            name=index_name
                        )
                    logger.info(f"创建索引成功: {index_name}")
                else:
                    logger.info(f"索引已存在: {index_name}")
            
            logger.info("数据库索引初始化完成")
            
        except Exception as e:
            logger.error(f"创建索引异常: {e}", exc_info=True)
    
    async def create(self, doc_data: Dict[str, Any]) -> str:
        try:
            doc_data = serialize_for_db(doc_data)
            
            if not doc_data:
                raise ValueError("序列化后的数据为空")
            
            result = await self._collection.insert_one(doc_data)
            doc_id = str(result.inserted_id)
            logger.info(f"文档保存成功，ID: {doc_id}")
            return doc_id
        except Exception as e:
            logger.error(f"保存文档到数据库失败: {e}", exc_info=True)
            raise
    
    async def get_by_id(self, doc_id: str) -> Optional[Dict[str, Any]]:
        start_time = time.time()
        try:
            object_id = ObjectId(doc_id) if ObjectId else doc_id
            
            projection = {
                "filename": 1,
                "ocr_result": 1,
                "structured_data": 1,
                "created_at": 1,
                "processing_time": 1,
                "updated_at": 1,
                "corrections": 1
            }
            
            doc = await self._collection.find_one({"_id": object_id}, projection=projection)
            
            if doc:
                result = DocumentModel.to_response(doc)
                return result
            return None
        except Exception as e:
            logger.error(f"获取文档失败: {e}", exc_info=True)
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
            query = {}
            
            if keyword:
                query["$or"] = [
                    {"$text": {"$search": keyword}},
                    {"filename": {"$regex": keyword, "$options": "i"}},
                    {"structured_data.title": {"$regex": keyword, "$options": "i"}},
                    {"structured_data.sender": {"$regex": keyword, "$options": "i"}}
                ]
            
            if start_date or end_date:
                date_query = {}
                if start_date:
                    try:
                        start_dt = datetime.strptime(start_date, "%Y-%m-%d")
                        date_query["$gte"] = start_dt
                    except ValueError:
                        logger.warning(f"无效的开始日期: {start_date}")
                if end_date:
                    try:
                        end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
                        date_query["$lte"] = end_dt
                    except ValueError:
                        logger.warning(f"无效的结束日期: {end_date}")
                if date_query:
                    query["created_at"] = date_query
            
            if min_confidence is not None and 0 <= min_confidence <= 1:
                query["ocr_result.confidence"] = {"$gte": min_confidence}
            
            if sender:
                query["structured_data.sender"] = {"$regex": sender, "$options": "i"}
            
            valid_sort_fields = ["created_at", "ocr_result.confidence", "filename", "processing_time"]
            if sort_by not in valid_sort_fields:
                sort_by = "created_at"
            
            if sort_order not in [1, -1]:
                sort_order = -1
            
            total = await self._collection.count_documents(query)
            
            skip = (page - 1) * page_size
            
            projection = {
                "filename": 1,
                "ocr_result.raw_text": 1,
                "ocr_result.confidence": 1,
                "ocr_result.lines": 1,
                "structured_data": 1,
                "created_at": 1,
                "processing_time": 1
            }
            
            cursor = (
                self._collection.find(query, projection=projection)
                .sort(sort_by, sort_order)
                .skip(skip)
                .limit(page_size)
                .hint(f"{sort_by}_{sort_order}" if sort_by != "created_at" else "created_at_-1")
            )
            
            items = []
            async for doc in cursor:
                items.append(DocumentModel.to_response(doc))
            
            return {
                "total": total,
                "page": page,
                "page_size": page_size,
                "items": items,
                "sort_by": sort_by,
                "sort_order": sort_order
            }
        except Exception as e:
            logger.error(f"查询文档列表失败: {e}", exc_info=True)
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
            object_ids = []
            for doc_id in doc_ids:
                try:
                    if ObjectId:
                        object_ids.append(ObjectId(doc_id))
                    else:
                        object_ids.append(doc_id)
                except Exception:
                    continue
            
            if not object_ids:
                return []
            
            projection = {
                "filename": 1,
                "ocr_result": 1,
                "structured_data": 1,
                "created_at": 1,
                "processing_time": 1
            }
            
            cursor = self._collection.find({"_id": {"$in": object_ids}}, projection=projection)
            
            items = []
            async for doc in cursor:
                items.append(DocumentModel.to_response(doc))
            
            return items
        except Exception as e:
            logger.error(f"批量获取文档失败: {e}", exc_info=True)
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
            object_id = ObjectId(doc_id) if ObjectId else doc_id
            
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
            
            result = await self._collection.update_one(
                {"_id": object_id},
                {"$set": update_data}
            )
            
            if result.modified_count > 0:
                logger.info(f"文档更新成功，ID: {doc_id}")
                return True
            return False
        except Exception as e:
            logger.error(f"更新文档失败: {e}", exc_info=True)
            return False
    
    async def delete(self, doc_id: str) -> bool:
        try:
            object_id = ObjectId(doc_id) if ObjectId else doc_id
            result = await self._collection.delete_one({"_id": object_id})
            if result.deleted_count > 0:
                logger.info(f"文档删除成功，ID: {doc_id}")
                return True
            return False
        except Exception as e:
            logger.error(f"删除文档失败: {e}")
            return False
    
    async def update(self, doc_id: str, update_data: Dict[str, Any]) -> bool:
        try:
            object_id = ObjectId(doc_id) if ObjectId else doc_id
            update_data = serialize_for_db(update_data) or {}
            update_data["updated_at"] = datetime.utcnow()
            result = await self._collection.update_one(
                {"_id": object_id},
                {"$set": update_data}
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"更新文档失败: {e}")
            return False
    
    async def get_stats(self) -> Dict[str, Any]:
        try:
            total_docs = await self._collection.count_documents({})
            
            pipeline = [
                {"$group": {
                    "_id": None,
                    "avg_confidence": {"$avg": "$ocr_result.confidence"},
                    "avg_processing_time": {"$avg": "$processing_time"},
                    "min_date": {"$min": "$created_at"},
                    "max_date": {"$max": "$created_at"}
                }}
            ]
            
            stats_result = await self._collection.aggregate(pipeline).to_list(length=1)
            
            query_count = self._query_stats.get("total_queries", 0)
            
            if stats_result:
                stat = stats_result[0]
                return {
                    "total_documents": total_docs,
                    "avg_confidence": stat.get("avg_confidence", 0) or 0,
                    "avg_processing_time": stat.get("avg_processing_time", 0) or 0,
                    "date_range": {
                        "min": stat.get("min_date"),
                        "max": stat.get("max_date")
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
            logger.error(f"获取统计信息失败: {e}")
            return {
                "total_documents": 0,
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
