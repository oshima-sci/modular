"""Shared utilities for saving links to database."""
import logging
import re

from db.queries.extract_links import ExtractLinkQueries

logger = logging.getLogger(__name__)

# UUID validation regex
UUID_PATTERN = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE
)


def is_valid_uuid(value: str) -> bool:
    """Check if a string is a valid UUID format."""
    return bool(UUID_PATTERN.match(value))


def save_c2c_links(
    links: list,
    job_id: str | None = None,
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
        if not is_valid_uuid(from_id) or not is_valid_uuid(to_id):
            logger.warning(f"Skipping c2c link with invalid UUID format: from={from_id}, to={to_id}")
            skipped += 1
            continue

        # Validate IDs exist in valid set
        if valid_claim_ids is not None:
            if from_id not in valid_claim_ids or to_id not in valid_claim_ids:
                logger.warning(f"Skipping c2c link with non-existent ID: from={from_id}, to={to_id}")
                skipped += 1
                continue

        # Dump full LLM response and add metadata
        content = link.model_dump()
        content["link_type"] = link.link_type.value  # Ensure enum is serialized as string
        content["link_category"] = "claim_to_claim"

        link_records.append({
            "from_id": from_id,
            "to_id": to_id,
            "content": content,
        })

    if skipped > 0:
        logger.warning(f"Skipped {skipped} c2c links with invalid/non-existent IDs")

    if not link_records:
        return 0

    saved = extract_links.create_many(link_records, job_id=job_id)
    return len(saved)


def save_c2o_links(
    links: list,
    job_id: str | None = None,
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
        if not is_valid_uuid(from_id) or not is_valid_uuid(to_id):
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
