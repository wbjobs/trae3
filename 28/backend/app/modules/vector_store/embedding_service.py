import os
import numpy as np
from typing import List, Optional
from functools import lru_cache

from app.core.config import settings


class EmbeddingService:
    def __init__(
        self,
        model_name: Optional[str] = None,
        device: Optional[str] = None,
        batch_size: Optional[int] = None,
        max_seq_length: Optional[int] = None,
        cache_size: Optional[int] = None,
    ):
        self.model_name = model_name or settings.EMBEDDING_MODEL_NAME
        self.device = device or settings.EMBEDDING_DEVICE
        self.batch_size = batch_size or settings.EMBEDDING_BATCH_SIZE
        self.max_seq_length = max_seq_length or settings.EMBEDDING_MAX_SEQ_LENGTH
        self.cache_size = cache_size or settings.EMBEDDING_CACHE_SIZE
        self._model = None
        self._tokenizer = None
        self._model_loaded = False
        self._local_model_path = os.path.join(
            settings.VECTOR_STORE_PATH, "models", self.model_name.replace("/", "_")
        )

    def _ensure_model(self) -> None:
        if self._model_loaded:
            return

        try:
            from sentence_transformers import SentenceTransformer

            if os.path.exists(self._local_model_path):
                self._model = SentenceTransformer(
                    self._local_model_path,
                    device=self.device,
                )
            else:
                self._model = SentenceTransformer(
                    self.model_name,
                    device=self.device,
                    cache_folder=os.path.dirname(self._local_model_path),
                )
                try:
                    self._model.save(self._local_model_path)
                except Exception:
                    pass

            self._model.max_seq_length = self.max_seq_length
            self._model_loaded = True

        except Exception as e:
            raise RuntimeError(f"Failed to load embedding model: {e}")

    @lru_cache(maxsize=10000)
    def _get_cached_embedding(self, text: str) -> np.ndarray:
        return self._model.encode(text, convert_to_numpy=True, show_progress_bar=False)

    def get_embedding(self, text: str, use_cache: bool = True) -> np.ndarray:
        self._ensure_model()

        if use_cache and self.cache_size > 0:
            return self._get_cached_embedding(text[:1000])

        return self._model.encode(text, convert_to_numpy=True, show_progress_bar=False)

    def get_embeddings(
        self,
        texts: List[str],
        batch_size: Optional[int] = None,
        show_progress: bool = False,
        use_cache: bool = True,
    ) -> np.ndarray:
        self._ensure_model()

        if not texts:
            return np.array([])

        if len(texts) == 1:
            return np.array([self.get_embedding(texts[0], use_cache=use_cache)])

        batch_size = batch_size or self.batch_size
        all_embeddings = []

        for i in range(0, len(texts), batch_size):
            batch_texts = texts[i:i + batch_size]

            if use_cache and self.cache_size > 0:
                batch_embeddings = []
                for text in batch_texts:
                    batch_embeddings.append(self.get_embedding(text, use_cache=True))
                all_embeddings.extend(batch_embeddings)
            else:
                batch_embeddings = self._model.encode(
                    batch_texts,
                    convert_to_numpy=True,
                    show_progress_bar=show_progress,
                    batch_size=len(batch_texts),
                )
                all_embeddings.extend(batch_embeddings)

        return np.array(all_embeddings)

    def split_text(
        self,
        text: str,
        chunk_size: int = 500,
        chunk_overlap: int = 50,
    ) -> List[str]:
        if not text:
            return []

        chunks = []
        text_length = len(text)

        if text_length <= chunk_size:
            return [text]

        start = 0
        while start < text_length:
            end = min(start + chunk_size, text_length)

            if end < text_length:
                last_period = text.rfind('.', start, end)
                last_newline = text.rfind('\n', start, end)
                if last_period > start + chunk_size // 2:
                    end = last_period + 1
                elif last_newline > start + chunk_size // 2:
                    end = last_newline

            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)

            start = end - chunk_overlap
            if start <= 0:
                start = end

        return chunks

    def get_dimension(self) -> int:
        self._ensure_model()
        return self._model.get_sentence_embedding_dimension()

    def clear_cache(self) -> None:
        self._get_cached_embedding.cache_clear()

    def get_cache_info(self) -> dict:
        cache_info = self._get_cached_embedding.cache_info()
        return {
            "hits": cache_info.hits,
            "misses": cache_info.misses,
            "maxsize": cache_info.maxsize,
            "currsize": cache_info.currsize,
            "hit_rate": cache_info.hits / (cache_info.hits + cache_info.misses)
            if (cache_info.hits + cache_info.misses) > 0
            else 0,
        }

    def unload_model(self) -> None:
        if self._model is not None:
            del self._model
            self._model = None
            self.clear_cache()
            self._model_loaded = False


_embedding_service: Optional[EmbeddingService] = None


def get_embedding_service() -> EmbeddingService:
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service


embedding_service = EmbeddingService()
