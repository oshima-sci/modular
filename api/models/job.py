from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class JobType(str, Enum):
    """Define your job types here."""
    PARSE_PAPER = "parse_paper"
    EXTRACT_CLAIMS = "extract_claims"
    EXTRACT_ELEMENTS = "extract_elements"
    # Add more job types as needed


class JobCreate(BaseModel):
    """Request model for creating a job."""
    job_type: JobType
    payload: dict[str, Any] = Field(default_factory=dict)
    max_attempts: int = Field(default=3, ge=1, le=10)


class Job(BaseModel):
    """Full job model matching database schema."""
    id: UUID
    status: JobStatus
    job_type: JobType
    payload: dict[str, Any] | None = None

    # Claiming
    claimed_by: str | None = None
    claimed_at: datetime | None = None

    # Retry
    attempts: int = 0
    max_attempts: int = 3
    retry_after: datetime | None = None

    # Results
    result: dict[str, Any] | None = None
    error: str | None = None

    # Timestamps
    created_at: datetime
    finished_at: datetime | None = None

    class Config:
        from_attributes = True
