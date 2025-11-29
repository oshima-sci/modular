from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from db import get_supabase_client
from models import Job, JobCreate, JobStatus, JobType


class JobQueue:
    """Service for managing the job queue."""

    def __init__(self):
        self.db = get_supabase_client()

    def create_job(self, job_data: JobCreate) -> Job:
        """Create a new job in the queue."""
        result = self.db.table("jobs").insert({
            "job_type": job_data.job_type.value,
            "payload": job_data.payload,
            "max_attempts": job_data.max_attempts,
        }).execute()

        return Job(**result.data[0])

    def create_job_by_type(
        self,
        job_type: JobType,
        payload: dict[str, Any],
        max_attempts: int = 3
    ) -> Job:
        """Convenience method to create a job directly by type."""
        job_data = JobCreate(job_type=job_type, payload=payload, max_attempts=max_attempts)
        return self.create_job(job_data)

    def get_job(self, job_id: UUID) -> Job | None:
        """Get a job by ID."""
        result = self.db.table("jobs").select("*").eq("id", str(job_id)).execute()

        if not result.data:
            return None

        return Job(**result.data[0])

    def list_jobs(
        self,
        status: JobStatus | None = None,
        limit: int = 50
    ) -> list[Job]:
        """List jobs, optionally filtered by status."""
        query = self.db.table("jobs").select("*").order("created_at", desc=True).limit(limit)

        if status:
            query = query.eq("status", status.value)

        result = query.execute()
        return [Job(**row) for row in result.data]

    def claim_job(self, worker_id: str) -> dict | None:
        """Claim the next available job. Returns job data or None."""
        result = self.db.rpc("claim_job", {"worker_id": worker_id}).execute()

        if not result.data:
            return None

        return result.data[0]

    def complete_job(
        self,
        job_id: UUID,
        worker_id: str,
        status: JobStatus,
        result: dict[str, Any] | None = None,
        error: str | None = None
    ) -> bool:
        """Mark a job as completed or failed."""
        rpc_result = self.db.rpc("complete_job", {
            "job_id": str(job_id),
            "worker_id": worker_id,
            "new_status": status.value,
            "job_result": result,
            "job_error": error,
        }).execute()

        return rpc_result.data is True

    def has_pending_processing_jobs_for_library(
        self,
        library_id: str | UUID,
        exclude_job_id: str | UUID | None = None,
    ) -> bool:
        """
        Check if any papers in the library have pending/running processing jobs.

        Looks for PARSE_PAPER or EXTRACT_ELEMENTS jobs that are pending or running
        for any paper connected to this library.

        Args:
            library_id: UUID of the library to check

        Returns:
            True if there are pending/running processing jobs, False otherwise
        """
        # Get all paper_ids in this library
        library_papers = (
            self.db.table("library_papers")
            .select("paper_id")
            .eq("library_id", str(library_id))
            .execute()
        )

        if not library_papers.data:
            return False

        paper_ids = [lp["paper_id"] for lp in library_papers.data]

        # Check for pending/running PARSE_PAPER or EXTRACT_ELEMENTS jobs
        # Jobs store paper_id in payload->>'paper_id'
        processing_types = [JobType.PARSE_PAPER.value, JobType.EXTRACT_ELEMENTS.value]
        active_statuses = [JobStatus.PENDING.value, JobStatus.RUNNING.value]

        for paper_id in paper_ids:
            query = (
                self.db.table("jobs")
                .select("id")
                .in_("job_type", processing_types)
                .in_("status", active_statuses)
                .eq("payload->>paper_id", paper_id)
            )
            if exclude_job_id:
                query = query.neq("id", str(exclude_job_id))
            result = query.limit(1).execute()
            if result.data:
                return True

        return False

    def has_recent_pending_link_job(
        self,
        library_id: str | UUID,
        minutes: int = 3,
    ) -> bool:
        """
        Check if there's a recent pending LINK_LIBRARY job for this library.

        Used to prevent duplicate link jobs when multiple papers finish processing
        around the same time. Only checks pending (not running) - running jobs are
        fine because concurrent jobs handle distinct time windows via cutoff.

        Args:
            library_id: UUID of the library to check
            minutes: How far back to look for existing jobs (default 3 minutes)

        Returns:
            True if there's a recent pending link job, False otherwise
        """
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=minutes)

        result = (
            self.db.table("jobs")
            .select("id")
            .eq("job_type", JobType.LINK_LIBRARY.value)
            .eq("status", JobStatus.PENDING.value)
            .eq("payload->>library_id", str(library_id))
            .gte("created_at", cutoff.isoformat())
            .limit(1)
            .execute()
        )

        return len(result.data) > 0

    def get_previous_link_job_claimed_at(
        self,
        library_id: str | UUID,
    ) -> datetime | None:
        """
        Get the claimed_at timestamp of the most recent completed/running LINK_LIBRARY job.

        Used to determine the cutoff for which extracts are "new" to this library.
        New jobs should process extracts created or added after this timestamp.

        Args:
            library_id: UUID of the library

        Returns:
            claimed_at timestamp of the previous job, or None if no previous job exists
        """
        result = (
            self.db.table("jobs")
            .select("claimed_at")
            .eq("job_type", JobType.LINK_LIBRARY.value)
            .in_("status", [JobStatus.COMPLETED.value, JobStatus.RUNNING.value])
            .eq("payload->>library_id", str(library_id))
            .order("claimed_at", desc=True)
            .limit(1)
            .execute()
        )

        if not result.data or not result.data[0].get("claimed_at"):
            return None

        # Parse the timestamp string to datetime
        claimed_at_str = result.data[0]["claimed_at"]
        if isinstance(claimed_at_str, str):
            # Handle ISO format with timezone
            return datetime.fromisoformat(claimed_at_str.replace("Z", "+00:00"))
        return claimed_at_str

    def has_unlinked_extracts_for_library(self, library_id: str | UUID) -> bool:
        """
        Check if a library has extracts that haven't been processed by a linking job.

        Returns True if:
        - No previous link job exists AND library has claims and observations, OR
        - There are extracts created after the last completed link job

        Args:
            library_id: UUID of the library

        Returns:
            True if there are unlinked extracts, False otherwise
        """
        from db.queries.extracts import ExtractQueries

        extract_queries = ExtractQueries()
        last_link_at = self.get_previous_link_job_claimed_at(library_id)

        if last_link_at is None:
            # Never linked - check if library has both claims and observations
            extracts = extract_queries.get_all_extracts_by_library(library_id)
            return len(extracts["claims"]) > 0 and len(extracts["observations"]) > 0

        # Check if there are claims created after the cutoff
        unlinked_claims = extract_queries.get_unlinked_claims_for_library(
            library_id, cutoff=last_link_at
        )
        return len(unlinked_claims) > 0

    def should_queue_link_library(self, library_id: str | UUID) -> bool:
        """
        Check if a LINK_LIBRARY job should be queued for this library.

        Returns True if:
        1. No papers are currently processing
        2. No recent pending link job exists
        3. There are unlinked extracts (new or created after last link job)

        Args:
            library_id: UUID of the library

        Returns:
            True if linking should be queued, False otherwise
        """
        if self.has_pending_processing_jobs_for_library(library_id):
            return False
        if self.has_recent_pending_link_job(library_id):
            return False
        return self.has_unlinked_extracts_for_library(library_id)
