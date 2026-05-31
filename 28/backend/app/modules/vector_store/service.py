import os
import uuid
import numpy as np
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.vector import Vector
from app.modules.vector_store.faiss_store import FAISSVectorStore
from app.modules.vector_store.embedding_service import embedding_service


class VectorStoreService:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        index_path = os.path.join(settings.VECTOR_STORE_PATH, "faiss.index")
        metadata_path = os.path.join(settings.VECTOR_STORE_PATH, "metadata.npy")
        self.vector_store = FAISSVectorStore(
            dimension=settings.VECTOR_INDEX_DIMENSION,
            index_path=index_path,
            metadata_path=metadata_path,
        )
        self.embedding_service = embedding_service

    def store_text(
        self,
        db: Session,
        paper_id: Optional[int],
        content_type: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
        chunk_size: int = 500,
        chunk_overlap: int = 50,
    ) -> List[Vector]:
        if metadata is None:
            metadata = {}

        chunks = self.embedding_service.split_text(content, chunk_size, chunk_overlap)
        if not chunks:
            return []

        embeddings = self.embedding_service.get_embeddings(chunks)

        vectors = []
        faiss_metadata = []

        for i, chunk in enumerate(chunks):
            vector_id = f"vec_{uuid.uuid4().hex}"

            chunk_metadata = {
                **metadata,
                "paper_id": paper_id,
                "content_type": content_type,
                "chunk_index": i,
                "total_chunks": len(chunks),
                "vector_id": vector_id,
            }

            vector = Vector(
                paper_id=paper_id,
                content_type=content_type,
                content=chunk,
                metadata=chunk_metadata,
                vector_id=vector_id,
            )
            vectors.append(vector)
            faiss_metadata.append(chunk_metadata)

        db.add_all(vectors)
        db.commit()

        for vector in vectors:
            db.refresh(vector)

        embeddings_np = np.array(embeddings, dtype=np.float32)
        self.vector_store.add_vectors(embeddings_np, faiss_metadata)

        return vectors

    def search(
        self,
        query: str,
        top_k: int = 5,
        paper_id: Optional[int] = None,
        content_type: Optional[str] = None,
        threshold: Optional[float] = None,
    ) -> List[Tuple[float, Dict[str, Any]]]:
        query_vector = self.embedding_service.get_embedding(query)

        filters: Dict[str, Any] = {}
        if paper_id is not None:
            filters["paper_id"] = paper_id
        if content_type is not None:
            filters["content_type"] = content_type

        scores, metadata_list = self.vector_store.search(
            query_vector=query_vector,
            top_k=top_k,
            filters=filters if filters else None,
            threshold=threshold,
        )

        results = []
        for score, meta in zip(scores, metadata_list):
            results.append((score, meta))

        return results

    def search_with_db_records(
        self,
        db: Session,
        query: str,
        top_k: int = 5,
        paper_id: Optional[int] = None,
        content_type: Optional[str] = None,
        threshold: Optional[float] = None,
    ) -> List[Tuple[float, Vector]]:
        results = self.search(query, top_k, paper_id, content_type, threshold)

        vector_ids = [meta["vector_id"] for _, meta in results]
        score_map = {meta["vector_id"]: score for score, meta in results}

        if not vector_ids:
            return []

        db_vectors = db.query(Vector).filter(Vector.vector_id.in_(vector_ids)).all()

        ordered_results = []
        for vector_id in vector_ids:
            for vec in db_vectors:
                if vec.vector_id == vector_id:
                    ordered_results.append((score_map[vector_id], vec))
                    break

        return ordered_results

    def delete_by_paper_id(self, db: Session, paper_id: int) -> bool:
        deleted = self.vector_store.delete_by_metadata({"paper_id": paper_id})
        db.query(Vector).filter(Vector.paper_id == paper_id).delete()
        db.commit()
        return deleted

    def delete_by_vector_id(self, db: Session, vector_id: str) -> bool:
        deleted = self.vector_store.delete_by_metadata({"vector_id": vector_id})
        db.query(Vector).filter(Vector.vector_id == vector_id).delete()
        db.commit()
        return deleted

    def get_stats(self, db: Session) -> Dict[str, Any]:
        total = self.vector_store.total_vectors

        by_content_type: Dict[str, int] = {}
        by_paper: Dict[int, int] = {}

        for meta in self.vector_store.metadata:
            ct = meta.get("content_type", "unknown")
            by_content_type[ct] = by_content_type.get(ct, 0) + 1

            pid = meta.get("paper_id")
            if pid is not None:
                by_paper[pid] = by_paper.get(pid, 0) + 1

        return {
            "total_vectors": total,
            "by_content_type": by_content_type,
            "by_paper": by_paper,
        }

    def clear_all(self, db: Session) -> None:
        self.vector_store.clear()
        db.query(Vector).delete()
        db.commit()

    def rebuild_index(self, db: Session) -> int:
        all_vectors = db.query(Vector).all()

        if not all_vectors:
            self.vector_store.clear()
            return 0

        embeddings = self.embedding_service.get_embeddings([v.content for v in all_vectors])
        metadata_list = [v.metadata for v in all_vectors]

        self.vector_store.clear()
        self.vector_store.add_vectors(
            np.array(embeddings, dtype=np.float32),
            metadata_list,
        )

        return len(all_vectors)


vector_store_service = VectorStoreService()
