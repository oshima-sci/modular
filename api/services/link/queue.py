"""Queue management for library linking jobs."""
import logging
from uuid import UUID

from db import LibraryQueries
from models import Job, JobType
from services.jobs import JobQueue

logger = logging.getLogger(__name__)


def maybe_queue_link_library(paper_id: str | UUID) -> list[Job]:
    """
    Check if it's safe to queue LINK_LIBRARY jobs for libraries containing this paper.

    Called after:
    - extract_elements completes for a paper
    - a paper is added to a library

    For each library the paper belongs to:
    1. Check if other papers in the library are still being processed (pending/running
       PARSE_PAPER or EXTRACT_ELEMENTS jobs) → skip if so
    2. Check if there's already a recent pending/running LINK_LIBRARY job for this
       library (within last 3 minutes) → skip if so
    3. Otherwise, queue a LINK_LIBRARY job for this library

    Args:
        paper_id: UUID of the paper that triggered this check

    Returns:
        List of Job objects that were created (may be empty)
    """
    paper_id_str = str(paper_id)
    logger.info(f"Checking if LINK_LIBRARY jobs should be queued for paper_id={paper_id_str}")

    library_queries = LibraryQueries()
    job_queue = JobQueue()

    # Get all libraries this paper belongs to
    libraries = library_queries.get_libraries_for_paper(paper_id)

    if not libraries:
        logger.info(f"Paper {paper_id_str} is not in any libraries, skipping link job")
        return []

    logger.info(f"Paper {paper_id_str} is in {len(libraries)} libraries")

    created_jobs: list[Job] = []

    for library in libraries:
        library_id = library["id"]
        library_title = library.get("title", "Untitled")

        # Check 1: Are there pending/running processing jobs for papers in this library?
        if job_queue.has_pending_processing_jobs_for_library(library_id):
            logger.info(
                f"Library '{library_title}' ({library_id}) has papers still being processed, "
                "skipping LINK_LIBRARY job"
            )
            continue

        # Check 2: Is there already a recent pending/running LINK_LIBRARY job?
        if job_queue.has_recent_pending_link_job(library_id):
            logger.info(
                f"Library '{library_title}' ({library_id}) already has a recent LINK_LIBRARY job, "
                "skipping duplicate"
            )
            continue

        # All checks passed - calculate cutoff and queue the job
        cutoff = job_queue.get_previous_link_job_claimed_at(library_id)
        cutoff_str = cutoff.isoformat() if cutoff else None

        logger.info(
            f"Queueing LINK_LIBRARY job for library '{library_title}' ({library_id}) "
            f"with cutoff={cutoff_str}"
        )
        job = job_queue.create_job_by_type(
            JobType.LINK_LIBRARY,
            payload={"library_id": str(library_id), "cutoff": cutoff_str},
        )
        created_jobs.append(job)
        logger.info(f"Created LINK_LIBRARY job {job.id} for library {library_id}")

    return created_jobs


def maybe_queue_link_library_for_library(library_id: str | UUID) -> Job | None:
    """
    Check if it's safe to queue a LINK_LIBRARY job for a specific library.

    Called after papers are added to a library via the API.

    Args:
        library_id: UUID of the library to check

    Returns:
        Job object if created, None otherwise
    """
    library_id_str = str(library_id)
    logger.info(f"Checking if LINK_LIBRARY job should be queued for library_id={library_id_str}")

    job_queue = JobQueue()

    # Check 1: Are there pending/running processing jobs for papers in this library?
    if job_queue.has_pending_processing_jobs_for_library(library_id):
        logger.info(
            f"Library {library_id_str} has papers still being processed, "
            "skipping LINK_LIBRARY job"
        )
        return None

    # Check 2: Is there already a recent pending/running LINK_LIBRARY job?
    if job_queue.has_recent_pending_link_job(library_id):
        logger.info(
            f"Library {library_id_str} already has a recent LINK_LIBRARY job, "
            "skipping duplicate"
        )
        return None

    # All checks passed - calculate cutoff and queue the job
    cutoff = job_queue.get_previous_link_job_claimed_at(library_id)
    cutoff_str = cutoff.isoformat() if cutoff else None

    logger.info(f"Queueing LINK_LIBRARY job for library {library_id_str} with cutoff={cutoff_str}")
    job = job_queue.create_job_by_type(
        JobType.LINK_LIBRARY,
        payload={"library_id": library_id_str, "cutoff": cutoff_str},
    )
    logger.info(f"Created LINK_LIBRARY job {job.id} for library {library_id_str}")

    return job
