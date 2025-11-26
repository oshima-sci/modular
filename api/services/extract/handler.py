"""Handler for extract_elements jobs."""
import logging
from typing import Any

from db import ExtractQueries
from services.extract.claims import extract_claims_from_paper
from services.extract.methods import extract_methods_from_paper
from services.extract.observations import extract_observations_from_paper

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
    results = {}

    # --- Claims Extraction ---
    logger.info("Running claims extraction")
    claims_result = extract_claims_from_paper(paper_id)

    # Save each claim to extracts table
    if claims_result.claims:
        extract_records = [
            {
                "paper_id": paper_id,
                "job_id": job_id,
                "type": "claim",
                "content": claim.model_dump(),
            }
            for claim in claims_result.claims
        ]
        extracts_db.create_many(extract_records)
        logger.info(f"Saved {len(claims_result.claims)} claims to extracts table")

    results["claims_count"] = len(claims_result.claims)

    # --- Methods Extraction ---
    logger.info("Running methods extraction")
    methods_result = extract_methods_from_paper(paper_id)

    # Save each method to extracts table
    if methods_result.methods:
        method_records = [
            {
                "paper_id": paper_id,
                "job_id": job_id,
                "type": "method",
                "content": method.model_dump(),
            }
            for method in methods_result.methods
        ]
        extracts_db.create_many(method_records)
        logger.info(f"Saved {len(methods_result.methods)} methods to extracts table")

    results["methods_count"] = len(methods_result.methods)

    # --- Observations Extraction (depends on methods) ---
    logger.info("Running observations extraction")
    observations_result = extract_observations_from_paper(paper_id)

    if observations_result.skipped:
        logger.info("Observations extraction skipped - no methods found")
        results["observations_count"] = 0
        results["observations_skipped"] = True
    else:
        # Save each observation to extracts table
        if observations_result.observations:
            observation_records = [
                {
                    "paper_id": paper_id,
                    "job_id": job_id,
                    "type": "observation",
                    "content": obs.model_dump(),
                }
                for obs in observations_result.observations
            ]
            extracts_db.create_many(observation_records)
            logger.info(f"Saved {len(observations_result.observations)} observations to extracts table")

        results["observations_count"] = len(observations_result.observations)
        results["observations_skipped"] = False

    logger.info(f"Extract elements complete: {results}")

    return {
        "paper_id": paper_id,
        "job_id": job_id,
        **results,
    }
