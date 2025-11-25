#!/usr/bin/env python3
"""
Background worker for processing jobs from the queue.

Run with: python worker.py
Options:
    --workers N     Number of parallel workers (default: 4)
    --poll-interval Seconds between polls when queue is empty (default: 5)
"""

import argparse
import asyncio
import logging
import os
import signal
import sys
import uuid
from datetime import datetime

import dspy

from models import JobStatus, JobType
from services.jobs import JobQueue, JobHandlers

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("worker")


class Worker:
    """A single worker that claims and processes jobs."""

    def __init__(
        self,
        worker_id: str,
        queue: JobQueue,
        handlers: JobHandlers,
        poll_interval: float = 5.0,
    ):
        self.worker_id = worker_id
        self.queue = queue
        self.handlers = handlers
        self.poll_interval = poll_interval
        self._running = False

    async def run(self):
        """Main worker loop."""
        self._running = True
        logger.info(f"[{self.worker_id}] Started")

        while self._running:
            try:
                job = self.queue.claim_job(self.worker_id)

                if job:
                    await self._process_job(job)
                else:
                    await asyncio.sleep(self.poll_interval)

            except Exception as e:
                logger.error(f"[{self.worker_id}] Error in worker loop: {e}")
                await asyncio.sleep(self.poll_interval)

        logger.info(f"[{self.worker_id}] Stopped")

    async def _process_job(self, job: dict):
        """Process a single job."""
        job_id = job["id"]
        job_type = job["job_type"]
        payload = job.get("payload") or {}
        attempt = job["attempts"]
        max_attempts = job["max_attempts"]

        logger.info(
            f"[{self.worker_id}] Processing job {job_id[:8]}... "
            f"(type={job_type}, attempt {attempt}/{max_attempts})"
        )

        start_time = datetime.now()

        try:
            # Run handler (in thread pool since handlers may be sync)
            result = await asyncio.get_event_loop().run_in_executor(
                None,
                self.handlers.process,
                JobType(job_type),
                payload,
            )

            # Mark completed
            self.queue.complete_job(
                job_id=job_id,
                worker_id=self.worker_id,
                status=JobStatus.COMPLETED,
                result=result,
            )

            duration = (datetime.now() - start_time).total_seconds()
            logger.info(
                f"[{self.worker_id}] Completed job {job_id[:8]}... "
                f"in {duration:.2f}s"
            )

        except Exception as e:
            # Mark failed
            self.queue.complete_job(
                job_id=job_id,
                worker_id=self.worker_id,
                status=JobStatus.FAILED,
                error=str(e),
            )

            duration = (datetime.now() - start_time).total_seconds()
            logger.error(
                f"[{self.worker_id}] Failed job {job_id[:8]}... "
                f"after {duration:.2f}s: {e}"
            )

    def stop(self):
        """Signal the worker to stop."""
        self._running = False


class WorkerPool:
    """Manages multiple parallel workers."""

    def __init__(self, num_workers: int = 4, poll_interval: float = 5.0):
        self.num_workers = num_workers
        self.poll_interval = poll_interval
        self.queue = JobQueue()
        self.handlers = JobHandlers()
        self.workers: list[Worker] = []
        self._shutdown_event = asyncio.Event()

    async def start(self):
        """Start all workers."""
        logger.info(f"Starting {self.num_workers} workers...")

        # Create workers
        for i in range(self.num_workers):
            worker_id = f"worker-{i+1}-{uuid.uuid4().hex[:6]}"
            worker = Worker(
                worker_id=worker_id,
                queue=self.queue,
                handlers=self.handlers,
                poll_interval=self.poll_interval,
            )
            self.workers.append(worker)

        # Run all workers concurrently
        tasks = [asyncio.create_task(w.run()) for w in self.workers]

        # Wait for shutdown signal
        await self._shutdown_event.wait()

        # Stop all workers
        logger.info("Shutting down workers...")
        for worker in self.workers:
            worker.stop()

        # Wait for all to finish
        await asyncio.gather(*tasks, return_exceptions=True)
        logger.info("All workers stopped")

    def shutdown(self):
        """Signal shutdown to all workers."""
        self._shutdown_event.set()


def configure_dspy():
    """Configure DSPy once at worker startup (before workers start)."""
    dspy.settings.configure(
        lm=dspy.LM(
            'anthropic/claude-sonnet-4-5-20250929',
            max_tokens=64000,  # Sonnet 4.5 max output tokens
            timeout=600  # 10 minute timeout for API calls
        ),
        adapter=dspy.JSONAdapter()
    )
    logger.info("DSPy configured globally with Claude Sonnet 4.5 (max_tokens=64000)")


def main():
    parser = argparse.ArgumentParser(description="Job queue worker")
    parser.add_argument(
        "--workers",
        type=int,
        default=4,
        help="Number of parallel workers (default: 4)",
    )
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=5.0,
        help="Seconds between polls when queue is empty (default: 5)",
    )
    args = parser.parse_args()

    # Configure DSPy once before starting workers
    configure_dspy()

    pool = WorkerPool(
        num_workers=args.workers,
        poll_interval=args.poll_interval,
    )

    # Handle shutdown signals
    def handle_signal(sig, frame):
        logger.info(f"Received signal {sig}, shutting down...")
        pool.shutdown()

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    # Run
    logger.info("=" * 50)
    logger.info("Job Queue Worker")
    logger.info(f"Workers: {args.workers}")
    logger.info(f"Poll interval: {args.poll_interval}s")
    logger.info("=" * 50)

    asyncio.run(pool.start())


if __name__ == "__main__":
    main()
