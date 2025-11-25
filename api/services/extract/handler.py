"""Handler for paper_extract jobs."""
import logging
from typing import Any

from db import ExtractQueries
from services.extract.claims import extract_claims_from_paper

logger = logging.getLogger(__name__)


def handle_paper_extract(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Handle paper_extract jobs - runs all extraction steps for a paper.

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

    logger.info(f"Starting paper_extract job for paper_id={paper_id}, job_id={job_id}")

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

    # --- Future extraction steps go here ---
    # results["methods_count"] = ...
    # results["observations_count"] = ...

    logger.info(f"Paper extract complete: {results}")

    return {
        "paper_id": paper_id,
        "job_id": job_id,
        **results,
    }
