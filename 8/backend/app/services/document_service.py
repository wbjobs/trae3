import sqlite3
import uuid
import os
import re
import logging
from typing import Optional, Set
from app.config import DB_PATH, UPLOAD_DIR, INCREMENTAL_UPDATE_ENABLED, SHARD_DEDUP_ENABLED
from app.models.schemas import DocumentInfo, DocumentDetail, ChunkInfo, DocumentStatus
from app.core.parser import get_parser
from app.core.chunker import TextChunker
from app.core.vector_store import get_chroma_client, get_or_create_collection, add_documents, delete_document_vectors

logger = logging.getLogger(__name__)


def get_db():
    return sqlite3.connect(str(DB_PATH))


def upload_document(file, user_id: str) -> DocumentInfo:
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in [".pdf", ".docx", ".txt", ".md"]:
        raise ValueError(f"Unsupported file type: {file_ext}")

    raw_filename = file.filename or "unknown"
    clean_filename = re.sub(r'[\\/:*?"<>|]', '_', raw_filename)

    doc_id = str(uuid.uuid4())
    file_path = UPLOAD_DIR / f"{doc_id}{file_ext}"

    content = file.file.read()
    with open(file_path, "wb") as f:
        f.write(content)
    file_size = os.path.getsize(file_path)

    conn = get_db()
    conn.execute(
        "INSERT INTO documents (id, filename, file_type, file_size, file_path, status, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (doc_id, clean_filename, file_ext, file_size, str(file_path), DocumentStatus.parsing.value, user_id),
    )
    conn.commit()
    conn.close()

    try:
        _parse_and_index(doc_id, str(file_path), file_ext)
    except Exception as e:
        logger.error(f"Failed to parse document {doc_id}: {e}", exc_info=True)
        conn = get_db()
        conn.execute("UPDATE documents SET status = ? WHERE id = ?", (DocumentStatus.failed.value, doc_id))
        conn.commit()
        conn.close()
        raise e
    return get_document(doc_id)


def _parse_and_index(doc_id: str, file_path: str, file_type: str, incremental: bool = INCREMENTAL_UPDATE_ENABLED):
    parser = get_parser(file_type)
    if not parser:
        raise ValueError(f"No parser for {file_type}")

    logger.info(f"Parsing document {doc_id} ({file_type}), incremental={incremental}")
    try:
        pages = parser.parse(file_path)
    except Exception as e:
        logger.error(f"Parser failed for {doc_id}: {e}")
        raise ValueError(f"Document parsing failed: {str(e)}")

    if not pages:
        raise ValueError("No text content extracted from document")

    chunker = TextChunker()
    chunks = chunker.chunk_pages(pages)

    if not chunks:
        raise ValueError("No chunks generated from document")

    if incremental and SHARD_DEDUP_ENABLED:
        existing_hashes = _get_existing_content_hashes(doc_id)
        new_chunks = []
        skipped = 0
        for chunk in chunks:
            chunk_hash = chunk.get("content_hash", _hash_chunk(chunk["content"]))
            if chunk_hash in existing_hashes:
                skipped += 1
            else:
                new_chunks.append(chunk)
        if skipped > 0:
            logger.info(f"Incremental update: skipped {skipped} duplicate chunks, processing {len(new_chunks)} new")
        if not new_chunks:
            logger.info(f"All chunks are duplicates, marking document as completed")
            conn = get_db()
            conn.execute("UPDATE documents SET status = ? WHERE id = ?", (DocumentStatus.completed.value, doc_id))
            conn.commit()
            conn.close()
            return
        chunks = new_chunks

    logger.info(f"Generated {len(chunks)} chunks for document {doc_id}")

    conn = get_db()
    try:
        for chunk in chunks:
            chunk_id = str(uuid.uuid4())
            clean_content = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', chunk["content"])
            clean_content = clean_content.replace('\ufffd', '')
            chunk_hash = chunk.get("content_hash", _hash_chunk(clean_content))
            conn.execute(
                "INSERT INTO chunks (id, document_id, content, page_number, token_count, chunk_index, content_hash, section) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    chunk_id, doc_id, clean_content, chunk.get("page_number"),
                    chunk["token_count"], chunk["chunk_index"], chunk_hash, chunk.get("section", ""),
                ),
            )
        conn.execute("UPDATE documents SET status = ? WHERE id = ?", (DocumentStatus.completed.value, doc_id))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

    try:
        client = get_chroma_client()
        collection = get_or_create_collection(client)
        doc_type = _get_doc_type(file_type)
        add_documents(collection, chunks, doc_id, doc_type)
        logger.info(f"Successfully indexed document {doc_id}")
    except Exception as e:
        logger.error(f"Vectorization failed for {doc_id}: {e}")
        conn = get_db()
        conn.execute("UPDATE documents SET status = ? WHERE id = ?", (DocumentStatus.failed.value, doc_id))
        conn.commit()
        conn.close()
        raise


def list_documents(page: int = 1, page_size: int = 20, keyword: Optional[str] = None):
    conn = get_db()
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    offset = (page - 1) * page_size
    if keyword:
        c.execute("SELECT COUNT(*) as total FROM documents WHERE filename LIKE ?", (f"%{keyword}%",))
        total = c.fetchone()["total"]
        c.execute(
            "SELECT d.*, (SELECT COUNT(*) FROM chunks WHERE document_id = d.id) as chunk_count FROM documents d WHERE filename LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (f"%{keyword}%", page_size, offset),
        )
    else:
        c.execute("SELECT COUNT(*) as total FROM documents")
        total = c.fetchone()["total"]
        c.execute(
            "SELECT d.*, (SELECT COUNT(*) FROM chunks WHERE document_id = d.id) as chunk_count FROM documents d ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (page_size, offset),
        )
    rows = c.fetchall()
    conn.close()
    docs = [
        DocumentInfo(
            id=r["id"],
            filename=r["filename"],
            file_type=r["file_type"],
            file_size=r["file_size"],
            status=DocumentStatus(r["status"]),
            chunk_count=r["chunk_count"],
            created_at=r["created_at"],
        )
        for r in rows
    ]
    return docs, total


def get_document(doc_id: str) -> Optional[DocumentDetail]:
    conn = get_db()
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute(
        "SELECT d.*, (SELECT COUNT(*) FROM chunks WHERE document_id = d.id) as chunk_count FROM documents d WHERE d.id = ?",
        (doc_id,),
    )
    row = c.fetchone()
    if not row:
        conn.close()
        return None
    c.execute("SELECT * FROM chunks WHERE document_id = ? ORDER BY chunk_index", (doc_id,))
    chunk_rows = c.fetchall()
    conn.close()
    chunks = [
        ChunkInfo(
            id=r["id"],
            content=r["content"],
            page_number=r["page_number"],
            token_count=r["token_count"],
        )
        for r in chunk_rows
    ]
    return DocumentDetail(
        id=row["id"],
        filename=row["filename"],
        file_type=row["file_type"],
        file_size=row["file_size"],
        status=DocumentStatus(row["status"]),
        chunk_count=row["chunk_count"],
        created_at=row["created_at"],
        chunks=chunks,
    )


def delete_document(doc_id: str):
    doc = get_document(doc_id)
    if not doc:
        return False
    try:
        client = get_chroma_client()
        collection = get_or_create_collection(client)
        delete_document_vectors(collection, doc_id)
    except Exception as e:
        logger.warning(f"Failed to delete vectors for {doc_id}: {e}")
    conn = get_db()
    conn.execute("DELETE FROM chunks WHERE document_id = ?", (doc_id,))
    conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
    conn.commit()
    conn.close()
    file_path = UPLOAD_DIR / f"{doc_id}{doc.file_type}"
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except OSError:
            pass
    return True


def reparse_document(doc_id: str):
    doc = get_document(doc_id)
    if not doc:
        return None
    file_path = UPLOAD_DIR / f"{doc_id}{doc.file_type}"
    if not os.path.exists(file_path):
        return None
    conn = get_db()
    conn.execute("DELETE FROM chunks WHERE document_id = ?", (doc_id,))
    conn.execute("UPDATE documents SET status = ? WHERE id = ?", (DocumentStatus.parsing.value, doc_id))
    conn.commit()
    conn.close()
    try:
        client = get_chroma_client()
        collection = get_or_create_collection(client)
        delete_document_vectors(collection, doc_id)
    except Exception as e:
        logger.warning(f"Failed to delete old vectors: {e}")
    try:
        _parse_and_index(doc_id, str(file_path), doc.file_type)
    except Exception as e:
        logger.error(f"Reparse failed for {doc_id}: {e}")
        conn = get_db()
        conn.execute("UPDATE documents SET status = ? WHERE id = ?", (DocumentStatus.failed.value, doc_id))
        conn.commit()
        conn.close()
        raise
    return get_document(doc_id)


def _hash_chunk(content: str) -> str:
    import hashlib
    return hashlib.md5(content.encode('utf-8')).hexdigest()


def _get_existing_content_hashes(doc_id: str) -> Set[str]:
    conn = get_db()
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    try:
        c.execute("SELECT content_hash FROM chunks WHERE document_id = ? AND content_hash IS NOT NULL", (doc_id,))
        rows = c.fetchall()
        return {r["content_hash"] for r in rows if r["content_hash"]}
    except Exception as e:
        logger.warning(f"Failed to get existing hashes: {e}")
        return set()
    finally:
        conn.close()


def _get_doc_type(file_type: str) -> str:
    type_map = {
        ".pdf": "pdf",
        ".docx": "docx",
        ".txt": "text",
        ".md": "markdown",
    }
    return type_map.get(file_type.lower(), "other")
