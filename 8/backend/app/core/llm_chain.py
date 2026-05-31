import time
import logging
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate
from langchain.schema import StrOutputParser
from typing import List, Dict, AsyncIterator
from app.config import (
    LLM_BASE_URL,
    LLM_API_KEY,
    LLM_MODEL_NAME,
    LLM_TIMEOUT,
    LLM_MAX_RETRIES,
    LLM_MAX_NEW_TOKENS,
    CONTEXT_MAX_TOKENS,
    CONTEXT_RERANK_TOP_K,
)
from app.core.prompt_optimizer import (
    format_context_compact,
    build_compressed_prompt,
    get_cached_answer,
    put_cached_answer,
    rerank_results,
)

logger = logging.getLogger(__name__)

_llm_instance = None


def get_llm():
    global _llm_instance
    if _llm_instance is None:
        _llm_instance = ChatOpenAI(
            openai_api_base=LLM_BASE_URL,
            openai_api_key=LLM_API_KEY,
            model_name=LLM_MODEL_NAME,
            temperature=0.1,
            streaming=True,
            request_timeout=LLM_TIMEOUT,
            max_retries=LLM_MAX_RETRIES,
            max_tokens=LLM_MAX_NEW_TOKENS,
            presence_penalty=-0.1,
            frequency_penalty=-0.1,
        )
    return _llm_instance


COMPRESSED_PROMPT = ChatPromptTemplate.from_template(
    """你是文档问答助手。
规则：
1. 只基于上下文回答，无信息则说"根据现有文档，我无法回答这个问题"
2. 答案简洁，控制在500字内
3. 用[1][2]在句中标注来源

上下文：
{context}

问题：{question}

回答："""
)


def build_qa_chain():
    llm = get_llm()
    chain = COMPRESSED_PROMPT | llm | StrOutputParser()
    return chain


def format_context(search_results: List[Dict]) -> str:
    return format_context_compact(search_results, CONTEXT_MAX_TOKENS)


async def generate_answer_stream(
    question: str,
    search_results: List[Dict],
) -> AsyncIterator[str]:
    reranked = rerank_results(search_results, question, CONTEXT_RERANK_TOP_K)
    context = format_context_compact(reranked, CONTEXT_MAX_TOKENS)

    cached = get_cached_answer(question, context)
    if cached:
        for char in cached:
            yield char
            time.sleep(0.005)
        return

    chain = build_qa_chain()
    answer_chunks: List[str] = []

    try:
        async for chunk in chain.astream({"context": context, "question": question}):
            answer_chunks.append(chunk)
            yield chunk
    except Exception as e:
        logger.error(f"LLM generation failed: {e}")
        raise

    full_answer = "".join(answer_chunks)
    put_cached_answer(question, context, full_answer)


def get_slim_generation_config() -> Dict:
    return {
        "max_new_tokens": LLM_MAX_NEW_TOKENS,
        "temperature": 0.1,
        "top_p": 0.8,
        "top_k": 40,
        "do_sample": False,
        "num_beams": 1,
        "use_cache": True,
    }
