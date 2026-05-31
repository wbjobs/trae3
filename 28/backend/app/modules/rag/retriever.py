import re
import numpy as np
from typing import List, Optional, Dict, Any, Tuple
from collections import defaultdict

from app.core.config import settings
from app.schemas.qa import QASearchResult, QAReference


class Retriever:
    def __init__(self, vector_store=None, embedding_model=None):
        self._vector_store = vector_store
        self._embedding_model = embedding_model
        self._keyword_index: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        self._initialized = False

    def _ensure_initialized(self):
        if self._initialized:
            return
        if self._embedding_model is None:
            from app.modules.vector_store.embedding_service import embedding_service
            self._embedding_model = embedding_service
        if self._vector_store is None:
            from app.modules.vector_store.service import vector_store_service
            self._vector_store = vector_store_service.vector_store
        self._build_keyword_index()
        self._initialized = True

    def _build_keyword_index(self) -> None:
        self._keyword_index.clear()
        if self._vector_store is None:
            return
        for meta in self._vector_store.metadata:
            content = meta.get("content", "")
            words = self._tokenize(content)
            for word in words:
                self._keyword_index[word].append(meta)

    def _tokenize(self, text: str) -> List[str]:
        text = text.lower()
        words = re.findall(r'[\w\u4e00-\u9fa5]+', text)
        return [w for w in words if len(w) > 1]

    def _filter_by_paper_ids(
        self,
        results: List[Dict[str, Any]],
        scores: List[float],
        paper_ids: Optional[List[str]],
    ) -> Tuple[List[Dict[str, Any]], List[float]]:
        if not paper_ids:
            return results, scores
        filtered_results = []
        filtered_scores = []
        for result, score in zip(results, scores):
            if result.get("paper_id") in paper_ids:
                filtered_results.append(result)
                filtered_scores.append(score)
        return filtered_results, filtered_scores

    def semantic_search(
        self,
        query: str,
        top_k: int = 5,
        paper_ids: Optional[List[str]] = None,
        threshold: Optional[float] = None,
    ) -> List[QASearchResult]:
        self._ensure_initialized()
        if self._embedding_model is None or self._vector_store is None:
            return []

        query_vector = self._embedding_model.get_embedding(query)
        scores, results = self._vector_store.search(
            query_vector=query_vector,
            top_k=top_k * 2,
            threshold=threshold,
        )

        results, scores = self._filter_by_paper_ids(results, scores, paper_ids)

        search_results = []
        for score, meta in zip(scores[:top_k], results[:top_k]):
            search_results.append(
                QASearchResult(
                    reference=QAReference(
                        paper_id=meta.get("paper_id", ""),
                        paper_title=meta.get("paper_title"),
                        chunk_id=meta.get("chunk_id"),
                        page_number=meta.get("page_number"),
                        figure_id=meta.get("figure_id"),
                        figure_caption=meta.get("figure_caption"),
                        figure_url=meta.get("figure_url"),
                        text=meta.get("content", ""),
                        score=score,
                    ),
                    content=meta.get("content", ""),
                    score=score,
                    retrieval_method="semantic",
                )
            )
        return search_results

    def keyword_search(
        self,
        query: str,
        top_k: int = 5,
        paper_ids: Optional[List[str]] = None,
    ) -> List[QASearchResult]:
        self._ensure_initialized()
        query_words = self._tokenize(query)
        if not query_words:
            return []

        doc_scores: Dict[str, float] = defaultdict(float)
        doc_meta: Dict[str, Dict[str, Any]] = {}

        for word in query_words:
            docs = self._keyword_index.get(word, [])
            for meta in docs:
                doc_id = meta.get("chunk_id", meta.get("paper_id", ""))
                if paper_ids and meta.get("paper_id") not in paper_ids:
                    continue
                doc_scores[doc_id] += 1.0
                doc_meta[doc_id] = meta

        sorted_docs = sorted(doc_scores.items(), key=lambda x: x[1], reverse=True)
        max_score = sorted_docs[0][1] if sorted_docs else 1.0

        search_results = []
        for doc_id, score in sorted_docs[:top_k]:
            normalized_score = score / max_score
            meta = doc_meta[doc_id]
            search_results.append(
                QASearchResult(
                    reference=QAReference(
                        paper_id=meta.get("paper_id", ""),
                        paper_title=meta.get("paper_title"),
                        chunk_id=meta.get("chunk_id"),
                        page_number=meta.get("page_number"),
                        figure_id=meta.get("figure_id"),
                        figure_caption=meta.get("figure_caption"),
                        figure_url=meta.get("figure_url"),
                        text=meta.get("content", ""),
                        score=normalized_score,
                    ),
                    content=meta.get("content", ""),
                    score=normalized_score,
                    retrieval_method="keyword",
                )
            )
        return search_results

    def hybrid_search(
        self,
        query: str,
        top_k: int = 5,
        paper_ids: Optional[List[str]] = None,
        semantic_weight: float = 0.6,
        keyword_weight: float = 0.4,
    ) -> List[QASearchResult]:
        semantic_results = self.semantic_search(
            query=query, top_k=top_k * 2, paper_ids=paper_ids,
        )
        keyword_results = self.keyword_search(
            query=query, top_k=top_k * 2, paper_ids=paper_ids,
        )

        merged_scores: Dict[str, Tuple[float, QASearchResult]] = {}
        for result in semantic_results:
            doc_id = result.reference.chunk_id or result.reference.paper_id
            merged_scores[doc_id] = (result.score * semantic_weight, result)

        for result in keyword_results:
            doc_id = result.reference.chunk_id or result.reference.paper_id
            if doc_id in merged_scores:
                current_score, orig_result = merged_scores[doc_id]
                new_score = current_score + result.score * keyword_weight
                orig_result.retrieval_method = "hybrid"
                orig_result.score = new_score
                orig_result.reference.score = new_score
                merged_scores[doc_id] = (new_score, orig_result)
            else:
                merged_scores[doc_id] = (result.score * keyword_weight, result)

        sorted_results = sorted(merged_scores.values(), key=lambda x: x[0], reverse=True)
        return [result for _, result in sorted_results[:top_k]]

    def rerank(
        self,
        query: str,
        results: List[QASearchResult],
        top_k: int = 5,
    ) -> List[QASearchResult]:
        if not results:
            return []

        try:
            from sentence_transformers import CrossEncoder
            reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
            pairs = [(query, result.content) for result in results]
            scores = reranker.predict(pairs)
            for result, score in zip(results, scores):
                result.score = float(score)
                result.reference.score = float(score)
                result.retrieval_method = f"{result.retrieval_method}+rerank"
            results = sorted(results, key=lambda x: x.score, reverse=True)
        except Exception:
            pass

        return results[:top_k]

    def search(
        self,
        query: str,
        top_k: int = 5,
        paper_ids: Optional[List[str]] = None,
        use_hybrid: bool = True,
        use_rerank: bool = True,
    ) -> List[QASearchResult]:
        if use_hybrid:
            results = self.hybrid_search(
                query=query, top_k=top_k * 2 if use_rerank else top_k, paper_ids=paper_ids,
            )
        else:
            results = self.semantic_search(
                query=query, top_k=top_k * 2 if use_rerank else top_k, paper_ids=paper_ids,
            )

        if use_rerank and results:
            results = self.rerank(query=query, results=results, top_k=top_k)

        return results

    def refresh_index(self) -> None:
        self._initialized = False
        self._keyword_index.clear()
        self._ensure_initialized()


_retriever: Optional[Retriever] = None


def get_retriever() -> Retriever:
    global _retriever
    if _retriever is None:
        _retriever = Retriever()
    return _retriever


retriever = Retriever()
