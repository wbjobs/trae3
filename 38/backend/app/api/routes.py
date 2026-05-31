import os
import uuid
import shutil
import logging
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ..models.schemas import (
    EntityUpdate, RelationUpdate, UploadResponse, BatchUploadResponse, GraphData,
)
from ..config import UPLOAD_DIR, MAX_BATCH_SIZE, MAX_FILE_SIZE
from ..services.parser import parse_document, batch_parse
from ..services.kg_builder import (
    build_knowledge_graph, batch_build_knowledge_graph, merge_extraction_results,
    create_task, get_task,
)
from ..services.vector_store import (
    add_document_embedding, add_entity_embeddings, query_similar, delete_document_embeddings,
)
from ..services.graph_store import (
    save_extraction_result, get_graph_data, update_entity, update_relation,
    delete_entity, delete_relation, verify_integrity,
    batch_update_entities, batch_update_relations, suggest_entity_associations,
    get_neighbors, get_entity_types, get_relation_types, find_path,
    delete_document_entities, get_query_cache_stats, invalidate_query_cache,
)
from ..services.ai_model import suggest_relations, get_cache_stats as get_ai_cache_stats, clear_cache

logger = logging.getLogger(__name__)
router = APIRouter()

_parsed_store: dict[str, dict] = {}
_extraction_store: dict[str, dict] = {}


class BatchEntityUpdateRequest(BaseModel):
    updates: list[dict]


class BatchRelationUpdateRequest(BaseModel):
    updates: list[dict]


class AddRelationRequest(BaseModel):
    source: str
    target: str
    relation_type: str
    description: str = ""
    confidence: float = 1.0


@router.post("/upload", response_model=UploadResponse)
async def upload_document(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名不能为空")
    ext = os.path.splitext(file.filename)[1].lower()
    supported = [".pdf", ".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".docx", ".txt", ".md"]
    if ext not in supported:
        raise HTTPException(status_code=400, detail=f"不支持的文件格式: {ext}")

    doc_id = str(uuid.uuid4())
    save_path = os.path.join(UPLOAD_DIR, f"{doc_id}_{file.filename}")
    with open(save_path, "wb") as f:
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            os.remove(save_path)
            raise HTTPException(status_code=400, detail="文件大小超过限制(50MB)")
        f.write(content)

    try:
        parsed = await parse_document(save_path, doc_id)
        _parsed_store[doc_id] = parsed.model_dump()

        add_document_embedding(doc_id, parsed.text_content[:2000], {"filename": parsed.filename, "page_count": parsed.page_count})

        return UploadResponse(
            doc_id=doc_id,
            filename=file.filename,
            status="success",
            message=f"文件上传并解析成功，共{parsed.page_count}页，提取{len(parsed.images)}张图片",
        )
    except Exception as e:
        logger.error(f"Upload & parse failed: {e}")
        return UploadResponse(doc_id=doc_id, filename=file.filename, status="error", message=str(e))


@router.post("/upload/batch", response_model=BatchUploadResponse)
async def upload_batch(files: list[UploadFile] = File(...)):
    if len(files) > MAX_BATCH_SIZE:
        raise HTTPException(status_code=400, detail=f"批量上传最多支持{MAX_BATCH_SIZE}个文件")

    results = []
    success_count = 0
    fail_count = 0

    filepaths = []
    doc_ids = []
    for file in files:
        doc_id = str(uuid.uuid4())
        save_path = os.path.join(UPLOAD_DIR, f"{doc_id}_{file.filename}")
        try:
            content = await file.read()
            with open(save_path, "wb") as f:
                f.write(content)
            filepaths.append(save_path)
            doc_ids.append((doc_id, file.filename))
        except Exception as e:
            results.append(UploadResponse(doc_id=doc_id, filename=file.filename, status="error", message=str(e)))
            fail_count += 1

    if filepaths:
        parsed_results = await batch_parse(filepaths)
        for parsed, (doc_id, filename) in zip(parsed_results, doc_ids):
            _parsed_store[doc_id] = parsed.model_dump()
            add_document_embedding(doc_id, parsed.text_content[:2000], {"filename": parsed.filename})
            results.append(UploadResponse(doc_id=doc_id, filename=filename, status="success", message="解析成功"))
            success_count += 1

    return BatchUploadResponse(results=results, total=len(files), success_count=success_count, fail_count=fail_count)


@router.post("/extract/{doc_id}")
async def extract_knowledge(doc_id: str, domain: str = "通用", background_tasks: BackgroundTasks = None):
    if doc_id not in _parsed_store:
        raise HTTPException(status_code=404, detail="文档不存在，请先上传")

    parsed = _parsed_store[doc_id]
    task_id = create_task(doc_id, parsed.get("filename", ""))

    async def _do_extract():
        result = await build_knowledge_graph(
            doc_id=doc_id,
            text_content=parsed.get("text_content", ""),
            image_paths=parsed.get("images", []),
            domain=domain,
            task_id=task_id,
        )
        _extraction_store[doc_id] = result.model_dump()
        add_entity_embeddings(doc_id, [e.model_dump() if hasattr(e, "model_dump") else e for e in result.entities])
        save_extraction_result(doc_id, [e.model_dump() if hasattr(e, "model_dump") else e for e in result.entities], [r.model_dump() if hasattr(r, "model_dump") else r for r in result.relations])

    if background_tasks:
        background_tasks.add_task(_do_extract)
    else:
        await _do_extract()

    return {"task_id": task_id, "doc_id": doc_id, "status": "processing", "message": "抽取任务已提交"}


@router.post("/extract/batch")
async def extract_batch(domain: str = "通用", background_tasks: BackgroundTasks = None):
    if not _parsed_store:
        raise HTTPException(status_code=400, detail="没有已解析的文档")

    async def _do_batch():
        from ..models.schemas import ParsedContent
        docs = []
        for doc_id, data in _parsed_store.items():
            docs.append(ParsedContent(**data))
        results = await batch_build_knowledge_graph(docs, domain)
        for result in results:
            _extraction_store[result.doc_id] = result.model_dump()
            add_entity_embeddings(result.doc_id, [e.model_dump() if hasattr(e, "model_dump") else e for e in result.entities])
            save_extraction_result(result.doc_id, [e.model_dump() if hasattr(e, "model_dump") else e for e in result.entities], [r.model_dump() if hasattr(r, "model_dump") else r for r in result.relations])

    if background_tasks:
        background_tasks.add_task(_do_batch)
    else:
        await _do_batch()

    return {"status": "processing", "message": f"批量抽取任务已提交，共{len(_parsed_store)}个文档"}


@router.get("/task/{task_id}")
async def get_task_status(task_id: str):
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    return task


@router.get("/graph")
async def get_full_graph():
    data = get_graph_data()
    return GraphData(nodes=data["nodes"], edges=data["edges"])


@router.get("/graph/{doc_id}")
async def get_doc_graph(doc_id: str):
    data = get_graph_data(doc_id)
    return GraphData(nodes=data["nodes"], edges=data["edges"])


@router.get("/parsed/{doc_id}")
async def get_parsed_content(doc_id: str):
    if doc_id not in _parsed_store:
        raise HTTPException(status_code=404, detail="文档不存在")
    return _parsed_store[doc_id]


@router.get("/extractions")
async def list_extractions():
    return {"extractions": list(_extraction_store.values())}


@router.get("/extraction/{doc_id}")
async def get_extraction(doc_id: str):
    if doc_id not in _extraction_store:
        raise HTTPException(status_code=404, detail="抽取结果不存在")
    return _extraction_store[doc_id]


@router.put("/entity/{entity_id}")
async def edit_entity(entity_id: str, update: EntityUpdate):
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="没有更新数据")
    update_entity(entity_id, **update_data)
    for doc_id, extraction in _extraction_store.items():
        for entity in extraction.get("entities", []):
            if entity.get("id") == entity_id:
                entity.update(update_data)
                break
    return {"status": "success", "message": "实体更新成功"}


@router.put("/relation/{relation_id}")
async def edit_relation(relation_id: str, update: RelationUpdate):
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="没有更新数据")
    update_relation(relation_id, **update_data)
    for doc_id, extraction in _extraction_store.items():
        for relation in extraction.get("relations", []):
            if relation.get("id") == relation_id:
                relation.update(update_data)
                break
    return {"status": "success", "message": "关系更新成功"}


@router.delete("/entity/{entity_id}")
async def remove_entity(entity_id: str):
    delete_entity(entity_id)
    for doc_id, extraction in _extraction_store.items():
        extraction["entities"] = [e for e in extraction.get("entities", []) if e.get("id") != entity_id]
        extraction["relations"] = [r for r in extraction.get("relations", []) if r.get("source") != entity_id and r.get("target") != entity_id]
    return {"status": "success", "message": "实体已删除"}


@router.delete("/relation/{relation_id}")
async def remove_relation(relation_id: str):
    delete_relation(relation_id)
    for doc_id, extraction in _extraction_store.items():
        extraction["relations"] = [r for r in extraction.get("relations", []) if r.get("id") != relation_id]
    return {"status": "success", "message": "关系已删除"}


@router.post("/search")
async def semantic_search(query: str, n_results: int = 10):
    results = query_similar(query, n_results)
    return results


@router.delete("/document/{doc_id}")
async def delete_document(doc_id: str):
    for root, dirs, files in os.walk(UPLOAD_DIR):
        for f in files:
            if f.startswith(doc_id):
                os.remove(os.path.join(root, f))
    delete_document_embeddings(doc_id)
    delete_document_entities(doc_id)
    _parsed_store.pop(doc_id, None)
    _extraction_store.pop(doc_id, None)
    return {"status": "success", "message": "文档已删除"}


@router.get("/integrity")
async def check_integrity(doc_id: str = None):
    stats = verify_integrity(doc_id)
    return stats


@router.post("/entities/batch")
async def batch_edit_entities(request: BatchEntityUpdateRequest):
    success, failed = batch_update_entities(request.updates)
    for update in request.updates:
        entity_id = update.get("id")
        if not entity_id:
            continue
        update_data = {k: v for k, v in update.items() if k != "id" and v is not None}
        for doc_id, extraction in _extraction_store.items():
            for entity in extraction.get("entities", []):
                if entity.get("id") == entity_id:
                    entity.update(update_data)
                    break
    return {"status": "success", "success_count": success, "fail_count": failed, "message": f"批量更新完成: {success}成功, {failed}失败"}


@router.post("/relations/batch")
async def batch_edit_relations(request: BatchRelationUpdateRequest):
    success, failed = batch_update_relations(request.updates)
    for update in request.updates:
        relation_id = update.get("id")
        if not relation_id:
            continue
        update_data = {k: v for k, v in update.items() if k != "id" and v is not None}
        for doc_id, extraction in _extraction_store.items():
            for relation in extraction.get("relations", []):
                if relation.get("id") == relation_id:
                    relation.update(update_data)
                    break
    return {"status": "success", "success_count": success, "fail_count": failed, "message": f"批量更新完成: {success}成功, {failed}失败"}


@router.get("/entity/{entity_id}/suggestions")
async def get_entity_suggestions(entity_id: str, limit: int = 10, doc_id: str = None):
    suggestions = suggest_entity_associations(entity_id, limit, doc_id)
    return {
        "entity_id": entity_id,
        "suggestions": suggestions,
        "count": len(suggestions),
    }


@router.post("/entity/{entity_id}/suggest-relations")
async def suggest_ai_relations(entity_id: str, domain: str = "通用", doc_id: str = None):
    graph_data = get_graph_data(doc_id)
    source_node = next((n for n in graph_data["nodes"] if n["id"] == entity_id), None)
    if not source_node:
        raise HTTPException(status_code=404, detail="实体不存在")

    suggestions = await suggest_relations(
        source_node.get("name", ""),
        source_node.get("type", ""),
        graph_data["nodes"],
        domain,
    )
    return {
        "entity_id": entity_id,
        "entity_name": source_node.get("name"),
        "entity_type": source_node.get("type"),
        "suggestions": suggestions,
    }


@router.post("/relation/add")
async def add_new_relation(request: AddRelationRequest):
    graph_data = get_graph_data()
    source_exists = any(n["id"] == request.source for n in graph_data["nodes"])
    target_exists = any(n["id"] == request.target for n in graph_data["nodes"])

    if not source_exists or not target_exists:
        raise HTTPException(status_code=400, detail="源实体或目标实体不存在")

    if request.source == request.target:
        raise HTTPException(status_code=400, detail="不能创建自引用关系")

    relation_id = f"R_user_{uuid.uuid4().hex[:8]}"
    success = save_extraction_result(
        "manual",
        [],
        [{
            "id": relation_id,
            "source": request.source,
            "target": request.target,
            "relation_type": request.relation_type,
            "description": request.description,
            "confidence": request.confidence,
        }],
    )

    return {
        "status": "success" if success else "failed",
        "relation_id": relation_id,
        "message": "关系创建成功" if success else "关系创建失败",
    }


@router.get("/entity/{entity_id}/neighbors")
async def get_entity_neighbors(entity_id: str, max_depth: int = 1, doc_id: str = None):
    neighbors = get_neighbors(entity_id, max_depth, doc_id)
    return {
        "entity_id": entity_id,
        "max_depth": max_depth,
        "nodes": neighbors.get("nodes", []),
        "edges": neighbors.get("edges", []),
        "node_count": len(neighbors.get("nodes", [])),
        "edge_count": len(neighbors.get("edges", [])),
    }


@router.get("/stats/entity-types")
async def get_all_entity_types(doc_id: str = None):
    types = get_entity_types(doc_id)
    return {"types": types, "total": len(types)}


@router.get("/stats/relation-types")
async def get_all_relation_types(doc_id: str = None):
    types = get_relation_types(doc_id)
    return {"types": types, "total": len(types)}


@router.get("/path/find")
async def find_entity_path(start_id: str, end_id: str, max_depth: int = 3):
    path = find_path(start_id, end_id, max_depth)
    return {
        "start_id": start_id,
        "end_id": end_id,
        "max_depth": max_depth,
        **path,
    }


@router.get("/cache/stats")
async def get_all_cache_stats():
    return {
        "ai_model": get_ai_cache_stats(),
        "graph_queries": get_query_cache_stats(),
    }


@router.post("/cache/clear")
async def clear_all_cache():
    clear_cache()
    invalidate_query_cache()
    return {"status": "success", "message": "所有缓存已清除"}
