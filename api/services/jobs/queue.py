from typing import Any
from uuid import UUID

from db import get_supabase_client
from models import Job, JobCreate, JobStatus


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
