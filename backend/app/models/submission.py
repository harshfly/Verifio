from sqlalchemy import Column, String, DateTime, text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.session import Base


class Submission(Base):
    __tablename__ = "submissions"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=True)
    original_filename = Column(String, nullable=False)
    storage_path = Column(String, nullable=False)
    file_type = Column(String, nullable=False)            # pdf | docx | txt
    file_hash = Column(String, nullable=False)
    raw_text = Column(String, nullable=True)               # populated after preprocessing
    status = Column(String, nullable=False, default="pending")  # pending | processing | completed | failed
    uploaded_at = Column(DateTime(timezone=True), server_default=text("now()"))
    processed_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="submissions")
    analysis_results = relationship("AnalysisResult", back_populates="submission", cascade="all, delete-orphan")
    report = relationship("Report", back_populates="submission", uselist=False, cascade="all, delete-orphan")
