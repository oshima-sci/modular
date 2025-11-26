"""Link claims to other claims within a library using DSPy."""
import asyncio
import logging
from typing import Any
from uuid import UUID

import dspy
from pydantic import BaseModel, Field

from db import ExtractQueries

logger = logging.getLogger(__name__)


# --- Pydantic Schemas ---

from enum import Enum

class ClaimLinkType(str, Enum):
    """
        Type of connection between the two claims.
        - DUPLICATE claims say basically the same thing in different words. They target the same phenomenon or 
        relationship and agree about their nature.
        - VARIANT claims talk about the same phenomenon or relationship but differ in some way about their
        exact nature. Variant claims can extend their counter part, impose different conditions, etc. Importantly,
        two variant claims can be true at the same time. They do not logically contradict each other.
        - CONTRADICTION claims directly disagree with each other. They talk about the same phenomenon or relationship
        but cannot both be true. They fundamentally contradict each other. Proving one would refute the other.
        - PREMISE claims are the logical foundation for downstream claims. A downstream claim rests logically
        upon the premise claims. Disproving the premise would disprove the downstream claim, but disproving the
        downstream claim would not make the premise automatically false too.
    """

    duplicate = "duplicate"
    variant = "variant"
    contradiction = "contradiction"
    premise = "premise"



class ClaimLink(BaseModel):
    """A link between two claims."""

    claim_id_1: str = Field(description="UUID of the source claim extract. For links of type premise, this is the premise.")
    claim_id_2: str = Field(description="UUID of the target claim extract. For links of type premise, this is the conclusion or downstream claim.")
    link_type: ClaimLinkType = Field(description="Type of relationship between the claims")
    reasoning: str = Field(description="Brief explanation of why these claims are linked")


class ClaimGroup(BaseModel):
    """A group of claims to evaluate for links."""

    claims: list[dict] = Field(description="List of claim objects in this group")


class LinkingResult(BaseModel):
    """Result of claim-to-claim linking for a library."""

    library_id: str
    total_claims: int
    groups_processed: int
    links: list[ClaimLink] = Field(default_factory=list)


# --- DSPy Signature ---


class LinkClaims(dspy.Signature):
    """
    Identify meaningful relationships between scientific claims.

    Given a set of claims extracted from different papers in a research library,
    identify pairs of claims that have meaningful relationships.

    Meaningful relationships (and link types) are:
    - DUPLICATE claims that are logically the same
    - VARIANT claims that slightly differ from but don't disagree with each other
    - CONTRADICTION claims  that directly disagree with each other
    - PREMISE claims where one is the logical basis for the other

    Only for PREMISE type links does the order in which you return the claim ids matter.
    First comes the premise, then the conclusion/dowstream argument.
    """

    claims_json: str = dspy.InputField(desc="JSON array of claims with id and rephrased_claim text")
    links: list[ClaimLink] = dspy.OutputField(desc="List of identified links between claims")


# --- DSPy Module ---


class ClaimLinker(dspy.Module):
    """DSPy module for linking claims."""

    def __init__(self):
        super().__init__()
        self.link = dspy.Predict(LinkClaims)

    def forward(self, claims_json: str) -> list[ClaimLink]:
        """Find links between claims."""
        result = self.link(claims_json=claims_json)
        return result.links


# --- Grouping Strategy ---


def create_claim_groups(
    claims: list[dict],
    max_group_size: int = 20,
) -> list[ClaimGroup]:
    """
    Create groups of claims for link evaluation.

    Strategy: Start simple with fixed-size groups.
    TODO: Add smarter grouping (by topic, embedding similarity, etc.)

    Args:
        claims: All claim extracts from the library
        max_group_size: Maximum claims per group (to keep LLM context manageable)

    Returns:
        List of ClaimGroup objects
    """
    if len(claims) <= max_group_size:
        return [ClaimGroup(claims=claims)]

    groups = []
    for i in range(0, len(claims), max_group_size):
        chunk = claims[i : i + max_group_size]
        groups.append(ClaimGroup(claims=chunk))

    # TODO: Consider overlapping windows or smarter clustering
    logger.info(f"Created {len(groups)} groups from {len(claims)} claims")
    return groups


# --- Helper Functions ---


def _format_claims_for_llm(claims: list[dict]) -> str:
    """Format claims as JSON for the DSPy module."""
    import json

    formatted = []
    for claim in claims:
        formatted.append({
            "id": claim["id"],
            "paper_id": claim["paper_id"],
            "claim": claim["content"].get("rephrased_claim", ""),
        })
    return json.dumps(formatted, indent=2)


# def _deduplicate_links(links: list[ClaimLink]) -> list[ClaimLink]:
#     """Remove duplicate links (A->B and B->A count as one for symmetric types)."""
#     seen = set()
#     unique = []

#     for link in links:
#         # For 'related' type, normalize order to avoid A-B and B-A duplicates
#         if link.link_type == "related":
#             key = tuple(sorted([link.source_claim_id, link.target_claim_id]))
#         else:
#             # Directional types keep order
#             key = (link.source_claim_id, link.target_claim_id, link.link_type)

#         if key not in seen:
#             seen.add(key)
#             unique.append(link)

#     return unique


# --- Main Orchestration ---

# Max concurrent LLM requests
MAX_CONCURRENT_REQUESTS = 10


async def _process_group(
    semaphore: asyncio.Semaphore,
    linker: ClaimLinker,
    group: ClaimGroup,
    group_idx: int,
) -> list[ClaimLink]:
    """Process a single group with semaphore-controlled concurrency."""
    async with semaphore:
        logger.info(f"Processing group {group_idx + 1} ({len(group.claims)} claims)")
        claims_json = _format_claims_for_llm(group.claims)

        try:
            # Run DSPy in thread pool since it's synchronous
            loop = asyncio.get_event_loop()
            links = await loop.run_in_executor(None, linker, claims_json)
            logger.info(f"Found {len(links)} links in group {group_idx + 1}")
            return links
        except Exception as e:
            logger.error(f"Error processing group {group_idx + 1}: {e}")
            return []


async def _link_claims_async(
    groups: list[ClaimGroup],
    max_concurrent: int = MAX_CONCURRENT_REQUESTS,
) -> list[ClaimLink]:
    """Run linking on all groups concurrently with semaphore limit."""
    semaphore = asyncio.Semaphore(max_concurrent)
    linker = ClaimLinker()

    tasks = [
        _process_group(semaphore, linker, group, i)
        for i, group in enumerate(groups)
    ]

    results = await asyncio.gather(*tasks)

    # Flatten results
    all_links: list[ClaimLink] = []
    for links in results:
        all_links.extend(links)

    return all_links


def link_claims_in_library(library_id: str | UUID) -> LinkingResult:
    """
    Find and create links between claims in a library.

    Steps:
    1. Fetch all claim extracts for papers in the library
    2. Group claims into manageable chunks
    3. Run DSPy linker on each group (concurrently)
    4. Return results

    Args:
        library_id: UUID of the library to process

    Returns:
        LinkingResult with all discovered links
    """
    library_id_str = str(library_id)
    logger.info(f"Starting claim-to-claim linking for library_id={library_id_str}")

    # 1. Fetch all claims for the library
    extracts = ExtractQueries()
    claims = extracts.get_claims_by_library(library_id_str)
    logger.info(f"Fetched {len(claims)} claims from library")

    if len(claims) < 2:
        logger.info("Not enough claims to link")
        return LinkingResult(
            library_id=library_id_str,
            total_claims=len(claims),
            groups_processed=0,
            links=[],
        )

    # 2. Group claims
    groups = create_claim_groups(claims)

    # 3. Run linker on all groups concurrently
    all_links = asyncio.run(_link_claims_async(groups))
    logger.info(f"Total links found: {len(all_links)}")

    return LinkingResult(
        library_id=library_id_str,
        total_claims=len(claims),
        groups_processed=len(groups),
        links=all_links,
    )


# --- Job Handler ---


def handle_link_claims(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Handler for link_claims jobs.

    Payload:
        library_id: UUID of the library to link claims within

    Returns:
        Dict with linking results
    """
    library_id = payload["library_id"]

    result = link_claims_in_library(library_id)

    return {
        "library_id": result.library_id,
        "total_claims": result.total_claims,
        "groups_processed": result.groups_processed,
        "links_count": len(result.links),
        "links": [link.model_dump() for link in result.links],
    }
