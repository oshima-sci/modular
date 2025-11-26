from datetime import datetime
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
