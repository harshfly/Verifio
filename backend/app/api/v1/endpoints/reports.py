"""
Report endpoints — Phase 7 (API portion, brought forward into Phase 6 wiring)
Serves the full authenticity report for a submission.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
import uuid

from app.db.session import get_db
from app.models.user import User
from app.models.submission import Submission
from app.models.report import Report
from app.models.analysis_result import AnalysisResult
from app.schemas.report import (
    ReportResponse,
    FullReportResponse,
    ModuleDetailResponse,
)
from app.api.v1.endpoints.auth import get_current_user

router = APIRouter()


@router.get("/{submission_id}", response_model=FullReportResponse)
async def get_report(
    submission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the full authenticity report for a submission.

    Returns the combined report, per-module detail breakdowns,
    and all flagged segments with evidence.
    """
    # Verify the user owns this submission
    sub_result = await db.execute(
        select(Submission).where(
            Submission.id == submission_id,
            Submission.user_id == current_user.id,
        )
    )
    submission = sub_result.scalars().first()
    if not submission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    # Fetch the report with flagged segments
    report_result = await db.execute(
        select(Report)
        .where(Report.submission_id == submission_id)
        .options(selectinload(Report.flagged_segments))
    )
    report = report_result.scalars().first()
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not yet generated. Check submission status.",
        )

    # Fetch per-module analysis results
    analysis_result = await db.execute(
        select(AnalysisResult).where(AnalysisResult.submission_id == submission_id)
    )
    modules = analysis_result.scalars().all()

    return FullReportResponse(
        report=ReportResponse.model_validate(report),
        module_details=[
            ModuleDetailResponse(
                module_name=m.module_name,
                risk_score=float(m.risk_score),
                details=m.details,
            )
            for m in modules
        ],
        submission={
            "id": str(submission.id),
            "title": submission.title,
            "original_filename": submission.original_filename,
            "file_type": submission.file_type,
            "status": submission.status,
            "raw_text": submission.raw_text,
            "uploaded_at": submission.uploaded_at.isoformat() if submission.uploaded_at else None,
        },
    )
