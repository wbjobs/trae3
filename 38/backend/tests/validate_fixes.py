import sys
import os
import tempfile
import json
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sys
from types import ModuleType

class MockException(Exception):
    pass


class MockModule(ModuleType):
    def __init__(self, name):
        super().__init__(name)
        self.__name__ = name

    def __getattr__(self, name):
        if name.startswith("__") and name.endswith("__"):
            raise AttributeError(name)
        full_name = f"{self.__name__}.{name}"
        mock = MockModule(full_name)
        sys.modules[full_name] = mock
        return mock

    def __call__(self, *args, **kwargs):
        return MockModule(f"{self.__name__}.()")

    def __iter__(self):
        return iter([])

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def __getitem__(self, key):
        return MockModule(f"{self.__name__}[{key}]")


_mock_exceptions = {
    "Neo4jError": MockException,
    "ServiceUnavailable": MockException,
    "TransientError": MockException,
    "SessionExpired": MockException,
}

class MockAsyncOpenAI:
    def __init__(self, **kwargs):
        self.chat = MockModule("openai.chat")
        self.embeddings = MockModule("openai.embeddings")
    async def close(self):
        pass

for mod_name in ["fitz", "pdfplumber", "docx", "chromadb", "sentence_transformers"]:
    if mod_name not in sys.modules:
        sys.modules[mod_name] = MockModule(mod_name)

neo4j_mod = MockModule("neo4j")
neo4j_exc_mod = MockModule("neo4j.exceptions")
for name, cls in _mock_exceptions.items():
    setattr(neo4j_exc_mod, name, cls)
sys.modules["neo4j"] = neo4j_mod
sys.modules["neo4j.exceptions"] = neo4j_exc_mod

class MockGraphDatabase:
    @staticmethod
    def driver(*args, **kwargs):
        mock_driver = MockModule("neo4j.driver")
        def verify_connectivity():
            raise Exception("Mock Neo4j connection failed - forcing in-memory mode")
        mock_driver.verify_connectivity = verify_connectivity
        def close():
            pass
        mock_driver.close = close
        def session():
            return MockModule("neo4j.session")
        mock_driver.session = session
        return mock_driver

neo4j_mod.GraphDatabase = MockGraphDatabase
neo4j_mod.Session = MockModule("neo4j.Session")
neo4j_mod.ManagedTransaction = MockModule("neo4j.ManagedTransaction")

pil_mod = MockModule("PIL")
pil_image_mod = MockModule("PIL.Image")
pil_mod.Image = pil_image_mod
sys.modules["PIL"] = pil_mod
sys.modules["PIL.Image"] = pil_image_mod

openai_mod = MockModule("openai")
openai_mod.AsyncOpenAI = MockAsyncOpenAI
sys.modules["openai"] = openai_mod


def run_tests():
    from app.services.kg_builder import EntityResolver, _split_text as kg_split_text
    from app.services.graph_store import (
        save_entity,
        save_relation,
        save_extraction_result,
        verify_integrity,
        _in_memory_graph,
    )
    from app.services.parser import _extract_caption, _get_nearby_text, ImageInfo

    passed = 0
    failed = 0

    def test(name, func):
        nonlocal passed, failed
        try:
            func()
            print(f"✅ PASS: {name}")
            passed += 1
        except AssertionError as e:
            print(f"❌ FAIL: {name} - {e}")
            failed += 1
        except Exception as e:
            print(f"❌ ERROR: {name} - {e}")
            import traceback
            traceback.print_exc()
            failed += 1

    def test_image_info_class():
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

    test("ImageInfo class", test_image_info_class)

    def test_extract_caption():
        text = "图 1 系统架构图\n这是一个架构图\n\n正文内容"
        caption = _extract_caption(text, (0, 0, 100, 100), 800)
        assert "系统架构图" in caption

        text2 = "Table 1 对比表格\n数据对比\n\n正文"
        caption2 = _extract_caption(text2, (0, 0, 100, 100), 800)
        assert "对比表格" in caption2

    test("Caption extraction", test_extract_caption)

    def test_get_nearby_text():
        text = "A" * 1000 + "重要内容" + "B" * 1000
        nearby = _get_nearby_text(text, (0, 380, 100, 420), 800)
        assert len(nearby) > 0
        assert "重要内容" in nearby

    test("Nearby text extraction", test_get_nearby_text)

    def test_parse_txt_simulation():
        test_content = "这是测试文本\n包含多行内容\n知识图谱构建测试"
        assert "知识图谱构建" in test_content
        assert len(test_content) > 0

    test("TXT parsing (simulated)", test_parse_txt_simulation)

    def test_entity_resolver_basic():
        resolver = EntityResolver("testdoc123")
        chunk_entities = [
            {"id": "E1", "name": "人工智能", "type": "技术", "description": "AI技术", "confidence": 0.95},
            {"id": "E2", "name": "机器学习", "type": "技术", "description": "ML技术", "confidence": 0.9},
        ]
        resolved = resolver.add_chunk_entities(chunk_entities, "chunk0")
        assert len(resolved) == 2
        assert len(resolver.entities) == 2
        assert resolver.id_map["E1"] is not None
        assert resolver.id_map["E2"] is not None

    test("EntityResolver - basic add", test_entity_resolver_basic)

    def test_entity_resolver_deduplication():
        resolver = EntityResolver("testdoc456")
        chunk1 = [{"id": "E1", "name": "人工智能", "type": "技术", "confidence": 0.8}]
        chunk2 = [{"id": "E1", "name": "人工智能", "type": "技术", "confidence": 0.95}]

        resolver.add_chunk_entities(chunk1, "chunk0")
        resolver.add_chunk_entities(chunk2, "chunk1")

        assert len(resolver.entities) == 1
        assert resolver.entities[0].confidence == 0.95

    test("EntityResolver - deduplication", test_entity_resolver_deduplication)

    def test_entity_resolver_relation():
        resolver = EntityResolver("testdoc789")
        resolver.add_chunk_entities([
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
        resolved = resolver.resolve_relation(relation)
        assert resolved is not None
        assert resolved.source in [e.id for e in resolver.entities]
        assert resolved.target in [e.id for e in resolver.entities]
        assert resolved.source != resolved.target

    test("EntityResolver - valid relation", test_entity_resolver_relation)

    def test_entity_resolver_invalid_relation():
        resolver = EntityResolver("testdoc101")
        resolver.add_chunk_entities([
            {"id": "E1", "name": "公司A", "type": "组织", "confidence": 0.9},
        ], "chunk0")

        relation = {
            "id": "R1",
            "source": "E1",
            "target": "E999",
            "relation_type": "生产",
        }
        resolved = resolver.resolve_relation(relation)
        assert resolved is None

    test("EntityResolver - invalid relation rejected", test_entity_resolver_invalid_relation)

    def test_entity_resolver_self_reference():
        resolver = EntityResolver("testdoc102")
        resolver.add_chunk_entities([
            {"id": "E1", "name": "公司A", "type": "组织", "confidence": 0.9},
        ], "chunk0")

        relation = {
            "id": "R1",
            "source": "E1",
            "target": "E1",
            "relation_type": "关联",
        }
        resolved = resolver.resolve_relation(relation)
        assert resolved is None

    test("EntityResolver - self-reference rejected", test_entity_resolver_self_reference)

    def test_entity_resolver_name_match():
        resolver = EntityResolver("testdoc103")
        resolver.add_chunk_entities([
            {"id": "E1", "name": "百度公司", "type": "组织", "confidence": 0.9},
            {"id": "E2", "name": "文心一言", "type": "产品", "confidence": 0.9},
        ], "chunk0")

        relation = {
            "id": "R1",
            "source": "百度公司",
            "target": "E2",
            "relation_type": "开发",
        }
        resolved = resolver.resolve_relation(relation)
        assert resolved is not None
        assert resolved.source != resolved.target

    test("EntityResolver - resolve by name match", test_entity_resolver_name_match)

    def test_entity_resolver_image_entities():
        resolver = EntityResolver("testdoc104")
        resolver.add_chunk_entities([
            {"id": "E1", "name": "系统", "type": "概念", "confidence": 0.9},
        ], "chunk0")

        img_entities = [
            {"id": "E_img_1", "name": "服务器", "type": "设备", "confidence": 0.85},
        ]
        resolved = resolver.add_image_entities(img_entities)
        assert len(resolved) == 1
        assert len(resolver.entities) == 2

    test("EntityResolver - image entities", test_entity_resolver_image_entities)

    def test_split_text_long():
        long_text = "\n\n".join(["段落" + str(i) + "内容" * 100 for i in range(20)])
        chunks = kg_split_text(long_text, max_length=1000, overlap=100)
        assert len(chunks) > 1
        assert all(len(c) <= 1100 for c in chunks)
        assert all(len(c.strip()) > 0 for c in chunks)

    test("Text splitting - long text", test_split_text_long)

    def test_split_text_short():
        short_text = "这是一段短文本"
        chunks = kg_split_text(short_text, max_length=1000)
        assert len(chunks) == 1
        assert chunks[0] == short_text

    test("Text splitting - short text", test_split_text_short)

    def test_graph_store_save_entity():
        _in_memory_graph["nodes"].clear()
        _in_memory_graph["edges"].clear()

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

    test("GraphStore - save entity", test_graph_store_save_entity)

    def test_graph_store_save_entity_invalid():
        success = save_entity(
            doc_id="doc1",
            entity_id="",
            name="",
            entity_type="",
        )
        assert success is False

    test("GraphStore - reject invalid entity", test_graph_store_save_entity_invalid)

    def test_graph_store_save_relation():
        _in_memory_graph["nodes"].clear()
        _in_memory_graph["edges"].clear()

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

    test("GraphStore - save valid relation", test_graph_store_save_relation)

    def test_graph_store_save_relation_missing_nodes():
        _in_memory_graph["nodes"].clear()
        _in_memory_graph["edges"].clear()

        success = save_relation(
            relation_id="rel2",
            source_id="nonexistent1",
            target_id="nonexistent2",
            relation_type="关联",
        )
        assert success is False
        assert "rel2" not in _in_memory_graph["edges"]

    test("GraphStore - reject relation with missing nodes", test_graph_store_save_relation_missing_nodes)

    def test_graph_store_save_extraction_result():
        _in_memory_graph["nodes"].clear()
        _in_memory_graph["edges"].clear()

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

    test("GraphStore - save extraction result", test_graph_store_save_extraction_result)

    def test_graph_store_save_partial_result():
        _in_memory_graph["nodes"].clear()
        _in_memory_graph["edges"].clear()

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

    test("GraphStore - partial save handling", test_graph_store_save_partial_result)

    def test_graph_store_integrity_good():
        _in_memory_graph["nodes"].clear()
        _in_memory_graph["edges"].clear()

        save_entity("doc1", "ent1", "实体1", "组织", "", 0.9)
        save_entity("doc1", "ent2", "实体2", "技术", "", 0.9)
        save_relation("rel1", "ent1", "ent2", "使用", "", 0.8)

        stats = verify_integrity()
        assert stats["total_nodes"] == 2
        assert stats["total_edges"] == 1
        assert stats["total_issues"] == 0

    test("GraphStore - integrity check (good graph)", test_graph_store_integrity_good)

    def test_graph_store_integrity_with_issues():
        _in_memory_graph["nodes"].clear()
        _in_memory_graph["edges"].clear()

        save_entity("doc1", "ent1", "实体1", "组织", "", 0.9)
        _in_memory_graph["nodes"]["ent2"] = {
            "id": "ent2", "name": "", "type": "技术", "doc_id": "doc1"
        }
        _in_memory_graph["nodes"]["ent3"] = {
            "id": "ent3", "name": "实体3", "type": "", "doc_id": "doc1"
        }

        _in_memory_graph["edges"]["bad_rel"] = {
            "id": "bad_rel",
            "source": "ent1",
            "target": "nonexistent",
            "relation_type": "关联",
        }

        stats = verify_integrity()
        assert stats["total_issues"] >= 3
        issue_types = [i["type"] for i in stats["issues"]]
        assert "orphan_target" in issue_types
        assert "missing_name" in issue_types
        assert "missing_type" in issue_types

    test("GraphStore - integrity check (with issues)", test_graph_store_integrity_with_issues)

    def test_full_workflow_simulation():
        _in_memory_graph["nodes"].clear()
        _in_memory_graph["edges"].clear()

        sample_text = """
人工智能（Artificial Intelligence，AI）是计算机科学的一个分支。

机器学习（Machine Learning）是人工智能的一个重要子集。

深度学习（Deep Learning）是机器学习的一种方法。

图 1 人工智能技术架构图
展示了从基础层到应用层的完整架构。

百度公司是一家知名的人工智能企业，研发了多款AI产品。

百度公司开发了文心一言大语言模型。

文心一言属于生成式AI产品。
"""

        resolver = EntityResolver("full_test_001")
        chunks = kg_split_text(sample_text, max_length=500)
        assert len(chunks) >= 1

        mock_entities = [
            {"id": "E1", "name": "人工智能", "type": "技术", "description": "AI技术", "confidence": 0.95},
            {"id": "E2", "name": "机器学习", "type": "技术", "description": "ML技术", "confidence": 0.9},
            {"id": "E3", "name": "深度学习", "type": "技术", "confidence": 0.88},
            {"id": "E4", "name": "百度公司", "type": "组织", "confidence": 0.92},
            {"id": "E5", "name": "文心一言", "type": "产品", "confidence": 0.87},
        ]
        mock_relations = [
            {"id": "R1", "source": "E2", "target": "E1", "relation_type": "属于", "confidence": 0.9},
            {"id": "R2", "source": "E3", "target": "E2", "relation_type": "属于", "confidence": 0.9},
            {"id": "R3", "source": "E4", "target": "E5", "relation_type": "开发", "confidence": 0.88},
        ]

        resolver.add_chunk_entities(mock_entities, "chunk0")
        for r in mock_relations:
            resolved = resolver.resolve_relation(r)
            assert resolved is not None
            resolver.relations.append(resolved)

        assert len(resolver.entities) == 5
        assert len(resolver.relations) == 3

        entities_dict = [e.model_dump() for e in resolver.entities]
        relations_dict = [r.model_dump() for r in resolver.relations]

        all_saved, saved_ents, saved_rels = save_extraction_result(
            "full_test_001", entities_dict, relations_dict
        )

        assert all_saved is True
        assert saved_ents == 5
        assert saved_rels == 3

        stats = verify_integrity("full_test_001")
        assert stats["total_nodes"] == 5
        assert stats["total_edges"] == 3
        assert stats["total_issues"] == 0

        print(f"\n  Full workflow results: {saved_ents} entities, {saved_rels} relations")
        for e in resolver.entities:
            print(f"    - {e.type}: {e.name} (confidence: {e.confidence})")
        for r in resolver.relations:
            src_name = next((e.name for e in resolver.entities if e.id == r.source), r.source)
            tgt_name = next((e.name for e in resolver.entities if e.id == r.target), r.target)
            print(f"    - {src_name} [{r.relation_type}] {tgt_name}")

    test("Full workflow simulation", test_full_workflow_simulation)

    print(f"\n{'='*60}")
    print(f"TEST SUMMARY: {passed} passed, {failed} failed")
    print(f"{'='*60}")

    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
