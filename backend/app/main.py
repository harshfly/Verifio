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

    # Seed default demo users for local zero-setup usage
    from app.db.session import AsyncSessionLocal
    from app.models.user import User
    from app.core.security import get_password_hash
    from sqlalchemy.future import select
    import uuid

    demo_users = [
        ("harsh@example.com", "Harsh Malviya", "securepassword123", "evaluator"),
        ("evaluator@university.edu", "Dr. Sarah Chen", "demo12345", "evaluator"),
        ("admin@verifio.internal", "System Administrator", "demo12345", "admin"),
        ("student@university.edu", "Alex Johnson", "demo12345", "student"),
    ]

    try:
        async with AsyncSessionLocal() as session:
            for email, name, password, role in demo_users:
                res = await session.execute(select(User).where(User.email == email))
                if not res.scalars().first():
                    user = User(
                        id=uuid.uuid4(),
                        email=email,
                        name=name,
                        password_hash=get_password_hash(password),
                        role=role,
                    )
                    session.add(user)
            await session.commit()
        logger.info("Default demo users verified and seeded")
    except Exception as e:
        logger.warning(f"Error seeding demo users: {e}")


@app.get("/health", tags=["system"])
async def health_check():
    return {"status": "healthy", "version": "1.0.0"}


app.include_router(api_router, prefix="/api/v1")
