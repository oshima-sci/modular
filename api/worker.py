#!/usr/bin/env python3
"""
Background worker for processing jobs from the queue.

Run with: python worker.py
Options:
    --workers N     Number of parallel workers (default: 4)
    --poll-interval Seconds between polls when queue is empty (default: 5)
"""

import argparse
import logging
import signal
import time
import uuid
from datetime import datetime
from multiprocessing import Process

import dspy

from models import JobStatus, JobType
from services.jobs import JobQueue, JobHandlers


def configure_logging():
    """Configure logging for this process."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        force=True,  # Reconfigure for each subprocess
    )
    return logging.getLogger("worker")


def configure_dspy():
    """Configure DSPy for this process."""
    lm = dspy.LM(
        'openai/gpt-5-mini-2025-08-07',
        max_tokens=None,
        temperature=None,
        timeout=600,
    )
    dspy.configure(lm=lm)


def run_worker(worker_num: int, poll_interval: float):
    """Run a single worker in its own process."""
    logger = configure_logging()
    worker_id = f"worker-{worker_num}-{uuid.uuid4().hex[:6]}"

    logger.info(f"[{worker_id}] Starting, configuring DSPy...")
    configure_dspy()
    logger.info(f"[{worker_id}] DSPy configured, starting job loop")

    queue = JobQueue()
    handlers = JobHandlers()
    running = True

    def handle_signal(sig, frame):
        nonlocal running
        logger.info(f"[{worker_id}] Received signal {sig}, stopping...")
        running = False

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    while running:
        try:
            job = queue.claim_job(worker_id)

            if job:
                process_job(worker_id, job, queue, handlers, logger)
            else:
                time.sleep(poll_interval)

        except Exception as e:
            logger.error(f"[{worker_id}] Error in worker loop: {e}")
            time.sleep(poll_interval)

    logger.info(f"[{worker_id}] Stopped")


def process_job(worker_id: str, job: dict, queue: JobQueue, handlers: JobHandlers, logger):
    """Process a single job."""
    job_id = job["id"]
    job_type = job["job_type"]
    payload = job.get("payload") or {}
    payload["job_id"] = job_id
    attempt = job["attempts"]
    max_attempts = job["max_attempts"]

    logger.info(
        f"[{worker_id}] Processing job {job_id[:8]}... "
        f"(type={job_type}, attempt {attempt}/{max_attempts})"
    )

    start_time = datetime.now()

    try:
        result = handlers.process(JobType(job_type), payload)

        queue.complete_job(
            job_id=job_id,
            worker_id=worker_id,
            status=JobStatus.COMPLETED,
            result=result,
        )

        duration = (datetime.now() - start_time).total_seconds()
        logger.info(f"[{worker_id}] Completed job {job_id[:8]}... in {duration:.2f}s")

    except Exception as e:
        queue.complete_job(
            job_id=job_id,
            worker_id=worker_id,
            status=JobStatus.FAILED,
            error=str(e),
        )

        duration = (datetime.now() - start_time).total_seconds()
        logger.error(f"[{worker_id}] Failed job {job_id[:8]}... after {duration:.2f}s: {e}")


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

    logger = configure_logging()
    logger.info("=" * 50)
    logger.info("Job Queue Worker (multiprocessing)")
    logger.info(f"Workers: {args.workers}")
    logger.info(f"Poll interval: {args.poll_interval}s")
    logger.info("=" * 50)

    processes: dict[int, Process] = {}
    shutdown_requested = False

    def handle_signal(sig, frame):
        nonlocal shutdown_requested
        logger.info(f"Received signal {sig}, shutting down all workers...")
        shutdown_requested = True

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    def start_worker(worker_num: int) -> Process:
        p = Process(target=run_worker, args=(worker_num, args.poll_interval))
        p.start()
        logger.info(f"Started worker-{worker_num} (pid={p.pid})")
        return p

    # Start initial workers
    for i in range(1, args.workers + 1):
        processes[i] = start_worker(i)

    # Monitor and restart crashed workers
    while not shutdown_requested:
        time.sleep(2)  # Check every 2 seconds

        for worker_num, proc in list(processes.items()):
            if not proc.is_alive():
                exit_code = proc.exitcode
                if exit_code != 0 and not shutdown_requested:
                    logger.warning(
                        f"Worker-{worker_num} (pid={proc.pid}) died with exit code {exit_code}, restarting..."
                    )
                    processes[worker_num] = start_worker(worker_num)
                elif not shutdown_requested:
                    logger.info(f"Worker-{worker_num} exited cleanly, restarting...")
                    processes[worker_num] = start_worker(worker_num)

    # Shutdown: terminate all workers
    logger.info("Stopping all workers...")
    for worker_num, proc in processes.items():
        if proc.is_alive():
            proc.terminate()

    # Wait for all to finish
    for worker_num, proc in processes.items():
        proc.join(timeout=10)
        if proc.is_alive():
            logger.warning(f"Worker-{worker_num} didn't stop gracefully, killing...")
            proc.kill()

    logger.info("All workers stopped")


if __name__ == "__main__":
    main()
