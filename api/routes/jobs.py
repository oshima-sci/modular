from uuid import UUID

from fastapi import APIRouter, HTTPException

from models import Job, JobCreate, JobStatus
from services.jobs import JobQueue

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


def get_queue() -> JobQueue:
    return JobQueue()


@router.post("", response_model=Job)
async def create_job(job_data: JobCreate):
    """Create a new job in the queue."""
    queue = get_queue()
    return queue.create_job(job_data)


@router.get("/{job_id}", response_model=Job)
async def get_job(job_id: UUID):
    """Get a job by ID."""
    queue = get_queue()
    job = queue.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return job


@router.get("", response_model=list[Job])
async def list_jobs(status: JobStatus | None = None, limit: int = 50):
    """List jobs, optionally filtered by status."""
    queue = get_queue()
    return queue.list_jobs(status=status, limit=limit)
