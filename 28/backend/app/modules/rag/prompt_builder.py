from typing import List, Optional, Dict, Any
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder, PromptTemplate
from langchain_core.messages import HumanMessage, AIMessage, BaseMessage

from app.schemas.qa import QASearchResult, QAReference
from app.core.config import settings


class PromptBuilder:
    RAG_SYSTEM_PROMPT = """你是专业的学术助手。

核心规则：
1. 仅使用提供的上下文信息回答
2. 信息不足时明确告知用户
3. 引用使用 [编号] 格式，如 [1][2]
4. 图表和公式需清晰说明
5. 结合上下文理解多轮对话意图
6. 使用与问题相同的语言回答

检索上下文：
{context}
"""

    CONTEXT_ITEM_TEMPLATE = """[{index}] {paper_title} (P.{page}) | 相关度 {score:.2f}{figure_info}
{content}
"""

    CONDENSE_QUESTION_PROMPT = """根据对话历史和最新问题，生成独立完整的问题。

对话历史:
{chat_history}

最新问题: {question}

请只输出改写后的问题："""

    def __init__(
        self,
        max_context_length: Optional[int] = None,
        min_relevance_score: Optional[float] = None,
        max_references: Optional[int] = None,
    ):
        self.max_context_length = max_context_length or settings.RAG_PROMPT_MAX_LENGTH
        self.min_relevance_score = min_relevance_score or settings.RAG_MIN_RELEVANCE_SCORE
        self.max_references = max_references or settings.RAG_MAX_REFERENCES

        self.qa_prompt = ChatPromptTemplate.from_messages([
            ("system", self.RAG_SYSTEM_PROMPT),
            MessagesPlaceholder(variable_name="chat_history", optional=True),
            ("human", "{question}"),
        ])

        self.condense_question_prompt = PromptTemplate.from_template(
            self.CONDENSE_QUESTION_PROMPT
        )

    def _format_context(
        self,
        search_results: List[QASearchResult],
    ) -> str:
        filtered_results = [
            r for r in search_results
            if r.score >= self.min_relevance_score
        ][:self.max_references]

        if not filtered_results:
            return "无有效上下文信息"

        context_parts = []
        current_length = 0

        for i, result in enumerate(filtered_results, 1):
            ref = result.reference

            figure_info = ""
            if ref.figure_id or ref.figure_caption:
                parts = []
                if ref.figure_id:
                    parts.append(f"图 {ref.figure_id}")
                if ref.figure_caption:
                    parts.append(ref.figure_caption[:100])
                if ref.figure_url:
                    parts.append(f"链接: {ref.figure_url}")
                figure_info = " | " + " | ".join(parts)

            content = result.content.strip()
            if len(content) > 500:
                content = content[:497] + "..."

            item_text = self.CONTEXT_ITEM_TEMPLATE.format(
                index=i,
                paper_title=(ref.paper_title or "未知论文")[:50],
                page=ref.page_number or "?",
                score=result.score,
                content=content,
                figure_info=figure_info,
            )

            if current_length + len(item_text) > self.max_context_length:
                remaining = self.max_context_length - current_length
                if remaining > 100:
                    context_parts.append(item_text[:remaining])
                break

            context_parts.append(item_text)
            current_length += len(item_text)

        return "\n".join(context_parts)

    def _format_chat_history(
        self,
        history: Optional[List[Dict[str, str]]],
        max_history: int = 3,
    ) -> List[BaseMessage]:
        if not history:
            return []

        recent_history = history[-max_history:]
        messages = []

        for item in recent_history:
            if "question" in item and "answer" in item:
                messages.append(HumanMessage(content=item["question"][:500]))
                messages.append(AIMessage(content=item["answer"][:1000]))
            elif "human" in item and "ai" in item:
                messages.append(HumanMessage(content=item["human"][:500]))
                messages.append(AIMessage(content=item["ai"][:1000]))
            elif "role" in item and "content" in item:
                if item["role"] == "human":
                    messages.append(HumanMessage(content=item["content"][:500]))
                elif item["role"] == "ai":
                    messages.append(AIMessage(content=item["content"][:1000]))

        return messages

    def build_qa_prompt(
        self,
        question: str,
        search_results: List[QASearchResult],
        history: Optional[List[Dict[str, str]]] = None,
    ) -> ChatPromptTemplate:
        context = self._format_context(search_results)
        return self.qa_prompt.partial(context=context)

    def get_prompt_inputs(
        self,
        question: str,
        search_results: List[QASearchResult],
        history: Optional[List[Dict[str, str]]] = None,
    ) -> Dict[str, Any]:
        context = self._format_context(search_results)
        chat_history = self._format_chat_history(history)
        return {
            "context": context,
            "question": question,
            "chat_history": chat_history,
        }

    def build_condense_prompt(
        self,
        question: str,
        history: List[Dict[str, str]],
    ) -> str:
        history_text = ""
        recent_history = history[-2:]

        for i, item in enumerate(recent_history):
            q = item.get("question", item.get("human", ""))[:200]
            a = item.get("answer", item.get("ai", ""))[:300]
            history_text += f"轮次 {i + 1}:\n用户: {q}\n助手: {a}\n\n"

        return self.condense_question_prompt.format(
            chat_history=history_text,
            question=question,
        )

    def extract_references(
        self,
        search_results: List[QASearchResult],
    ) -> List[QAReference]:
        references = []
        seen_ids = set()

        filtered_results = [
            r for r in search_results
            if r.score >= self.min_relevance_score
        ][:self.max_references]

        for result in filtered_results:
            ref = result.reference
            ref_id = f"{ref.paper_id}-{ref.chunk_id or 'default'}"
            if ref_id not in seen_ids:
                seen_ids.add(ref_id)
                references.append(ref)

        return references


prompt_builder = PromptBuilder()
