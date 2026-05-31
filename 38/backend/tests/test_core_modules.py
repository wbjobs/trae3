import sys
import os
import tempfile
import pytest
from unittest.mock import patch, MagicMock, AsyncMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.parser import (
    parse_pdf,
    parse_image,
    parse_docx,
    parse_txt,
    _split_text,
    _extract_caption,
    _get_nearby_text,
    ImageInfo,
    _save_extracted_image,
    image_to_base64,
)
from app.services.kg_builder import EntityResolver, _split_text as kg_split_text
from app.services.graph_store import (
    save_entity,
    save_relation,
    save_extraction_result,
    verify_integrity,
    _in_memory_graph,
)


class TestParser:
    def test_image_info_class(self):
        info = ImageInfo(
            path="/test/path.jpg",
            page_num=1,
            index=0,
            caption="测试图注",
            nearby_text="测试上下文",
            bbox=(0, 0, 100, 100),
        )
        d = info.to_dict()
        assert d["path"] == "/test/path.jpg"
        assert d["page_num"] == 1
        assert d["caption"] == "测试图注"
        assert d["nearby_text"] == "测试上下文"

    def test_extract_caption(self):
        text = "图 1 系统架构图\n这是一个架构图\n\n正文内容"
        caption = _extract_caption(text, (0, 0, 100, 100), 800)
        assert "系统架构图" in caption

        text2 = "Table 1 对比表格\n数据对比\n\n正文"
        caption2 = _extract_caption(text2, (0, 0, 100, 100), 800)
        assert "对比表格" in caption2

    def test_get_nearby_text(self):
        text = "A" * 1000 + "重要内容" + "B" * 1000
        nearby = _get_nearby_text(text, (0, 0, 100, 100), 800)
        assert len(nearby) > 0
        assert "重要内容" in nearby

    def test_parse_txt(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, encoding="utf-8") as f:
            f.write("这是测试文本\n包含多行内容\n知识图谱构建测试")
            tmp_path = f.name

        try:
            result = parse_txt(tmp_path, "test_doc_001")
            assert result.doc_id == "test_doc_001"
            assert "知识图谱构建" in result.text_content
            assert result.page_count == 1
            assert len(result.images) == 0
        finally:
            os.unlink(tmp_path)

    def test_parse_txt_gbk(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, encoding="gbk") as f:
            f.write("GBK编码测试文本")
            tmp_path = f.name

        try:
            result = parse_txt(tmp_path, "test_doc_002")
            assert "GBK编码" in result.text_content
        finally:
            os.unlink(tmp_path)


class TestEntityResolver:
    def setup_method(self):
        self.resolver = EntityResolver("testdoc123")

    def test_add_chunk_entities(self):
        chunk_entities = [
            {"id": "E1", "name": "人工智能", "type": "技术", "description": "AI技术", "confidence": 0.95},
            {"id": "E2", "name": "机器学习", "type": "技术", "description": "ML技术", "confidence": 0.9},
        ]
        resolved = self.resolver.add_chunk_entities(chunk_entities, "chunk0")

        assert len(resolved) == 2
        assert len(self.resolver.entities) == 2
        assert self.resolver.id_map["E1"] is not None
        assert self.resolver.id_map["E2"] is not None

    def test_entity_deduplication(self):
        chunk1 = [{"id": "E1", "name": "人工智能", "type": "技术", "confidence": 0.8}]
        chunk2 = [{"id": "E1", "name": "人工智能", "type": "技术", "confidence": 0.95}]

        self.resolver.add_chunk_entities(chunk1, "chunk0")
        self.resolver.add_chunk_entities(chunk2, "chunk1")

        assert len(self.resolver.entities) == 1
        assert self.resolver.entities[0].confidence == 0.95

    def test_resolve_relation(self):
        self.resolver.add_chunk_entities([
            {"id": "E1", "name": "公司A", "type": "组织", "confidence": 0.9},
            {"id": "E2", "name": "产品B", "type": "产品", "confidence": 0.9},
        ], "chunk0")

        relation = {
            "id": "R1",
            "source": "E1",
            "target": "E2",
            "relation_type": "生产",
            "description": "生产关系",
            "confidence": 0.85,
        }
        resolved = self.resolver.resolve_relation(relation)

        assert resolved is not None
        assert resolved.source in [e.id for e in self.resolver.entities]
        assert resolved.target in [e.id for e in self.resolver.entities]
        assert resolved.source != resolved.target

    def test_resolve_relation_invalid_ids(self):
        self.resolver.add_chunk_entities([
            {"id": "E1", "name": "公司A", "type": "组织", "confidence": 0.9},
        ], "chunk0")

        relation = {
            "id": "R1",
            "source": "E1",
            "target": "E999",
            "relation_type": "生产",
        }
        resolved = self.resolver.resolve_relation(relation)
        assert resolved is None

    def test_resolve_self_reference(self):
        self.resolver.add_chunk_entities([
            {"id": "E1", "name": "公司A", "type": "组织", "confidence": 0.9},
        ], "chunk0")

        relation = {
            "id": "R1",
            "source": "E1",
            "target": "E1",
            "relation_type": "关联",
        }
        resolved = self.resolver.resolve_relation(relation)
        assert resolved is None

    def test_resolve_relation_by_name(self):
        self.resolver.add_chunk_entities([
            {"id": "E1", "name": "百度公司", "type": "组织", "confidence": 0.9},
        ], "chunk0")

        relation = {
            "id": "R1",
            "source": "百度公司",
            "target": "E1",
            "relation_type": "生产",
        }
        resolved = self.resolver.resolve_relation(relation)
        assert resolved is not None

    def test_add_image_entities(self):
        self.resolver.add_chunk_entities([
            {"id": "E1", "name": "系统", "type": "概念", "confidence": 0.9},
        ], "chunk0")

        img_entities = [
            {"id": "E_img_1", "name": "服务器", "type": "设备", "confidence": 0.85},
        ]
        resolved = self.resolver.add_image_entities(img_entities)
        assert len(resolved) == 1
        assert len(self.resolver.entities) == 2

    def test_split_text(self):
        long_text = "\n\n".join(["段落" + str(i) + "内容" * 100 for i in range(20)])
        chunks = kg_split_text(long_text, max_length=1000, overlap=100)
        assert len(chunks) > 1
        assert all(len(c) <= 1000 + 100 for c in chunks)
        assert all(len(c.strip()) > 0 for c in chunks)

    def test_split_text_short(self):
        short_text = "这是一段短文本"
        chunks = kg_split_text(short_text, max_length=1000)
        assert len(chunks) == 1
        assert chunks[0] == short_text


class TestGraphStore:
    def setup_method(self):
        _in_memory_graph["nodes"].clear()
        _in_memory_graph["edges"].clear()

    def test_save_entity(self):
        success = save_entity(
            doc_id="doc1",
            entity_id="ent1",
            name="测试实体",
            entity_type="技术",
            description="测试描述",
            confidence=0.9,
        )
        assert success is True
        assert "ent1" in _in_memory_graph["nodes"]
        assert _in_memory_graph["nodes"]["ent1"]["name"] == "测试实体"

    def test_save_entity_invalid(self):
        success = save_entity(
            doc_id="doc1",
            entity_id="",
            name="",
            entity_type="",
        )
        assert success is False

    def test_save_relation(self):
        save_entity("doc1", "ent1", "实体1", "组织", "", 0.9)
        save_entity("doc1", "ent2", "实体2", "技术", "", 0.9)

        success = save_relation(
            relation_id="rel1",
            source_id="ent1",
            target_id="ent2",
            relation_type="使用",
            description="使用关系",
            confidence=0.8,
        )
        assert success is True
        assert "rel1" in _in_memory_graph["edges"]

    def test_save_relation_missing_nodes(self):
        success = save_relation(
            relation_id="rel2",
            source_id="nonexistent1",
            target_id="nonexistent2",
            relation_type="关联",
        )
        assert success is False
        assert "rel2" not in _in_memory_graph["edges"]

    def test_save_extraction_result(self):
        entities = [
            {"id": "e1", "name": "实体1", "type": "组织", "confidence": 0.9},
            {"id": "e2", "name": "实体2", "type": "技术", "confidence": 0.9},
        ]
        relations = [
            {"id": "r1", "source": "e1", "target": "e2", "relation_type": "研发", "confidence": 0.85},
        ]

        all_saved, saved_ents, saved_rels = save_extraction_result("doc_test", entities, relations)
        assert all_saved is True
        assert saved_ents == 2
        assert saved_rels == 1

    def test_save_extraction_result_partial(self):
        entities = [
            {"id": "e1", "name": "实体1", "type": "组织", "confidence": 0.9},
            {"id": "", "name": "", "type": "", "confidence": 0.0},
        ]
        relations = [
            {"id": "r1", "source": "e1", "target": "invalid", "relation_type": "研发"},
        ]

        all_saved, saved_ents, saved_rels = save_extraction_result("doc_test2", entities, relations)
        assert all_saved is False
        assert saved_ents == 1
        assert saved_rels == 0

    def test_verify_integrity(self):
        save_entity("doc1", "ent1", "实体1", "组织", "", 0.9)
        save_entity("doc1", "ent2", "实体2", "技术", "", 0.9)
        save_relation("rel1", "ent1", "ent2", "使用", "", 0.8)

        stats = verify_integrity()
        assert stats["total_nodes"] == 2
        assert stats["total_edges"] == 1
        assert stats["total_issues"] == 0

    def test_verify_integrity_with_issues(self):
        save_entity("doc1", "ent1", "实体1", "组织", "", 0.9)
        save_entity("doc1", "ent2", "", "技术", "", 0.9)
        save_entity("doc1", "ent3", "实体3", "", "", 0.9)

        _in_memory_graph["edges"]["bad_rel"] = {
            "id": "bad_rel",
            "source": "ent1",
            "target": "nonexistent",
            "relation_type": "关联",
        }

        stats = verify_integrity()
        assert stats["total_issues"] == 3
        issue_types = [i["type"] for i in stats["issues"]]
        assert "orphan_target" in issue_types
        assert "missing_name" in issue_types
        assert "missing_type" in issue_types


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
