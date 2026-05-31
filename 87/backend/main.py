import asyncio
import json
import random
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import CORS_ORIGINS
from backend.api.routes import router
from backend.api.websocket import handle_data_stream, manager
from backend.services.tsdb import tsdb_service
from backend.services.metrics import metrics_calculator
from backend.services.fault import fault_detector
from backend.models.schemas import SensorData


@asynccontextmanager
async def lifespan(app: FastAPI):
    await tsdb_service.initialize()
    await fault_detector.initialize()
    fault_detector.on_alert(lambda alert: manager.broadcast_alert(alert))
    asyncio.create_task(_simulate_data())
    print("[App] System started, data simulation running")
    yield
    await tsdb_service.close()
    await fault_detector.close()
    print("[App] System shutdown")


app = FastAPI(
    title="工业数据监控平台",
    description="全栈工业参数监控、指标计算与故障识别系统",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

@app.websocket("/ws")
async def websocket_endpoint(websocket):
    await handle_data_stream(websocket)


SIMULATED_DEVICES = {
    "pump-001": {"temp_base": 55, "vib_base": 3.2, "press_base": 3.0, "rpm_base": 1450, "curr_base": 12.5},
    "motor-002": {"temp_base": 65, "vib_base": 2.8, "press_base": 0.0, "rpm_base": 2960, "curr_base": 18.3},
    "compressor-003": {"temp_base": 78, "vib_base": 4.5, "press_base": 5.5, "rpm_base": 3500, "curr_base": 25.0},
    "fan-004": {"temp_base": 42, "vib_base": 1.9, "press_base": 1.2, "rpm_base": 980, "curr_base": 6.8},
}


async def _simulate_data():
    await asyncio.sleep(2)
    tick = 0
    while True:
        try:
            tick += 1
            for device_id, base in SIMULATED_DEVICES.items():
                spike = 1.0
                if tick % 50 == 0 and device_id == "compressor-003":
                    spike = 1.25
                if tick % 80 == 0 and device_id == "pump-001":
                    spike = 1.3

                data = SensorData(
                    timestamp=datetime.utcnow().isoformat(),
                    device_id=device_id,
                    temperature=base["temp_base"] + random.gauss(0, 3) * spike,
                    vibration=base["vib_base"] + random.gauss(0, 0.5) * spike,
                    pressure=max(0, base["press_base"] + random.gauss(0, 0.3) * spike) if base["press_base"] > 0 else 0,
                    rpm=base["rpm_base"] + random.gauss(0, 30) * spike,
                    current=base["curr_base"] + random.gauss(0, 1.0) * spike,
                )
                await tsdb_service.write(data)
                metrics_calculator.add_data(device_id, data.model_dump())
                alerts = await fault_detector.detect(data)

                await manager.broadcast({
                    "type": "realtime_data",
                    "data": data.model_dump(),
                })
                for alert in alerts:
                    await manager.broadcast_alert(alert)

            if tick % 10 == 0:
                for device_id in SIMULATED_DEVICES:
                    metrics = metrics_calculator.compute_metrics(device_id)
                    if metrics:
                        await manager.broadcast({
                            "type": "metrics_update",
                            "data": {"device_id": device_id, "metrics": [m.model_dump() for m in metrics]},
                        })

            await asyncio.sleep(1)
        except Exception as e:
            print(f"[Simulate] Error: {e}")
            await asyncio.sleep(5)
