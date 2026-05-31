from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from typing import Optional
from app.models.schemas import DocumentInfo, DocumentDetail, PaginatedResponse
from app.services.document_service import (
    upload_document, list_documents, get_document, delete_document, reparse_document,
)
from app.middleware.auth import get_current_user
from app.models.schemas import UserInfo

router = APIRouter(prefix="/api/documents", tags=["documents"])
security = HTTPBearer()


@router.post("/upload", response_model=DocumentInfo)
async def upload_doc(
    file: UploadFile = File(...),
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    user = await get_current_user(credentials)
    try:
        doc = upload_document(file, user.id)
        return doc
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process document: {str(e)}")


@router.get("")
async def list_docs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    keyword: Optional[str] = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    await get_current_user(credentials)
    docs, total = list_documents(page, page_size, keyword)
    return {"items": docs, "total": total}


@router.get("/{document_id}", response_model=DocumentDetail)
async def get_doc(
    document_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    await get_current_user(credentials)
    doc = get_document(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.delete("/{document_id}")
async def delete_doc(
    document_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    await get_current_user(credentials)
    success = delete_document(document_id)
    if not success:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"message": "Document deleted successfully"}


@router.post("/{document_id}/reparse")
async def reparse_doc(
    document_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    await get_current_user(credentials)
    try:
        doc = reparse_document(document_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        return {"message": "Document reparsed successfully", "status": doc.status}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))