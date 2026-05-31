import asyncio
import json
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .db.database import db
from .api import data, metrics, alerts, pressure, archive
from .services.ws_manager import ws_manager
from .services.metrics_engine import metrics_engine
from .utils.mock_generator import mock_generator
from .schemas.models import ApiResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    historical_data = mock_generator.generate_historical(hours=2, interval_seconds=30)
    db.insert_metric_batch(historical_data)
    print(f"Preloaded {len(historical_data)} historical data points")

    await metrics_engine.start()

    if settings.GENERATE_MOCK_DATA:
        task = asyncio.create_task(mock_data_task())
        app.state.mock_task = task

    yield

    if hasattr(app.state, 'mock_task'):
        app.state.mock_task.cancel()

    await metrics_engine.stop()
    print("Shutting down...")


async def mock_data_task():
    try:
        async for metric_data in mock_generator.generate_stream(settings.MOCK_DATA_INTERVAL):
            result = metrics_engine.process_data(metric_data)
            await ws_manager.broadcast_data(result)
    except asyncio.CancelledError:
        pass
    except Exception as e:
        print(f"Mock data task error: {e}")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(data.router, prefix="/api")
app.include_router(metrics.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(pressure.router, prefix="/api")
app.include_router(archive.router, prefix="/api")


@app.get("/api/health", response_model=ApiResponse)
async def health_check():
    return ApiResponse(data={
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "connections": ws_manager.get_connection_count()
    })


@app.websocket("/ws/stream")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                payload = json.loads(data)
                await ws_manager.handle_subscription(websocket, payload)
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        ws_manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )
