from abc import ABC, abstractmethod
from typing import Optional, List, Tuple, Dict, Any
import numpy as np


class BaseVectorStore(ABC):
    def __init__(self, dimension: int, index_path: str, metadata_path: str):
        self.dimension = dimension
        self.index_path = index_path
        self.metadata_path = metadata_path
        self._metadata: List[Dict[str, Any]] = []

    @abstractmethod
    def create_index(self) -> None:
        pass

    @abstractmethod
    def save_index(self) -> None:
        pass

    @abstractmethod
    def load_index(self) -> bool:
        pass

    @abstractmethod
    def add_vectors(self, vectors: np.ndarray, metadata: List[Dict[str, Any]]) -> None:
        pass

    @abstractmethod
    def search(
        self,
        query_vector: np.ndarray,
        top_k: int = 5,
        filters: Optional[Dict[str, Any]] = None,
        threshold: Optional[float] = None,
    ) -> Tuple[List[float], List[Dict[str, Any]]]:
        pass

    @abstractmethod
    def delete_by_metadata(self, filters: Dict[str, Any]) -> bool:
        pass

    @abstractmethod
    def clear(self) -> None:
        pass

    @property
    @abstractmethod
    def total_vectors(self) -> int:
        pass

    @property
    def metadata(self) -> List[Dict[str, Any]]:
        return self._metadata.copy()

    def _filter_metadata(
        self,
        indices: List[int],
        scores: List[float],
        filters: Optional[Dict[str, Any]] = None,
        threshold: Optional[float] = None,
    ) -> Tuple[List[float], List[Dict[str, Any]]]:
        result_scores = []
        result_metadata = []

        for score, idx in zip(scores, indices):
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
            result_scores.append(score)
            result_metadata.append(meta)

        return result_scores, result_metadata
