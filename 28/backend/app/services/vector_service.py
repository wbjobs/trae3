from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session

from app.services.base import BaseService
from app.models.vector import Vector
from app.schemas.vector import VectorStoreRequest, VectorSearchRequest
from app.modules.vector_store.service import vector_store_service


class VectorService(BaseService[Vector, VectorStoreRequest, VectorStoreRequest]):
    def __init__(self):
        super().__init__(Vector)

    def store_text(
        self,
        db: Session,
        request: VectorStoreRequest,
    ) -> List[Vector]:
        return vector_store_service.store_text(
            db=db,
            paper_id=request.paper_id,
            content_type=request.content_type,
            content=request.content,
            metadata=request.metadata,
            chunk_size=request.chunk_size,
            chunk_overlap=request.chunk_overlap,
        )

    def search(
        self,
        db: Session,
        request: VectorSearchRequest,
    ) -> List[tuple[float, Vector]]:
        return vector_store_service.search_with_db_records(
            db=db,
            query=request.query,
            top_k=request.top_k,
            paper_id=request.paper_id,
            content_type=request.content_type,
            threshold=request.threshold,
        )

    def delete_by_paper_id(self, db: Session, paper_id: int) -> bool:
        return vector_store_service.delete_by_paper_id(db, paper_id)

    def delete_by_vector_id(self, db: Session, vector_id: str) -> bool:
        return vector_store_service.delete_by_vector_id(db, vector_id)

    def get_stats(self, db: Session) -> Dict[str, Any]:
        return vector_store_service.get_stats(db)

    def clear_all(self, db: Session) -> None:
        vector_store_service.clear_all(db)

    def rebuild_index(self, db: Session) -> int:
        return vector_store_service.rebuild_index(db)

    def get_by_vector_id(self, db: Session, vector_id: str) -> Optional[Vector]:
        return db.query(Vector).filter(Vector.vector_id == vector_id).first()

    def get_by_paper_id(self, db: Session, paper_id: int) -> List[Vector]:
        return db.query(Vector).filter(Vector.paper_id == paper_id).all()

    def get_by_content_type(self, db: Session, content_type: str) -> List[Vector]:
        return db.query(Vector).filter(Vector.content_type == content_type).all()


vector_service = VectorService()
