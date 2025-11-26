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


def _cosine_similarity_matrix(embeddings: np.ndarray) -> np.ndarray:
    """
    Compute pairwise cosine similarity matrix.

    Args:
        embeddings: (n, d) array of embedding vectors

    Returns:
        (n, n) similarity matrix
    """
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    normalized = embeddings / norms
    return normalized @ normalized.T


def _build_similarity_groups(
    claims: list[dict],
    similarity_matrix: np.ndarray,
    threshold: float = 0.75,
) -> list[ClaimGroup]:
    """
    Build groups using greedy edge covering on the similarity graph.

    For each claim, we identify similar claims (above threshold) and batch them
    together. Claims may appear in multiple batches if they bridge different
    neighborhoods. Isolated claims (no similar neighbors) are skipped.

    Args:
        claims: List of claim dicts (must have 'id' key)
        similarity_matrix: (n, n) pairwise similarity scores
        threshold: Minimum similarity to consider claims related

    Returns:
        List of ClaimGroup objects covering all similar pairs
    """
    n = len(claims)

    # Build adjacency list (edges = pairs above threshold)
    # Use upper triangle to avoid double-counting edges
    adjacency: dict[int, set[int]] = {i: set() for i in range(n)}
    for i in range(n):
        for j in range(i + 1, n):
            if similarity_matrix[i, j] >= threshold:
                adjacency[i].add(j)
                adjacency[j].add(i)

    # Track which edges have been covered
    uncovered_edges: set[tuple[int, int]] = set()
    for i in range(n):
        for j in adjacency[i]:
            if i < j:
                uncovered_edges.add((i, j))

    if not uncovered_edges:
        logger.info("No similar claim pairs found above threshold")
        return []

    groups = []

    # Greedy: pick node with most uncovered edges, batch it with neighbors
    while uncovered_edges:
        # Count uncovered edges per node
        edge_counts: dict[int, int] = {}
        for i, j in uncovered_edges:
            edge_counts[i] = edge_counts.get(i, 0) + 1
            edge_counts[j] = edge_counts.get(j, 0) + 1

        # Pick node with most uncovered edges
        pivot = max(edge_counts, key=lambda x: edge_counts[x])

        # Get all neighbors that have uncovered edges to pivot
        neighbors_with_uncovered = set()
        for i, j in list(uncovered_edges):
            if i == pivot:
                neighbors_with_uncovered.add(j)
            elif j == pivot:
                neighbors_with_uncovered.add(i)

        # Build group: pivot + all neighbors with uncovered edges
        group_indices = {pivot} | neighbors_with_uncovered
        group_claims = [claims[i] for i in group_indices]
        groups.append(ClaimGroup(claims=group_claims))

        # Mark edges within this group as covered
        edges_to_remove = set()
        group_list = list(group_indices)
        for idx_a, i in enumerate(group_list):
            for j in group_list[idx_a + 1:]:
                edge = (min(i, j), max(i, j))
                if edge in uncovered_edges:
                    edges_to_remove.add(edge)

        uncovered_edges -= edges_to_remove

    logger.info(f"Created {len(groups)} similarity-based groups from {n} claims")
    return groups


def _fetch_claims_with_embeddings(library_id: str) -> list[dict]:
    """
    Fetch all claims for a library and merge in their embeddings.

    Args:
        library_id: UUID of the library

    Returns:
        List of claim dicts, each with an 'embedding' key added
    """
    extracts = ExtractQueries()
    vectors = VectorQueries()

    # Fetch claims
    claims = extracts.get_claims_by_library(library_id)
    if not claims:
        return []

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


def link_claims_in_library(
    library_id: str | UUID,
    similarity_threshold: float = 0.75,
) -> LinkingResult:
    """
    Find and create links between claims in a library.

    Steps:
    1. Fetch all claim extracts with embeddings for papers in the library
    2. Compute pairwise similarity and group claims by similarity
    3. Run DSPy linker on each group (concurrently)
    4. Deduplicate and return results

    Args:
        library_id: UUID of the library to process
        similarity_threshold: Minimum cosine similarity to consider claims related (default 0.75)

    Returns:
        LinkingResult with all discovered links
    """
    library_id_str = str(library_id)
    logger.info(f"Starting claim-to-claim linking for library_id={library_id_str}")

    # 1. Fetch all claims with embeddings
    claims = _fetch_claims_with_embeddings(library_id_str)
    logger.info(f"Fetched {len(claims)} claims with embeddings from library")

    if len(claims) < 2:
        logger.info("Not enough claims to link")
        return LinkingResult(
            library_id=library_id_str,
            total_claims=len(claims),
            groups_processed=0,
            links=[],
        )

    # 2. Compute similarity matrix and build groups
    embeddings = np.array([c["embedding"] for c in claims])
    similarity_matrix = _cosine_similarity_matrix(embeddings)
    groups = _build_similarity_groups(claims, similarity_matrix, threshold=similarity_threshold)

    if not groups:
        logger.info("No similar claim pairs found, nothing to link")
        return LinkingResult(
            library_id=library_id_str,
            total_claims=len(claims),
            groups_processed=0,
            links=[],
        )

    # 3. Run linker on all groups concurrently
    all_links = asyncio.run(_link_claims_async(groups))

    # 4. Deduplicate links (claims can appear in multiple groups)
    unique_links = _deduplicate_links(all_links)
    logger.info(f"Total unique links found: {len(unique_links)}")

    return LinkingResult(
        library_id=library_id_str,
        total_claims=len(claims),
        groups_processed=len(groups),
        links=unique_links,
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
