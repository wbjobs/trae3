import os
import numpy as np
import faiss
from typing import Optional, List, Tuple, Dict, Any
from pathlib import Path
from collections import defaultdict

from app.modules.vector_store.base_store import BaseVectorStore
from app.core.config import settings


class FAISSVectorStore(BaseVectorStore):
    def __init__(self, dimension: int, index_path: str, metadata_path: str):
        super().__init__(dimension, index_path, metadata_path)
        self._index: Optional[faiss.Index] = None
        self._metadata: List[Dict[str, Any]] = []
        self._bucket_map: Dict[str, List[int]] = defaultdict(list)
        self._pending_count: int = 0
        self._is_trained: bool = False
        self._load_or_create_index()

    def _load_or_create_index(self) -> None:
        if not self.load_index():
            self.create_index()
            self.save_index()

    def create_index(self) -> None:
        index_type = settings.VECTOR_INDEX_TYPE.upper()

        if index_type == "IVF" and settings.VECTOR_USE_QUANTIZATION:
            quantizer = faiss.IndexFlatL2(self.dimension)
            self._index = faiss.IndexIVFPQ(
                quantizer, self.dimension, settings.VECTOR_NLIST, 8, 8
            )
        elif index_type == "IVF":
            quantizer = faiss.IndexFlatL2(self.dimension)
            self._index = faiss.IndexIVFFlat(
                quantizer, self.dimension, settings.VECTOR_NLIST, faiss.METRIC_L2
            )
            if hasattr(self._index, 'nprobe'):
                self._index.nprobe = settings.VECTOR_NPROBE
        else:
            self._index = faiss.IndexFlatL2(self.dimension)
            self._is_trained = True

        self._metadata = []
        self._bucket_map.clear()
        self._pending_count = 0

    def _train_index_if_needed(self, vectors: np.ndarray) -> None:
        if self._is_trained:
            return

        if not hasattr(self._index, 'is_trained'):
            self._is_trained = True
            return

        if self._index.is_trained:
            self._is_trained = True
            return

        total_vectors = len(vectors) + len(self._metadata)
        if total_vectors >= settings.VECTOR_TRAIN_THRESHOLD:
            if len(self._metadata) > 0:
                existing_vectors = self._index.reconstruct_n(0, len(self._metadata))
                all_vectors = np.vstack([existing_vectors, vectors])
            else:
                all_vectors = vectors

            self._index.train(all_vectors)
            self._is_trained = True

    def save_index(self) -> None:
        if self._index is None:
            raise ValueError("Index not created")
        Path(os.path.dirname(self.index_path)).mkdir(parents=True, exist_ok=True)
        faiss.write_index(self._index, self.index_path)
        np.save(self.metadata_path, np.array(self._metadata, dtype=object))

        bucket_path = self.metadata_path.replace('.npy', '_buckets.npy')
        np.save(bucket_path, np.array(dict(self._bucket_map), dtype=object))

        self._pending_count = 0

    def load_index(self) -> bool:
        if os.path.exists(self.index_path) and os.path.exists(self.metadata_path):
            self._index = faiss.read_index(self.index_path)
            self._metadata = np.load(self.metadata_path, allow_pickle=True).tolist()
            self._is_trained = True

            bucket_path = self.metadata_path.replace('.npy', '_buckets.npy')
            if os.path.exists(bucket_path):
                bucket_data = np.load(bucket_path, allow_pickle=True).item()
                self._bucket_map = defaultdict(list, bucket_data)
            else:
                self._rebuild_bucket_map()

            if hasattr(self._index, 'nprobe'):
                self._index.nprobe = settings.VECTOR_NPROBE

            return True
        return False

    def _rebuild_bucket_map(self) -> None:
        self._bucket_map.clear()
        for idx, meta in enumerate(self._metadata):
            paper_id = str(meta.get('paper_id', 'unknown'))
            self._bucket_map[paper_id].append(idx)

    def add_vectors(self, vectors: np.ndarray, metadata: List[Dict[str, Any]]) -> None:
        if self._index is None:
            raise ValueError("Index not created")
        if vectors.shape[1] != self.dimension:
            raise ValueError(
                f"Vector dimension mismatch: expected {self.dimension}, got {vectors.shape[1]}"
            )
        if len(vectors) != len(metadata):
            raise ValueError(
                f"Vectors count ({len(vectors)}) does not match metadata count ({len(metadata)})"
            )

        self._train_index_if_needed(vectors)

        start_idx = len(self._metadata)
        self._index.add(vectors)

        for i, meta in enumerate(metadata):
            paper_id = str(meta.get('paper_id', 'unknown'))
            self._bucket_map[paper_id].append(start_idx + i)

        self._metadata.extend(metadata)
        self._pending_count += len(vectors)

        if self._pending_count >= settings.VECTOR_AUTO_SAVE_BATCH:
            self.save_index()

    def add_vectors_batch(
        self, vectors: np.ndarray, metadata: List[Dict[str, Any]], batch_size: int = 1000
    ) -> None:
        total = len(vectors)
        for i in range(0, total, batch_size):
            end = min(i + batch_size, total)
            self.add_vectors(vectors[i:end], metadata[i:end])

    def search(
        self,
        query_vector: np.ndarray,
        top_k: int = 5,
        filters: Optional[Dict[str, Any]] = None,
        threshold: Optional[float] = None,
        paper_ids: Optional[List[str]] = None,
    ) -> Tuple[List[float], List[Dict[str, Any]]]:
        if self._index is None or self._index.ntotal == 0:
            return [], []

        query = query_vector.reshape(1, -1).astype(np.float32)

        if paper_ids:
            return self._search_in_buckets(query, top_k, paper_ids, filters, threshold)

        k = min(top_k * 3, self._index.ntotal)
        distances, indices = self._index.search(query, k)

        scores = [1.0 / (1.0 + d) for d in distances[0]]
        index_list = indices[0].tolist()

        return self._filter_metadata(index_list, scores, filters, threshold, top_k)

    def _search_in_buckets(
        self,
        query: np.ndarray,
        top_k: int,
        paper_ids: List[str],
        filters: Optional[Dict[str, Any]],
        threshold: Optional[float],
    ) -> Tuple[List[float], List[Dict[str, Any]]]:
        candidate_indices = []
        for paper_id in paper_ids:
            candidate_indices.extend(self._bucket_map.get(str(paper_id), []))

        if not candidate_indices:
            return [], []

        try:
            candidate_vectors = self._index.reconstruct_n(0, self._index.ntotal)
            bucket_vectors = candidate_vectors[candidate_indices]

            k = min(top_k * 3, len(bucket_vectors))
            distances, local_indices = faiss.IndexFlatL2(self.dimension).search(
                bucket_vectors.astype(np.float32), query.astype(np.float32), k
            )

            original_indices = [candidate_indices[i] for i in local_indices[0]]
            scores = [1.0 / (1.0 + d) for d in distances[0]]

            return self._filter_metadata(original_indices, scores, filters, threshold, top_k)
        except NotImplementedError:
            k = min(top_k * 5, self._index.ntotal)
            distances, indices = self._index.search(query, k)
            scores = [1.0 / (1.0 + d) for d in distances[0]]

            filtered_indices = []
            filtered_scores = []
            for idx, score in zip(indices[0], scores):
                meta = self._metadata[idx]
                if str(meta.get('paper_id')) in paper_ids:
                    filtered_indices.append(idx)
                    filtered_scores.append(score)

            return self._filter_metadata(
                filtered_indices, filtered_scores, filters, threshold, top_k
            )

    def search_batch(
        self,
        query_vectors: np.ndarray,
        top_k: int = 5,
        filters: Optional[Dict[str, Any]] = None,
        threshold: Optional[float] = None,
    ) -> List[Tuple[List[float], List[Dict[str, Any]]]]:
        if self._index is None or self._index.ntotal == 0:
            return [([], []) for _ in range(len(query_vectors))]

        k = min(top_k * 3, self._index.ntotal)
        distances_list, indices_list = self._index.search(
            query_vectors.astype(np.float32), k
        )

        results = []
        for distances, indices in zip(distances_list, indices_list):
            scores = [1.0 / (1.0 + d) for d in distances]
            index_list = indices.tolist()
            filtered_scores, filtered_meta = self._filter_metadata(
                index_list, scores, filters, threshold, top_k
            )
            results.append((filtered_scores, filtered_meta))

        return results

    def _filter_metadata(
        self,
        index_list: List[int],
        scores: List[float],
        filters: Optional[Dict[str, Any]],
        threshold: Optional[float],
        top_k: Optional[int] = None,
    ) -> Tuple[List[float], List[Dict[str, Any]]]:
        if top_k is None:
            top_k = len(index_list)

        filtered_scores = []
        filtered_metadata = []

        for idx, score in zip(index_list, scores):
            if idx < 0 or idx >= len(self._metadata):
                continue

            if threshold is not None and score < threshold:
                continue

            meta = self._metadata[idx]

            if filters:
                match = True
                for key, value in filters.items():
                    if meta.get(key) != value:
                        match = False
                        break
                if not match:
                    continue

            filtered_scores.append(score)
            filtered_metadata.append(meta)

            if len(filtered_scores) >= top_k:
                break

        return filtered_scores, filtered_metadata

    def delete_by_metadata(self, filters: Dict[str, Any]) -> bool:
        if self._index is None or self._index.ntotal == 0:
            return False

        try:
            all_vectors = self._index.reconstruct_n(0, self._index.ntotal)
        except NotImplementedError:
            return self._soft_delete_by_metadata(filters)

        new_metadata = []
        vectors_to_keep = []
        deleted_count = 0

        for i, meta in enumerate(self._metadata):
            match = True
            for key, value in filters.items():
                if meta.get(key) != value:
                    match = False
                    break
            if not match:
                new_metadata.append(meta)
                vectors_to_keep.append(all_vectors[i])
            else:
                deleted_count += 1

        if deleted_count == 0:
            return False

        self._metadata = new_metadata
        self.create_index()

        if vectors_to_keep:
            vectors_array = np.array(vectors_to_keep, dtype=np.float32)
            self._train_index_if_needed(vectors_array)
            self._index.add(vectors_array)
            self._rebuild_bucket_map()

        self.save_index()
        return True

    def _soft_delete_by_metadata(self, filters: Dict[str, Any]) -> bool:
        deleted_count = 0
        for i, meta in enumerate(self._metadata):
            match = True
            for key, value in filters.items():
                if meta.get(key) != value:
                    match = False
                    break
            if match:
                meta['_deleted'] = True
                deleted_count += 1

        if deleted_count > 0:
            self.save_index()

        return deleted_count > 0

    def delete_by_paper_ids(self, paper_ids: List[str]) -> int:
        total_deleted = 0
        for paper_id in paper_ids:
            if self.delete_by_metadata({'paper_id': paper_id}):
                total_deleted += 1
        return total_deleted

    def clear(self) -> None:
        self.create_index()
        self.save_index()

    def optimize(self) -> None:
        if self._index is None or self._index.ntotal == 0:
            return

        if hasattr(faiss, 'ParameterSpace'):
            try:
                params = faiss.ParameterSpace()
                params.display()
            except Exception:
                pass

        self.save_index()

    @property
    def total_vectors(self) -> int:
        return self._index.ntotal if self._index else 0

    @property
    def bucket_info(self) -> Dict[str, int]:
        return {k: len(v) for k, v in self._bucket_map.items()}

    def flush(self) -> None:
        if self._pending_count > 0:
            self.save_index()

    def __del__(self):
        try:
            self.flush()
        except Exception:
            pass
