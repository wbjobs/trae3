import json
import logging
import re
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sse_starlette.sse import EventSourceResponse
from app.models.schemas import ChatRequest, Conversation, Message
from app.services.chat_service import (
    create_conversation, list_conversations, get_conversation_messages,
    save_message, delete_conversation, retrieve_context,
)
from app.core.llm_chain import generate_answer_stream
from app.middleware.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])
security = HTTPBearer()


def _sanitize_text(text: str) -> str:
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    text = text.replace('\ufffd', '')
    return text


@router.post("")
async def chat(
    request: ChatRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    user = await get_current_user(credentials)
    conversation_id = request.conversation_id
    if not conversation_id:
        conv = create_conversation(user.id, request.question[:50])
        conversation_id = conv.id

    clean_question = _sanitize_text(request.question)
    save_message(conversation_id, "user", clean_question)

    sources = retrieve_context(clean_question)
    collected_answer = []

    async def event_generator():
        nonlocal collected_answer
        try:
            async for chunk in generate_answer_stream(clean_question, [s.model_dump() for s in sources]):
                clean_chunk = _sanitize_text(chunk)
                if not clean_chunk:
                    continue
                collected_answer.append(clean_chunk)
                data = json.dumps({"type": "chunk", "content": clean_chunk}, ensure_ascii=False)
                yield {"event": "message", "data": data}

            full_answer = "".join(collected_answer)
            full_answer = _sanitize_text(full_answer)
            save_message(conversation_id, "assistant", full_answer, sources)

            sources_data = json.dumps(
                {
                    "type": "done",
                    "conversation_id": conversation_id,
                    "sources": [s.model_dump() for s in sources],
                },
                ensure_ascii=False,
            )
            yield {"event": "message", "data": sources_data}
        except Exception as e:
            logger.error(f"Chat stream error: {e}", exc_info=True)
            if collected_answer:
                partial = _sanitize_text("".join(collected_answer))
                save_message(conversation_id, "assistant", partial, sources)
            error_data = json.dumps({"type": "error", "content": str(e)}, ensure_ascii=False)
            yield {"event": "message", "data": error_data}

    return EventSourceResponse(event_generator())


@router.get("/conversations", response_model=list[Conversation])
async def get_conversations(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    user = await get_current_user(credentials)
    return list_conversations(user.id)


@router.get("/conversations/{conversation_id}", response_model=list[Message])
async def get_messages(
    conversation_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    await get_current_user(credentials)
    return get_conversation_messages(conversation_id)


@router.delete("/conversations/{conversation_id}")
async def delete_conv(
    conversation_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    await get_current_user(credentials)
    delete_conversation(conversation_id)
    return {"message": "Conversation deleted successfully"}
