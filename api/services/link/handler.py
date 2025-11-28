"""Handler for LINK_LIBRARY jobs."""
import logging
import re
from datetime import datetime
from typing import Any

from db import ExtractQueries
from db.queries.extract_links import ExtractLinkQueries
from services.link.claim2claim import add_embeddings_to_claims
from services.link.claim2claim_pairwise import link_claims_pairwise
from services.link.claim2observation import link_observations_to_input_claims

logger = logging.getLogger(__name__)

# UUID validation regex
UUID_PATTERN = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE
)


def _is_valid_uuid(value: str) -> bool:
    """Check if a string is a valid UUID format."""
    return bool(UUID_PATTERN.match(value))


def _save_c2c_links(
    links: list,
    job_id: str | None,
    valid_claim_ids: set[str] | None = None,
) -> int:
    """
    Save claim-to-claim links to extract_links table.

    Validates UUIDs and checks IDs exist in valid set to prevent batch failures.

    Args:
        links: List of ClaimLink objects from c2c linking
        job_id: Job ID to associate with links
        valid_claim_ids: Set of valid claim IDs (if provided, filters to only these)

    Returns:
        Number of links saved
    """
    if not links:
        return 0

    extract_links = ExtractLinkQueries()

    # Convert ClaimLink objects to dicts, validating UUIDs and IDs
    link_records = []
    skipped = 0
    for link in links:
        from_id = link.claim_id_1
        to_id = link.claim_id_2

        # Validate UUID format
        if not _is_valid_uuid(from_id) or not _is_valid_uuid(to_id):
            logger.warning(f"Skipping c2c link with invalid UUID format: from={from_id}, to={to_id}")
            skipped += 1
            continue

        # Validate IDs exist in valid set
        if valid_claim_ids is not None:
            if from_id not in valid_claim_ids or to_id not in valid_claim_ids:
                logger.warning(f"Skipping c2c link with non-existent ID: from={from_id}, to={to_id}")
                skipped += 1
                continue

        link_records.append({
            "from_id": from_id,
            "to_id": to_id,
            "content": {
                "link_type": link.link_type.value,
                "reasoning": link.reasoning,
                "link_category": "claim_to_claim",
            },
        })

    if skipped > 0:
        logger.warning(f"Skipped {skipped} c2c links with invalid/non-existent IDs")

    if not link_records:
        return 0

    saved = extract_links.create_many(link_records, job_id=job_id)
    return len(saved)


def _save_c2o_links(
    links: list,
    job_id: str | None,
    valid_claim_ids: set[str] | None = None,
    valid_observation_ids: set[str] | None = None,
) -> int:
    """
    Save claim-to-observation (evidence) links to extract_links table.

    Validates UUIDs and checks IDs exist in valid sets to prevent batch failures.

    Args:
        links: List of EvidenceLink objects from c2o linking
        job_id: Job ID to associate with links
        valid_claim_ids: Set of valid claim IDs (if provided, filters to only these)
        valid_observation_ids: Set of valid observation IDs (if provided, filters to only these)

    Returns:
        Number of links saved
    """
    if not links:
        return 0

    extract_links = ExtractLinkQueries()

    # Convert EvidenceLink objects to dicts, validating UUIDs and IDs
    link_records = []
    skipped = 0
    for link in links:
        from_id = link.claim_id
        to_id = link.observation_id

        # Validate UUID format
        if not _is_valid_uuid(from_id) or not _is_valid_uuid(to_id):
            logger.warning(f"Skipping c2o link with invalid UUID format: from={from_id}, to={to_id}")
            skipped += 1
            continue

        # Validate claim ID exists
        if valid_claim_ids is not None and from_id not in valid_claim_ids:
            logger.warning(f"Skipping c2o link with non-existent claim ID: {from_id}")
            skipped += 1
            continue

        # Validate observation ID exists
        if valid_observation_ids is not None and to_id not in valid_observation_ids:
            logger.warning(f"Skipping c2o link with non-existent observation ID: {to_id}")
            skipped += 1
            continue

        link_records.append({
            "from_id": from_id,
            "to_id": to_id,
            "content": {
                "link_type": link.link_type.value,
                "reasoning": link.reasoning,
                "link_category": "claim_to_observation",
            },
        })

    if skipped > 0:
        logger.warning(f"Skipped {skipped} c2o links with invalid/non-existent IDs")

    if not link_records:
        return 0

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

    # 2b. Fetch all valid IDs for validation (prevents hallucinated IDs from failing batch)
    all_claims = extracts.get_claims_by_library(library_id)
    all_observations = extracts.get_observations_by_library(library_id)
    valid_claim_ids = {c["id"] for c in all_claims}
    valid_observation_ids = {o["id"] for o in all_observations}
    logger.info(f"Loaded {len(valid_claim_ids)} valid claim IDs, {len(valid_observation_ids)} valid observation IDs")

    # 3. Run claim-to-claim linking (pairwise approach) and save immediately
    logger.info("Running claim-to-claim linking (pairwise)...")
    c2c_pairwise_result = link_claims_pairwise(
        input_claims=claims_with_embeddings,
        library_id=library_id,
    )
    c2c_result = c2c_pairwise_result.result
    c2c_usage = c2c_pairwise_result.stats
    logger.info(f"C2C linking found {len(c2c_result.links)} links")
    logger.info(f"C2C usage: {c2c_usage.total_calls} calls, {c2c_usage.total_input_tokens} input tokens, {c2c_usage.total_output_tokens} output tokens, ${c2c_usage.total_cost:.4f}")

    # Save c2c links immediately after finding them
    c2c_saved = _save_c2c_links(c2c_result.links, job_id, valid_claim_ids)
    logger.info(f"Saved {c2c_saved} c2c links")

    # 4. Run claim-to-observation linking
    logger.info("Running claim-to-observation linking...")
    c2o_pairwise_result = link_observations_to_input_claims(
        library_id=library_id,
        input_claims=claims_with_embeddings,
    )
    c2o_result = c2o_pairwise_result.result
    c2o_usage = c2o_pairwise_result.stats
    logger.info(f"C2O linking found {len(c2o_result.links)} links")
    logger.info(f"C2O usage: {c2o_usage.total_calls} calls, {c2o_usage.total_input_tokens} input tokens, {c2o_usage.total_output_tokens} output tokens, ${c2o_usage.total_cost:.4f}")

    # 5. Save c2o links to database
    c2o_saved = _save_c2o_links(c2o_result.links, job_id, valid_claim_ids, valid_observation_ids)
    logger.info(f"Saved {c2o_saved} c2o links")

    return {
        "library_id": library_id,
        "claims_processed": len(claims_with_embeddings),
        "c2c_links_found": len(c2c_result.links),
        "c2c_links_created": c2c_saved,
        "c2o_links_found": len(c2o_result.links),
        "c2o_links_created": c2o_saved,
        "c2c_usage": {
            "total_calls": c2c_usage.total_calls,
            "input_tokens": c2c_usage.total_input_tokens,
            "output_tokens": c2c_usage.total_output_tokens,
            "cost": c2c_usage.total_cost,
        },
        "c2o_usage": {
            "total_calls": c2o_usage.total_calls,
            "input_tokens": c2o_usage.total_input_tokens,
            "output_tokens": c2o_usage.total_output_tokens,
            "cost": c2o_usage.total_cost,
        },
        "status": "complete",
    }
