"""Link claims to observations (evidence) within a library using DSPy."""
import asyncio
import logging
from typing import Any
from uuid import UUID

import dspy
from pydantic import BaseModel, Field

from db import ExtractQueries, VectorQueries

logger = logging.getLogger(__name__)


# --- Pydantic Schemas ---

from enum import Enum


class EvidenceLinkType(str, Enum):
    """
    Type of evidential relationship between a claim and an observation.
    - SUPPORTS: The observation provides evidence that supports the claim.
    - CONTRADICTS: The observation provides evidence that contradicts or refutes the claim.
    - CONTEXTUALIZES: The observation provides relevant context for the claim without
      directly supporting or contradicting it (e.g., scope conditions, boundary cases,
      related phenomena).
    """

    supports = "supports"
    contradicts = "contradicts"
    contextualizes = "contextualizes"


class EvidenceLink(BaseModel):
    """A link between a claim and an observation."""

    claim_id: str = Field(description="UUID of the claim extract")
    observation_id: str = Field(description="UUID of the observation extract")
    link_type: EvidenceLinkType = Field(description="Type of evidential relationship")
    reasoning: str = Field(description="Brief explanation of how the observation relates to the claim")


class EvidenceGroup(BaseModel):
    """A group containing one claim and candidate observations to evaluate."""

    claim: dict = Field(description="The claim to find evidence for")
    observations: list[dict] = Field(description="Candidate observations that may be evidence")


class EvidenceLinkingResult(BaseModel):
    """Result of claim-to-observation linking for a library."""

    library_id: str
    total_claims: int
    total_observations: int
    groups_processed: int
    links: list[EvidenceLink] = Field(default_factory=list)


# --- DSPy Signature ---


class LinkClaimToObservations(dspy.Signature):
    """
    Identify evidential relationships between a scientific claim and provided observations.

    Given a claim and a set of observations (empirical findings, measurements, experimental
    results) from papers in a research library, identify which observations serve as
    evidence for or against the claim.

    Evidential relationships:
    - SUPPORTS: The observation provides empirical evidence supporting the claim. It is a specific instance of the claim's general assertion.
    - CONTRADICTS: The observation provides empirical evidence against the claim. If the claim were true as it is, we would not be able to make this observation.
    - CONTEXTUALIZES: The observation provides relevant context (scope, conditions, related findings)
      without directly supporting or contradicting the claim

    Only create links where there is a clear evidential relationship.
    Use the observation and claim ids provided in the input in your response.

    If the method examines the exact phenomenon or relationship the claim addresses, it's likely that the observations
    coming out of it provide evidence for or against the claim.
    If the method doesn't directly examine the exact phenomenon or relationship but relevant and related concepts,
    there's probably some observations being made that provide relevant context to the claim.
    """

    claim_json: str = dspy.InputField(desc="JSON object with claim id and text")
    observations_json: str = dspy.InputField(desc="""
        JSON object with observations and context of the methods/studies that produced them.
        Contains observations from the literature and potentially from same paper as the claim (if so they are marked as such).
    """)
    links: list[EvidenceLink] = dspy.OutputField(desc="List of identified evidence links")


# --- DSPy Module ---


class EvidenceLinker(dspy.Module):
    """DSPy module for linking claims to observations."""

    def __init__(self):
        super().__init__()
        self.link = dspy.Predict(LinkClaimToObservations)

    def forward(self, claim_json: str, observations_json: str) -> list[EvidenceLink]:
        """Find evidence links between a claim and observations."""
        result = self.link(claim_json=claim_json, observations_json=observations_json)
        return result.links


# --- Preselection ---


def _preselect_observations_for_claim(
    claim: dict,
    observations: list[dict],
    methods: list[dict],
    observations_by_method: dict[str, list[dict]],
    observations_by_paper: dict[str, list[dict]],
) -> list[dict]:
    """
    Preselect candidate observations for a single claim using method-based filtering.

    Strategy:
    1. Use LLM to select which methods are relevant to the claim
    2. Include all observations from selected methods
    3. Also include observations from the same paper as the claim (always relevant)

    Args:
        claim: Claim dict with 'id', 'content', 'paper_id', etc.
        observations: All observations in the library
        methods: All methods in the library
        observations_by_method: Lookup dict mapping method_id -> observations
        observations_by_paper: Lookup dict mapping paper_id -> observations

    Returns:
        List of candidate observation dicts for this claim
    """
    from services.link.method_selector import select_methods_for_claims

    candidate_obs_ids = set()

    # Use LLM to select relevant methods (if methods available)
    if methods:
        # select_methods_for_claims expects a list, returns list of lists
        method_selections = select_methods_for_claims([claim], methods)
        selected_method_ids = method_selections[0] if method_selections else []

        # Add observations from selected methods
        for method_id in selected_method_ids:
            for obs in observations_by_method.get(method_id, []):
                candidate_obs_ids.add(obs["id"])

    # Always include observations from the same paper as the claim
    claim_paper_id = claim.get("paper_id")
    if claim_paper_id:
        for obs in observations_by_paper.get(claim_paper_id, []):
            candidate_obs_ids.add(obs["id"])

    # Build observation list
    if candidate_obs_ids:
        return [obs for obs in observations if obs["id"] in candidate_obs_ids]
    return []


def _build_observation_lookups(
    observations: list[dict],
) -> tuple[dict[str, list[dict]], dict[str, list[dict]]]:
    """
    Build lookup dicts for observations by method and by paper.

    Returns:
        Tuple of (observations_by_method, observations_by_paper)
    """
    observations_by_method: dict[str, list[dict]] = {}
    observations_by_paper: dict[str, list[dict]] = {}

    for obs in observations:
        # By method
        method_id = obs.get("content", {}).get("method_reference")
        if method_id:
            if method_id not in observations_by_method:
                observations_by_method[method_id] = []
            observations_by_method[method_id].append(obs)

        # By paper
        paper_id = obs.get("paper_id")
        if paper_id:
            if paper_id not in observations_by_paper:
                observations_by_paper[paper_id] = []
            observations_by_paper[paper_id].append(obs)

    return observations_by_method, observations_by_paper


# --- Data Fetching ---


def _fetch_claims_with_embeddings(library_id: str) -> list[dict]:
    """
    Fetch all claims for a library with their embeddings.

    Args:
        library_id: UUID of the library

    Returns:
        List of claim dicts, each with an 'embedding' key
    """
    import json

    extracts = ExtractQueries()
    vectors = VectorQueries()

    claims = extracts.get_claims_by_library(library_id)
    if not claims:
        return []

    claim_ids = [c["id"] for c in claims]
    vector_records = vectors.get_by_extract_ids(claim_ids)

    embedding_by_id = {}
    for v in vector_records:
        emb = v["embedding"]
        if isinstance(emb, str):
            emb = json.loads(emb)
        embedding_by_id[v["extract_id"]] = emb

    claims_with_embeddings = []
    for claim in claims:
        embedding = embedding_by_id.get(claim["id"])
        if embedding is not None:
            claim["embedding"] = embedding
            claims_with_embeddings.append(claim)
        else:
            logger.warning(f"Claim {claim['id']} has no embedding, skipping")

    return claims_with_embeddings


def _fetch_observations_with_embeddings(library_id: str) -> list[dict]:
    """
    Fetch all observations for a library with their embeddings.

    Args:
        library_id: UUID of the library

    Returns:
        List of observation dicts, each with an 'embedding' key
    """
    import json

    extracts = ExtractQueries()
    vectors = VectorQueries()

    observations = extracts.get_observations_by_library(library_id)
    if not observations:
        return []

    observation_ids = [o["id"] for o in observations]
    vector_records = vectors.get_by_extract_ids(observation_ids)

    embedding_by_id = {}
    for v in vector_records:
        emb = v["embedding"]
        if isinstance(emb, str):
            emb = json.loads(emb)
        embedding_by_id[v["extract_id"]] = emb

    observations_with_embeddings = []
    for obs in observations:
        embedding = embedding_by_id.get(obs["id"])
        if embedding is not None:
            obs["embedding"] = embedding
            observations_with_embeddings.append(obs)
        else:
            logger.warning(f"Observation {obs['id']} has no embedding, skipping")

    return observations_with_embeddings


def _fetch_methods(library_id: str) -> list[dict]:
    """
    Fetch all methods for a library.

    Args:
        library_id: UUID of the library

    Returns:
        List of method dicts
    """
    extracts = ExtractQueries()
    methods = extracts.get_methods_by_library(library_id)
    return methods if methods else []


# --- Helper Functions ---


def _format_claim_for_llm(claim: dict) -> str:
    """Format a single claim as JSON for the DSPy module."""
    import json

    formatted = {
        "id": claim["id"],
        "paper_id": claim["paper_id"],
        "claim": claim["content"].get("rephrased_claim", ""),
    }
    return json.dumps(formatted, indent=2)


def _format_observations_for_llm(
    observations: list[dict],
    methods_lookup: dict[str, dict] | None = None,
    claim_paper_id: str | None = None,
) -> str:
    """Format observations as JSON for the DSPy module, grouped by method.

    Args:
        observations: List of observation dicts
        methods_lookup: Optional dict mapping method_id -> method dict for context
        claim_paper_id: Optional paper_id of the claim to separate same-paper observations
    """
    import json

    # Separate same-paper vs general literature observations
    same_paper_obs = []
    general_obs = []
    for obs in observations:
        if claim_paper_id and obs.get("paper_id") == claim_paper_id:
            same_paper_obs.append(obs)
        else:
            general_obs.append(obs)

    def group_by_method(obs_list: list[dict]) -> list[dict]:
        """Group observations by method_reference."""
        method_groups: dict[str | None, list[dict]] = {}
        for obs in obs_list:
            content = obs.get("content", {})
            method_id = content.get("method_reference")
            if method_id not in method_groups:
                method_groups[method_id] = []
            method_groups[method_id].append(obs)

        grouped = []
        for method_id, obs_in_method in method_groups.items():
            method_summary = None
            if method_id and methods_lookup:
                method = methods_lookup.get(method_id)
                if method:
                    method_summary = method["content"].get("method_summary", "")

            formatted_obs = []
            for obs in obs_in_method:
                obs_data = {"id": obs["id"]}
                content = obs.get("content", {})
                for key, value in content.items():
                    if key not in ("source_elements", "method_reference"):
                        obs_data[key] = value
                formatted_obs.append(obs_data)

            grouped.append({
                "method_summary": method_summary,
                "observations": formatted_obs,
            })
        return grouped

    result = {}
    if same_paper_obs:
        result["observations_from_same_paper"] = group_by_method(same_paper_obs)
    if general_obs:
        result["observations_from_general_literature"] = group_by_method(general_obs)

    return json.dumps(result, indent=2)


def _deduplicate_links(links: list[EvidenceLink]) -> list[EvidenceLink]:
    """
    Remove duplicate evidence links.

    Since evidence links are directional (claim -> observation), we use
    the full tuple as the key.
    """
    seen = set()
    unique = []

    for link in links:
        key = (link.claim_id, link.observation_id, link.link_type)
        if key not in seen:
            seen.add(key)
            unique.append(link)

    return unique


# --- Claim-Level Linking ---


def link_observations_to_claim(
    claim: dict,
    observations: list[dict],
    methods: list[dict],
    methods_lookup: dict[str, dict],
    observations_by_method: dict[str, list[dict]],
    observations_by_paper: dict[str, list[dict]],
) -> list[EvidenceLink]:
    """
    Find evidence links between a single claim and candidate observations.

    This is the core claim-level function. It:
    1. Preselects candidate observations for the claim (via method selection)
    2. Runs the evidence linker on the claim + candidates
    3. Returns the discovered links

    Args:
        claim: Claim dict with 'id', 'content', 'paper_id', etc.
        observations: All observations in the library
        methods: All methods in the library
        methods_lookup: Dict mapping method_id -> method dict
        observations_by_method: Lookup dict mapping method_id -> observations
        observations_by_paper: Lookup dict mapping paper_id -> observations

    Returns:
        List of EvidenceLink objects for this claim
    """
    # 1. Preselect candidate observations
    candidate_observations = _preselect_observations_for_claim(
        claim=claim,
        observations=observations,
        methods=methods,
        observations_by_method=observations_by_method,
        observations_by_paper=observations_by_paper,
    )

    if not candidate_observations:
        logger.debug(f"No candidate observations for claim {claim['id']}")
        return []

    # 2. Run evidence linker
    linker = EvidenceLinker()
    claim_json = _format_claim_for_llm(claim)
    observations_json = _format_observations_for_llm(
        candidate_observations, methods_lookup, claim_paper_id=claim.get("paper_id")
    )

    try:
        links = linker(claim_json, observations_json)
        logger.info(f"Found {len(links)} evidence links for claim {claim['id'][:8]}...")
        return links
    except Exception as e:
        logger.error(f"Error linking claim {claim['id']}: {e}")
        return []


# --- Batch/Library-Level Orchestration ---

MAX_CONCURRENT_REQUESTS = 100


async def _process_claim_async(
    semaphore: asyncio.Semaphore,
    linker: EvidenceLinker,
    claim: dict,
    candidate_observations: list[dict],
    methods_lookup: dict[str, dict],
    claim_idx: int,
) -> list[EvidenceLink]:
    """Process a single claim with semaphore-controlled concurrency."""
    async with semaphore:
        if not candidate_observations:
            return []

        logger.info(f"Processing claim {claim_idx + 1} ({len(candidate_observations)} observations)")
        claim_json = _format_claim_for_llm(claim)
        observations_json = _format_observations_for_llm(
            candidate_observations, methods_lookup, claim_paper_id=claim.get("paper_id")
        )

        try:
            loop = asyncio.get_event_loop()
            links = await loop.run_in_executor(
                None, linker, claim_json, observations_json
            )
            logger.info(f"Found {len(links)} evidence links for claim {claim_idx + 1}")
            return links
        except Exception as e:
            logger.error(f"Error processing claim {claim_idx + 1}: {e}")
            return []


async def _link_claims_async(
    claims: list[dict],
    observations: list[dict],
    methods: list[dict],
    methods_lookup: dict[str, dict],
    max_concurrent: int = MAX_CONCURRENT_REQUESTS,
) -> list[EvidenceLink]:
    """
    Run evidence linking on multiple claims concurrently.

    Performs method selection for all claims first (batched), then runs
    evidence linking concurrently with semaphore limit.
    """
    from services.link.method_selector import select_methods_for_claims

    # Build observation lookups
    observations_by_method, observations_by_paper = _build_observation_lookups(observations)

    # Batch method selection for all claims
    if methods:
        logger.info(f"Selecting relevant methods for {len(claims)} claims")
        method_selections = select_methods_for_claims(claims, methods)
    else:
        method_selections = [[] for _ in claims]

    # Build candidate observations for each claim
    candidate_obs_per_claim = []
    for claim, selected_method_ids in zip(claims, method_selections):
        candidate_obs_ids = set()

        # Add observations from selected methods
        for method_id in selected_method_ids:
            for obs in observations_by_method.get(method_id, []):
                candidate_obs_ids.add(obs["id"])

        # Always include same-paper observations
        claim_paper_id = claim.get("paper_id")
        if claim_paper_id:
            for obs in observations_by_paper.get(claim_paper_id, []):
                candidate_obs_ids.add(obs["id"])

        if candidate_obs_ids:
            candidates = [obs for obs in observations if obs["id"] in candidate_obs_ids]
        else:
            candidates = []
        candidate_obs_per_claim.append(candidates)

    # Run evidence linking concurrently
    semaphore = asyncio.Semaphore(max_concurrent)
    linker = EvidenceLinker()

    tasks = [
        _process_claim_async(semaphore, linker, claim, candidates, methods_lookup, i)
        for i, (claim, candidates) in enumerate(zip(claims, candidate_obs_per_claim))
    ]

    results = await asyncio.gather(*tasks)

    all_links: list[EvidenceLink] = []
    for links in results:
        all_links.extend(links)

    return all_links


def link_observations_to_input_claims(
    library_id: str | UUID,
    input_claims: list[dict],
) -> EvidenceLinkingResult:
    """
    Link input claims against ALL observations in a library.

    Used by LINK_LIBRARY job for incremental linking - only processes
    new/unlinked claims rather than the entire library.

    Args:
        library_id: UUID of the library
        input_claims: List of claim dicts (must include embeddings)

    Returns:
        EvidenceLinkingResult with discovered evidence links
    """
    library_id_str = str(library_id)
    logger.info(
        f"Starting c2o linking for {len(input_claims)} input claims in library {library_id_str}"
    )

    if not input_claims:
        logger.info("No input claims provided, skipping c2o linking")
        return EvidenceLinkingResult(
            library_id=library_id_str,
            total_claims=0,
            total_observations=0,
            groups_processed=0,
            links=[],
        )

    # Fetch ALL observations from the library
    observations = _fetch_observations_with_embeddings(library_id_str)
    logger.info(f"Fetched {len(observations)} observations with embeddings")

    if not observations:
        logger.info("No observations in library, skipping c2o linking")
        return EvidenceLinkingResult(
            library_id=library_id_str,
            total_claims=len(input_claims),
            total_observations=0,
            groups_processed=0,
            links=[],
        )

    # Fetch methods for preselection
    methods = _fetch_methods(library_id_str)
    logger.info(f"Fetched {len(methods)} methods for preselection")

    # Build methods lookup for observation context
    methods_lookup = {m["id"]: m for m in methods}

    # Run linking on input claims concurrently
    all_links = asyncio.run(
        _link_claims_async(input_claims, observations, methods, methods_lookup)
    )

    # Deduplicate links
    unique_links = _deduplicate_links(all_links)
    logger.info(f"Total unique evidence links found: {len(unique_links)}")

    return EvidenceLinkingResult(
        library_id=library_id_str,
        total_claims=len(input_claims),
        total_observations=len(observations),
        groups_processed=len(input_claims),
        links=unique_links,
    )


def link_observations_to_claims(
    library_id: str | UUID,
) -> EvidenceLinkingResult:
    """
    Find and create evidence links between claims and observations in a library.

    Steps:
    1. Fetch all claim extracts with embeddings
    2. Fetch all observation extracts with embeddings
    3. Fetch all methods for method-based preselection
    4. Batch method selection for all claims
    5. Run DSPy linker on each claim (concurrently)
    6. Deduplicate and return results

    Args:
        library_id: UUID of the library to process

    Returns:
        EvidenceLinkingResult with all discovered evidence links
    """
    library_id_str = str(library_id)
    logger.info(f"Starting claim-to-observation linking for library_id={library_id_str}")

    # 1. Fetch claims with embeddings
    claims = _fetch_claims_with_embeddings(library_id_str)
    logger.info(f"Fetched {len(claims)} claims with embeddings")

    # 2. Fetch observations with embeddings
    observations = _fetch_observations_with_embeddings(library_id_str)
    logger.info(f"Fetched {len(observations)} observations with embeddings")

    if not claims or not observations:
        logger.info("Not enough data to link (need both claims and observations)")
        return EvidenceLinkingResult(
            library_id=library_id_str,
            total_claims=len(claims),
            total_observations=len(observations),
            groups_processed=0,
            links=[],
        )

    # 3. Fetch methods for preselection
    methods = _fetch_methods(library_id_str)
    logger.info(f"Fetched {len(methods)} methods for preselection")

    # Build methods lookup for observation context
    methods_lookup = {m["id"]: m for m in methods}

    # 4-5. Run linking on all claims concurrently
    all_links = asyncio.run(_link_claims_async(claims, observations, methods, methods_lookup))

    # 6. Deduplicate links
    unique_links = _deduplicate_links(all_links)
    logger.info(f"Total unique evidence links found: {len(unique_links)}")

    return EvidenceLinkingResult(
        library_id=library_id_str,
        total_claims=len(claims),
        total_observations=len(observations),
        groups_processed=len(claims),
        links=unique_links,
    )


# --- Job Handler ---


def handle_link_evidence(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Handler for link_evidence jobs.

    Payload:
        library_id: UUID of the library to link claims and observations within

    Returns:
        Dict with evidence linking results
    """
    library_id = payload["library_id"]

    result = link_observations_to_claims(library_id)

    return {
        "library_id": result.library_id,
        "total_claims": result.total_claims,
        "total_observations": result.total_observations,
        "groups_processed": result.groups_processed,
        "links_count": len(result.links),
        "links": [link.model_dump() for link in result.links],
    }
