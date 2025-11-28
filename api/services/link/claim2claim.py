"""Link claims to other claims within a library using DSPy."""
import asyncio
import logging
from typing import Any
from uuid import UUID

import dspy
import numpy as np
from pydantic import BaseModel, Field

from db import ExtractQueries, VectorQueries

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


# --- Token/Cost Tracking ---

from dataclasses import dataclass


@dataclass
class UsageStats:
    """Aggregated usage statistics."""

    total_calls: int = 0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_cost: float = 0.0

    def add(self, usage: dict, cost: float):
        """Add stats from a single call."""
        self.total_calls += 1
        self.total_input_tokens += usage.get("prompt_tokens", 0) or usage.get("input_tokens", 0)
        self.total_output_tokens += usage.get("completion_tokens", 0) or usage.get("output_tokens", 0)
        self.total_cost += cost or 0.0


@dataclass
class BatchedLinkingResult:
    """Result with usage stats."""

    result: LinkingResult
    stats: UsageStats


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


# --- Similarity & Grouping ---


def _asymmetric_cosine_similarity(
    input_embeddings: np.ndarray,
    library_embeddings: np.ndarray,
) -> np.ndarray:
    """
    Compute asymmetric cosine similarity matrix between input and library claims.

    Args:
        input_embeddings: (n_input, d) array of input claim embeddings
        library_embeddings: (n_library, d) array of all library claim embeddings

    Returns:
        (n_input, n_library) similarity matrix where [i, j] is similarity
        between input claim i and library claim j
    """
    input_norms = np.linalg.norm(input_embeddings, axis=1, keepdims=True)
    library_norms = np.linalg.norm(library_embeddings, axis=1, keepdims=True)

    input_normalized = input_embeddings / input_norms
    library_normalized = library_embeddings / library_norms

    return input_normalized @ library_normalized.T


def _build_similarity_groups(
    input_claims: list[dict],
    library_claims: list[dict],
    similarity_matrix: np.ndarray,
    threshold: float = 0.35,
) -> list[ClaimGroup]:
    """
    Build groups from asymmetric similarity matrix (input_claims x library_claims).

    For each input claim, finds similar library claims and groups them together.
    Uses greedy edge covering to batch efficiently. Claims may appear in multiple
    groups to ensure all similar pairs get evaluated.
    """
    n_input = len(input_claims)
    n_library = len(library_claims)

    # Build claim_id -> input_index lookup for fast membership checks
    input_id_to_idx = {c["id"]: i for i, c in enumerate(input_claims)}
    
    # Build claim_id -> library_index lookup
    library_id_to_idx = {c["id"]: j for j, c in enumerate(library_claims)}

    # Build adjacency: for each input claim, which library claims are similar?
    adjacency: dict[int, set[int]] = {i: set() for i in range(n_input)}

    for i in range(n_input):
        for j in range(n_library):
            if input_claims[i]["id"] == library_claims[j]["id"]:
                continue
            if similarity_matrix[i, j] >= threshold:
                adjacency[i].add(j)

    # Track uncovered edges as (input_idx, library_idx) pairs
    uncovered_edges: set[tuple[int, int]] = set()
    for i in range(n_input):
        for j in adjacency[i]:
            uncovered_edges.add((i, j))

    if not uncovered_edges:
        logger.info("No similar claim pairs found above threshold")
        return []

    groups = []

    while uncovered_edges:
        # Count uncovered edges per input claim
        edge_counts: dict[int, int] = {}
        for i, j in uncovered_edges:
            edge_counts[i] = edge_counts.get(i, 0) + 1

        # Pick input claim with most uncovered edges
        pivot_input = max(edge_counts, key=lambda x: edge_counts[x])

        # Get all library claims connected to pivot
        library_neighbors = {j for (i, j) in uncovered_edges if i == pivot_input}

        # Build group: the pivot + all similar library claims
        group_claims = [input_claims[pivot_input]]
        for lib_idx in library_neighbors:
            group_claims.append(library_claims[lib_idx])

        groups.append(ClaimGroup(claims=group_claims))

        # Get all claim IDs in this group
        group_claim_ids = {c["id"] for c in group_claims}
        
        # Get all input indices that are in this group
        group_input_indices = {
            input_id_to_idx[cid] 
            for cid in group_claim_ids 
            if cid in input_id_to_idx
        }
        
        # Get all library indices that are in this group
        group_library_indices = {
            library_id_to_idx[cid] 
            for cid in group_claim_ids 
            if cid in library_id_to_idx
        }

        # Remove ALL edges where both endpoints are in the group
        edges_to_remove = {
            (i, j) for (i, j) in uncovered_edges
            if i in group_input_indices and j in group_library_indices
        }
        uncovered_edges -= edges_to_remove

    logger.info(f"Created {len(groups)} similarity-based groups from {n_input} input claims")
    return groups


def add_embeddings_to_claims(claims: list[dict]) -> list[dict]:
    """
    Fetch and merge embeddings into claim dicts.

    Args:
        claims: List of claim dicts (must have 'id' key)

    Returns:
        List of claim dicts with 'embedding' key added (claims without embeddings are skipped)
    """
    if not claims:
        return []

    vectors = VectorQueries()

    # Fetch embeddings
    claim_ids = [c["id"] for c in claims]
    vector_records = vectors.get_by_extract_ids(claim_ids)

    # Build lookup (parse string embeddings if needed)
    import json

    embedding_by_id = {}
    for v in vector_records:
        emb = v["embedding"]
        # Handle string-encoded embeddings from DB
        if isinstance(emb, str):
            emb = json.loads(emb)
        embedding_by_id[v["extract_id"]] = emb

    # Merge embeddings into claims
    claims_with_embeddings = []
    for claim in claims:
        embedding = embedding_by_id.get(claim["id"])
        if embedding is not None:
            claim["embedding"] = embedding
            claims_with_embeddings.append(claim)
        else:
            logger.warning(f"Claim {claim['id']} has no embedding, skipping")

    return claims_with_embeddings


def _fetch_claims_with_embeddings(library_id: str) -> list[dict]:
    """
    Fetch all claims for a library and merge in their embeddings.

    Args:
        library_id: UUID of the library

    Returns:
        List of claim dicts, each with an 'embedding' key added
    """
    extracts = ExtractQueries()

    # Fetch claims
    claims = extracts.get_claims_by_library(library_id)
    if not claims:
        return []

    return add_embeddings_to_claims(claims)


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


def _deduplicate_links(links: list[ClaimLink]) -> list[ClaimLink]:
    """
    Remove duplicate links (A->B and B->A count as one for symmetric types).

    For symmetric link types (duplicate, variant, contradiction), order doesn't matter.
    For directional types (premise), order is preserved.
    """
    seen = set()
    unique = []

    symmetric_types = {ClaimLinkType.duplicate, ClaimLinkType.variant, ClaimLinkType.contradiction}

    for link in links:
        if link.link_type in symmetric_types:
            # Normalize order for symmetric types
            key = (tuple(sorted([link.claim_id_1, link.claim_id_2])), link.link_type)
        else:
            # Preserve order for directional types (premise)
            key = (link.claim_id_1, link.claim_id_2, link.link_type)

        if key not in seen:
            seen.add(key)
            unique.append(link)

    return unique


# --- Main Orchestration ---

# Max concurrent LLM requests
MAX_CONCURRENT_REQUESTS = 100


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


def _aggregate_usage_from_history() -> UsageStats:
    """Aggregate usage stats from all LM history entries."""
    stats = UsageStats()
    lm = dspy.settings.lm
    if lm and lm.history:
        for entry in lm.history:
            usage = entry.get("usage", {})
            cost = entry.get("cost", 0.0)
            stats.add(usage, cost)
    return stats


async def _link_claims_async(
    groups: list[ClaimGroup],
    max_concurrent: int = MAX_CONCURRENT_REQUESTS,
) -> tuple[list[ClaimLink], UsageStats]:
    """Run linking on all groups concurrently with semaphore limit."""
    semaphore = asyncio.Semaphore(max_concurrent)
    linker = ClaimLinker()

    # Clear history before run so we only capture this batch
    lm = dspy.settings.lm
    if lm:
        lm.history.clear()

    tasks = [
        _process_group(semaphore, linker, group, i)
        for i, group in enumerate(groups)
    ]

    results = await asyncio.gather(*tasks)

    # Aggregate usage from all history entries after completion
    stats = _aggregate_usage_from_history()

    # Flatten results
    all_links: list[ClaimLink] = []
    for links in results:
        all_links.extend(links)

    return all_links, stats


def link_claims(
    input_claims: list[dict],
    library_id: str | UUID,
    similarity_threshold: float = 0.35,
) -> BatchedLinkingResult:
    """
    Find links between input claims and all claims in a library.

    Computes asymmetric similarity (input_claims x library_claims) so edges
    can only involve input claims. For full library mode, pass all claims as input.

    Steps:
    1. Fetch all claims from the library (for comparison targets)
    2. Compute asymmetric similarity matrix (input x library)
    3. Build groups from similarity (each group has an input claim + similar library claims)
    4. Run DSPy linker on each group (concurrently)
    5. Deduplicate and return results

    Args:
        input_claims: List of claim dicts to link (must have 'id' and 'embedding' keys)
        library_id: UUID of the library for context
        similarity_threshold: Minimum cosine similarity to consider claims related

    Returns:
        BatchedLinkingResult with discovered links and usage stats
    """
    library_id_str = str(library_id)
    logger.info(f"Starting claim linking for library_id={library_id_str}")
    logger.info(f"Input claims: {len(input_claims)}")

    if not input_claims:
        logger.info("No input claims to link")
        return BatchedLinkingResult(
            result=LinkingResult(
                library_id=library_id_str,
                total_claims=0,
                groups_processed=0,
                links=[],
            ),
            stats=UsageStats(),
        )

    # 1. Fetch all claims from library (these are the comparison targets)
    library_claims = _fetch_claims_with_embeddings(library_id_str)
    logger.info(f"Fetched {len(library_claims)} total claims from library")

    if len(library_claims) < 2:
        logger.info("Not enough claims in library to link")
        return BatchedLinkingResult(
            result=LinkingResult(
                library_id=library_id_str,
                total_claims=len(library_claims),
                groups_processed=0,
                links=[],
            ),
            stats=UsageStats(),
        )

    # 2. Compute asymmetric similarity matrix (input x library)
    input_embeddings = np.array([c["embedding"] for c in input_claims])
    library_embeddings = np.array([c["embedding"] for c in library_claims])
    similarity_matrix = _asymmetric_cosine_similarity(input_embeddings, library_embeddings)

    # 3. Build groups from similarity
    groups = _build_similarity_groups(
        input_claims,
        library_claims,
        similarity_matrix,
        threshold=similarity_threshold,
    )

    if not groups:
        logger.info("No similar claim pairs found involving input claims")
        return BatchedLinkingResult(
            result=LinkingResult(
                library_id=library_id_str,
                total_claims=len(library_claims),
                groups_processed=0,
                links=[],
            ),
            stats=UsageStats(),
        )

    # 4. Run linker on all groups concurrently
    all_links, stats = asyncio.run(_link_claims_async(groups))

    # 5. Deduplicate links
    unique_links = _deduplicate_links(all_links)
    logger.info(f"Total unique links found: {len(unique_links)}")
    logger.info(f"Usage: {stats.total_input_tokens} input tokens, {stats.total_output_tokens} output tokens")
    logger.info(f"Total cost: ${stats.total_cost:.4f}")

    return BatchedLinkingResult(
        result=LinkingResult(
            library_id=library_id_str,
            total_claims=len(library_claims),
            groups_processed=len(groups),
            links=unique_links,
        ),
        stats=stats,
    )


def link_claims_in_library(
    library_id: str | UUID,
    similarity_threshold: float = 0.35,
) -> BatchedLinkingResult:
    """
    Find and create links between ALL claims in a library.

    This is the "full library" mode - compares all claims against each other.
    Use link_claims() for incremental linking with specific input claims.

    Steps:
    1. Fetch all claim extracts with embeddings for papers in the library
    2. Compute pairwise similarity and group claims by similarity
    3. Run DSPy linker on each group (concurrently)
    4. Deduplicate and return results

    Args:
        library_id: UUID of the library to process
        similarity_threshold: Minimum cosine similarity to consider claims related

    Returns:
        BatchedLinkingResult with all discovered links and usage stats
    """
    library_id_str = str(library_id)
    logger.info(f"Starting full claim-to-claim linking for library_id={library_id_str}")

    # Fetch all claims with embeddings
    claims = _fetch_claims_with_embeddings(library_id_str)
    logger.info(f"Fetched {len(claims)} claims with embeddings from library")

    if len(claims) < 2:
        logger.info("Not enough claims to link")
        return BatchedLinkingResult(
            result=LinkingResult(
                library_id=library_id_str,
                total_claims=len(claims),
                groups_processed=0,
                links=[],
            ),
            stats=UsageStats(),
        )

    # Use link_claims with all claims as input (full library mode)
    # Pass claims directly - they already have embeddings
    return link_claims(
        input_claims=claims,
        library_id=library_id,
        similarity_threshold=similarity_threshold,
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

    batched_result = link_claims_in_library(library_id)
    result = batched_result.result
    stats = batched_result.stats

    return {
        "library_id": result.library_id,
        "total_claims": result.total_claims,
        "groups_processed": result.groups_processed,
        "links_count": len(result.links),
        "links": [link.model_dump() for link in result.links],
        "usage": {
            "total_calls": stats.total_calls,
            "input_tokens": stats.total_input_tokens,
            "output_tokens": stats.total_output_tokens,
            "cost": stats.total_cost,
        },
    }
