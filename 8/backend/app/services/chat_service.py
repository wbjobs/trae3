import sqlite3
import uuid
import json
import re
import logging
from datetime import datetime, timezone
from typing import List, Optional
from app.config import DB_PATH, SEARCH_DEFAULT_TOP_K
from app.core.vector_store import get_chroma_client, get_or_create_collection, search_documents
from app.models.schemas import Conversation, Message, Source

logger = logging.getLogger(__name__)


def get_db():
    return sqlite3.connect(str(DB_PATH))


def create_conversation(user_id: str, title: str = "New Conversation") -> Conversation:
    conn = get_db()
    conv_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    clean_title = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', title[:100])
    conn.execute(
        "INSERT INTO conversations (id, title, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (conv_id, clean_title, user_id, now, now),
    )
    conn.commit()
    conn.close()
    return Conversation(id=conv_id, title=clean_title, created_at=now, updated_at=now)


def list_conversations(user_id: str) -> List[Conversation]:
    conn = get_db()
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute(
        "SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC",
        (user_id,),
    )
    rows = c.fetchall()
    conn.close()
    return [
        Conversation(id=r["id"], title=r["title"], created_at=r["created_at"], updated_at=r["updated_at"])
        for r in rows
    ]


def get_conversation_messages(conversation_id: str) -> List[Message]:
    conn = get_db()
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at", (conversation_id,))
    rows = c.fetchall()
    conn.close()
    messages = []
    for r in rows:
        sources = None
        if r["sources_json"]:
            try:
                sources = [Source(**s) for s in json.loads(r["sources_json"])]
            except (json.JSONDecodeError, Exception) as e:
                logger.warning(f"Failed to parse sources for message {r['id']}: {e}")
                sources = None
        messages.append(
            Message(id=r["id"], role=r["role"], content=r["content"], sources=sources, created_at=r["created_at"])
        )
    return messages


def save_message(conversation_id: str, role: str, content: str, sources: Optional[List[Source]] = None) -> Message:
    conn = get_db()
    msg_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    clean_content = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', content)
    sources_json = json.dumps([s.model_dump() for s in sources], ensure_ascii=False) if sources else None
    conn.execute(
        "INSERT INTO messages (id, conversation_id, role, content, sources_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (msg_id, conversation_id, role, clean_content, sources_json, now),
    )
    conn.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", (now, conversation_id))
    conn.commit()
    conn.close()
    return Message(id=msg_id, role=role, content=clean_content, sources=sources, created_at=now)


def delete_conversation(conversation_id: str):
    conn = get_db()
    conn.execute("DELETE FROM messages WHERE conversation_id = ?", (conversation_id,))
    conn.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
    conn.commit()
    conn.close()


def retrieve_context(query: str, top_k: int = SEARCH_DEFAULT_TOP_K) -> List[Source]:
    try:
        client = get_chroma_client()
        collection = get_or_create_collection(client)
        raw_results = search_documents(collection, query, top_k=top_k)
    except Exception as e:
        logger.error(f"Retrieval failed: {e}")
        return []

    sources = []
    for r in raw_results:
        doc_id = r["document_id"]
        conn = get_db()
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT filename FROM documents WHERE id = ?", (doc_id,))
        row = c.fetchone()
        conn.close()
        filename = row["filename"] if row else "Unknown"
        sources.append(
            Source(
                chunk_id=r["chunk_id"],
                document_id=doc_id,
                filename=filename,
                content=r["content"],
                page_number=r.get("page_number"),
                score=r["score"],
            )
        )
    return sources
