import hashlib
import logging
import chromadb
from typing import List, Dict, Optional, Tuple
from app.config import (
    CHROMA_DIR,
    CHROMA_MAX_BATCH_SIZE,
    SEARCH_DEFAULT_TOP_K,
    SEARCH_MIN_THRESHOLD,
    CHROMA_HNSW_M,
    CHROMA_HNSW_EF_CONSTRUCTION,
    CHROMA_HNSW_EF_SEARCH,
    VECTOR_PARTITION_ENABLED,
    VECTOR_DISTANCE_METRIC,
    CACHE_ENABLED,
    EMBEDDING_CACHE_SIZE,
)
from app.core.embedder import embed_documents_batched, embed_query_with_retry
from functools import lru_cache

logger = logging.getLogger(__name__)

_chroma_client = None
_collection_cache: Dict[str, chromadb.Collection] = {}


class LRUCache:
    def __init__(self, capacity: int):
        self.capacity = capacity
        self.cache: Dict[str, List[float]] = {}
        self.order: List[str] = []

    def get(self, key: str) -> Optional[List[float]]:
        if key in self.cache:
            self.order.remove(key)
            self.order.append(key)
            return self.cache[key]
        return None

    def put(self, key: str, value: List[float]):
        if key in self.cache:
            self.order.remove(key)
        elif len(self.cache) >= self.capacity:
            oldest = self.order.pop(0)
            del self.cache[oldest]
        self.cache[key] = value
        self.order.append(key)


_embedding_cache = LRUCache(EMBEDDING_CACHE_SIZE) if CACHE_ENABLED else None


def _content_hash(content: str) -> str:
    return hashlib.md5(content.encode('utf-8')).hexdigest()


def get_chroma_client():
    global _chroma_client
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    return _chroma_client


def _get_partition_name(document_type: str = "all") -> str:
    if VECTOR_PARTITION_ENABLED:
        return f"docs_{document_type}"
    return "documents"


def _get_distance_space() -> str:
    metric_map = {
        "ip": "ip",
        "cosine": "cosine",
        "l2": "l2",
    }
    return metric_map.get(VECTOR_DISTANCE_METRIC, "cosine")


def get_or_create_collection(client, partition: str = "all"):
    name = _get_partition_name(partition)
    if name in _collection_cache:
        return _collection_cache[name]
    collection = client.get_or_create_collection(
        name=name,
        metadata={
            "hnsw:space": _get_distance_space(),
            "hnsw:M": CHROMA_HNSW_M,
            "hnsw:construction_ef": CHROMA_HNSW_EF_CONSTRUCTION,
            "hnsw:search_ef": CHROMA_HNSW_EF_SEARCH,
        },
    )
    _collection_cache[name] = collection
    return collection


def _get_cached_embeddings(texts: List[str]) -> Tuple[List[List[float]], List[str], List[int]]:
    if not CACHE_ENABLED or _embedding_cache is None:
        return (embed_documents_batched(texts), [], list(range(len(texts))))

    embeddings: List[Optional[List[float]]] = [None] * len(texts)
    uncached_indices: List[int] = []
    cache_hits = 0

    for i, text in enumerate(texts):
        key = _content_hash(text)
        cached = _embedding_cache.get(key)
        if cached is not None:
            embeddings[i] = cached
            cache_hits += 1
        else:
            uncached_indices.append(i)

    if uncached_indices:
        uncached_texts = [texts[i] for i in uncached_indices]
        new_embeddings = embed_documents_batched(uncached_texts)
        for j, idx in enumerate(uncached_indices):
            embeddings[idx] = new_embeddings[j]
            key = _content_hash(texts[idx])
            _embedding_cache.put(key, new_embeddings[j])

    if cache_hits > 0:
        logger.debug(f"Embedding cache hit: {cache_hits}/{len(texts)}")

    result = [e for e in embeddings if e is not None]
    return (result, [], list(range(len(result))))


def add_documents(collection, chunks: List[Dict], document_id: str, doc_type: str = "all"):
    texts = [c["content"] for c in chunks]
    ids = [f"{document_id}_{c['chunk_index']}" for c in chunks]
    metadatas = [
        {
            "document_id": document_id,
            "chunk_index": c["chunk_index"],
            "page_number": str(c.get("page_number") or ""),
            "content_hash": _content_hash(c["content"]),
            "doc_type": doc_type,
        }
        for c in chunks
    ]

    if VECTOR_PARTITION_ENABLED:
        client = get_chroma_client()
        collection = get_or_create_collection(client, doc_type)

    logger.info(f"Embedding {len(texts)} chunks for document {document_id}")
    embeddings, _, _ = _get_cached_embeddings(texts)

    if len(embeddings) != len(ids):
        logger.warning(f"Embedding count mismatch: {len(embeddings)} vs {len(ids)}")
        embeddings = embeddings + [[0.0] * 1024] * (len(ids) - len(embeddings))

    batch_size = CHROMA_MAX_BATCH_SIZE
    for i in range(0, len(ids), batch_size):
        batch_ids = ids[i:i + batch_size]
        batch_embeddings = embeddings[i:i + batch_size]
        batch_texts = texts[i:i + batch_size]
        batch_metadatas = metadatas[i:i + batch_size]
        try:
            collection.add(
                ids=batch_ids,
                embeddings=batch_embeddings,
                documents=batch_texts,
                metadatas=batch_metadatas,
            )
            logger.info(f"Added batch {i // batch_size + 1}: {len(batch_ids)} vectors")
        except Exception as e:
            logger.error(f"Failed to add batch to ChromaDB: {e}")
            for j in range(len(batch_ids)):
                try:
                    collection.add(
                        ids=[batch_ids[j]],
                        embeddings=[batch_embeddings[j]],
                        documents=[batch_texts[j]],
                        metadatas=[batch_metadatas[j]],
                    )
                except Exception as inner_e:
                    logger.error(f"Failed to add chunk {batch_ids[j]}: {inner_e}")

    logger.info(f"Completed adding {len(ids)} vectors for document {document_id}")


def _normalize_score(distance: float, metric: str) -> float:
    if metric == "ip":
        return max(0.0, min(1.0, (distance + 1) / 2))
    elif metric == "cosine":
        return max(0.0, 1.0 - distance)
    else:
        return max(0.0, 1.0 / (1.0 + distance))


def search_documents(
    collection,
    query: str,
    top_k: int = SEARCH_DEFAULT_TOP_K,
    threshold: float = SEARCH_MIN_THRESHOLD,
    doc_type_filter: Optional[str] = None,
) -> List[Dict]:
    if VECTOR_PARTITION_ENABLED and doc_type_filter:
        client = get_chroma_client()
        collection = get_or_create_collection(client, doc_type_filter)

    query_embedding = embed_query_with_retry(query)

    collection_count = collection.count()
    if collection_count == 0:
        return []

    effective_top_k = min(top_k, collection_count)
    search_ef = max(CHROMA_HNSW_EF_SEARCH, effective_top_k * 2)

    try:
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=effective_top_k,
            include=["documents", "metadatas", "distances"],
        )
    except Exception as e:
        logger.error(f"ChromaDB query failed: {e}")
        return []

    search_results = []
    metric = _get_distance_space()
    if results["ids"] and results["ids"][0]:
        for i in range(len(results["ids"][0])):
            distance = results["distances"][0][i] if results.get("distances") else 1.0
            score = _normalize_score(distance, metric)

            if score < threshold:
                continue

            metadata = {}
            if results.get("metadatas") and results["metadatas"][0]:
                metadata = results["metadatas"][0][i] or {}

            content = ""
            if results.get("documents") and results["documents"][0]:
                content = results["documents"][0][i] or ""

            page_number_raw = metadata.get("page_number", "")
            page_number = None
            if page_number_raw and page_number_raw not in ("", "None", "null"):
                try:
                    page_number = int(page_number_raw)
                except (ValueError, TypeError):
                    page_number = None

            search_results.append(
                {
                    "chunk_id": results["ids"][0][i],
                    "document_id": metadata.get("document_id", ""),
                    "content": content,
                    "score": round(score, 4),
                    "page_number": page_number,
                }
            )

    search_results.sort(key=lambda x: x["score"], reverse=True)
    return search_results


def delete_document_vectors(collection, document_id: str, doc_type: Optional[str] = None):
    try:
        if VECTOR_PARTITION_ENABLED and doc_type:
            client = get_chroma_client()
            collection = get_or_create_collection(client, doc_type)
        all_ids = collection.get(where={"document_id": document_id})["ids"]
        if all_ids:
            collection.delete(ids=all_ids)
            logger.info(f"Deleted {len(all_ids)} vectors for document {document_id}")
    except Exception as e:
        logger.error(f"Failed to delete vectors for document {document_id}: {e}")


def get_collection_stats(partition: str = "all") -> Dict:
    try:
        client = get_chroma_client()
        collection = get_or_create_collection(client, partition)
        count = collection.count()
        return {
            "partition": partition,
            "vector_count": count,
            "distance_metric": _get_distance_space(),
            "hnsw_m": CHROMA_HNSW_M,
            "hnsw_ef_construction": CHROMA_HNSW_EF_CONSTRUCTION,
            "hnsw_ef_search": CHROMA_HNSW_EF_SEARCH,
        }
    except Exception as e:
        logger.error(f"Failed to get collection stats: {e}")
        return {"error": str(e)}
