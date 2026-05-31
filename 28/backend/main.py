import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import init_db
from app.api.v1 import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    os.makedirs(settings.STATIC_FILES_DIR, exist_ok=True)
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="FastAPI 后端服务 - 支持 PDF 处理、向量存储、用户认证等功能",
    debug=settings.DEBUG,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=settings.CORS_METHODS,
    allow_headers=settings.CORS_HEADERS,
)

app.include_router(api_router, prefix=settings.API_V1_PREFIX)

static_dir = os.path.abspath(settings.STATIC_FILES_DIR)
os.makedirs(static_dir, exist_ok=True)
app.mount(
    settings.STATIC_URL_PREFIX,
    StaticFiles(directory=static_dir),
    name="static",
)


@app.get("/", tags=["根路径"])
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "api_prefix": settings.API_V1_PREFIX,
    }


@app.get("/health", tags=["健康检查"])
async def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        workers=1,
    )
