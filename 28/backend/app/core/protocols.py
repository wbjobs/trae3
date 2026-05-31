from typing import Protocol, List, Tuple, Dict, Any, Optional, runtime_checkable
import numpy as np


@runtime_checkable
class VectorSearchProvider(Protocol):
    def search(
        self,
        query_vector: np.ndarray,
        top_k: int = 5,
        filters: Optional[Dict[str, Any]] = None,
        threshold: Optional[float] = None,
    ) -> Tuple[List[float], List[Dict[str, Any]]]:
        ...

    @property
    def metadata(self) -> List[Dict[str, Any]]:
        ...


@runtime_checkable
class EmbeddingProvider(Protocol):
    def get_embedding(self, text: str) -> np.ndarray:
        ...

    def get_embeddings(self, texts: List[str]) -> np.ndarray:
        ...


@runtime_checkable
class ChartClassifier(Protocol):
    def classify(self, image: np.ndarray) -> Tuple[str, float]:
        ...

    def extract_data(self, image: np.ndarray, chart_type: str) -> Optional[Dict[str, Any]]:
        ...
