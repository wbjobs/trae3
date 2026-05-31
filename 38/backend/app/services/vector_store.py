import logging
import chromadb
from typing import Optional
from ..config import CHROMA_PERSIST_DIR, CHROMA_COLLECTION_NAME, EMBEDDING_MODEL

logger = logging.getLogger(__name__)

_client: Optional[chromadb.PersistentClient] = None
_collection = None


def get_chroma_client():
    global _client, _collection
    if _client is None:
        _client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)
    if _collection is None:
        _collection = _client.get_or_create_collection(
            name=CHROMA_COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
    return _client, _collection


def add_document_embedding(doc_id: str, text: str, metadata: dict = None):
    _, collection = get_chroma_client()
    try:
        collection.add(
            documents=[text],
            ids=[doc_id],
            metadatas=[metadata or {}],
        )
        logger.info(f"Added embedding for doc {doc_id}")
    except Exception as e:
        logger.error(f"Failed to add embedding for {doc_id}: {e}")


def add_entity_embeddings(doc_id: str, entities: list[dict]):
    _, collection = get_chroma_client()
    try:
        ids = []
        documents = []
        metadatas = []
        for entity in entities:
            eid = entity.get("id", "")
            desc = entity.get("description", "") or entity.get("name", "")
            ids.append(f"{doc_id}_{eid}")
            documents.append(desc)
            metadatas.append({
                "doc_id": doc_id,
                "entity_id": eid,
                "entity_name": entity.get("name", ""),
                "entity_type": entity.get("type", ""),
            })
        if ids:
            collection.add(documents=documents, ids=ids, metadatas=metadatas)
            logger.info(f"Added {len(ids)} entity embeddings for doc {doc_id}")
    except Exception as e:
        logger.error(f"Failed to add entity embeddings for {doc_id}: {e}")


def query_similar(query_text: str, n_results: int = 10) -> list[dict]:
    _, collection = get_chroma_client()
    try:
        results = collection.query(
            query_texts=[query_text],
            n_results=n_results,
        )
        return results
    except Exception as e:
        logger.error(f"Query failed: {e}")
        return {"documents": [[]], "metadatas": [[]], "distances": [[]]}


def delete_document_embeddings(doc_id: str):
    _, collection = get_chroma_client()
    try:
        all_ids = collection.get(where={"doc_id": doc_id})["ids"]
        doc_id_id = collection.get(ids=[doc_id])["ids"]
        ids_to_delete = list(set(all_ids + doc_id_id))
        if ids_to_delete:
            collection.delete(ids=ids_to_delete)
            logger.info(f"Deleted embeddings for doc {doc_id}")
    except Exception as e:
        logger.error(f"Failed to delete embeddings for {doc_id}: {e}")


def get_all_documents() -> list[dict]:
    _, collection = get_chroma_client()
    try:
        results = collection.get(include=["metadatas", "documents"])
        return results
    except Exception as e:
        logger.error(f"Failed to get all documents: {e}")
        return {"ids": [], "metadatas": [], "documents": []}
