from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
import sys
import time
from datetime import datetime

from app.config import settings
from app.api.v1.health import router as health_router
from app.api.v1.document import router as document_router


def setup_logging():
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)
    
    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    console_handler.setLevel(logging.INFO)
    
    logger.handlers.clear()
    logger.addHandler(console_handler)
    
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.error").setLevel(logging.ERROR)
    
    return logger


logger = setup_logging()

app = FastAPI(
    title="文书手写字迹识别 API",
    description="基于深度学习的文书手写体识别与内容结构化系统",
    version="1.1.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    
    logger.info(f"请求开始 - {request.method} {request.url.path}")
    
    try:
        response = await call_next(request)
        process_time = (time.time() - start_time) * 1000
        logger.info(
            f"请求完成 - {request.method} {request.url.path} - "
            f"状态码: {response.status_code} - 耗时: {process_time:.2f}ms"
        )
        return response
    except Exception as e:
        process_time = (time.time() - start_time) * 1000
        logger.error(
            f"请求异常 - {request.method} {request.url.path} - "
            f"异常: {str(e)} - 耗时: {process_time:.2f}ms",
            exc_info=True
        )
        raise


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    logger.warning(f"HTTP 异常 - {request.method} {request.url.path}: {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    logger.error(f"值错误 - {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=400,
        content={"detail": str(exc)}
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error(
        f"未捕获异常 - {request.method} {request.url.path}: {exc}",
        exc_info=True
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "服务器内部错误，请稍后重试"}
    )

api_prefix = "/api/v1"
app.include_router(health_router, prefix=api_prefix, tags=["health"])
app.include_router(document_router, prefix=api_prefix)


@app.on_event("startup")
async def startup_event():
    from app.db.database import database
    from app.services.ocr_service import ocr_service
    from app.services.structurize import structurize_service
    
    logger.info("=" * 50)
    logger.info("服务启动中...")
    logger.info("=" * 50)
    
    logger.info(f"服务主机: {settings.app_host}")
    logger.info(f"服务端口: {settings.app_port}")
    logger.info(f"CORS 源: {settings.cors_origins}")
    
    if database.is_connected():
        db_status = await database.check_connection()
        if db_status:
            logger.info("✓ MongoDB 连接正常")
        else:
            logger.warning("⚠ MongoDB 连接异常，将使用内存模式")
    else:
        logger.warning("⚠ MongoDB 未连接，将使用内存模式")
    
    if ocr_service._use_mock:
        logger.warning("⚠ PaddleOCR 未安装，将使用模拟模式")
    else:
        logger.info("✓ PaddleOCR 初始化成功")
    
    logger.info("✓ 结构化提取服务初始化成功")
    
    logger.info("=" * 50)
    logger.info("服务启动完成！")
    logger.info("=" * 50)


@app.on_event("shutdown")
async def shutdown_event():
    from app.db.database import database
    
    logger.info("=" * 50)
    logger.info("服务关闭中...")
    logger.info("=" * 50)
    
    if database.client:
        database.client.close()
        logger.info("✓ MongoDB 连接已关闭")
    
    logger.info("✓ 服务已关闭")
    logger.info("=" * 50)


@app.get("/")
async def root():
    return {
        "name": "文书手写字迹识别 API",
        "version": "1.1.0",
        "status": "running",
        "timestamp": datetime.utcnow().isoformat(),
        "docs": "/docs",
        "health": "/api/v1/health",
        "endpoints": {
            "process_document": "POST /api/v1/documents/process",
            "get_document": "GET /api/v1/documents/{id}",
            "list_documents": "GET /api/v1/documents",
            "delete_document": "DELETE /api/v1/documents/{id}"
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.app_host,
        port=settings.app_port,
        reload=True,
        log_config=None
    )
