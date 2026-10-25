from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional, Any


class FlaggedSegmentResponse(BaseModel):
    id: UUID
    sentence_id: Optional[str] = None
    segment_text: str
    module: str
    severity: str
    matched_source_ref: Optional[str] = None
    confidence: Optional[float] = None

    class Config:
        from_attributes = True


class ReportResponse(BaseModel):
    id: UUID
    submission_id: UUID
    authenticity_score: float
    plagiarism_score: float
    ai_detection_score: float
    manipulation_score: float
    similarity_score: float
    weight_config_json: Optional[dict] = None
    status: str
    generated_at: datetime
    flagged_segments: list[FlaggedSegmentResponse] = []

    class Config:
        from_attributes = True


class ReportSummaryResponse(BaseModel):
    """Lightweight report info for list views."""
    id: UUID
    submission_id: UUID
    authenticity_score: float
    status: str
    generated_at: datetime

    class Config:
        from_attributes = True


class ModuleDetailResponse(BaseModel):
    """Per-module analysis detail from the analysis_results table."""
    module_name: str
    risk_score: float
    details: Optional[dict[str, Any]] = None

    class Config:
        from_attributes = True


class FullReportResponse(BaseModel):
    """The complete report with nested module details and flagged segments."""
    report: ReportResponse
    module_details: list[ModuleDetailResponse] = []
    submission: Optional[dict] = None


class WeightConfigResponse(BaseModel):
    plagiarism: float
    similarity: float
    ai_detection: float
    manipulation: float


class WeightConfigUpdate(BaseModel):
    plagiarism: float
    similarity: float
    ai_detection: float
    manipulation: float
