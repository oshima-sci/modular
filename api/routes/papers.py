from uuid import UUID

from fastapi import APIRouter, File, HTTPException, UploadFile

from models import Paper, PapersUploadResponse
from services.papers import PaperStorage

router = APIRouter(prefix="/api/papers", tags=["papers"])


def get_storage() -> PaperStorage:
    return PaperStorage()


@router.post("/upload", response_model=PapersUploadResponse)
async def upload_papers(files: list[UploadFile] = File(...)):
    """
    Upload multiple paper PDFs.

    - Accepts multiple PDF files
    - Stores each in Supabase bucket
    - Creates paper records in database
    - Deduplicates by SHA256 hash
    """
    storage = get_storage()

    # Read all files and prepare for upload
    file_data = []
    for file in files:
        content = await file.read()
        content_type = file.content_type or "application/pdf"
        file_data.append((file.filename, content, content_type))

    # Upload all papers
    results = storage.upload_papers(file_data)

    # Compute summary stats
    successful = sum(1 for r in results if r.success and not r.duplicate_of)
    duplicates = sum(1 for r in results if r.duplicate_of is not None)
    failed = sum(1 for r in results if not r.success)

    return PapersUploadResponse(
        uploaded=results,
        total=len(results),
        successful=successful,
        duplicates=duplicates,
        failed=failed
    )


@router.get("/{paper_id}", response_model=Paper)
async def get_paper(paper_id: UUID):
    """Get a paper by ID."""
    storage = get_storage()
    paper = storage.get_paper(paper_id)

    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    return paper


@router.get("", response_model=list[Paper])
async def list_papers(limit: int = 50):
    """List all papers."""
    storage = get_storage()
    return storage.list_papers(limit=limit)
