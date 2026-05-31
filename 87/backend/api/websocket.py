import asyncio
import json
from datetime import datetime
from typing import Set, Dict
from fastapi import WebSocket, WebSocketDisconnect

from backend.models.schemas import SensorData
from backend.services.tsdb import tsdb_service
from backend.services.metrics import metrics_calculator
from backend.services.fault import fault_detector


class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._device_subscriptions: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        print(f"[WS] Client connected, total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        for subs in self._device_subscriptions.values():
            subs.discard(websocket)
        print(f"[WS] Client disconnected, total: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        data = json.dumps(message, ensure_ascii=False)
        disconnected = set()
        for ws in self.active_connections:
            try:
                await ws.send_text(data)
            except Exception:
                disconnected.add(ws)
        self.active_connections -= disconnected

    async def broadcast_alert(self, alert):
        msg = {
            "type": "fault_alert",
            "data": alert.model_dump(),
        }
        await self.broadcast(msg)


manager = ConnectionManager()


async def handle_data_stream(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"type": "error", "message": "Invalid JSON"}))
                continue

            msg_type = payload.get("type", "data")

            if msg_type == "data":
                await _process_sensor_data(payload, websocket)
            elif msg_type == "subscribe":
                device_id = payload.get("device_id")
                if device_id:
                    if device_id not in manager._device_subscriptions:
                        manager._device_subscriptions[device_id] = set()
                    manager._device_subscriptions[device_id].add(websocket)
                    await websocket.send_text(json.dumps({
                        "type": "subscribed",
                        "device_id": device_id,
                    }))
            elif msg_type == "query_metrics":
                device_id = payload.get("device_id")
                if device_id:
                    metrics = metrics_calculator.compute_metrics(device_id)
                    await websocket.send_text(json.dumps({
                        "type": "metrics",
                        "data": [m.model_dump() for m in metrics],
                    }))
    except WebSocketDisconnect:
        manager.disconnect(websocket)


async def _process_sensor_data(payload: dict, websocket: WebSocket):
    try:
        if "timestamp" not in payload or payload["timestamp"] is None:
            payload["timestamp"] = datetime.utcnow().isoformat()
        data = SensorData(**payload)
    except Exception as e:
        await websocket.send_text(json.dumps({"type": "error", "message": f"Invalid data: {e}"}))
        return

    await tsdb_service.write(data)

    data_dict = data.model_dump()
    metrics_calculator.add_data(data.device_id, data_dict)

    alerts = await fault_detector.detect(data)

    await manager.broadcast({
        "type": "realtime_data",
        "data": data_dict,
    })

    if alerts:
        for alert in alerts:
            await manager.broadcast_alert(alert)

    metrics = metrics_calculator.compute_metrics(data.device_id)
    if metrics:
        await websocket.send_text(json.dumps({
            "type": "metrics_update",
            "data": [m.model_dump() for m in metrics],
        }))
