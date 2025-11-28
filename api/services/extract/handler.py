"""Handler for extract_elements jobs."""
import logging
from typing import Any

import dspy

from db import ExtractQueries, VectorQueries
from services.extract.claims import extract_claims_from_paper
from services.extract.methods import extract_methods_from_paper
from services.extract.observations import extract_observations_from_paper
from services.link.queue import maybe_queue_link_library
from services.vector import embed_texts

logger = logging.getLogger(__name__)


def handle_extract_elements(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Handle extract_elements jobs - runs all extraction steps for a paper.

    Currently runs:
    - Claims extraction

    Payload:
        paper_id: UUID of the paper to extract from
        job_id: UUID of this job (for linking extracts)

    Returns:
        Dict with extraction results summary
    """
    paper_id = payload["paper_id"]
    job_id = payload.get("job_id")

    logger.info(f"Starting extract_elements job for paper_id={paper_id}, job_id={job_id}")

    extracts_db = ExtractQueries()
    vectors_db = VectorQueries()

    # Check if extracts already exist for this job (avoid duplicates on retry)
    if job_id:
        existing = extracts_db.get_by_job_id(job_id)
        if existing:
            logger.info(f"Extracts already exist for job_id={job_id}, skipping to avoid duplicates")
            return {
                "paper_id": paper_id,
                "job_id": job_id,
                "skipped": True,
                "reason": "extracts_already_exist",
                "existing_count": len(existing),
            }

    results = {}

    extract_lm = dspy.LM("anthropic/claude-sonnet-4-5-20250929")

    # --- Claims Extraction ---
    logger.info("Running claims extraction")
    with dspy.context(lm=extract_lm):
        claims_result = extract_claims_from_paper(paper_id)
    if claims_result.claims:
        # 1. Save claims to extracts table first
        extract_records = [
            {
                "paper_id": paper_id,
                "job_id": job_id,
                "type": "claim",
                "content": claim.model_dump(),
            }
            for claim in claims_result.claims
        ]
        saved_extracts = extracts_db.create_many(extract_records)
        logger.info(f"Saved {len(saved_extracts)} claims to extracts table")

        # 2. Batch embed all claim texts
        claim_texts = [claim.rephrased_claim for claim in claims_result.claims]
        embeddings = embed_texts(claim_texts)
        logger.info(f"Embedded {len(embeddings)} claims")

        # 3. Save embeddings to extract_vectors table
        vector_records = [
            {
                "extract_id": saved_extract["id"],
                "embedding": embedding,
            }
            for saved_extract, embedding in zip(saved_extracts, embeddings)
        ]
        vectors_db.create_many(vector_records)
        logger.info(f"Saved {len(vector_records)} claim embeddings to extract_vectors table")

    results["claims_count"] = len(claims_result.claims)

    # --- Methods Extraction ---
    logger.info("Running methods extraction")
    with dspy.context(lm=extract_lm):
        methods_result = extract_methods_from_paper(paper_id)

    if methods_result.methods:
        # 1. Save methods to extracts table first
        method_records = [
            {
                "paper_id": paper_id,
                "job_id": job_id,
                "type": "method",
                "content": method.model_dump(),
            }
            for method in methods_result.methods
        ]
        saved_methods = extracts_db.create_many(method_records)
        logger.info(f"Saved {len(saved_methods)} methods to extracts table")

        # 2. Batch embed all method summaries
        method_texts = [method.method_summary for method in methods_result.methods]
        method_embeddings = embed_texts(method_texts)
        logger.info(f"Embedded {len(method_embeddings)} methods")

        # 3. Save embeddings to extract_vectors table
        method_vector_records = [
            {
                "extract_id": saved_method["id"],
                "embedding": embedding,
            }
            for saved_method, embedding in zip(saved_methods, method_embeddings)
        ]
        vectors_db.create_many(method_vector_records)
        logger.info(f"Saved {len(method_vector_records)} method embeddings to extract_vectors table")

    results["methods_count"] = len(methods_result.methods)

    # --- Observations Extraction (depends on methods) ---
    logger.info("Running observations extraction")
    with dspy.context(lm=extract_lm):
        observations_result = extract_observations_from_paper(paper_id)

    if observations_result.skipped:
        logger.info("Observations extraction skipped - no methods found")
        results["observations_count"] = 0
        results["observations_skipped"] = True
    else:
        if observations_result.observations:
            # 1. Save observations to extracts table first
            observation_records = [
                {
                    "paper_id": paper_id,
                    "job_id": job_id,
                    "type": "observation",
                    "content": obs.model_dump(),
                }
                for obs in observations_result.observations
            ]
            saved_observations = extracts_db.create_many(observation_records)
            logger.info(f"Saved {len(saved_observations)} observations to extracts table")

            # 2. Batch embed all observation summaries
            observation_texts = [obs.observation_summary for obs in observations_result.observations]
            observation_embeddings = embed_texts(observation_texts)
            logger.info(f"Embedded {len(observation_embeddings)} observations")

            # 3. Save embeddings to extract_vectors table
            observation_vector_records = [
                {
                    "extract_id": saved_obs["id"],
                    "embedding": embedding,
                }
                for saved_obs, embedding in zip(saved_observations, observation_embeddings)
            ]
            vectors_db.create_many(observation_vector_records)
            logger.info(f"Saved {len(observation_vector_records)} observation embeddings to extract_vectors table")

        results["observations_count"] = len(observations_result.observations)
        results["observations_skipped"] = False

    # Log which model was used (from last history entry)
    if extract_lm.history:
        last_entry = extract_lm.history[-1]
        results["model"] = last_entry.get("model")
        logger.info(f"Extract elements complete using model={results['model']}: {results}")
    else:
        logger.info(f"Extract elements complete: {results}")

    # Queue LINK_LIBRARY jobs for any libraries this paper belongs to
    # Pass job_id to exclude this job from the "pending processing jobs" check
    link_jobs = maybe_queue_link_library(paper_id, exclude_job_id=job_id)
    if link_jobs:
        logger.info(f"Queued {len(link_jobs)} LINK_LIBRARY jobs for paper {paper_id}")

    return {
        "paper_id": paper_id,
        "job_id": job_id,
        **results,
    }
