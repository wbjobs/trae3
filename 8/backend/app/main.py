import logging
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from app.config import CORS_ORIGINS
from app.routers import auth, documents, search, chat, users, stats
from init_db import init_database

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_database()
    yield


app = FastAPI(
    title="DocuSem AI",
    description="Private Document Semantic Search",
    version="1.0.0",
    lifespan=lifespan,
    default_response_class=JSONResponse,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def ensure_utf8_response(request: Request, call_next):
    response: Response = await call_next(request)
    if "content-type" in response.headers:
        ct = response.headers["content-type"]
        if "application/json" in ct and "charset" not in ct.lower():
            response.headers["content-type"] = "application/json; charset=utf-8"
    return response


app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(search.router)
app.include_router(chat.router)
app.include_router(users.router)
app.include_router(stats.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
