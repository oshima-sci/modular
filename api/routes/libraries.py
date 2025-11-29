from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from db.queries.libraries import LibraryQueries
from dependencies.auth import get_current_user, get_optional_user, UserContext
from models.library import (
    ExtractsByType,
    Library,
    LibraryCreateRequest,
    LibraryCreateResponse,
    LibraryData,
    LibraryFullResponse,
    LibraryMetadata,
    LibraryStats,
    LibraryWithPapers,
    ProcessingStatus,
)
from services.jobs import JobQueue
from services.link.queue import maybe_queue_link_library_for_library

router = APIRouter(prefix="/api/library", tags=["libraries"])


def get_queries() -> LibraryQueries:
    return LibraryQueries()


@router.post("", response_model=LibraryCreateResponse)
async def create_or_update_library(
    request: LibraryCreateRequest,
    user: UserContext | None = Depends(get_optional_user),
    queries: LibraryQueries = Depends(get_queries),
):
    """
    Create a library and/or add papers to it.

    - If library_id is provided: add papers to that existing library
    - If library_name is provided (no library_id): create a new library with that name
    - paper_ids: list of paper UUIDs to add to the library
    - Authentication is optional; if provided, library is linked to user
    """
    created = False
    user_id = user.user_id if user else None

    if request.library_id:
        # Use existing library
        library = queries.get_by_id(request.library_id)
        if not library:
            raise HTTPException(status_code=404, detail="Library not found")

        # Verify ownership if library has an owner
        if library["owner_id"] and library["owner_id"] != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to modify this library")
    else:
        # Create new library
        library = queries.create(title=request.library_name, owner_id=user_id)
        if not library:
            raise HTTPException(status_code=500, detail="Failed to create library")
        created = True

    # Add papers to library
    added = queries.add_papers(library["id"], request.paper_ids)

    # Queue LINK_LIBRARY job if conditions are met
    if added:
        maybe_queue_link_library_for_library(library["id"])

    return LibraryCreateResponse(
        library=Library(**library),
        papers_added=len(added),
        created=created,
    )


@router.get("", response_model=list[Library])
async def list_libraries(
    user: UserContext | None = Depends(get_optional_user),
    queries: LibraryQueries = Depends(get_queries),
    limit: int = 50,
):
    """List libraries. If authenticated, returns user's libraries. Otherwise returns unowned libraries."""
    if user:
        libraries = queries.list_by_owner(user.user_id, limit=limit)
    else:
        libraries = queries.list_by_owner(None, limit=limit)
    return [Library(**lib) for lib in libraries]


@router.get("/{library_id}", response_model=LibraryFullResponse)
async def get_library(
    library_id: UUID,
    user: UserContext | None = Depends(get_optional_user),
    queries: LibraryQueries = Depends(get_queries),
):
    """Get a library with all its papers, extracts, and links."""
    result = queries.get_full_library(library_id)

    if not result:
        raise HTTPException(status_code=404, detail="Library not found")

    library = result["library"]

    # Allow access if: library has no owner, or user owns it
    user_id = user.user_id if user else None
    if library["owner_id"] and library["owner_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to view this library")

    # Auto-trigger linking if library is idle and has unlinked extracts
    job_queue = JobQueue()
    if job_queue.should_queue_link_library(library_id):
        maybe_queue_link_library_for_library(library_id)

    return LibraryFullResponse(
        metadata=LibraryMetadata(
            id=library["id"],
            owner_id=library.get("owner_id"),
            title=library["title"],
            created_at=library["created_at"],
            updated_at=library["updated_at"],
            stats=LibraryStats(**result["stats"]),
        ),
        data=LibraryData(
            papers=result["papers"],
            extracts=ExtractsByType(**result["extracts"]),
            links=result["links"],
        ),
        processing=ProcessingStatus(**result["processing"]),
    )


@router.delete("/{library_id}")
async def delete_library(
    library_id: UUID,
    user: UserContext | None = Depends(get_optional_user),
    queries: LibraryQueries = Depends(get_queries),
):
    """Delete a library. Requires ownership if library has an owner."""
    library = queries.get_by_id(library_id)

    if not library:
        raise HTTPException(status_code=404, detail="Library not found")

    user_id = user.user_id if user else None
    if library["owner_id"] and library["owner_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this library")

    queries.delete(library_id)
    return {"deleted": True}
