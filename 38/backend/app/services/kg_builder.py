import uuid
import asyncio
import logging
from datetime import datetime
from typing import Optional, Tuple
from .ai_model import (
    extract_entities_and_relations,
    extract_from_image_description,
    analyze_image_with_vision,
    extract_entities_and_relations_with_image,
)
from .parser import image_to_base64
from ..models.schemas import Entity, Relation, ExtractionResult

logger = logging.getLogger(__name__)

_task_store: dict[str, dict] = {}


class EntityResolver:
    def __init__(self, doc_id: str):
        self.doc_id = doc_id
        self.entity_counter = 0
        self.relation_counter = 0
        self.id_map: dict[str, str] = {}
        self.entities: list[Entity] = []
        self.relations: list[Relation] = []
        self.name_type_to_id: dict[Tuple[str, str], str] = {}

    def _normalize(self, s: str) -> str:
        return s.strip().lower() if s else ""

    def add_chunk_entities(
        self,
        chunk_entities: list[dict],
        chunk_prefix: str,
    ) -> list[Entity]:
        resolved_entities: list[Entity] = []
        for e in chunk_entities:
            old_id = e.get("id", "")
            name = e.get("name", "").strip()
            entity_type = e.get("type", "").strip()

            if not name or not entity_type:
                continue

            norm_name = self._normalize(name)
            norm_type = self._normalize(entity_type)
            key = (norm_name, norm_type)

            if key in self.name_type_to_id:
                new_id = self.name_type_to_id[key]
                existing = next((ent for ent in self.entities if ent.id == new_id), None)
                if existing:
                    if e.get("confidence", 0) > (existing.confidence or 0):
                        existing.confidence = e.get("confidence", 0)
                    if e.get("description") and not existing.description:
                        existing.description = e.get("description", "")
                self.id_map[old_id] = new_id
                existing_e = next((ent for ent in self.entities if ent.id == new_id), None)
                if existing_e:
                    resolved_entities.append(existing_e)
                continue

            new_id = f"E_{self.doc_id[:8]}_{self.entity_counter}"
            self.entity_counter += 1

            entity = Entity(
                id=new_id,
                name=name,
                type=entity_type,
                description=e.get("description", ""),
                source_doc=self.doc_id,
                confidence=e.get("confidence", 0.0),
            )
            self.entities.append(entity)
            resolved_entities.append(entity)
            self.id_map[old_id] = new_id
            self.name_type_to_id[key] = new_id

        return resolved_entities

    def add_image_entities(
        self,
        image_entities: list[dict],
    ) -> list[Entity]:
        resolved_entities: list[Entity] = []
        for e in image_entities:
            old_id = e.get("id", "")
            name = e.get("name", "").strip()
            entity_type = e.get("type", "").strip()

            if not name or not entity_type:
                continue

            norm_name = self._normalize(name)
            norm_type = self._normalize(entity_type)
            key = (norm_name, norm_type)

            if key in self.name_type_to_id:
                new_id = self.name_type_to_id[key]
                self.id_map[old_id] = new_id
                existing_e = next((ent for ent in self.entities if ent.id == new_id), None)
                if existing_e:
                    resolved_entities.append(existing_e)
                continue

            new_id = f"E_img_{self.doc_id[:8]}_{self.entity_counter}"
            self.entity_counter += 1

            entity = Entity(
                id=new_id,
                name=name,
                type=entity_type,
                description=e.get("description", ""),
                source_doc=self.doc_id,
                confidence=e.get("confidence", 0.0),
            )
            self.entities.append(entity)
            resolved_entities.append(entity)
            self.id_map[old_id] = new_id
            self.name_type_to_id[key] = new_id

        return resolved_entities

    def resolve_relation(
        self,
        relation: dict,
        chunk_prefix: str = "",
        is_image: bool = False,
    ) -> Optional[Relation]:
        old_source = relation.get("source", "")
        old_target = relation.get("target", "")

        new_source = self._resolve_id(old_source)
        new_target = self._resolve_id(old_target)

        if not new_source or not new_target:
            logger.warning(
                f"Could not resolve relation: {old_source} -> {old_target} "
                f"(resolved: {new_source} -> {new_target})"
            )
            return None

        if new_source == new_target:
            logger.warning(f"Skipping self-referential relation: {new_source}")
            return None

        valid_ids = {e.id for e in self.entities}
        if new_source not in valid_ids or new_target not in valid_ids:
            logger.warning(
                f"Relation references non-existent entities: "
                f"{new_source} (exists: {new_source in valid_ids}) -> "
                f"{new_target} (exists: {new_target in valid_ids})"
            )
            return None

        prefix = "R_img_" if is_image else "R_"
        new_id = f"{prefix}{self.doc_id[:8]}_{self.relation_counter}"
        self.relation_counter += 1

        return Relation(
            id=new_id,
            source=new_source,
            target=new_target,
            relation_type=relation.get("relation_type", "").strip(),
            description=relation.get("description", ""),
            confidence=relation.get("confidence", 0.0),
        )

    def _resolve_id(self, old_id: str) -> Optional[str]:
        if not old_id:
            return None

        if old_id in self.id_map:
            return self.id_map[old_id]

        for existing_id in self.id_map.values():
            if old_id.endswith(existing_id.split("_")[-1]):
                return existing_id

        for entity in self.entities:
            if entity.name.lower() == old_id.lower() or old_id.lower() in entity.name.lower():
                return entity.id

        for key, eid in self.name_type_to_id.items():
            if old_id.lower() in key[0]:
                return eid

        return None


def create_task(doc_id: str, filename: str) -> str:
    task_id = str(uuid.uuid4())
    _task_store[task_id] = {
        "task_id": task_id,
        "doc_id": doc_id,
        "filename": filename,
        "status": "pending",
        "progress": 0.0,
        "message": "任务已创建",
        "result": None,
    }
    return task_id


def get_task(task_id: str) -> dict | None:
    return _task_store.get(task_id)


def _update_task(task_id: str, **kwargs):
    if task_id in _task_store:
        _task_store[task_id].update(kwargs)


def _split_text(text: str, max_length: int = 3000, overlap: int = 200) -> list[str]:
    if len(text) <= max_length:
        return [text]

    chunks = []
    paragraphs = text.split("\n\n")
    current_chunk = ""

    for para in paragraphs:
        if not para.strip():
            continue

        if len(current_chunk) + len(para) + 2 <= max_length:
            current_chunk += "\n\n" + para if current_chunk else para
        else:
            if current_chunk:
                chunks.append(current_chunk.strip())

            if len(para) > max_length:
                for k in range(0, len(para), max_length - overlap):
                    chunk = para[k:k + max_length]
                    if len(chunk) > overlap:
                        chunks.append(chunk)
                current_chunk = para[-overlap:] if len(para) > overlap else ""
            else:
                if current_chunk and overlap > 0:
                    overlap_text = current_chunk[-overlap:]
                    current_chunk = overlap_text + "\n\n" + para
                else:
                    current_chunk = para

    if current_chunk.strip():
        if chunks and current_chunk.strip() not in chunks[-1]:
            chunks.append(current_chunk.strip())
        elif not chunks:
            chunks.append(current_chunk.strip())

    return [c for c in chunks if c.strip()]


async def build_knowledge_graph(
    doc_id: str,
    text_content: str,
    image_paths: list[str] = None,
    domain: str = "通用",
    task_id: str = None,
) -> ExtractionResult:
    resolver = EntityResolver(doc_id)

    if text_content and text_content.strip():
        _update_task(task_id, status="processing", progress=0.1, message="正在从文本中抽取实体和关系...")
        chunks = _split_text(text_content, max_length=3000, overlap=150)
        logger.info(f"Split text into {len(chunks)} chunks for processing")

        semaphore = asyncio.Semaphore(3)

        async def process_chunk(chunk_idx: int, chunk_text: str):
            async with semaphore:
                chunk_prefix = f"chunk{chunk_idx}"
                try:
                    result = await extract_entities_and_relations(chunk_text, domain)
                    chunk_entities = result.get("entities", [])
                    chunk_relations = result.get("relations", [])

                    resolver.add_chunk_entities(chunk_entities, chunk_prefix)

                    for r in chunk_relations:
                        resolved = resolver.resolve_relation(r, chunk_prefix)
                        if resolved:
                            resolver.relations.append(resolved)

                    return len(chunk_entities), len(chunk_relations)
                except Exception as e:
                    logger.error(f"Error processing chunk {chunk_idx}: {e}")
                    return 0, 0

        tasks = [process_chunk(i, chunk) for i, chunk in enumerate(chunks)]
        results = await asyncio.gather(*tasks)

        for i, (ent_count, rel_count) in enumerate(results):
            progress = 0.1 + 0.5 * (i + 1) / len(chunks)
            _update_task(
                task_id,
                progress=min(progress, 0.6),
                message=f"已处理 {i+1}/{len(chunks)} 个文本块 (本次抽取: {ent_count} 实体, {rel_count} 关系)",
            )

    if image_paths:
        _update_task(
            task_id,
            status="processing",
            progress=0.6,
            message=f"正在分析 {len(image_paths)} 张图片...",
        )

        semaphore = asyncio.Semaphore(2)

        async def process_image(img_idx: int, img_path: str):
            async with semaphore:
                try:
                    img_b64 = image_to_base64(img_path)

                    existing_for_image = [
                        {"id": e.id, "name": e.name, "type": e.type}
                        for e in resolver.entities
                    ]

                    description = await analyze_image_with_vision(img_b64, domain=domain)

                    if description:
                        img_result = await extract_from_image_description(
                            description,
                            existing_entities=existing_for_image,
                            domain=domain,
                        )

                        img_entities = img_result.get("entities", [])
                        img_relations = img_result.get("relations", [])

                        resolver.add_image_entities(img_entities)

                        for r in img_relations:
                            resolved = resolver.resolve_relation(r, is_image=True)
                            if resolved:
                                resolver.relations.append(resolved)

                        return len(img_entities), len(img_relations), True
                    return 0, 0, False
                except Exception as e:
                    logger.warning(f"Image extraction failed for {img_path}: {e}")
                    return 0, 0, False

        tasks = [process_image(i, path) for i, path in enumerate(image_paths)]
        img_results = await asyncio.gather(*tasks)

        for i, (ent_count, rel_count, success) in enumerate(img_results):
            progress = 0.6 + 0.3 * (i + 1) / len(image_paths)
            status = "成功" if success else "跳过"
            _update_task(
                task_id,
                progress=min(progress, 0.9),
                message=f"已处理 {i+1}/{len(image_paths)} 张图片 ({status}: {ent_count} 实体, {rel_count} 关系)",
            )

    _update_task(
        task_id,
        status="completed",
        progress=1.0,
        message=f"知识图谱构建完成: {len(resolver.entities)} 个实体, {len(resolver.relations)} 个关系",
    )

    logger.info(
        f"Built knowledge graph for {doc_id}: "
        f"{len(resolver.entities)} entities, {len(resolver.relations)} relations"
    )

    return ExtractionResult(
        doc_id=doc_id,
        entities=resolver.entities,
        relations=resolver.relations,
        extracted_at=datetime.now(),
    )


def merge_extraction_results(results: list[ExtractionResult]) -> ExtractionResult:
    if not results:
        return ExtractionResult(doc_id="merged", entities=[], relations=[])

    resolver = EntityResolver("merged")

    for result in results:
        entity_map: dict[str, str] = {}

        for entity in result.entities:
            e_dict = entity.model_dump() if hasattr(entity, "model_dump") else dict(entity)
            old_id = e_dict.get("id", "")

            norm_name = resolver._normalize(e_dict.get("name", ""))
            norm_type = resolver._normalize(e_dict.get("type", ""))
            key = (norm_name, norm_type)

            if key in resolver.name_type_to_id:
                new_id = resolver.name_type_to_id[key]
                entity_map[old_id] = new_id
                existing = next((e for e in resolver.entities if e.id == new_id), None)
                if existing:
                    if e_dict.get("confidence", 0) > (existing.confidence or 0):
                        existing.confidence = e_dict.get("confidence", 0)
                    if e_dict.get("description") and not existing.description:
                        existing.description = e_dict.get("description", "")
                continue

            new_id = f"E_merged_{resolver.entity_counter}"
            resolver.entity_counter += 1
            new_entity = Entity(
                id=new_id,
                name=e_dict.get("name", ""),
                type=e_dict.get("type", ""),
                description=e_dict.get("description", ""),
                source_doc=result.doc_id,
                confidence=e_dict.get("confidence", 0.0),
            )
            resolver.entities.append(new_entity)
            entity_map[old_id] = new_id
            resolver.name_type_to_id[key] = new_id
            resolver.id_map[old_id] = new_id

        for relation in result.relations:
            r_dict = relation.model_dump() if hasattr(relation, "model_dump") else dict(relation)
            old_source = r_dict.get("source", "")
            old_target = r_dict.get("target", "")

            new_source = entity_map.get(old_source) or resolver._resolve_id(old_source)
            new_target = entity_map.get(old_target) or resolver._resolve_id(old_target)

            if not new_source or not new_target or new_source == new_target:
                continue

            valid_ids = {e.id for e in resolver.entities}
            if new_source not in valid_ids or new_target not in valid_ids:
                continue

            exists = any(
                r.source == new_source
                and r.target == new_target
                and r.relation_type == r_dict.get("relation_type", "")
                for r in resolver.relations
            )
            if exists:
                continue

            new_id = f"R_merged_{resolver.relation_counter}"
            resolver.relation_counter += 1
            resolver.relations.append(Relation(
                id=new_id,
                source=new_source,
                target=new_target,
                relation_type=r_dict.get("relation_type", ""),
                description=r_dict.get("description", ""),
                confidence=r_dict.get("confidence", 0.0),
            ))

    return ExtractionResult(
        doc_id="merged",
        entities=resolver.entities,
        relations=resolver.relations,
        extracted_at=datetime.now(),
    )


async def batch_build_knowledge_graph(
    parsed_docs: list,
    domain: str = "通用",
) -> list[ExtractionResult]:
    tasks = []
    for doc in parsed_docs:
        task_id = create_task(doc.doc_id, doc.filename)
        task = build_knowledge_graph(
            doc_id=doc.doc_id,
            text_content=doc.text_content,
            image_paths=doc.images,
            domain=domain,
            task_id=task_id,
        )
        tasks.append(task)

    results = await asyncio.gather(*tasks, return_exceptions=True)
    final_results = []
    for r in results:
        if isinstance(r, Exception):
            logger.error(f"Batch KG build error: {r}")
        else:
            final_results.append(r)
    return final_results
