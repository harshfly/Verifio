"""
Admin endpoints — Phase 8 (scaffolded now for Phase 6 completeness)
Aggregate stats and weight configuration management.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func

from app.db.session import get_db
from app.models.user import User
from app.models.submission import Submission
from app.models.report import Report
from app.schemas.report import WeightConfigResponse, WeightConfigUpdate
from app.api.v1.endpoints.auth import require_role
from app.pipeline.scoring import DEFAULT_WEIGHTS

router = APIRouter()

# In-memory weight config (in production, persist to a settings table)
_current_weights = dict(DEFAULT_WEIGHTS)


@router.get("/stats")
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("evaluator", "admin")),
):
    """Aggregate dashboard metrics: submission counts by status, score distribution."""
    # Count submissions by status
    status_counts_result = await db.execute(
        select(Submission.status, func.count(Submission.id))
        .group_by(Submission.status)
    )
    status_counts = {row[0]: row[1] for row in status_counts_result.all()}

    # Count reports by status band
    report_counts_result = await db.execute(
        select(Report.status, func.count(Report.id))
        .group_by(Report.status)
    )
    report_counts = {row[0]: row[1] for row in report_counts_result.all()}

    # Average authenticity score
    avg_result = await db.execute(select(func.avg(Report.authenticity_score)))
    avg_score = avg_result.scalar()

    # Total users
    user_count_result = await db.execute(select(func.count(User.id)))
    total_users = user_count_result.scalar()

    return {
        "submissions_by_status": status_counts,
        "reports_by_status": report_counts,
        "average_authenticity_score": round(float(avg_score), 1) if avg_score else None,
        "total_users": total_users,
        "total_submissions": sum(status_counts.values()),
        "total_reports": sum(report_counts.values()),
    }


@router.get("/weight-config", response_model=WeightConfigResponse)
async def get_weight_config(
    current_user: User = Depends(require_role("admin")),
):
    """Get the current scoring engine weight configuration."""
    return WeightConfigResponse(**_current_weights)


@router.put("/weight-config", response_model=WeightConfigResponse)
async def update_weight_config(
    config: WeightConfigUpdate,
    current_user: User = Depends(require_role("admin")),
):
    """Update the scoring engine weights. Weights must sum to 1.0."""
    total = config.plagiarism + config.similarity + config.ai_detection + config.manipulation
    if abs(total - 1.0) > 0.01:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Weights must sum to 1.0, got {total:.3f}",
        )

    _current_weights["plagiarism"] = config.plagiarism
    _current_weights["similarity"] = config.similarity
    _current_weights["ai_detection"] = config.ai_detection
    _current_weights["manipulation"] = config.manipulation

    return WeightConfigResponse(**_current_weights)
