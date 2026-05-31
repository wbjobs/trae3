from typing import List, Optional, Dict, Any, Iterator, Tuple
from sqlalchemy.orm import Session

from app.services.base import BaseService
from app.models.qa import QA
from app.schemas.qa import QACreate, QAOut, QAQuestion, QAResponse
from app.modules.rag.service import RAGService, rag_service


class QAService(BaseService[QA, QACreate, QACreate]):
    def __init__(self):
        super().__init__(QA)
        self.rag_service: RAGService = rag_service

    def _extract_context_from_references(
        self,
        references: List[Any],
    ) -> str:
        context_parts = []
        for i, ref in enumerate(references, 1):
            context_parts.append(
                f"[{i}] {ref.paper_title or '未知论文'} "
                f"(页码: {ref.page_number or '未知'})\n{ref.text or ''}"
            )
        return "\n\n".join(context_parts)

    def ask(
        self,
        db: Session,
        question: QAQuestion,
        user_id: Optional[int] = None,
    ) -> QAResponse:
        rag_response = self.rag_service.ask(question)

        context = self._extract_context_from_references(rag_response.references)
        paper_ids = [ref.paper_id for ref in rag_response.references]

        qa_create = QACreate(
            question=question.question,
            answer=rag_response.answer,
            context=context,
            paper_ids=paper_ids,
            metadata={
                **rag_response.metadata,
                "references": [ref.model_dump() for ref in rag_response.references],
                "conversation_id": rag_response.conversation_id,
            },
            created_by=user_id,
        )

        self.create(db, obj_in=qa_create)

        return rag_response

    def ask_stream(
        self,
        db: Session,
        question: QAQuestion,
        user_id: Optional[int] = None,
    ) -> Tuple[Iterator[str], QAResponse]:
        stream_gen, conversation_id, references, search_results = self.rag_service.ask_with_streaming(
            question
        )

        context = self._extract_context_from_references(references)
        paper_ids = [ref.paper_id for ref in references]

        rag_response = QAResponse(
            answer="",
            references=references,
            conversation_id=conversation_id,
            metadata={
                "retrieval_method": search_results[0].retrieval_method
                if search_results
                else "none",
                "result_count": len(references),
                "paper_ids": paper_ids,
                "used_history": bool(question.history) or bool(question.conversation_id),
            },
        )

        def stream_with_save() -> Iterator[str]:
            full_answer = ""
            for chunk in stream_gen:
                if isinstance(chunk, bytes):
                    chunk = chunk.decode("utf-8", errors="replace")
                full_answer += chunk
                yield chunk

            rag_response.answer = full_answer

            qa_create = QACreate(
                question=question.question,
                answer=full_answer,
                context=context,
                paper_ids=paper_ids,
                metadata={
                    **rag_response.metadata,
                    "references": [ref.model_dump() for ref in references],
                    "conversation_id": conversation_id,
                },
                created_by=user_id,
            )

            self.create(db, obj_in=qa_create)

        return stream_with_save(), rag_response

    def retrieve_only(
        self,
        question: str,
        top_k: int = 5,
        paper_ids: Optional[List[str]] = None,
        use_rerank: bool = True,
    ) -> List[Any]:
        return self.rag_service.retrieve(
            question=question,
            top_k=top_k,
            paper_ids=paper_ids,
            use_rerank=use_rerank,
        )

    def get_by_user(
        self,
        db: Session,
        user_id: int,
        skip: int = 0,
        limit: int = 100,
    ) -> List[QA]:
        return (
            db.query(self.model)
            .filter(self.model.created_by == user_id)
            .filter(self.model.is_active == True)
            .order_by(self.model.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def count_by_user(
        self,
        db: Session,
        user_id: int,
    ) -> int:
        return (
            db.query(self.model)
            .filter(self.model.created_by == user_id)
            .filter(self.model.is_active == True)
            .count()
        )

    def search_qa_history(
        self,
        db: Session,
        keyword: str,
        user_id: Optional[int] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[QA]:
        query = db.query(self.model).filter(self.model.is_active == True)

        if user_id:
            query = query.filter(self.model.created_by == user_id)

        if keyword:
            query = query.filter(
                self.model.question.ilike(f"%{keyword}%")
                | self.model.answer.ilike(f"%{keyword}%")
            )

        return query.order_by(self.model.created_at.desc()).offset(skip).limit(limit).all()

    def clear_conversation(self, conversation_id: str) -> bool:
        return self.rag_service.clear_conversation(conversation_id)

    def get_conversation_history(
        self,
        conversation_id: str,
    ) -> List[Dict[str, str]]:
        return self.rag_service.get_conversation_history(conversation_id)

    def refresh_retriever(self) -> None:
        self.rag_service.refresh_retriever()


qa_service = QAService()
