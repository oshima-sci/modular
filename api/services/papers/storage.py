import hashlib
from uuid import UUID, uuid4

from db import get_supabase_client
from models import Paper, PaperUploadResult, JobType
from services.jobs import JobQueue


BUCKET_NAME = "papers"


class PaperStorage:
    """Service for storing and managing paper PDFs."""

    def __init__(self):
        self.db = get_supabase_client()

    def _compute_sha256(self, content: bytes) -> str:
        """Compute SHA256 hash of file content."""
        return hashlib.sha256(content).hexdigest()

    def _find_by_sha256(self, sha256: str) -> Paper | None:
        """Find existing paper by SHA256 hash."""
        result = self.db.table("papers").select("*").eq("sha256", sha256).execute()
        if result.data:
            return Paper(**result.data[0])
        return None

    def upload_paper(self, filename: str, content: bytes, content_type: str = "application/pdf") -> PaperUploadResult:
        """
        Upload a single paper PDF.

        - Computes SHA256 for deduplication
        - Uploads to Supabase storage bucket
        - Creates papers table record

        Returns PaperUploadResult with success/failure info.
        """
        sha256 = self._compute_sha256(content)

        # Check for duplicate
        existing = self._find_by_sha256(sha256)
        if existing:
            return PaperUploadResult(
                filename=filename,
                success=True,
                duplicate_of=existing.id,
                error="Duplicate file already exists"
            )

        # Generate unique storage path: {paper_id}/original.pdf
        paper_id = uuid4()
        storage_path = f"{paper_id}/original.pdf"

        try:
            # Upload to bucket
            self.db.storage.from_(BUCKET_NAME).upload(
                path=storage_path,
                file=content,
                file_options={"content-type": content_type}
            )

            # Insert record into papers table
            # Title defaults to filename, will be updated after parsing
            result = self.db.table("papers").insert({
                "id": str(paper_id),
                "title": filename.rsplit(".", 1)[0],  # Remove .pdf extension
                "filename": filename,
                "storage_path": storage_path,
                "file_size": len(content),
                "content_type": content_type,
                "sha256": sha256,
            }).execute()

            paper = Paper(**result.data[0])

            # Create parse_paper job
            job_queue = JobQueue()
            job_queue.create_job_by_type(
                job_type=JobType.PARSE_PAPER,
                payload={"paper_id": str(paper_id)}
            )

            return PaperUploadResult(
                paper=paper,
                filename=filename,
                success=True
            )

        except Exception as e:
            return PaperUploadResult(
                filename=filename,
                success=False,
                error=str(e)
            )

    def upload_papers(self, files: list[tuple[str, bytes, str]]) -> list[PaperUploadResult]:
        """
        Upload multiple papers.

        Args:
            files: List of (filename, content, content_type) tuples

        Returns:
            List of PaperUploadResult for each file
        """
        results = []
        for filename, content, content_type in files:
            result = self.upload_paper(filename, content, content_type)
            results.append(result)
        return results

    def get_paper(self, paper_id: UUID) -> Paper | None:
        """Get a paper by ID."""
        result = self.db.table("papers").select("*").eq("id", str(paper_id)).execute()
        if not result.data:
            return None
        return Paper(**result.data[0])

    def list_papers(self, limit: int = 50) -> list[Paper]:
        """List papers, ordered by creation date."""
        result = (
            self.db.table("papers")
            .select("*")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return [Paper(**row) for row in result.data]
