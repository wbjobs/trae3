import sys
import os
import json
import asyncio
import threading
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tcp_server import run_tcp_server
from data_aggregator import get_aggregator
from storage import Database, Node


app = FastAPI(title='边缘节点监控 API', version='2.0.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

aggregator = get_aggregator()
db = Database()


class AlertResolveRequest(BaseModel):
    resolved_by: Optional[str] = None


@app.on_event('startup')
def startup_event():
    aggregator.start()
    tcp_thread = threading.Thread(
        target=run_tcp_server,
        args=('0.0.0.0', 8888),
        daemon=True
    )
    tcp_thread.start()
    print('API服务已启动: http://127.0.0.1:8000')
    print('API文档: http://127.0.0.1:8000/docs')


@app.get('/api/stats/summary')
async def get_stats_summary():
    return db.get_stats_summary()


@app.get('/api/nodes')
async def get_nodes(status: Optional[str] = None):
    if status:
        return db.get_nodes_by_status(status)
    return [n.to_dict() for n in db.get_all_nodes()]


@app.get('/api/nodes/{node_id}')
async def get_node(node_id: str):
    node = db.get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail='节点不存在')
    return node.to_dict()


@app.get('/api/nodes/{node_id}/metrics')
async def get_node_metrics(
    node_id: str,
    start: Optional[str] = None,
    end: Optional[str] = None,
    limit: int = 100
):
    start_time = datetime.fromisoformat(start) if start else None
    end_time = datetime.fromisoformat(end) if end else None
    metrics = db.get_node_metrics(node_id, start_time, end_time, limit)
    return [m.to_dict() for m in metrics]


@app.get('/api/nodes/{node_id}/alerts')
async def get_node_alerts(node_id: str, resolved: Optional[bool] = None, limit: int = 50):
    alerts = db.get_node_alerts(node_id, resolved, limit)
    return [a.to_dict() for a in alerts]


@app.get('/api/nodes/{node_id}/history')
async def get_node_status_history(node_id: str, limit: int = 100):
    history = db.get_status_history(node_id, limit)
    return [h.to_dict() for h in history]


@app.get('/api/alerts')
async def get_alerts(
    resolved: Optional[bool] = None,
    min_severity: int = 1,
    limit: int = 100
):
    alerts = db.get_alerts(resolved, limit, min_severity)
    return [a.to_dict() for a in alerts]


@app.post('/api/alerts/{alert_id}/resolve')
async def resolve_alert(alert_id: int, request: AlertResolveRequest):
    success = db.resolve_alert(alert_id)
    if not success:
        raise HTTPException(status_code=404, detail='告警不存在或已处理')
    return {'success': True, 'message': '告警已标记为已处理'}


@app.post('/api/alerts/{alert_id}/escalate')
async def escalate_alert(alert_id: int):
    alert = db.escalate_alert(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail='告警不存在或已处理')
    aggregator.event_bus.publish('alert', alert.to_dict())
    return {'success': True, 'alert': alert.to_dict()}


@app.get('/api/metrics/realtime')
async def get_realtime_metrics(node_id: Optional[str] = None):
    return aggregator.get_recent_metrics(node_id)


@app.get('/api/metrics/range')
async def get_metrics_range(start: str, end: Optional[str] = None, node_id: Optional[str] = None):
    try:
        start_time = datetime.fromisoformat(start)
        end_time = datetime.fromisoformat(end) if end else None
        metrics = db.get_metrics_range(start_time, end_time)
        if node_id:
            metrics = [m for m in metrics if m.node_id == node_id]
        return [m.to_dict() for m in metrics]
    except ValueError:
        raise HTTPException(status_code=400, detail='时间格式错误，请使用 ISO 格式')


@app.get('/api/status/history')
async def get_all_status_history(limit: int = 100):
    history = db.get_status_history(None, limit)
    return [h.to_dict() for h in history]


@app.get('/api/status/range')
async def get_status_range(start: str, end: Optional[str] = None):
    try:
        start_time = datetime.fromisoformat(start)
        end_time = datetime.fromisoformat(end) if end else None
        history = db.get_status_history_range(start_time, end_time)
        return [h.to_dict() for h in history]
    except ValueError:
        raise HTTPException(status_code=400, detail='时间格式错误，请使用 ISO 格式')


@app.get('/api/history/summary')
async def get_history_summary(hours: int = 24):
    end_time = datetime.now()
    start_time = end_time - timedelta(hours=hours)
    status_history = db.get_status_history_range(start_time, end_time)
    metric_history = db.get_metrics_range(start_time, end_time)

    node_status_changes: Dict[str, List[Dict[str, Any]]] = {}
    for h in status_history:
        if h.node_id not in node_status_changes:
            node_status_changes[h.node_id] = []
        node_status_changes[h.node_id].append(h.to_dict())

    node_metrics_count: Dict[str, int] = {}
    for m in metric_history:
        node_metrics_count[m.node_id] = node_metrics_count.get(m.node_id, 0) + 1

    return {
        'time_range': {
            'start': start_time.isoformat(),
            'end': end_time.isoformat(),
            'hours': hours
        },
        'total_status_changes': len(status_history),
        'total_metrics': len(metric_history),
        'node_status_changes': node_status_changes,
        'node_metrics_count': node_metrics_count
    }


@app.get('/api/logs')
async def get_logs():
    return aggregator.get_logs()


async def sse_event_generator():
    queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_running_loop()

    def on_event(data):
        loop.call_soon_threadsafe(lambda: queue.put_nowait(data))

    aggregator.event_bus.subscribe('metric', on_event)
    aggregator.event_bus.subscribe('alert', on_event)
    aggregator.event_bus.subscribe('alert_escalated', on_event)
    aggregator.event_bus.subscribe('node_status', on_event)
    aggregator.event_bus.subscribe('log', on_event)

    try:
        while True:
            try:
                data = await asyncio.wait_for(queue.get(), timeout=30)
                event_type = 'message'
                if 'escalation_count' in data and 'severity' in data and 'alert_type' in data:
                    event_type = 'alert'
                elif 'severity' in data and 'alert_level' in data and 'message' in data and 'node_id' in data:
                    event_type = 'alert'
                elif 'level' in data and 'message' in data and 'timestamp' in data and 'type' in data:
                    event_type = 'log'
                elif 'status' in data and 'node_id' in data:
                    event_type = 'node_status'
                elif 'cpu_usage' in data and 'node_id' in data:
                    event_type = 'metric'

                yield f'event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n'
            except asyncio.TimeoutError:
                yield f': ping {datetime.now().isoformat()}\n\n'
    finally:
        aggregator.event_bus.unsubscribe('metric', on_event)
        aggregator.event_bus.unsubscribe('alert', on_event)
        aggregator.event_bus.unsubscribe('alert_escalated', on_event)
        aggregator.event_bus.unsubscribe('node_status', on_event)
        aggregator.event_bus.unsubscribe('log', on_event)


@app.get('/api/stream')
async def stream_events():
    return StreamingResponse(
        sse_event_generator(),
        media_type='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        }
    )


@app.get('/')
async def root():
    return {
        'name': '边缘节点监控系统 API',
        'version': '2.0.0',
        'endpoints': {
            'stats': '/api/stats/summary',
            'nodes': '/api/nodes',
            'alerts': '/api/alerts',
            'metrics': '/api/metrics/realtime',
            'stream': '/api/stream',
            'history': '/api/history/summary',
        }
    }


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8000)
