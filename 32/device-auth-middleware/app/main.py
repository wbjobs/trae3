import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.device import router as device_router
from app.api.permission import router as permission_router
from app.api.access_control import router as access_control_router
from app.models.tenant import Base
from app.database import get_engine
from app.redis import close_redis
from app.schemas.common import ErrorResponse
from app.utils.config import load_config

logger = logging.getLogger("device_auth_middleware")

_CLUSTER_NODE_ID = "standalone"

_STATUS_CODE_MESSAGES = {
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    409: "Conflict",
    422: "Unprocessable Entity",
    429: "Too Many Requests",
    500: "Internal Server Error",
}


def _get_node_id() -> str:
    return _CLUSTER_NODE_ID


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _CLUSTER_NODE_ID
    config = load_config()
    log_level = config.get("server", {}).get("log_level", "info")
    logging.basicConfig(
        level=getattr(logging, log_level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    cluster_cfg = config.get("cluster", {})
    if cluster_cfg.get("enabled"):
        _CLUSTER_NODE_ID = cluster_cfg.get("node_id", "standalone")
        logger.info(f"Cluster mode enabled, node_id={_CLUSTER_NODE_ID}")

    logger.info("Device Auth Middleware started")
    yield
    logger.info("Device Auth Middleware shutting down")
    await close_redis()
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(
        title="硬件设备权限鉴权中台",
        description="多租户硬件设备权限鉴权服务 API",
        version="2.0.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def cluster_tracing_middleware(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id
        request.state.node_id = _get_node_id()

        response = await call_next(request)

        response.headers["X-Request-ID"] = request_id
        response.headers["X-Node-ID"] = _get_node_id()
        rl_headers = getattr(request.state, "ratelimit_headers", None)
        if rl_headers:
            for k, v in rl_headers.items():
                response.headers[k] = v
        return response

    app.include_router(device_router, prefix="/api/v1")
    app.include_router(permission_router, prefix="/api/v1")
    app.include_router(access_control_router, prefix="/api/v1")

    @app.get("/health", tags=["健康检查"])
    async def health_check():
        return {
            "status": "healthy",
            "node_id": _get_node_id(),
            "cluster_enabled": load_config().get("cluster", {}).get("enabled", False),
        }

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        rid = getattr(request.state, "request_id", None)
        nid = getattr(request.state, "node_id", None)
        code = exc.status_code
        body = ErrorResponse(
            code=code,
            message=_STATUS_CODE_MESSAGES.get(code, "Error"),
            detail=str(exc.detail) if exc.detail else None,
            node_id=nid,
            request_id=rid,
        )
        return JSONResponse(status_code=code, content=body.model_dump())

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        rid = getattr(request.state, "request_id", None)
        nid = getattr(request.state, "node_id", None)
        logger.error(f"Unhandled exception: {exc}", exc_info=True)
        body = ErrorResponse(
            code=500,
            message="Internal Server Error",
            detail=str(exc),
            node_id=nid,
            request_id=rid,
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=body.model_dump(),
        )

    return app


app = create_app()
