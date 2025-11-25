import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import jobs_router, papers_router
from services.jobs import JobQueue, JobHandlers

logger = logging.getLogger(__name__)

# Background worker tasks
worker_tasks: list[asyncio.Task] = []
NUM_WORKERS = 4


async def run_worker(worker_id: str, queue: JobQueue, handlers: JobHandlers, poll_interval: float = 5.0):
    """Simple background worker that processes jobs."""
    from models import JobStatus, JobType

    logger.info(f"[{worker_id}] Started")

    while True:
        try:
            job = queue.claim_job(worker_id)

            if job:
                job_id = job["id"]
                job_type = job["job_type"]
                payload = job.get("payload") or {}

                logger.info(f"[{worker_id}] Processing job {job_id[:8]}... (type={job_type})")

                try:
                    result = await asyncio.get_event_loop().run_in_executor(
                        None,
                        handlers.process,
                        JobType(job_type),
                        payload,
                    )

                    queue.complete_job(
                        job_id=job_id,
                        worker_id=worker_id,
                        status=JobStatus.COMPLETED,
                        result=result,
                    )
                    logger.info(f"[{worker_id}] Completed job {job_id[:8]}...")

                except Exception as e:
                    queue.complete_job(
                        job_id=job_id,
                        worker_id=worker_id,
                        status=JobStatus.FAILED,
                        error=str(e),
                    )
                    logger.error(f"[{worker_id}] Failed job {job_id[:8]}...: {e}")

            else:
                await asyncio.sleep(poll_interval)

        except asyncio.CancelledError:
            logger.info(f"[{worker_id}] Shutting down")
            break
        except Exception as e:
            logger.error(f"[{worker_id}] Error in worker loop: {e}")
            await asyncio.sleep(poll_interval)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start background workers on startup, stop on shutdown."""
    global worker_tasks

    queue = JobQueue()
    handlers = JobHandlers()

    # Start multiple workers
    for i in range(NUM_WORKERS):
        worker_id = f"api-worker-{i + 1}"
        task = asyncio.create_task(run_worker(worker_id, queue, handlers))
        worker_tasks.append(task)

    logger.info(f"Started {NUM_WORKERS} background workers")

    yield

    # Stop all workers
    for task in worker_tasks:
        task.cancel()

    for task in worker_tasks:
        try:
            await task
        except asyncio.CancelledError:
            pass

    logger.info(f"Stopped {NUM_WORKERS} background workers")


app = FastAPI(lifespan=lifespan)

# Include routers
app.include_router(jobs_router)
app.include_router(papers_router)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite's default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Hello from FastAPI!"}

@app.get("/api/health")
async def health():
    return {"status": "healthy"}
