import json
import asyncio
from typing import Set, Dict, List
from fastapi import WebSocket, WebSocketDisconnect

from .metrics_engine import metrics_engine
from ..schemas.models import MetricData


class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.client_subscriptions: Dict[WebSocket, Dict] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        self.client_subscriptions[websocket] = {
            "metrics": set(),
            "sources": set(),
            "include_alerts": True
        }

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        self.client_subscriptions.pop(websocket, None)

    async def send_personal_message(self, message: Dict, websocket: WebSocket):
        try:
            await websocket.send_json(message)
        except Exception as e:
            pass

    async def broadcast(self, message: Dict):
        disconnected = []
        for connection in self.active_connections:
            try:
                if self._should_send(message, connection):
                    await connection.send_json(message)
            except WebSocketDisconnect:
                disconnected.append(connection)
            except Exception as e:
                disconnected.append(connection)

        for conn in disconnected:
            self.disconnect(conn)

    def _should_send(self, message: Dict, websocket: WebSocket) -> bool:
        sub = self.client_subscriptions.get(websocket, {})
        msg_type = message.get("type")

        if msg_type == "alert" and not sub.get("include_alerts", True):
            return False

        if msg_type == "data":
            data = message.get("data", {})
            metric = data.get("metric")
            source = data.get("source")

            subscribed_metrics = sub.get("metrics", set())
            subscribed_sources = sub.get("sources", set())

            if subscribed_metrics and metric not in subscribed_metrics:
                return False
            if subscribed_sources and source not in subscribed_sources:
                return False

        return True

    async def handle_subscription(self, websocket: WebSocket, payload: Dict):
        if websocket not in self.client_subscriptions:
            return

        action = payload.get("action")
        if action == "subscribe":
            metrics = payload.get("metrics", [])
            sources = payload.get("sources", [])
            include_alerts = payload.get("include_alerts", True)

            if metrics:
                self.client_subscriptions[websocket]["metrics"].update(metrics)
            if sources:
                self.client_subscriptions[websocket]["sources"].update(sources)
            self.client_subscriptions[websocket]["include_alerts"] = include_alerts

        elif action == "unsubscribe":
            metrics = payload.get("metrics", [])
            sources = payload.get("sources", [])

            if metrics:
                for m in metrics:
                    self.client_subscriptions[websocket]["metrics"].discard(m)
            if sources:
                for s in sources:
                    self.client_subscriptions[websocket]["sources"].discard(s)

        elif action == "get_latest":
            latest = metrics_engine.get_latest_values()
            await self.send_personal_message({
                "type": "latest_values",
                "data": latest
            }, websocket)

    async def broadcast_data(self, result: Dict):
        await self.broadcast({
            "type": "data",
            "timestamp": result["data"]["timestamp"],
            "data": result["data"],
            "anomaly": result["anomaly"]
        })

        if result.get("alert"):
            await self.broadcast({
                "type": "alert",
                "timestamp": result["alert"]["timestamp"],
                "data": result["alert"]
            })

    def get_connection_count(self) -> int:
        return len(self.active_connections)


ws_manager = ConnectionManager()
