"""
Submission endpoints — Phases 2 & 4
Upload, list, detail, status polling, and delete.
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from typing import List, Optional
import hashlib
import uuid
import os

from app.db.session import get_db
from app.models.user import User
from app.models.submission import Submission
from app.schemas.submission import (
    SubmissionResponse,
    SubmissionDetailResponse,
    SubmissionStatusResponse,
)
from app.api.v1.endpoints.auth import get_current_user
from app.services.storage import storage_service
from app.core.config import settings

router = APIRouter()

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}


def _get_file_type(filename: str) -> str:
    """Extract file extension without the dot."""
    ext = os.path.splitext(filename)[1].lower()
    return ext.lstrip(".")


@router.post("/", response_model=SubmissionResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    title: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a document for authenticity analysis.

    Accepts PDF, DOCX, or TXT files. Saves the file via the storage service,
    creates a Submission record, and dispatches the Celery processing task.
    """
    # Validate file extension
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # Read content and enforce size limit
    content = await file.read()
    max_bytes = settings.UPLOAD_MAX_SIZE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {settings.UPLOAD_MAX_SIZE_MB} MB limit.",
        )

    # Save file via storage service
    submission_id = uuid.uuid4()
    file_hash = hashlib.sha256(content).hexdigest()
    file_path = await storage_service.save_file(
        submission_id=str(submission_id),
        filename=file.filename,
        content=content,
    )

    # Create submission record
    submission = Submission(
        id=submission_id,
        user_id=current_user.id,
        title=title or file.filename,
        original_filename=file.filename,
        storage_path=file_path,
        file_type=_get_file_type(file.filename),
        file_hash=file_hash,
        status="pending",
    )
    db.add(submission)
    await db.commit()
    await db.refresh(submission)

    # Dispatch async processing task
    try:
        from app.tasks.celery_worker import process_submission_task
        process_submission_task.delay(str(submission_id), file_path)
    except Exception as e:
        # If Celery/Redis is unavailable, log but don't fail the upload
        import logging
        logging.getLogger(__name__).warning(f"Failed to dispatch Celery task: {e}")

    return submission


@router.get("/", response_model=List[SubmissionResponse])
async def list_submissions(
    status_filter: Optional[str] = Query(None, alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List the current user's submissions, with optional status filter and pagination."""
    query = select(Submission).where(Submission.user_id == current_user.id)
    if status_filter:
        query = query.where(Submission.status == status_filter)
    query = query.order_by(Submission.uploaded_at.desc()).offset(skip).limit(limit)

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{submission_id}", response_model=SubmissionDetailResponse)
async def get_submission(
    submission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get detailed info about a specific submission."""
    result = await db.execute(
        select(Submission).where(
            Submission.id == submission_id,
            Submission.user_id == current_user.id,
        )
    )
    submission = result.scalars().first()
    if not submission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
    return submission


@router.get("/{submission_id}/status", response_model=SubmissionStatusResponse)
async def get_submission_status(
    submission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Poll the processing status of a submission.

    Frontend should poll this while status is 'pending' or 'processing'.
    """
    result = await db.execute(
        select(Submission).where(
            Submission.id == submission_id,
            Submission.user_id == current_user.id,
        )
    )
    submission = result.scalars().first()
    if not submission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
    return submission


@router.delete("/{submission_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_submission(
    submission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a submission and its associated files."""
    result = await db.execute(
        select(Submission).where(
            Submission.id == submission_id,
            Submission.user_id == current_user.id,
        )
    )
    submission = result.scalars().first()
    if not submission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    # Delete stored files
    await storage_service.delete_submission_files(str(submission_id))

    # Delete DB record (cascades to analysis_results, report, flagged_segments)
    await db.delete(submission)
    await db.commit()
