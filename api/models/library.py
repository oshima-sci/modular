from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, model_validator


class Library(BaseModel):
    """Library record from database."""
    id: UUID
    owner_id: UUID | None = None
    title: str
    created_at: datetime
    updated_at: datetime


class LibraryWithPapers(Library):
    """Library with its linked papers."""
    papers: list[dict] = []


# --- Full library response models ---


class LibraryPaper(BaseModel):
    """Paper summary for library response."""
    id: UUID
    title: str | None = None
    filename: str
    storage_path: str
    abstract: str | None = None
    added_at: datetime | None = None


class Extract(BaseModel):
    """Extract record."""
    id: UUID
    paper_id: UUID
    job_id: UUID | None = None
    type: str
    content: dict[str, Any]
    created_at: datetime | None = None


class ExtractLink(BaseModel):
    """Link between two extracts."""
    id: UUID
    from_id: UUID
    to_id: UUID
    content: dict[str, Any]
    job_id: UUID | None = None
    created_at: datetime | None = None


class LibraryStats(BaseModel):
    """Statistics for a library."""
    total_papers: int = 0
    total_extracts: int = 0
    total_links: int = 0


class LibraryMetadata(BaseModel):
    """Library metadata with stats."""
    id: UUID
    owner_id: UUID | None = None
    title: str
    created_at: datetime
    updated_at: datetime
    stats: LibraryStats


class ExtractsByType(BaseModel):
    """Extracts grouped by type."""
    claims: list[Extract] = []
    observations: list[Extract] = []
    methods: list[Extract] = []


class LibraryData(BaseModel):
    """Library data containing papers, extracts, and links."""
    papers: list[LibraryPaper] = []
    extracts: ExtractsByType = ExtractsByType()
    links: list[ExtractLink] = []


class LibraryFullResponse(BaseModel):
    """Full library response with metadata and all data."""
    status: str = "success"
    message: str = "Library retrieved successfully"
    metadata: LibraryMetadata
    data: LibraryData


class LibraryCreateRequest(BaseModel):
    """Request to create/update a library with papers."""
    paper_ids: list[UUID]
    library_id: UUID | None = None
    library_name: str | None = None

    @model_validator(mode="after")
    def check_library_id_or_name(self):
        if self.library_id is None and self.library_name is None:
            raise ValueError("Either library_id or library_name must be provided")
        return self


class LibraryCreateResponse(BaseModel):
    """Response after creating/updating a library."""
    library: Library
    papers_added: int
    created: bool  # True if new library was created, False if existing
