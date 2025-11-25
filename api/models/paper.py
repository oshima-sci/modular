from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class Paper(BaseModel):
    """Paper record from database."""
    id: UUID
    title: str | None
    filename: str
    storage_path: str
    parsed_path: str | None
    file_size: int | None
    content_type: str | None
    sha256: str
    metadata: dict = {}
    created_at: datetime
    updated_at: datetime


class PaperUploadResult(BaseModel):
    """Result of uploading a single paper."""
    paper: Paper | None = None
    filename: str
    success: bool
    error: str | None = None
    duplicate_of: UUID | None = None


class PapersUploadResponse(BaseModel):
    """Response for bulk paper upload."""
    uploaded: list[PaperUploadResult]
    total: int
    successful: int
    duplicates: int
    failed: int
