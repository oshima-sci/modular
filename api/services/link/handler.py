"""Handler for LINK_LIBRARY jobs."""
import logging
from datetime import datetime
from typing import Any

import dspy

from db import ExtractQueries
from services.jobs import JobQueue
from services.link.claim2claim import add_embeddings_to_claims, link_claims
from services.link.claim2observation import link_observations_to_input_claims

logger = logging.getLogger(__name__)


def handle_link_library(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Handler for LINK_LIBRARY jobs.

    Links new/unlinked claims in a library against all claims and observations.
    Links are saved to the database per-batch during processing for partial
    progress persistence. Supports resuming from previous progress on retry.

    Payload:
        library_id: UUID of the library to link
        cutoff: ISO timestamp string - claims newer than this are processed.
                If None, all claims are processed (new library case).
        job_id: Optional UUID of this job (for associating created links)

    Returns:
        Dict with linking results summary
    """
    library_id = payload["library_id"]
    cutoff_str = payload.get("cutoff")
    job_id = payload.get("job_id")

    # Parse cutoff timestamp
    cutoff: datetime | None = None
    if cutoff_str:
        cutoff = datetime.fromisoformat(cutoff_str.replace("Z", "+00:00"))

    logger.info(f"Starting LINK_LIBRARY job for library={library_id}, cutoff={cutoff}")

    # Load existing progress (for resume after failure)
    queue = JobQueue()
    progress = queue.get_job_progress(job_id) if job_id else None
    c2c_processed: set[str] = set(progress.get("c2c_processed", [])) if progress else set()
    c2o_processed: set[str] = set(progress.get("c2o_processed", [])) if progress else set()

    if c2c_processed or c2o_processed:
        logger.info(f"Resuming from progress: {len(c2c_processed)} c2c, {len(c2o_processed)} c2o claims already processed")

    # Progress saving helper
    def save_progress():
        if job_id:
            queue.update_job_progress(job_id, {
                "c2c_processed": list(c2c_processed),
                "c2o_processed": list(c2o_processed),
            })

    # Configure LM for linking operations
    link_lm = dspy.LM("openai/gpt-5-mini-2025-08-07")
    dspy.configure(lm=link_lm)

    # 1. Fetch unlinked claims
    extracts = ExtractQueries()
    unlinked_claims = extracts.get_unlinked_claims_for_library(library_id, cutoff)
    logger.info(f"Found {len(unlinked_claims)} unlinked claims to process")

    if not unlinked_claims:
        logger.info("No unlinked claims found, job complete")
        return {
            "library_id": library_id,
            "claims_processed": 0,
            "c2c_links_created": 0,
            "c2o_links_created": 0,
            "status": "complete",
            "message": "No new claims to link",
        }

    # 2. Add embeddings to claims
    claims_with_embeddings = add_embeddings_to_claims(unlinked_claims)
    logger.info(f"{len(claims_with_embeddings)} claims have embeddings")

    if not claims_with_embeddings:
        logger.warning("No claims have embeddings, cannot link")
        return {
            "library_id": library_id,
            "claims_processed": 0,
            "c2c_links_created": 0,
            "c2o_links_created": 0,
            "status": "complete",
            "message": "No claims with embeddings to link",
        }

    # 2b. Fetch all valid IDs for validation (prevents hallucinated IDs from failing batch)
    all_claims = extracts.get_claims_by_library(library_id)
    all_observations = extracts.get_observations_by_library(library_id)
    valid_claim_ids = {c["id"] for c in all_claims}
    valid_observation_ids = {o["id"] for o in all_observations}
    logger.info(f"Loaded {len(valid_claim_ids)} valid claim IDs, {len(valid_observation_ids)} valid observation IDs")

    # 3. Run claim-to-claim linking (saves per-batch internally)
    # Filter out already-processed claims for c2c
    c2c_claims = [c for c in claims_with_embeddings if c["id"] not in c2c_processed]
    logger.info(f"Running claim-to-claim linking on {len(c2c_claims)} claims ({len(c2c_processed)} already processed)...")

    def on_c2c_progress(batch_claim_ids: list[str]):
        c2c_processed.update(batch_claim_ids)
        save_progress()

    c2c_result = link_claims(
        input_claims=c2c_claims,
        library_id=library_id,
        job_id=job_id,
        valid_claim_ids=valid_claim_ids,
        progress_callback=on_c2c_progress,
    )
    logger.info(f"C2C linking found {len(c2c_result.result.links)} links, saved {c2c_result.links_saved}")

    # 4. Run claim-to-observation linking (saves per-batch internally)
    # Filter out already-processed claims for c2o
    c2o_claims = [c for c in claims_with_embeddings if c["id"] not in c2o_processed]
    logger.info(f"Running claim-to-observation linking on {len(c2o_claims)} claims ({len(c2o_processed)} already processed)...")

    def on_c2o_progress(batch_claim_ids: list[str]):
        c2o_processed.update(batch_claim_ids)
        save_progress()

    c2o_result = link_observations_to_input_claims(
        library_id=library_id,
        input_claims=c2o_claims,
        job_id=job_id,
        valid_claim_ids=valid_claim_ids,
        valid_observation_ids=valid_observation_ids,
        progress_callback=on_c2o_progress,
    )
    logger.info(f"C2O linking found {len(c2o_result.result.links)} links, saved {c2o_result.links_saved}")

    # Log which model was used (from last history entry)
    model_used = None
    if link_lm.history:
        last_entry = link_lm.history[-1]
        model_used = last_entry.get("model")
        logger.info(f"Link library job complete using model={model_used}")
    else:
        logger.info("Link library job complete")

    return {
        "library_id": library_id,
        "claims_processed": len(claims_with_embeddings),
        "c2c_links_found": len(c2c_result.result.links),
        "c2c_links_created": c2c_result.links_saved,
        "c2o_links_found": len(c2o_result.result.links),
        "c2o_links_created": c2o_result.links_saved,
        "c2c_usage": {
            "total_calls": c2c_result.stats.total_calls,
            "input_tokens": c2c_result.stats.total_input_tokens,
            "output_tokens": c2c_result.stats.total_output_tokens,
            "cost": c2c_result.stats.total_cost,
        },
        "c2o_usage": {
            "total_calls": c2o_result.stats.total_calls,
            "input_tokens": c2o_result.stats.total_input_tokens,
            "output_tokens": c2o_result.stats.total_output_tokens,
            "cost": c2o_result.stats.total_cost,
        },
        "model": model_used,
        "status": "complete",
    }
