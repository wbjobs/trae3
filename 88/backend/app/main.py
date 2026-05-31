from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
from .core.database import engine, Base
from .services.database_service import database_service
from .api.v1 import ocr, records

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("应用启动中...")

    Base.metadata.create_all(bind=engine)
    logger.info("数据库表创建完成")

    init_success = database_service.initialize_database()
    if init_success:
        logger.info("数据库服务初始化成功")
    else:
        logger.warning("数据库服务初始化存在警告")

    logger.info("应用启动完成")
    yield
    logger.info("应用关闭中...")


app = FastAPI(
    title="铭牌OCR识别系统 API",
    description="工业铭牌图像识别与信息提取系统",
    version="1.1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ocr.router, prefix="/api/v1/ocr", tags=["OCR识别"])
app.include_router(records.router, prefix="/api/v1/records", tags=["档案记录"])


@app.get("/")
def root():
    return {
        "message": "铭牌OCR识别系统 API 运行正常",
        "version": "1.1.0",
        "features": [
            "反光/模糊图像增强预处理",
            "OCR结果缓存与超时保护",
            "智能字段提取与冲突解决",
            "数据库事务与自动备份"
        ]
    }


@app.get("/health")
def health_check():
    from .core.database import get_db
    from sqlalchemy import text

    try:
        db = next(get_db())
        db.execute(text("SELECT 1"))
        db_status = "healthy"
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"

    ocr_stats = {}
    try:
        from .services.ocr_service import ocr_service
        ocr_stats = ocr_service.get_stats()
    except Exception:
        pass

    return {
        "status": "healthy",
        "database": db_status,
        "ocr_service": ocr_stats
    }


@app.get("/api/v1/status")
def get_system_status():
    from .core.database import get_db
    from .services.ocr_service import ocr_service

    db = next(get_db())

    integrity = database_service.check_database_integrity(db)
    ocr_stats = ocr_service.get_stats()
    statistics = database_service.get_statistics(db)

    return {
        "integrity": integrity,
        "ocr_service": ocr_stats,
        "statistics": statistics
    }
