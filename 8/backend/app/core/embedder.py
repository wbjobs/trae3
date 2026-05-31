import time
import logging
from langchain_openai import OpenAIEmbeddings
from app.config import (
    EMBEDDING_BASE_URL, EMBEDDING_API_KEY, EMBEDDING_MODEL_NAME,
    EMBEDDING_TIMEOUT, API_MAX_RETRIES, API_RETRY_DELAY, EMBEDDING_BATCH_SIZE,
)

logger = logging.getLogger(__name__)

_embeddings_instance = None


def get_embeddings():
    global _embeddings_instance
    if _embeddings_instance is None:
        _embeddings_instance = OpenAIEmbeddings(
            openai_api_base=EMBEDDING_BASE_URL,
            openai_api_key=EMBEDDING_API_KEY,
            model=EMBEDDING_MODEL_NAME,
            request_timeout=EMBEDDING_TIMEOUT,
            max_retries=API_MAX_RETRIES,
            check_embedding_ctx_length=False,
        )
    return _embeddings_instance


def embed_with_retry(texts: list[str], max_retries: int = API_MAX_RETRIES) -> list[list[float]]:
    for attempt in range(max_retries):
        try:
            model = get_embeddings()
            return model.embed_documents(texts)
        except Exception as e:
            logger.warning(f"Embedding attempt {attempt + 1}/{max_retries} failed: {e}")
            if attempt < max_retries - 1:
                delay = API_RETRY_DELAY * (2 ** attempt)
                logger.info(f"Retrying in {delay}s...")
                time.sleep(delay)
            else:
                logger.error(f"All {max_retries} embedding attempts failed")
                raise


def embed_query_with_retry(query: str, max_retries: int = API_MAX_RETRIES) -> list[float]:
    for attempt in range(max_retries):
        try:
            model = get_embeddings()
            return model.embed_query(query)
        except Exception as e:
            logger.warning(f"Query embedding attempt {attempt + 1}/{max_retries} failed: {e}")
            if attempt < max_retries - 1:
                delay = API_RETRY_DELAY * (2 ** attempt)
                time.sleep(delay)
            else:
                logger.error(f"All {max_retries} query embedding attempts failed")
                raise


def embed_documents_batched(texts: list[str], batch_size: int = EMBEDDING_BATCH_SIZE) -> list[list[float]]:
    if len(texts) <= batch_size:
        return embed_with_retry(texts)

    all_embeddings = []
    total_batches = (len(texts) + batch_size - 1) // batch_size
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        batch_num = i // batch_size + 1
        logger.info(f"Embedding batch {batch_num}/{total_batches} ({len(batch)} texts)")
        try:
            batch_embeddings = embed_with_retry(batch)
            all_embeddings.extend(batch_embeddings)
        except Exception as e:
            logger.error(f"Batch {batch_num} failed, using zero vectors as fallback: {e}")
            if batch_embeddings and len(batch_embeddings) > 0:
                dim = len(batch_embeddings[0])
            else:
                dim = 1024
            all_embeddings.extend([[0.0] * dim] * len(batch))
    return all_embeddings
