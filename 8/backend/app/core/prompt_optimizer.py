import re
import logging
import hashlib
from typing import List, Dict, Optional, Tuple
from functools import lru_cache
from app.config import (
    CONTEXT_MAX_TOKENS,
    CONTEXT_RERANK_TOP_K,
    PROMPT_COMPRESSION_ENABLED,
    LLM_CACHE_SIZE,
    CACHE_ENABLED,
)

logger = logging.getLogger(__name__)


class LRUCache:
    def __init__(self, capacity: int):
        self.capacity = capacity
        self.cache: Dict[str, str] = {}
        self.order: List[str] = []

    def get(self, key: str) -> Optional[str]:
        if key in self.cache:
            self.order.remove(key)
            self.order.append(key)
            return self.cache[key]
        return None

    def put(self, key: str, value: str):
        if key in self.cache:
            self.order.remove(key)
        elif len(self.cache) >= self.capacity:
            oldest = self.order.pop(0)
            del self.cache[oldest]
        self.cache[key] = value
        self.order.append(key)


_llm_cache = LRUCache(LLM_CACHE_SIZE) if CACHE_ENABLED else None


def _hash_key(question: str, context: str) -> str:
    combined = f"{question}|{context[:500]}"
    return hashlib.md5(combined.encode('utf-8')).hexdigest()


def get_cached_answer(question: str, context: str) -> Optional[str]:
    if not CACHE_ENABLED or _llm_cache is None:
        return None
    key = _hash_key(question, context)
    cached = _llm_cache.get(key)
    if cached:
        logger.debug("LLM cache hit")
    return cached


def put_cached_answer(question: str, context: str, answer: str):
    if not CACHE_ENABLED or _llm_cache is None:
        return
    key = _hash_key(question, context)
    _llm_cache.put(key, answer)


def compress_context(context: str, max_tokens: int = CONTEXT_MAX_TOKENS) -> str:
    if len(context) <= max_tokens:
        return context

    if not PROMPT_COMPRESSION_ENABLED:
        return context[:max_tokens]

    lines = context.split('\n')
    compressed_lines = []
    current_length = 0

    for line in lines:
        line = line.strip()
        if not line:
            continue

        line = re.sub(r'\s+', ' ', line)
        line = re.sub(r'[，。；：！？、,.;:!?]\s*', lambda m: m.group(0), line)

        if current_length + len(line) + 1 <= max_tokens:
            compressed_lines.append(line)
            current_length += len(line) + 1
        else:
            remaining = max_tokens - current_length
            if remaining > 50:
                compressed_lines.append(line[:remaining])
            break

    result = '\n'.join(compressed_lines)
    logger.debug(f"Context compressed from {len(context)} to {len(result)} chars")
    return result


def rerank_results(results: List[Dict], query: str, top_k: int = CONTEXT_RERANK_TOP_K) -> List[Dict]:
    if len(results) <= top_k:
        return results

    query_keywords = extract_keywords(query)

    scored = []
    for r in results:
        content = r.get('content', '')
        score = r.get('score', 0.0)

        keyword_hits = sum(1 for kw in query_keywords if kw and kw in content)
        keyword_bonus = min(keyword_hits * 0.05, 0.3)

        sentence_count = len(re.split(r'[。！？.!?]', content))
        length_bonus = min(sentence_count * 0.01, 0.1)

        final_score = score + keyword_bonus + length_bonus
        scored.append((final_score, r))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [r for _, r in scored[:top_k]]


def extract_keywords(text: str) -> List[str]:
    text = re.sub(r'[^\w\u4e00-\u9fff]', ' ', text)
    words = text.split()
    keywords = [w for w in words if len(w) >= 2]

    stopwords = {'的', '了', '是', '在', '和', '与', '及', '或', '其', '这', '那', '什么', '怎么', '如何', '为什么', '吗', '呢', '啊', '吧'}
    keywords = [w for w in keywords if w not in stopwords]

    return list(dict.fromkeys(keywords))[:10]


def format_context_compact(search_results: List[Dict], max_tokens: int = CONTEXT_MAX_TOKENS) -> str:
    filtered_results = rerank_results(search_results, "", CONTEXT_RERANK_TOP_K)

    context_parts = []
    current_length = 0

    for i, result in enumerate(filtered_results, 1):
        filename = result.get("filename", "未知文档")
        page_number = result.get("page_number")
        page_info = f", 第{page_number}页" if page_number else ""
        content = result.get("content", "")

        header = f"[{i}] {filename}{page_info}"
        content_len = max_tokens - current_length - len(header) - 4

        if content_len < 50:
            break

        if len(content) > content_len:
            content = content[:content_len] + "..."

        entry = f"{header}\n{content}"
        context_parts.append(entry)
        current_length += len(entry) + 2

    result = "\n\n".join(context_parts)
    logger.debug(f"Formatted context: {len(result)} chars, {len(filtered_results)} sources")
    return result


def build_compressed_prompt(question: str, context: str) -> Tuple[str, str]:
    compressed_context = compress_context(context, CONTEXT_MAX_TOKENS)

    system_prompt = """你是文档问答助手。
规则：
1. 只基于上下文回答，无信息则说"无法回答"
2. 答案简洁，控制在500字内
3. 用[1][2]标注来源，不要写"来源:"字样"""

    user_prompt = f"""{system_prompt}

上下文：
{compressed_context}

问题：{question}

回答："""

    return user_prompt, compressed_context
