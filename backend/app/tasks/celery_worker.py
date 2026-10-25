"""
Celery worker — Phase 4
Processes document submissions asynchronously.
Runs the full analysis pipeline via the orchestrator.
"""
import asyncio
import logging
from celery import Celery
from app.core.config import settings

logger = logging.getLogger(__name__)

celery_app = Celery(
    "verifio",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)


def _run_async(coro):
    """Helper to run async code from sync Celery tasks."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(bind=True, name="verifio.process_submission", max_retries=2)
def process_submission_task(self, submission_id: str, file_path: str):
    """Celery task that runs the full analysis pipeline on a submission.
    
    This is the async bridge: Celery tasks are synchronous, but our pipeline
    uses async SQLAlchemy and async LLM calls. We create a fresh event loop
    and run the orchestrator inside it.
    """
    logger.info(f"[Task] Starting processing for submission {submission_id}")

    try:
        _run_async(_process_async(submission_id, file_path))
        logger.info(f"[Task] Completed submission {submission_id}")
    except Exception as exc:
        logger.error(f"[Task] Failed submission {submission_id}: {exc}", exc_info=True)
        # Retry with exponential backoff
        raise self.retry(exc=exc, countdown=30 * (self.request.retries + 1))


async def _process_async(submission_id: str, file_path: str):
    """Async wrapper that creates a fresh DB session and runs the pipeline."""
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from sqlalchemy.pool import NullPool
    from app.pipeline.orchestrator import run_pipeline

    # Normalize file path for current OS environment
    file_path = file_path.replace("\\", "/")

    # Create fresh engine with NullPool so asyncpg doesn't share connections across event loops
    worker_engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    WorkerSession = async_sessionmaker(worker_engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with WorkerSession() as db:
            result = await run_pipeline(submission_id, file_path, db)
            logger.info(f"[Task] Pipeline result: {result}")
            return result
    finally:
        await worker_engine.dispose()
