import logging
from typing import Dict, Any
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, Query, HTTPException, status

from app.tenant.dependencies import get_tenant_id
from app.push.service import push_service
from app.push.websocket_manager import websocket_manager
from app.push.message_queue import message_queue
from app.api.schemas import (
    MessagePushRequest, MessagePushResponse,
    MessageRecallRequest, MessageRecallResponse,
    OfflineRedeliverRequest, OfflineRedeliverResponse
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/push", tags=["push"])


@router.post("/send", response_model=MessagePushResponse)
async def push_message(
    message_data: MessagePushRequest,
    tenant_id: str = Depends(get_tenant_id)
):
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant ID is required"
        )

    try:
        message_id = await push_service.push_message(
            tenant_id=tenant_id,
            message_type=message_data.message_type,
            payload=message_data.payload,
            priority=message_data.priority,
            target_client_id=message_data.target_client_id,
            device_id=message_data.device_id
        )

        if not message_id:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Message queue is full or tenant limit exceeded"
            )

        return MessagePushResponse(
            message_id=message_id,
            status="queued"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error pushing message: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to queue message"
        )


@router.post("/recall", response_model=MessageRecallResponse)
async def recall_message(
    request: MessageRecallRequest,
    tenant_id: str = Depends(get_tenant_id)
):
    try:
        success = await push_service.recall_message(tenant_id, request.message_id)
        if success:
            return MessageRecallResponse(
                message_id=request.message_id,
                recalled=True,
                detail="Message recalled successfully, recall notification sent to clients"
            )
        else:
            return MessageRecallResponse(
                message_id=request.message_id,
                recalled=False,
                detail="Message not found, already delivered, or cannot be recalled"
            )
    except Exception as e:
        logger.error(f"Error recalling message: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to recall message"
        )


@router.post("/redeliver-offline", response_model=OfflineRedeliverResponse)
async def redeliver_offline_messages(
    request: OfflineRedeliverRequest,
    tenant_id: str = Depends(get_tenant_id)
):
    try:
        count = await push_service.redeliver_offline_messages(
            tenant_id=tenant_id,
            device_id=request.device_id
        )
        return OfflineRedeliverResponse(
            tenant_id=tenant_id,
            redelivered_count=count
        )
    except Exception as e:
        logger.error(f"Error redelivering offline messages: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to redeliver offline messages"
        )


@router.get("/stats")
async def get_push_stats(tenant_id: str = Depends(get_tenant_id)):
    try:
        stats = push_service.get_queue_stats(tenant_id=tenant_id)
        queue_stats = message_queue.get_stats()
        stats["queue_utilization"] = queue_stats.utilization
        stats["dead_letter_count"] = queue_stats.dead_letter_count
        return stats
    except Exception as e:
        logger.error(f"Error getting push stats: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get statistics"
        )


@router.get("/dead-letters")
async def get_dead_letters(
    limit: int = 100,
    tenant_id: str = Depends(get_tenant_id)
):
    try:
        dead_letters = message_queue.get_dead_letters(limit)
        tenant_dead_letters = [
            {
                "message_id": msg.message_id,
                "message_type": msg.message_type,
                "priority": msg.priority,
                "created_at": msg.created_at.isoformat() if msg.created_at else None,
                "tenant_id": msg.tenant_id
            }
            for msg in dead_letters
            if msg.tenant_id == tenant_id
        ]
        return {
            "count": len(tenant_dead_letters),
            "messages": tenant_dead_letters
        }
    except Exception as e:
        logger.error(f"Error getting dead letters: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get dead letters"
        )


@router.delete("/dead-letters")
async def clear_dead_letters(tenant_id: str = Depends(get_tenant_id)):
    try:
        count = await message_queue.clear_dead_letters()
        return {"cleared": count}
    except Exception as e:
        logger.error(f"Error clearing dead letters: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to clear dead letters"
        )


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    tenant_id: str = Query(...),
    client_id: str = Query(...)
):
    if not tenant_id or not client_id:
        await websocket.close(code=1008, reason="tenant_id and client_id are required")
        return

    connected = await websocket_manager.connect(websocket, tenant_id, client_id)
    if not connected:
        return

    try:
        await websocket_manager.send_personal_message(
            tenant_id,
            client_id,
            {
                "type": "system",
                "status": "connected",
                "message": "WebSocket connection established"
            }
        )

        while True:
            data = await websocket.receive_text()
            await websocket_manager.send_personal_message(
                tenant_id,
                client_id,
                {"type": "echo", "content": data}
            )
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: {tenant_id}/{client_id}")
    except Exception as e:
        logger.error(f"WebSocket error for {tenant_id}/{client_id}: {e}", exc_info=True)
    finally:
        await websocket_manager.disconnect(tenant_id, client_id)
