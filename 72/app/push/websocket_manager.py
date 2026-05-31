import asyncio
import json
import logging
from typing import Dict, List, Optional, Tuple, Any
from fastapi import WebSocket, WebSocketDisconnect

from app.config import settings
from app.database import get_db
from app.tenant.models import Tenant

logger = logging.getLogger(__name__)


class Connection:
    __slots__ = ('websocket', 'tenant_id', 'client_id', 'connected_at')

    def __init__(self, websocket: WebSocket, tenant_id: str, client_id: str):
        self.websocket = websocket
        self.tenant_id = tenant_id
        self.client_id = client_id
        self.connected_at = asyncio.get_event_loop().time()


class WebSocketManager:
    def __init__(self):
        self.active_connections: Dict[str, Dict[str, Connection]] = {}
        self._lock = asyncio.Lock()
        self._max_connections_per_tenant = 1000

    def _validate_tenant(self, tenant_id: str) -> bool:
        if not tenant_id:
            return False
        db = next(get_db(), None)
        if not db:
            return False
        try:
            tenant = db.query(Tenant).filter(
                Tenant.id == tenant_id,
                Tenant.is_active == True
            ).first()
            return tenant is not None
        except Exception as e:
            logger.error(f"Tenant validation error: {e}")
            return False
        finally:
            db.close()

    async def connect(self, websocket: WebSocket, tenant_id: str, client_id: str) -> bool:
        if not self._validate_tenant(tenant_id):
            logger.warning(f"Invalid tenant attempted connection: {tenant_id}")
            await websocket.close(code=1008, reason="Invalid or inactive tenant")
            return False

        async with self._lock:
            if tenant_id not in self.active_connections:
                self.active_connections[tenant_id] = {}

            if len(self.active_connections[tenant_id]) >= self._max_connections_per_tenant:
                await websocket.close(code=1008, reason="Too many connections for this tenant")
                logger.warning(f"Tenant {tenant_id} connection limit reached")
                return False

            if client_id in self.active_connections[tenant_id]:
                old_conn = self.active_connections[tenant_id][client_id]
                try:
                    await old_conn.websocket.close(code=1001, reason="New connection from same client")
                except Exception:
                    pass

            await websocket.accept()
            self.active_connections[tenant_id][client_id] = Connection(websocket, tenant_id, client_id)
            logger.info(f"Client {client_id} connected for tenant {tenant_id}")
            return True

    async def disconnect(self, tenant_id: str, client_id: str):
        async with self._lock:
            if tenant_id in self.active_connections:
                self.active_connections[tenant_id].pop(client_id, None)
                if not self.active_connections[tenant_id]:
                    del self.active_connections[tenant_id]
                logger.info(f"Client {client_id} disconnected for tenant {tenant_id}")

    async def send_personal_message(self, tenant_id: str, client_id: str, message: dict) -> bool:
        if not tenant_id or not client_id:
            logger.warning(f"Invalid parameters for personal message: tenant={tenant_id}, client={client_id}")
            return False

        try:
            async with self._lock:
                tenant_conns = self.active_connections.get(tenant_id)
                if not tenant_conns:
                    logger.debug(f"No connections for tenant {tenant_id}")
                    return False

                connection = tenant_conns.get(client_id)
                if not connection:
                    logger.debug(f"Client {client_id} not found for tenant {tenant_id}")
                    return False

                message_with_tenant = {
                    **message,
                    "tenant_id": tenant_id
                }
                await connection.websocket.send_text(
                    json.dumps(message_with_tenant, ensure_ascii=False)
                )
                return True
        except Exception as e:
            logger.error(f"Error sending personal message to {tenant_id}/{client_id}: {e}")
            return False

    async def send_to_tenant(self, tenant_id: str, message: dict) -> Tuple[int, int]:
        if not tenant_id:
            logger.warning("Empty tenant_id for tenant broadcast")
            return (0, 0)

        success_count = 0
        fail_count = 0
        failed_clients = []

        try:
            async with self._lock:
                tenant_conns = self.active_connections.get(tenant_id)
                if not tenant_conns:
                    return (0, 0)

                message_with_tenant = {
                    **message,
                    "tenant_id": tenant_id
                }

                connections = list(tenant_conns.values())

            for connection in connections:
                try:
                    await connection.websocket.send_text(
                        json.dumps(message_with_tenant, ensure_ascii=False)
                    )
                    success_count += 1
                except Exception as e:
                    fail_count += 1
                    failed_clients.append(connection.client_id)
                    logger.error(f"Failed to send to {connection.client_id}: {e}")

            if failed_clients:
                async with self._lock:
                    for client_id in failed_clients:
                        tenant_conns = self.active_connections.get(tenant_id)
                        if tenant_conns and client_id in tenant_conns:
                            del tenant_conns[client_id]
                    if tenant_conns and not tenant_conns:
                        del self.active_connections[tenant_id]

            return (success_count, fail_count)
        except Exception as e:
            logger.error(f"Error sending tenant broadcast to {tenant_id}: {e}")
            return (success_count, fail_count)

    async def broadcast(self, message: dict) -> Tuple[int, int]:
        logger.warning("Broadcast called - this sends to ALL tenants!")
        success_count = 0
        fail_count = 0

        async with self._lock:
            all_connections = []
            for tenant_id, tenant_conns in self.active_connections.items():
                for client_id, conn in tenant_conns.items():
                    all_connections.append((tenant_id, client_id, conn))

        for tenant_id, client_id, connection in all_connections:
            try:
                message_with_tenant = {
                    **message,
                    "tenant_id": tenant_id
                }
                await connection.websocket.send_text(
                    json.dumps(message_with_tenant, ensure_ascii=False)
                )
                success_count += 1
            except Exception as e:
                fail_count += 1
                logger.error(f"Broadcast failed to {tenant_id}/{client_id}: {e}")

        return (success_count, fail_count)

    def get_tenant_connections_count(self, tenant_id: str) -> int:
        if tenant_id in self.active_connections:
            return len(self.active_connections[tenant_id])
        return 0

    def get_all_connections_count(self) -> int:
        count = 0
        for tenant_connections in self.active_connections.values():
            count += len(tenant_connections)
        return count

    def get_connection_stats(self) -> Dict[str, Any]:
        return {
            "total_connections": self.get_all_connections_count(),
            "active_tenants": len(self.active_connections),
            "connections_per_tenant": {
                tid: len(conns) for tid, conns in self.active_connections.items()
            }
        }


websocket_manager = WebSocketManager()
