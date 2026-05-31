import os
import json
import time
import asyncio
import logging
import hashlib
import zlib
from functools import lru_cache
from typing import Optional, Any
from collections import OrderedDict
from openai import AsyncOpenAI
from ..config import OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL, LIGHTWEIGHT_MODEL

logger = logging.getLogger(__name__)

_client: Optional[AsyncOpenAI] = None

_semaphore = asyncio.Semaphore(8)
_semaphore_vision = asyncio.Semaphore(4)

_CACHE_TTL = 1800
_MAX_CACHE_SIZE = 2000


class LRUDict(OrderedDict):
    def __init__(self, maxsize: int = 128):
        super().__init__()
        self.maxsize = maxsize

    def __getitem__(self, key):
        value = super().__getitem__(key)
        self.move_to_end(key)
        return value

    def __setitem__(self, key, value):
        super().__setitem__(key, value)
        self.move_to_end(key)
        if len(self) > self.maxsize:
            oldest = next(iter(self))
            del self[oldest]


_cache: LRUDict = LRUDict(maxsize=_MAX_CACHE_SIZE)


def get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            api_key=OPENAI_API_KEY,
            base_url=OPENAI_BASE_URL,
            timeout=60.0,
            max_retries=2,
        )
    return _client


def _get_cache_key(text: str, domain: str, function: str) -> str:
    compressed = zlib.adler32(f"{function}:{domain}:{text}".encode("utf-8"))
    return f"{compressed:08x}"


def _get_cached(cache_key: str) -> Optional[Any]:
    if cache_key in _cache:
        result, timestamp = _cache[cache_key]
        if time.time() - timestamp < _CACHE_TTL:
            return result
        else:
            del _cache[cache_key]
    return None


def _set_cache(cache_key: str, value: Any):
    _cache[cache_key] = (value, time.time())


def _clear_expired_cache():
    now = time.time()
    expired = [k for k, (_, ts) in _cache.items() if now - ts > _CACHE_TTL]
    for k in expired:
        del _cache[k]


def _estimate_timeout(text_length: int, base: float = 30.0, per_k: float = 5.0) -> float:
    return min(90.0, base + (text_length / 1000) * per_k)


async def _retry_with_backoff(coro, max_retries: int = 2, base_delay: float = 0.5):
    last_exception = None
    for attempt in range(max_retries):
        try:
            return await coro
        except Exception as e:
            last_exception = e
            if attempt < max_retries - 1:
                delay = base_delay * (2 ** attempt)
                logger.warning(f"Attempt {attempt + 1} failed: {e}. Retrying in {delay}s...")
                await asyncio.sleep(delay)
    logger.error(f"All {max_retries} attempts failed")
    raise last_exception


async def _clean_json_response(content: str) -> str:
    content = content.strip()

    if content.startswith("```"):
        first_newline = content.find("\n")
        if first_newline > 0:
            content = content[first_newline + 1:]
        else:
            content = content[3:]
        if content.startswith("json"):
            content = content[4:]
        content = content.strip()
    if content.endswith("```"):
        content = content[:-3].strip()

    brace_start = content.find("{")
    bracket_start = content.find("[")
    if brace_start >= 0 and (bracket_start < 0 or brace_start < bracket_start):
        brace_end = content.rfind("}")
        if brace_end > brace_start:
            content = content[brace_start:brace_end + 1]
    elif bracket_start >= 0:
        bracket_end = content.rfind("]")
        if bracket_end > bracket_start:
            content = content[bracket_start:bracket_end + 1]

    return content.strip()


def _build_er_system_prompt(domain: str, lightweight: bool = False) -> str:
    if lightweight:
        return f"""专业{domain}领域知识抽取。返回JSON:
{{"entities":[{{"id":"E1","name":"","type":"","confidence":0.9}}],
"relations":[{{"id":"R1","source":"E1","target":"E2","relation_type":"","confidence":0.8}}]}}
规则：id从E1/R1编号，关系引用有效实体，仅JSON"""

    return f"""你是专业的{domain}领域知识抽取专家。请从文本中抽取实体和关系。

JSON格式:
{{
    "entities": [
        {{
            "id": "E1",
            "name": "实体名称",
            "type": "实体类型",
            "description": "简短描述",
            "confidence": 0.95
        }}
    ],
    "relations": [
        {{
            "id": "R1",
            "source": "E1",
            "target": "E2",
            "relation_type": "关系类型",
            "description": "简短描述",
            "confidence": 0.90
        }}
    ]
}}

要求：
1. 实体id从E1开始编号，关系从R1开始
2. 关系source/target必须是实体id
3. 仅返回JSON，不要其他内容
4. 置信度0-1，越高越确定
5. 类型示例：组织、人物、技术、产品、概念、地点"""


async def extract_entities_and_relations(
    text: str,
    domain: str = "通用",
    lightweight: bool = True,
) -> dict:
    if not text or len(text.strip()) < 10:
        return {"entities": [], "relations": []}

    mode = "light" if lightweight else "full"
    cache_key = _get_cache_key(text, domain, f"extract_er_{mode}")
    cached = _get_cached(cache_key)
    if cached is not None:
        logger.debug(f"Cache hit for extraction ({len(text)} chars, {mode})")
        return cached

    async with _semaphore:
        client = get_client()
        system_prompt = _build_er_system_prompt(domain, lightweight)
        model = LIGHTWEIGHT_MODEL if lightweight else OPENAI_MODEL
        timeout = _estimate_timeout(len(text))
        max_tokens = 2048 if lightweight else 4096

        try:
            start_time = time.time()
            response = await _retry_with_backoff(
                client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"文本:\n{text[:6000]}\n\n抽取："},
                    ],
                    temperature=0.05,
                    max_tokens=max_tokens,
                    timeout=timeout,
                )
            )
            content = response.choices[0].message.content or ""
            content = await _clean_json_response(content)

            try:
                result = json.loads(content)
            except json.JSONDecodeError:
                try:
                    fixed = content.replace("'", '"').replace("\n", " ")
                    result = json.loads(fixed)
                except json.JSONDecodeError:
                    logger.warning(f"JSON parse failed, falling back to empty")
                    result = {"entities": [], "relations": []}

            entities = result.get("entities", [])
            relations = result.get("relations", [])

            valid_entity_ids = {e.get("id") for e in entities if e.get("id")}
            valid_relations = [
                r for r in relations
                if r.get("source") in valid_entity_ids and r.get("target") in valid_entity_ids
            ]

            result["relations"] = valid_relations
            result["entities"] = entities

            elapsed = time.time() - start_time
            logger.info(
                f"Extracted {len(entities)} entities, {len(valid_relations)} relations "
                f"from {len(text)} chars in {elapsed:.2f}s ({mode})"
            )

            _set_cache(cache_key, result)
            return result

        except Exception as e:
            logger.error(f"AI model call failed: {e}")
            if lightweight and LIGHTWEIGHT_MODEL != OPENAI_MODEL:
                logger.info("Falling back to full model...")
                return await extract_entities_and_relations(text, domain, lightweight=False)
            return {"entities": [], "relations": []}


async def batch_extract_entities(
    texts: list[str],
    domain: str = "通用",
    lightweight: bool = True,
) -> list[dict]:
    if not texts:
        return []

    async def extract_single(text: str) -> dict:
        return await extract_entities_and_relations(text, domain, lightweight)

    tasks = [extract_single(text) for text in texts]
    return await asyncio.gather(*tasks)


async def extract_from_image_description(
    image_description: str,
    existing_entities: list[dict] = None,
    domain: str = "通用",
) -> dict:
    if not image_description or len(image_description.strip()) < 5:
        return {"entities": [], "relations": []}

    cache_key = _get_cache_key(image_description, domain, "extract_img")
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached

    existing_hint = ""
    if existing_entities and len(existing_entities) > 0:
        existing_hint = "已有实体参考：" + ",".join(
            [f"{e.get('name')}({e.get('type')})" for e in existing_entities[:10]]
        ) + "。请尽量复用。"

    async with _semaphore_vision:
        client = get_client()
        system_prompt = f"""专业{domain}领域图片知识抽取。{existing_hint}
返回JSON格式：{{"entities":[{{"id":"E_img_1","name":"","type":"","confidence":0.9}}],"relations":[{{"id":"R_img_1","source":"","target":"","relation_type":"","confidence":0.8}}]}}
仅返回JSON"""

        try:
            response = await _retry_with_backoff(
                client.chat.completions.create(
                    model=LIGHTWEIGHT_MODEL,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"图片描述：{image_description[:3000]}"},
                    ],
                    temperature=0.1,
                    max_tokens=1536,
                    timeout=45.0,
                )
            )
            content = response.choices[0].message.content or ""
            content = await _clean_json_response(content)

            try:
                result = json.loads(content)
            except json.JSONDecodeError:
                result = {"entities": [], "relations": []}

            _set_cache(cache_key, result)
            return result

        except Exception as e:
            logger.error(f"Image extraction failed: {e}")
            return {"entities": [], "relations": []}


async def extract_entities_and_relations_with_image(
    text: str,
    image_base64: str,
    domain: str = "通用",
) -> dict:
    cache_key = _get_cache_key(text[:500] + "_" + image_base64[:50], domain, "extract_mm")
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached

    async with _semaphore_vision:
        client = get_client()
        system_prompt = f"""专业{domain}领域多模态知识抽取。根据文本和图片抽取实体和关系。返回JSON，仅JSON。"""

        try:
            response = await _retry_with_backoff(
                client.chat.completions.create(
                    model=OPENAI_MODEL,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": f"文本：{text[:4000]}\n\n图片："},
                                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}},
                            ],
                        },
                    ],
                    temperature=0.1,
                    max_tokens=3072,
                    timeout=90.0,
                )
            )
            content = response.choices[0].message.content or ""
            content = await _clean_json_response(content)

            try:
                result = json.loads(content)
            except json.JSONDecodeError:
                result = {"entities": [], "relations": []}

            _set_cache(cache_key, result)
            return result

        except Exception as e:
            logger.error(f"Multimodal extraction failed: {e}")
            return {"entities": [], "relations": []}


async def generate_embedding(text: str, model: str = "text-embedding-ada-002") -> list[float]:
    if not text or not text.strip():
        return []

    cache_key = _get_cache_key(text, model, "embed")
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached

    async with _semaphore:
        client = get_client()
        try:
            response = await _retry_with_backoff(
                client.embeddings.create(
                    model=model,
                    input=text[:8000],
                    timeout=20.0,
                )
            )
            embedding = response.data[0].embedding
            _set_cache(cache_key, embedding)
            return embedding
        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            return []


async def batch_generate_embeddings(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []

    async def embed_single(text: str) -> list[float]:
        return await generate_embedding(text)

    tasks = [embed_single(text) for text in texts]
    return await asyncio.gather(*tasks)


async def analyze_image_with_vision(
    image_base64: str,
    prompt: str = "描述图片内容，重点在行业知识：图表数据、流程关系、架构设计等",
    domain: str = "通用",
    detailed: bool = False,
) -> str:
    async with _semaphore_vision:
        client = get_client()
        max_tokens = 512 if not detailed else 2048
        full_prompt = f"你是{domain}领域专家。{prompt}"

        try:
            response = await _retry_with_backoff(
                client.chat.completions.create(
                    model=OPENAI_MODEL,
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": full_prompt},
                                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}},
                            ],
                        }
                    ],
                    max_tokens=max_tokens,
                    timeout=60.0,
                )
            )
            return response.choices[0].message.content or ""
        except Exception as e:
            logger.error(f"Vision analysis failed: {e}")
            return ""


async def suggest_relations(
    entity_name: str,
    entity_type: str,
    all_entities: list[dict],
    domain: str = "通用",
) -> list[dict]:
    cache_key = _get_cache_key(f"{entity_name}:{entity_type}:{len(all_entities)}", domain, "suggest_rel")
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached

    if len(all_entities) < 2:
        return []

    entity_names = [e.get("name", "") for e in all_entities[:20] if e.get("name") != entity_name]
    if not entity_names:
        return []

    async with _semaphore:
        client = get_client()
        system_prompt = f"""专业{domain}领域关联推荐。预测实体与其他实体的可能关系。
返回JSON: {{"suggestions": [{{"target": "实体名", "relation_type": "关系类型", "confidence": 0.7}}]}}
仅返回JSON，置信度0-1"""

        try:
            response = await _retry_with_backoff(
                client.chat.completions.create(
                    model=LIGHTWEIGHT_MODEL,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"源实体: {entity_name}({entity_type})\n候选实体: {', '.join(entity_names[:15])}\n\n预测关系："},
                    ],
                    temperature=0.2,
                    max_tokens=1024,
                    timeout=30.0,
                )
            )
            content = response.choices[0].message.content or ""
            content = await _clean_json_response(content)

            try:
                result = json.loads(content)
                suggestions = result.get("suggestions", [])
                _set_cache(cache_key, suggestions)
                return suggestions
            except json.JSONDecodeError:
                return []

        except Exception as e:
            logger.error(f"Relation suggestion failed: {e}")
            return []


def get_cache_stats() -> dict:
    return {
        "total_entries": len(_cache),
        "max_entries": _MAX_CACHE_SIZE,
        "hit_rate": 0.0,
        "ttl_seconds": _CACHE_TTL,
    }


def clear_cache():
    _cache.clear()
    logger.info("Cache cleared")
