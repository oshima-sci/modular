"""Handler for LINK_LIBRARY jobs."""
import logging
from datetime import datetime
from typing import Any

from db import ExtractQueries
from db.queries.extract_links import ExtractLinkQueries
from services.link.claim2claim import add_embeddings_to_claims, link_claims
from services.link.claim2observation import link_observations_to_input_claims

logger = logging.getLogger(__name__)


def _save_c2c_links(
    links: list,
    job_id: str | None,
) -> int:
    """
    Save claim-to-claim links to extract_links table.

    Args:
        links: List of ClaimLink objects from c2c linking
        job_id: Job ID to associate with links

    Returns:
        Number of links saved
    """
    if not links:
        return 0

    extract_links = ExtractLinkQueries()

    # Convert ClaimLink objects to dicts for storage
    link_records = []
    for link in links:
        link_records.append({
            "from_id": link.claim_id_1,
            "to_id": link.claim_id_2,
            "content": {
                "link_type": link.link_type.value,
                "reasoning": link.reasoning,
                "link_category": "claim_to_claim",
            },
        })

    saved = extract_links.create_many(link_records, job_id=job_id)
    return len(saved)


def _save_c2o_links(
    links: list,
    job_id: str | None,
) -> int:
    """
    Save claim-to-observation (evidence) links to extract_links table.

    Args:
        links: List of EvidenceLink objects from c2o linking
        job_id: Job ID to associate with links

    Returns:
        Number of links saved
    """
    if not links:
        return 0

    extract_links = ExtractLinkQueries()

    # Convert EvidenceLink objects to dicts for storage
    link_records = []
    for link in links:
        link_records.append({
            "from_id": link.claim_id,
            "to_id": link.observation_id,
            "content": {
                "link_type": link.link_type.value,
                "reasoning": link.reasoning,
                "link_category": "claim_to_observation",
            },
        })

    saved = extract_links.create_many(link_records, job_id=job_id)
    return len(saved)


def handle_link_library(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Handler for LINK_LIBRARY jobs.

    Links new/unlinked claims in a library against all claims and observations.

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

    # 3. Run claim-to-claim linking
    logger.info("Running claim-to-claim linking...")
    c2c_result = link_claims(
        input_claims=claims_with_embeddings,
        library_id=library_id,
    )
    logger.info(f"C2C linking found {len(c2c_result.links)} links")

    # 4. Run claim-to-observation linking
    logger.info("Running claim-to-observation linking...")
    c2o_result = link_observations_to_input_claims(
        library_id=library_id,
        input_claims=claims_with_embeddings,
    )
    logger.info(f"C2O linking found {len(c2o_result.links)} links")

    # 5. Save links to database
    c2c_saved = _save_c2c_links(c2c_result.links, job_id)
    c2o_saved = _save_c2o_links(c2o_result.links, job_id)

    logger.info(f"Saved {c2c_saved} c2c links and {c2o_saved} c2o links")

    return {
        "library_id": library_id,
        "claims_processed": len(claims_with_embeddings),
        "c2c_links_found": len(c2c_result.links),
        "c2c_links_created": c2c_saved,
        "c2o_links_found": len(c2o_result.links),
        "c2o_links_created": c2o_saved,
        "status": "complete",
    }
