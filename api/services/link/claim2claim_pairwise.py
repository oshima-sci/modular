"""Pairwise claim linking - one LLM call per candidate pair.

This approach avoids UUID hallucination by never asking the LLM to return UUIDs.
Instead, we pass exactly two claims and ask for a link type (or None).
"""
import asyncio
import logging
from dataclasses import dataclass
from typing import Optional
from uuid import UUID

import dspy
import numpy as np
from pydantic import BaseModel, Field

from db import ExtractQueries, VectorQueries
from services.link.claim2claim import (
    ClaimLink,
    ClaimLinkType,
    LinkingResult,
    add_embeddings_to_claims,
    _asymmetric_cosine_similarity,
    _fetch_claims_with_embeddings,
)

logger = logging.getLogger(__name__)


# --- Pairwise DSPy Signature ---


from enum import Enum


class PairwiseLinkType(str, Enum):
    """Link type for a pair of claims, including 'none' for no relationship."""

    none = "none"
    duplicate = "duplicate"
    variant = "variant"
    contradiction = "contradiction"
    premise_1_to_2 = "premise_1_to_2"  # Claim 1 is premise for Claim 2
    premise_2_to_1 = "premise_2_to_1"  # Claim 2 is premise for Claim 1


class PairwiseLinkResult(BaseModel):
    """Result of evaluating a single pair of claims."""

    link_type: PairwiseLinkType = Field(
        description="Type of relationship: none, duplicate, variant, contradiction, premise_1_to_2, or premise_2_to_1"
    )
    reasoning: str = Field(description="Brief explanation of the relationship (or why there is none)")


class ClassifyClaimPair(dspy.Signature):
    """
    Determine if two scientific claims have a meaningful relationship.

    Given exactly two claims, classify their relationship:
    - NONE: No meaningful relationship
    - DUPLICATE: Claims say the same thing in different words
    - VARIANT: Claims talk about the excat same phenomenon or relationship but differ 
        in some detail about their nature. Variant claims extend their counter part, 
        impose different conditions, etc. Two variant claims can be true at the same time. 
        Importantly, claims not immediately variants of each other because they touch upon the same topic.
        They need to be about the exact same relationship or phenomenon to be variants. 
    - CONTRADICTION: Claims directly disagree and cannot both be true
    - PREMISE_1_TO_2: Claim 1 is a logical premise/foundation for Claim 2
    - PREMISE_2_TO_1: Claim 2 is a logical premise/foundation for Claim 1
    """

    claim_1: str = dspy.InputField(desc="First claim text")
    claim_2: str = dspy.InputField(desc="Second claim text")
    result: PairwiseLinkResult = dspy.OutputField(desc="Classification result")


class PairwiseLinker(dspy.Module):
    """DSPy module for classifying a single pair of claims."""

    def __init__(self):
        super().__init__()
        self.classify = dspy.Predict(ClassifyClaimPair)

    def forward(self, claim_1: str, claim_2: str) -> PairwiseLinkResult:
        """Classify the relationship between two claims."""
        result = self.classify(claim_1=claim_1, claim_2=claim_2)
        return result.result


# --- Candidate Pair Generation ---


@dataclass
class CandidatePair:
    """A pair of claims to evaluate."""

    claim_1_id: str
    claim_1_text: str
    claim_2_id: str
    claim_2_text: str
    similarity: float


def build_candidate_pairs(
    input_claims: list[dict],
    library_claims: list[dict],
    threshold: float = 0.35,
) -> list[CandidatePair]:
    """
    Build list of candidate pairs above similarity threshold.

    Uses asymmetric similarity: only pairs where at least one claim is from input_claims.
    """
    if not input_claims or not library_claims:
        return []

    # Build embeddings matrices
    input_embeddings = np.array([c["embedding"] for c in input_claims])
    library_embeddings = np.array([c["embedding"] for c in library_claims])

    # Compute similarity
    similarity_matrix = _asymmetric_cosine_similarity(input_embeddings, library_embeddings)

    # Build ID sets for deduplication
    input_ids = {c["id"] for c in input_claims}

    # Collect candidate pairs
    pairs = []
    seen = set()  # Track (min_id, max_id) to avoid duplicates

    for i, input_claim in enumerate(input_claims):
        for j, lib_claim in enumerate(library_claims):
            # Skip self-comparison
            if input_claim["id"] == lib_claim["id"]:
                continue

            # Skip if below threshold
            sim = similarity_matrix[i, j]
            if sim < threshold:
                continue

            # Deduplicate: use sorted IDs as key
            pair_key = tuple(sorted([input_claim["id"], lib_claim["id"]]))
            if pair_key in seen:
                continue
            seen.add(pair_key)

            # Get claim text
            claim_1_text = input_claim["content"].get("rephrased_claim", "")
            claim_2_text = lib_claim["content"].get("rephrased_claim", "")

            pairs.append(CandidatePair(
                claim_1_id=input_claim["id"],
                claim_1_text=claim_1_text,
                claim_2_id=lib_claim["id"],
                claim_2_text=claim_2_text,
                similarity=float(sim),
            ))

    logger.info(f"Built {len(pairs)} candidate pairs above threshold {threshold}")
    return pairs


# --- Token/Cost Tracking ---


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


# --- Async Processing ---

from concurrent.futures import ThreadPoolExecutor

MAX_CONCURRENT_REQUESTS = 200

# Explicit thread pool for I/O-bound API calls (default is only 32)
_executor = ThreadPoolExecutor(max_workers=MAX_CONCURRENT_REQUESTS)


async def _process_pair(
    semaphore: asyncio.Semaphore,
    linker: PairwiseLinker,
    pair: CandidatePair,
    pair_idx: int,
) -> Optional[ClaimLink]:
    """Process a single pair with semaphore-controlled concurrency."""
    async with semaphore:
        logger.debug(f"Processing pair {pair_idx + 1}: {pair.claim_1_id[:8]}... <-> {pair.claim_2_id[:8]}...")

        try:
            # Run DSPy in thread pool
            loop = asyncio.get_event_loop()
            result: PairwiseLinkResult = await loop.run_in_executor(
                _executor, linker, pair.claim_1_text, pair.claim_2_text
            )

            # Convert to ClaimLink if there's a relationship
            if result.link_type == PairwiseLinkType.none:
                return None

            # Map pairwise result to ClaimLink
            if result.link_type == PairwiseLinkType.premise_1_to_2:
                return ClaimLink(
                    claim_id_1=pair.claim_1_id,
                    claim_id_2=pair.claim_2_id,
                    link_type=ClaimLinkType.premise,
                    reasoning=result.reasoning,
                )
            elif result.link_type == PairwiseLinkType.premise_2_to_1:
                return ClaimLink(
                    claim_id_1=pair.claim_2_id,
                    claim_id_2=pair.claim_1_id,
                    link_type=ClaimLinkType.premise,
                    reasoning=result.reasoning,
                )
            else:
                # Symmetric types: duplicate, variant, contradiction
                return ClaimLink(
                    claim_id_1=pair.claim_1_id,
                    claim_id_2=pair.claim_2_id,
                    link_type=ClaimLinkType(result.link_type.value),
                    reasoning=result.reasoning,
                )

        except Exception as e:
            logger.error(f"Error processing pair {pair_idx + 1}: {e}")
            return None


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


async def _link_pairs_async(
    pairs: list[CandidatePair],
    max_concurrent: int = MAX_CONCURRENT_REQUESTS,
) -> tuple[list[ClaimLink], UsageStats]:
    """Run linking on all pairs concurrently."""
    semaphore = asyncio.Semaphore(max_concurrent)
    linker = PairwiseLinker()

    # Clear history before run so we only capture this batch
    lm = dspy.settings.lm
    if lm:
        lm.history.clear()

    tasks = [
        _process_pair(semaphore, linker, pair, i)
        for i, pair in enumerate(pairs)
    ]

    results = await asyncio.gather(*tasks)

    # Aggregate usage from all history entries after completion
    stats = _aggregate_usage_from_history()

    # Filter out None results
    links = [r for r in results if r is not None]
    return links, stats


# --- Main Entry Points ---


@dataclass
class PairwiseLinkingResult:
    """Result with usage stats."""

    result: LinkingResult
    stats: UsageStats


def link_claims_pairwise(
    input_claims: list[dict],
    library_id: str | UUID,
    similarity_threshold: float = 0.35,
) -> PairwiseLinkingResult:
    """
    Find links using pairwise classification (one LLM call per candidate pair).

    This approach:
    - Never asks LLM to return UUIDs (avoids hallucination)
    - Makes one call per candidate pair above similarity threshold
    - Returns detailed usage statistics for cost analysis
    """
    library_id_str = str(library_id)
    logger.info(f"Starting pairwise claim linking for library_id={library_id_str}")
    logger.info(f"Input claims: {len(input_claims)}")

    if not input_claims:
        return PairwiseLinkingResult(
            result=LinkingResult(
                library_id=library_id_str,
                total_claims=0,
                groups_processed=0,
                links=[],
            ),
            stats=UsageStats(),
        )

    # Fetch library claims
    library_claims = _fetch_claims_with_embeddings(library_id_str)
    logger.info(f"Fetched {len(library_claims)} claims from library")

    if len(library_claims) < 2:
        return PairwiseLinkingResult(
            result=LinkingResult(
                library_id=library_id_str,
                total_claims=len(library_claims),
                groups_processed=0,
                links=[],
            ),
            stats=UsageStats(),
        )

    # Build candidate pairs
    pairs = build_candidate_pairs(input_claims, library_claims, similarity_threshold)

    if not pairs:
        return PairwiseLinkingResult(
            result=LinkingResult(
                library_id=library_id_str,
                total_claims=len(library_claims),
                groups_processed=0,
                links=[],
            ),
            stats=UsageStats(),
        )

    # Process all pairs
    links, stats = asyncio.run(_link_pairs_async(pairs))

    logger.info(f"Found {len(links)} links from {len(pairs)} candidate pairs")
    logger.info(f"Usage: {stats.total_input_tokens} input tokens, {stats.total_output_tokens} output tokens")
    logger.info(f"Total cost: ${stats.total_cost:.4f}")

    return PairwiseLinkingResult(
        result=LinkingResult(
            library_id=library_id_str,
            total_claims=len(library_claims),
            groups_processed=len(pairs),  # pairs processed instead of groups
            links=links,
        ),
        stats=stats,
    )


def link_claims_in_library_pairwise(
    library_id: str | UUID,
    similarity_threshold: float = 0.35,
) -> PairwiseLinkingResult:
    """
    Full library pairwise linking - compare all claims against each other.
    """
    library_id_str = str(library_id)
    claims = _fetch_claims_with_embeddings(library_id_str)

    if len(claims) < 2:
        return PairwiseLinkingResult(
            result=LinkingResult(
                library_id=library_id_str,
                total_claims=len(claims),
                groups_processed=0,
                links=[],
            ),
            stats=UsageStats(),
        )

    return link_claims_pairwise(
        input_claims=claims,
        library_id=library_id,
        similarity_threshold=similarity_threshold,
    )
