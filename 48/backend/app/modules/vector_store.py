import os
import time
import logging
import threading
from functools import lru_cache
from collections import OrderedDict
from typing import Optional, List, Dict, Any, Tuple

import chromadb
import numpy as np

logger = logging.getLogger(__name__)

CHROMA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "chroma_data")
VECTOR_DIM = 64

_client = None
_collection = None
_lock = threading.Lock()


class LRUCache:
    def __init__(self, capacity: int = 128):
        self._cache: "OrderedDict[str, Tuple[float, List[Dict[str, Any]]]]" = OrderedDict()
        self._capacity = capacity
        self._hits = 0
        self._misses = 0

    def get(self, key: str, max_age: float = 60.0) -> Optional[List[Dict[str, Any]]]:
        if key in self._cache:
            timestamp, value = self._cache[key]
            if time.time() - timestamp < max_age:
                self._hits += 1
                self._cache.move_to_end(key)
                return value
            else:
                del self._cache[key]
        self._misses += 1
        return None

    def put(self, key: str, value: List[Dict[str, Any]]) -> None:
        with _lock:
            self._cache[key] = (time.time(), value)
            self._cache.move_to_end(key)
            while len(self._cache) > self._capacity:
                self._cache.popitem(last=False)

    def stats(self) -> Dict[str, Any]:
        return {
            "size": len(self._cache),
            "capacity": self._capacity,
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": self._hits / max(self._hits + self._misses, 1),
        }


_search_cache = LRUCache(capacity=256)


def get_chroma_client():
    global _client
    if _client is None:
        with _lock:
            if _client is None:
                _client = chromadb.PersistentClient(path=CHROMA_DIR)
    return _client


def get_collection():
    global _collection
    if _collection is None:
        with _lock:
            if _collection is None:
                client = get_chroma_client()
                _collection = client.get_or_create_collection(
                    name="defects",
                    metadata={
                        "hnsw:space": "cosine",
                        "hnsw:M": 16,
                        "hnsw:ef_construction": 64,
                        "hnsw:ef_search": 32,
                    },
                )
    return _collection


def _validate_vector(vector: List[float]) -> bool:
    if not isinstance(vector, list) or len(vector) != VECTOR_DIM:
        logger.warning(
            f"Invalid vector: expected {VECTOR_DIM} dims, "
            f"got {len(vector) if isinstance(vector, (list, tuple)) else type(vector)}"
        )
        return False
    arr = np.asarray(vector, dtype=np.float64)
    norm = np.linalg.norm(arr)
    if norm < 1e-8:
        logger.warning("Vector has near-zero norm, would cause division by zero in cosine similarity")
        return False
    if not np.all(np.isfinite(arr)):
        logger.warning("Vector contains NaN or Inf values")
        return False
    return True


def _normalize_vector(vector: List[float]) -> List[float]:
    arr = np.asarray(vector, dtype=np.float64)
    norm = np.linalg.norm(arr)
    return (arr / norm).tolist()


def store_vector(vector_id: str, vector: List[float], metadata: Dict[str, Any]):
    if not _validate_vector(vector):
        logger.error(f"Skipping invalid vector storage for id={vector_id}")
        return False
    normalized = _normalize_vector(vector)
    collection = get_collection()
    try:
        with _lock:
            collection.upsert(
                ids=[vector_id],
                embeddings=[normalized],
                metadatas=[metadata],
            )
        verify = collection.get(ids=[vector_id], include=["embeddings"])
        if not verify["ids"] or not verify["embeddings"]:
            logger.error(f"Vector verification failed for id={vector_id}: not found after upsert")
            return False
        stored = np.asarray(verify["embeddings"][0])
        diff = np.linalg.norm(stored - np.asarray(normalized))
        if diff > 0.01:
            logger.warning(f"Vector drift detected for id={vector_id}: diff={diff:.6f}")
        return True
    except Exception as e:
        logger.error(f"Failed to store vector id={vector_id}: {e}")
        return False


def batch_store_vectors(vectors: List[Tuple[str, List[float], Dict[str, Any]]]) -> List[bool]:
    results = []
    for vid, vec, meta in vectors:
        results.append(store_vector(vid, vec, meta))
    return results


def _search_cache_key(query_vector: List[float], top_k: int, filters: Optional[Dict[str, Any]] = None) -> str:
    arr = np.asarray(query_vector, dtype=np.float32)
    vec_hash = hash(arr.tobytes())
    return f"{vec_hash}:{top_k}:{hash(str(filters))}"


def search_similar(
    query_vector: List[float],
    top_k: int = 10,
    filters: Optional[Dict[str, Any]] = None,
    use_cache: bool = True,
    min_similarity: float = 0.0,
) -> List[Dict[str, Any]]:
    if not _validate_vector(query_vector):
        logger.warning("Invalid query vector for search")
        return []

    if use_cache:
        cache_key = _search_cache_key(query_vector, top_k, filters)
        cached = _search_cache.get(cache_key, max_age=120.0)
        if cached is not None:
            logger.debug("Vector search cache hit")
            return cached

    normalized = _normalize_vector(query_vector)
    collection = get_collection()
    if collection.count() == 0:
        return []

    effective_top_k = min(max(top_k, 1), min(collection.count(), 100))
    try:
        search_kwargs = {
            "query_embeddings": [normalized],
            "n_results": effective_top_k,
            "include": ["metadatas", "distances"],
        }
        if filters:
            search_kwargs["where"] = filters
        results = collection.query(**search_kwargs)
    except Exception as e:
        logger.error(f"Vector search failed: {e}")
        return []

    items = []
    if results and results["ids"] and results["ids"][0]:
        for i, vid in enumerate(results["ids"][0]):
            distance = float(results["distances"][0][i])
            similarity = max(0.0, 1.0 - distance)
            if similarity >= min_similarity:
                items.append({
                    "vector_id": vid,
                    "similarity": round(similarity, 4),
                    "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
                })

    if use_cache:
        cache_key = _search_cache_key(query_vector, top_k, filters)
        _search_cache.put(cache_key, items)

    return items


def batch_search_similar(
    query_vectors: List[List[float]],
    top_k: int = 10,
    filters: Optional[Dict[str, Any]] = None,
    use_cache: bool = True,
) -> List[List[Dict[str, Any]]]:
    normalized_queries = []
    for v in query_vectors:
        if not _validate_vector(v):
            logger.warning("Skipping invalid vector in batch search")
            normalized_queries.append(None)
        else:
            normalized_queries.append(_normalize_vector(v))

    valid_queries = [(i, v) for i, v in enumerate(normalized_queries) if v is not None]
    if not valid_queries:
        return [[] for _ in query_vectors]

    collection = get_collection()
    if collection.count() == 0:
        return [[] for _ in query_vectors]

    effective_top_k = min(max(top_k, 1), min(collection.count(), 100))
    vecs = [v for _, v in valid_queries]

    try:
        results = collection.query(
            query_embeddings=vecs,
            n_results=effective_top_k,
            include=["metadatas", "distances"],
        )
    except Exception as e:
        logger.error(f"Batch vector search failed: {e}")
        return [[] for _ in query_vectors]

    all_results = [[] for _ in query_vectors]
    if results and results.get("ids"):
        for res_idx, (orig_idx, _) in enumerate(valid_queries):
            items = []
            for i, vid in enumerate(results["ids"][res_idx]):
                distance = float(results["distances"][res_idx][i])
                similarity = max(0.0, 1.0 - distance)
                items.append({
                    "vector_id": vid,
                    "similarity": round(similarity, 4),
                    "metadata": results["metadatas"][res_idx][i] if results["metadatas"] else {},
                })
            all_results[orig_idx] = items

    return all_results


def delete_vector(vector_id: str):
    collection = get_collection()
    try:
        with _lock:
            collection.delete(ids=[vector_id])
    except Exception:
        pass


def get_vector_store_stats() -> Dict[str, Any]:
    collection = get_collection()
    return {
        "total_vectors": collection.count(),
        "cache_stats": _search_cache.stats(),
        "hnsw_params": collection.metadata if hasattr(collection, "metadata") else {},
        "vector_dim": VECTOR_DIM,
    }
