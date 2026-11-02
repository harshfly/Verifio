from datetime import datetime, timezone as tz
import uuid
from sqlalchemy import Column, String, DateTime, func, ForeignKey, Numeric, Uuid, JSON
from sqlalchemy.orm import relationship
from app.db.session import Base


class AnalysisResult(Base):
    """Per-module analysis output (plagiarism, similarity, ai_detection, manipulation)."""
    __tablename__ = "analysis_results"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    submission_id = Column(Uuid, ForeignKey("submissions.id"), nullable=False)
    module_name = Column(String, nullable=False)   # plagiarism | similarity | ai_detection | manipulation
    risk_score = Column(Numeric, nullable=False)    # 0-100
    details = Column(JSON)                         # module-specific flagged segments and evidence
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(tz.utc), server_default=func.now())

    submission = relationship("Submission", back_populates="analysis_results")
