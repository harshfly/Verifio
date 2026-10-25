from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.router import api_router
from app.db.session import engine, Base
# Import all models so Base.metadata knows about every table
import app.models  # noqa: F401
import logging
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Verifio API",
    description="AI-powered academic authenticity validation backend",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    # Ensure storage directory exists
    from app.core.config import settings
    os.makedirs(settings.STORAGE_DIR, exist_ok=True)

    async with engine.begin() as conn:
        # Create all tables on startup
        # In production, use Alembic migrations instead
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables created / verified")


@app.get("/health", tags=["system"])
async def health_check():
    return {"status": "healthy", "version": "1.0.0"}


app.include_router(api_router, prefix="/api/v1")
