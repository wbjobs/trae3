import sqlite3
import uuid
import logging
from typing import List
from app.config import DB_PATH, SEARCH_MIN_THRESHOLD, SEARCH_MAX_TOP_K
from app.core.vector_store import get_chroma_client, get_or_create_collection, search_documents
from app.models.schemas import SearchResult, SearchHistory

logger = logging.getLogger(__name__)


def get_db():
    return sqlite3.connect(str(DB_PATH))


def semantic_search(query: str, top_k: int = 5, threshold: float = 0.3) -> List[SearchResult]:
    top_k = max(1, min(top_k, SEARCH_MAX_TOP_K))
    threshold = max(SEARCH_MIN_THRESHOLD, threshold)

    client = get_chroma_client()
    collection = get_or_create_collection(client)
    raw_results = search_documents(collection, query, top_k, threshold)
    results = []
    for r in raw_results:
        doc_id = r["document_id"]
        filename = _get_document_filename(doc_id)
        results.append(
            SearchResult(
                chunk_id=r["chunk_id"],
                document_id=doc_id,
                filename=filename,
                content=r["content"],
                score=r["score"],
                page_number=r.get("page_number"),
            )
        )
    return results


def save_search_history(query: str, result_count: int, user_id: str):
    conn = get_db()
    history_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO search_history (id, query, result_count, user_id) VALUES (?, ?, ?, ?)",
        (history_id, query, result_count, user_id),
    )
    conn.commit()
    conn.close()


def get_search_history(user_id: str, page: int = 1, page_size: int = 20):
    conn = get_db()
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    offset = (page - 1) * page_size
    c.execute("SELECT COUNT(*) as total FROM search_history WHERE user_id = ?", (user_id,))
    total = c.fetchone()["total"]
    c.execute(
        "SELECT * FROM search_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
        (user_id, page_size, offset),
    )
    rows = c.fetchall()
    conn.close()
    histories = [
        SearchHistory(id=r["id"], query=r["query"], result_count=r["result_count"], created_at=r["created_at"])
        for r in rows
    ]
    return histories, total


def _get_document_filename(doc_id: str) -> str:
    conn = get_db()
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT filename FROM documents WHERE id = ?", (doc_id,))
    row = c.fetchone()
    conn.close()
    return row["filename"] if row else "Unknown"
