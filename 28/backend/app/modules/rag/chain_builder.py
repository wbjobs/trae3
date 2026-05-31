from typing import List, Optional, Dict, Any, Union, Iterator
from abc import ABC, abstractmethod

from langchain_core.runnables import Runnable, RunnableLambda, RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser
from langchain_core.messages import BaseMessage
from langchain_core.documents import Document

from app.modules.rag.retriever import Retriever, retriever
from app.modules.rag.prompt_builder import PromptBuilder, prompt_builder
from app.modules.rag.llm_service import LLMService, get_llm_service
from app.schemas.qa import QASearchResult, QAReference


class BaseChain(ABC):
    @abstractmethod
    def invoke(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        pass

    @abstractmethod
    def stream(self, inputs: Dict[str, Any]) -> Iterator[str]:
        pass


class RetrievalChain(BaseChain):
    def __init__(
        self,
        retriever_instance: Optional[Retriever] = None,
    ):
        self.retriever = retriever_instance or retriever

    def invoke(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        question = inputs["question"]
        top_k = inputs.get("top_k", 5)
        paper_ids = inputs.get("paper_ids")
        use_hybrid = inputs.get("use_hybrid", True)
        use_rerank = inputs.get("use_rerank", True)

        search_results = self.retriever.search(
            query=question,
            top_k=top_k,
            paper_ids=paper_ids,
            use_hybrid=use_hybrid,
            use_rerank=use_rerank,
        )

        return {
            "question": question,
            "search_results": search_results,
            **inputs,
        }

    def stream(self, inputs: Dict[str, Any]) -> Iterator[str]:
        result = self.invoke(inputs)
        yield str(result)


class QuestionCondenseChain(BaseChain):
    def __init__(
        self,
        llm_service_instance: Optional[LLMService] = None,
        prompt_builder_instance: Optional[PromptBuilder] = None,
    ):
        self.llm_service = llm_service_instance or get_llm_service()
        self.prompt_builder = prompt_builder_instance or prompt_builder

    def invoke(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        question = inputs["question"]
        history = inputs.get("history", [])

        if not history:
            return {"condensed_question": question, **inputs}

        condense_prompt = self.prompt_builder.build_condense_prompt(
            question=question,
            history=history,
        )

        condensed_question = self.llm_service.generate(condense_prompt)
        condensed_question = condensed_question.strip()

        return {
            "condensed_question": condensed_question,
            "original_question": question,
            **inputs,
        }

    def stream(self, inputs: Dict[str, Any]) -> Iterator[str]:
        result = self.invoke(inputs)
        yield result["condensed_question"]


class QAChain(BaseChain):
    def __init__(
        self,
        llm_service_instance: Optional[LLMService] = None,
        prompt_builder_instance: Optional[PromptBuilder] = None,
    ):
        self.llm_service = llm_service_instance or get_llm_service()
        self.prompt_builder = prompt_builder_instance or prompt_builder
        self.output_parser = StrOutputParser()

    def _build_langchain_chain(self, inputs: Dict[str, Any]) -> Runnable:
        search_results: List[QASearchResult] = inputs["search_results"]
        history = inputs.get("history", [])
        question = inputs.get("condensed_question", inputs["question"])

        prompt = self.prompt_builder.build_qa_prompt(
            question=question,
            search_results=search_results,
            history=history,
        )

        llm = self.llm_service.get_llm()

        return prompt | llm | self.output_parser

    def invoke(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        chain = self._build_langchain_chain(inputs)
        prompt_inputs = self.prompt_builder.get_prompt_inputs(
            question=inputs.get("condensed_question", inputs["question"]),
            search_results=inputs["search_results"],
            history=inputs.get("history", []),
        )

        answer = chain.invoke(prompt_inputs)

        search_results: List[QASearchResult] = inputs["search_results"]
        references = self.prompt_builder.extract_references(search_results)

        return {
            "answer": answer,
            "references": references,
            "search_results": search_results,
            **inputs,
        }

    def stream(self, inputs: Dict[str, Any]) -> Iterator[str]:
        chain = self._build_langchain_chain(inputs)
        prompt_inputs = self.prompt_builder.get_prompt_inputs(
            question=inputs.get("condensed_question", inputs["question"]),
            search_results=inputs["search_results"],
            history=inputs.get("history", []),
        )

        for chunk in chain.stream(prompt_inputs):
            yield chunk


class ChainBuilder:
    def __init__(
        self,
        retriever_instance: Optional[Retriever] = None,
        llm_service_instance: Optional[LLMService] = None,
        prompt_builder_instance: Optional[PromptBuilder] = None,
    ):
        self.retriever = retriever_instance or retriever
        self.llm_service = llm_service_instance or get_llm_service()
        self.prompt_builder = prompt_builder_instance or prompt_builder

    def build_retrieval_chain(self) -> RetrievalChain:
        return RetrievalChain(retriever_instance=self.retriever)

    def build_condense_chain(self) -> QuestionCondenseChain:
        return QuestionCondenseChain(
            llm_service_instance=self.llm_service,
            prompt_builder_instance=self.prompt_builder,
        )

    def build_qa_chain(self) -> QAChain:
        return QAChain(
            llm_service_instance=self.llm_service,
            prompt_builder_instance=self.prompt_builder,
        )

    def build_full_rag_chain(self) -> Runnable:
        condense_chain = self.build_condense_chain()
        retrieval_chain = self.build_retrieval_chain()
        qa_chain = self.build_qa_chain()

        def run_condense(inputs: Dict[str, Any]) -> Dict[str, Any]:
            return condense_chain.invoke(inputs)

        def run_retrieval(inputs: Dict[str, Any]) -> Dict[str, Any]:
            inputs["question"] = inputs.get("condensed_question", inputs["question"])
            return retrieval_chain.invoke(inputs)

        def run_qa(inputs: Dict[str, Any]) -> Dict[str, Any]:
            return qa_chain.invoke(inputs)

        full_chain = (
            RunnableLambda(run_condense)
            | RunnableLambda(run_retrieval)
            | RunnableLambda(run_qa)
        )

        return full_chain

    def build_simple_rag_chain(self) -> Runnable:
        retrieval_chain = self.build_retrieval_chain()
        qa_chain = self.build_qa_chain()

        def run_retrieval(inputs: Dict[str, Any]) -> Dict[str, Any]:
            return retrieval_chain.invoke(inputs)

        def run_qa(inputs: Dict[str, Any]) -> Dict[str, Any]:
            return qa_chain.invoke(inputs)

        return RunnableLambda(run_retrieval) | RunnableLambda(run_qa)


chain_builder = ChainBuilder()
