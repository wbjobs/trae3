from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .config import settings
from .database import init_db
from .routers import (
    data_query_router,
    data_cleaning_router,
    fault_stats_router,
    array_group_router,
    report_router
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    try:
        from .mock import init_mock_data
        init_mock_data()
    except Exception as e:
        print(f"Mock data init: {e}")
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="光伏阵列工况时序数据分析可视化系统 API",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["系统"])
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "docs": "/docs"
    }


@app.get("/health", tags=["系统"])
async def health_check():
    return {"status": "healthy"}


app.include_router(data_query_router, prefix=settings.API_PREFIX)
app.include_router(data_cleaning_router, prefix=settings.API_PREFIX)
app.include_router(fault_stats_router, prefix=settings.API_PREFIX)
app.include_router(array_group_router, prefix=settings.API_PREFIX)
app.include_router(report_router, prefix=settings.API_PREFIX)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )
