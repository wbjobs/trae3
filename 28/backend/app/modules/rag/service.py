import uuid
from typing import List, Optional, Dict, Any, Iterator, Tuple
from collections import defaultdict

from app.modules.rag.retriever import Retriever, retriever
from app.modules.rag.prompt_builder import PromptBuilder, prompt_builder
from app.modules.rag.llm_service import LLMService, llm_service
from app.modules.rag.chain_builder import ChainBuilder, chain_builder
from app.schemas.qa import (
    QAQuestion,
    QAResponse,
    QASearchResult,
    QAReference,
)


class ConversationManager:
    def __init__(self, max_history: int = 10):
        self._conversations: Dict[str, List[Dict[str, str]]] = defaultdict(list)
        self.max_history = max_history

    def get_conversation_id(self, conversation_id: Optional[str] = None) -> str:
        if conversation_id and conversation_id in self._conversations:
            return conversation_id
        return str(uuid.uuid4())

    def add_message(
        self,
        conversation_id: str,
        question: str,
        answer: str,
    ) -> None:
        self._conversations[conversation_id].append({
            "question": question,
            "answer": answer,
        })

        if len(self._conversations[conversation_id]) > self.max_history:
            self._conversations[conversation_id] = (
                self._conversations[conversation_id][-self.max_history:]
            )

    def get_history(self, conversation_id: str) -> List[Dict[str, str]]:
        return self._conversations.get(conversation_id, [])

    def clear_conversation(self, conversation_id: str) -> None:
        if conversation_id in self._conversations:
            del self._conversations[conversation_id]

    def get_all_conversations(self) -> Dict[str, List[Dict[str, str]]]:
        return dict(self._conversations)


class RAGService:
    def __init__(
        self,
        retriever_instance: Optional[Retriever] = None,
        prompt_builder_instance: Optional[PromptBuilder] = None,
        llm_service_instance: Optional[LLMService] = None,
        chain_builder_instance: Optional[ChainBuilder] = None,
        max_history: int = 10,
    ):
        self.retriever = retriever_instance or retriever
        self.prompt_builder = prompt_builder_instance or prompt_builder
        self.llm_service = llm_service_instance or llm_service
        self.chain_builder = chain_builder_instance or chain_builder
        self.conversation_manager = ConversationManager(max_history=max_history)

    def retrieve(
        self,
        question: str,
        top_k: int = 5,
        paper_ids: Optional[List[str]] = None,
        use_hybrid: bool = True,
        use_rerank: bool = True,
    ) -> List[QASearchResult]:
        return self.retriever.search(
            query=question,
            top_k=top_k,
            paper_ids=paper_ids,
            use_hybrid=use_hybrid,
            use_rerank=use_rerank,
        )

    def _merge_references(
        self,
        search_results: List[QASearchResult],
    ) -> List[QAReference]:
        paper_groups: Dict[str, List[QASearchResult]] = defaultdict(list)

        for result in search_results:
            paper_id = result.reference.paper_id
            paper_groups[paper_id].append(result)

        references = []
        for paper_id, results in paper_groups.items():
            best_result = max(results, key=lambda r: r.score)
            ref = best_result.reference.model_copy()
            ref.score = best_result.score

            related_chunks = []
            for r in results:
                chunk_info = {
                    "chunk_id": r.reference.chunk_id,
                    "page_number": r.reference.page_number,
                    "text": r.reference.text,
                    "score": r.score,
                }
                related_chunks.append(chunk_info)

            ref.metadata = {
                **(ref.metadata or {}),
                "related_chunks": related_chunks,
                "chunk_count": len(results),
            }

            references.append(ref)

        references.sort(key=lambda r: r.score or 0, reverse=True)
        return references

    def _prepare_inputs(
        self,
        qa_question: QAQuestion,
    ) -> Tuple[Dict[str, Any], str]:
        conversation_id = self.conversation_manager.get_conversation_id(
            qa_question.conversation_id
        )

        history = qa_question.history or self.conversation_manager.get_history(
            conversation_id
        )

        inputs = {
            "question": qa_question.question,
            "top_k": qa_question.top_k,
            "paper_ids": qa_question.paper_ids,
            "use_hybrid": True,
            "use_rerank": qa_question.use_rerank,
            "history": history,
            "conversation_id": conversation_id,
        }

        return inputs, conversation_id

    def ask(
        self,
        qa_question: QAQuestion,
    ) -> QAResponse:
        inputs, conversation_id = self._prepare_inputs(qa_question)

        if inputs["history"]:
            chain = self.chain_builder.build_full_rag_chain()
        else:
            chain = self.chain_builder.build_simple_rag_chain()

        result = chain.invoke(inputs)

        references = self._merge_references(result["search_results"])

        self.conversation_manager.add_message(
            conversation_id=conversation_id,
            question=qa_question.question,
            answer=result["answer"],
        )

        paper_ids = list({ref.paper_id for ref in references})

        return QAResponse(
            answer=result["answer"],
            references=references,
            conversation_id=conversation_id,
            metadata={
                "retrieval_method": result["search_results"][0].retrieval_method
                if result["search_results"]
                else "none",
                "result_count": len(result["search_results"]),
                "paper_ids": paper_ids,
                "used_history": len(inputs["history"]) > 0,
            },
        )

    def ask_stream(
        self,
        qa_question: QAQuestion,
    ) -> Iterator[str]:
        inputs, conversation_id = self._prepare_inputs(qa_question)

        retrieval_chain = self.chain_builder.build_retrieval_chain()
        retrieval_result = retrieval_chain.invoke(inputs)

        search_results = retrieval_result["search_results"]

        qa_chain = self.chain_builder.build_qa_chain()
        full_inputs = {
            **inputs,
            "search_results": search_results,
        }

        full_answer = ""
        for chunk in qa_chain.stream(full_inputs):
            full_answer += chunk
            yield chunk

        self.conversation_manager.add_message(
            conversation_id=conversation_id,
            question=qa_question.question,
            answer=full_answer,
        )

    def ask_with_streaming(
        self,
        qa_question: QAQuestion,
    ) -> Tuple[Iterator[str], str, List[QAReference], List[QASearchResult]]:
        inputs, conversation_id = self._prepare_inputs(qa_question)

        retrieval_chain = self.chain_builder.build_retrieval_chain()
        retrieval_result = retrieval_chain.invoke(inputs)

        search_results = retrieval_result["search_results"]
        references = self._merge_references(search_results)

        qa_chain = self.chain_builder.build_qa_chain()
        full_inputs = {
            **inputs,
            "search_results": search_results,
        }

        def stream_generator() -> Iterator[str]:
            full_answer = ""
            for chunk in qa_chain.stream(full_inputs):
                full_answer += chunk
                yield chunk

            self.conversation_manager.add_message(
                conversation_id=conversation_id,
                question=qa_question.question,
                answer=full_answer,
            )

        return stream_generator(), conversation_id, references, search_results

    def clear_conversation(self, conversation_id: str) -> bool:
        self.conversation_manager.clear_conversation(conversation_id)
        return True

    def get_conversation_history(
        self,
        conversation_id: str,
    ) -> List[Dict[str, str]]:
        return self.conversation_manager.get_history(conversation_id)

    def refresh_retriever(self) -> None:
        self.retriever.refresh_index()


rag_service = RAGService()
