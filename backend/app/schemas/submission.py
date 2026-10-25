from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional


class SubmissionResponse(BaseModel):
    id: UUID
    user_id: UUID
    title: Optional[str] = None
    original_filename: str
    file_type: str
    status: str
    uploaded_at: datetime
    processed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SubmissionDetailResponse(SubmissionResponse):
    file_hash: str
    raw_text: Optional[str] = None


class SubmissionStatusResponse(BaseModel):
    id: UUID
    status: str
    uploaded_at: datetime
    processed_at: Optional[datetime] = None

    class Config:
        from_attributes = True
