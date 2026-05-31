import logging
import sys
import time
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

from app.config import settings
from app.database import init_db, get_database_health
from app.tenant.middleware import TenantMiddleware
from app.scheduler.service import scheduler_service
from app.push.service import push_service
from app.data_cleanup.service import data_cleanup_service
from app.middleware.circuit_breaker import circuit_registry
from app.api import api_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ]
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing application...")
    try:
        init_db()
        logger.info("Database initialized")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}", exc_info=True)

    try:
        scheduler_service.start()
        logger.info("Scheduler service started")
    except Exception as e:
        logger.error(f"Scheduler service start failed: {e}", exc_info=True)

    try:
        await push_service.start()
        logger.info("Push service started")
    except Exception as e:
        logger.error(f"Push service start failed: {e}", exc_info=True)

    try:
        await data_cleanup_service.start()
        logger.info("Data cleanup service started")
    except Exception as e:
        logger.error(f"Data cleanup service start failed: {e}", exc_info=True)

    app.state.start_time = time.time()
    logger.info(f"{settings.APP_NAME} v{settings.APP_VERSION} started successfully")

    yield

    logger.info("Shutting down application...")
    try:
        scheduler_service.shutdown()
        logger.info("Scheduler service shutdown")
    except Exception as e:
        logger.error(f"Scheduler service shutdown failed: {e}", exc_info=True)

    try:
        await push_service.shutdown()
        logger.info("Push service shutdown")
    except Exception as e:
        logger.error(f"Push service shutdown failed: {e}", exc_info=True)

    try:
        await data_cleanup_service.shutdown()
        logger.info("Data cleanup service shutdown")
    except Exception as e:
        logger.error(f"Data cleanup service shutdown failed: {e}", exc_info=True)

    logger.info("Application shutdown complete")


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

app.add_middleware(TenantMiddleware)


@app.middleware("http")
async def error_handling_middleware(request: Request, call_next):
    start_time = time.time()
    try:
        response = await call_next(request)
        process_time = (time.time() - start_time) * 1000
        response.headers["X-Process-Time"] = f"{process_time:.2f}ms"
        return response
    except Exception as e:
        process_time = (time.time() - start_time) * 1000
        logger.error(
            f"Unhandled exception for {request.method} {request.url.path}: {e}",
            exc_info=True
        )

        error_detail = {
            "detail": "Internal server error",
            "path": request.url.path,
            "method": request.method,
            "process_time_ms": round(process_time, 2)
        }

        if settings.DEBUG:
            error_detail["error"] = str(e)
            error_detail["error_type"] = type(e).__name__

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_detail
        )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(
        f"Global exception handler caught: {type(exc).__name__}: {exc}",
        exc_info=True
    )

    error_detail = {
        "detail": "An unexpected error occurred",
        "path": request.url.path
    }

    if settings.DEBUG:
        error_detail["error"] = str(exc)
        error_detail["error_type"] = type(exc).__name__

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=error_detail
    )


app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "uptime_seconds": round(time.time() - getattr(app.state, "start_time", time.time()), 2)
    }


@app.get("/health/detailed")
async def detailed_health_check():
    db_health = get_database_health()
    push_stats = push_service.get_queue_stats()
    scheduler_stats = scheduler_service.get_task_stats()
    circuit_status = circuit_registry.get_all_status()

    overall_status = "healthy"
    if any("unhealthy" in v for v in db_health.values() if isinstance(v, str)):
        overall_status = "degraded"
    for cb in circuit_status.values():
        if cb.get("state") == "open":
            overall_status = "degraded"
            break

    return {
        "status": overall_status,
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "uptime_seconds": round(time.time() - getattr(app.state, "start_time", time.time()), 2),
        "databases": db_health,
        "push_service": push_stats,
        "scheduler_service": scheduler_stats,
        "circuit_breakers": circuit_status
    }


@app.get("/metrics")
async def get_metrics():
    db_health = get_database_health()
    push_stats = push_service.get_queue_stats()
    scheduler_stats = scheduler_service.get_task_stats()
    retention_config = data_cleanup_service.get_retention_config()
    circuit_status = circuit_registry.get_all_status()

    return {
        "timestamp": time.time(),
        "service": settings.APP_NAME,
        "uptime_seconds": round(time.time() - getattr(app.state, "start_time", time.time()), 2),
        "databases": db_health,
        "push": push_stats,
        "scheduler": scheduler_stats,
        "retention_config": retention_config,
        "circuit_breakers": circuit_status
    }


@app.get("/admin/circuit-breakers")
async def get_circuit_breaker_status():
    return circuit_registry.get_all_status()


@app.post("/admin/circuit-breakers/{name}/reset")
async def reset_circuit_breaker(name: str):
    cb = circuit_registry.get(name)
    if not cb:
        return JSONResponse(status_code=404, content={"detail": f"Circuit breaker '{name}' not found"})
    await cb.reset()
    return {"message": f"Circuit breaker '{name}' reset to CLOSED"}


@app.post("/admin/cleanup/message-logs")
async def trigger_message_log_cleanup(days: int = 30):
    result = await data_cleanup_service.cleanup_message_logs(days)
    return {"message": "Message log cleanup triggered", "result": result}


@app.post("/admin/cleanup/scheduler-tasks")
async def trigger_scheduler_cleanup(days: int = 90):
    result = await data_cleanup_service.cleanup_scheduler_tasks(days)
    return {"message": "Scheduler task cleanup triggered", "result": result}


@app.post("/admin/cleanup/all")
async def trigger_full_cleanup():
    result = await data_cleanup_service.cleanup_all()
    return {"message": "Full cleanup triggered", "result": result}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=settings.DEBUG)
