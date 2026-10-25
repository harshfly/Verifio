from sqlalchemy import Column, String, DateTime, text, ForeignKey, Numeric
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.db.session import Base


class AnalysisResult(Base):
    """Per-module analysis output (plagiarism, similarity, ai_detection, manipulation)."""
    __tablename__ = "analysis_results"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    submission_id = Column(UUID(as_uuid=True), ForeignKey("submissions.id"), nullable=False)
    module_name = Column(String, nullable=False)   # plagiarism | similarity | ai_detection | manipulation
    risk_score = Column(Numeric, nullable=False)    # 0-100
    details = Column(JSONB)                         # module-specific flagged segments and evidence
    created_at = Column(DateTime(timezone=True), server_default=text("now()"))

    submission = relationship("Submission", back_populates="analysis_results")
