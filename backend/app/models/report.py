from datetime import datetime, timezone as tz
import uuid
from sqlalchemy import Column, String, DateTime, func, ForeignKey, Numeric, Uuid, JSON
from sqlalchemy.orm import relationship
from app.db.session import Base


class Report(Base):
    """Combined authenticity report for a submission — the final deliverable."""
    __tablename__ = "reports"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    submission_id = Column(Uuid, ForeignKey("submissions.id"), unique=True, nullable=False)

    authenticity_score = Column(Numeric, nullable=False)           # 0-100 overall risk score
    plagiarism_score = Column(Numeric, nullable=False, default=0)
    ai_detection_score = Column(Numeric, nullable=False, default=0)
    manipulation_score = Column(Numeric, nullable=False, default=0)
    similarity_score = Column(Numeric, nullable=False, default=0)

    weight_config_json = Column(JSON)           # weights used for this run
    status = Column(String, nullable=False)      # clean | review | flagged

    generated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(tz.utc), server_default=func.now())

    submission = relationship("Submission", back_populates="report")
    flagged_segments = relationship("FlaggedSegment", back_populates="report", cascade="all, delete-orphan")


class FlaggedSegment(Base):
    """An individual piece of evidence flagged by a detection module."""
    __tablename__ = "flagged_segments"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    report_id = Column(Uuid, ForeignKey("reports.id"), nullable=False)
    sentence_id = Column(String, nullable=True)
    segment_text = Column(String, nullable=False)
    module = Column(String, nullable=False)       # plagiarism | ai_detection | manipulation | similarity
    severity = Column(String, nullable=False)     # low | medium | high
    matched_source_ref = Column(String, nullable=True)
    confidence = Column(Numeric, nullable=True)

    report = relationship("Report", back_populates="flagged_segments")
