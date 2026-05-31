import asyncio
import json
import argparse
import logging
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.parser import parse_document
from app.services.kg_builder import build_knowledge_graph
from app.services.vector_store import add_document_embedding, add_entity_embeddings
from app.services.graph_store import save_extraction_result

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


async def inference_single(filepath: str, domain: str = "通用", output_dir: str = None):
    logger.info(f"Processing: {filepath}")
    parsed = await parse_document(filepath)
    logger.info(f"Parsed: {len(parsed.text_content)} chars, {len(parsed.images)} images")

    result = await build_knowledge_graph(
        doc_id=parsed.doc_id,
        text_content=parsed.text_content,
        image_paths=parsed.images,
        domain=domain,
    )

    add_document_embedding(parsed.doc_id, parsed.text_content[:2000], {"filename": parsed.filename})
    add_entity_embeddings(
        parsed.doc_id,
        [e.model_dump() for e in result.entities],
    )
    save_extraction_result(
        parsed.doc_id,
        [e.model_dump() for e in result.entities],
        [r.model_dump() for r in result.relations],
    )

    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, f"{parsed.doc_id}_result.json")
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result.model_dump(), f, ensure_ascii=False, indent=2, default=str)
        logger.info(f"Result saved to: {output_path}")

    return result


async def inference_batch(filepaths: list[str], domain: str = "通用", output_dir: str = None):
    results = []
    for fp in filepaths:
        try:
            result = await inference_single(fp, domain, output_dir)
            results.append(result)
        except Exception as e:
            logger.error(f"Failed to process {fp}: {e}")
    return results


def main():
    parser = argparse.ArgumentParser(description="知识图谱构建推理脚本")
    parser.add_argument("files", nargs="+", help="待处理的文件路径")
    parser.add_argument("--domain", default="通用", help="行业领域（如：医疗、金融、法律等）")
    parser.add_argument("--output", default=None, help="输出目录")
    args = parser.parse_args()

    asyncio.run(inference_batch(args.files, args.domain, args.output))


if __name__ == "__main__":
    main()
