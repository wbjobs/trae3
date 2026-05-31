from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import engine, Base
from app.api import devices, vibration, anomalies, reports, data_collection, advanced

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="工业设备振动数据分析系统",
    description="多文件、跨服务的工业设备时序振动数据分析可视化全栈系统",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(devices.router, prefix="/api")
app.include_router(vibration.router, prefix="/api")
app.include_router(anomalies.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(data_collection.router, prefix="/api")
app.include_router(advanced.router)


@app.get("/")
def root():
    return {
        "message": "工业设备振动数据分析系统 API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
