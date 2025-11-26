"""Select relevant methods for a claim using DSPy."""
import asyncio
import logging

import dspy

logger = logging.getLogger(__name__)


# --- DSPy Signature ---


class SelectRelevantMethods(dspy.Signature):
    """
    Identify which research methods could produce evidence relevant to a scientific claim.

    Given a claim and a set of method summaries, identify which methods could produce
    observations serving as evidence for or against the claim. Think about the phenomena or 
    relationships that need to be examined to test the claim.

    A method is relevant if:
    - It directly examines the phenomenon or relationship the claim addresses
    - It examines closely related concepts that could provide relevant context

    A method is NOT relevant if:
    - It studies completely unrelated phenomena
    - Its observations could not logically bear on the truth of the claim

    Be inclusive rather than exclusive - it's better to include a marginally relevant
    method than to miss one that could provide key evidence.
    """

    claim_json: str = dspy.InputField(desc="JSON object with claim id and text")
    methods_json: str = dspy.InputField(desc="JSON array of methods with id and summary")
    selection: list[str] = dspy.OutputField(desc="UUIDs of the methods likely to have produced relevant evidence")


# --- DSPy Module ---


class MethodSelector(dspy.Module):
    """DSPy module for selecting relevant methods for a claim."""

    def __init__(self):
        super().__init__()
        self.select = dspy.Predict(SelectRelevantMethods)

    def forward(self, claim_json: str, methods_json: str) -> list[str]:
        """Select methods relevant to a claim."""
        result = self.select(claim_json=claim_json, methods_json=methods_json)
        return result.selection


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


def _format_methods_for_llm(methods: list[dict]) -> str:
    """Format methods as JSON for the DSPy module."""
    import json

    formatted = []
    for method in methods:
        formatted.append({
            "id": method["id"],
            "paper_id": method["paper_id"],
            "summary": method["content"].get("method_summary", ""),
        })
    return json.dumps(formatted, indent=2)


# --- Async Processing ---

MAX_CONCURRENT_REQUESTS = 100


async def _select_methods_for_claim(
    semaphore: asyncio.Semaphore,
    selector: MethodSelector,
    claim: dict,
    methods: list[dict],
    claim_idx: int,
) -> list[str]:
    """Select relevant methods for a single claim with semaphore-controlled concurrency."""
    async with semaphore:
        logger.info(f"Selecting methods for claim {claim_idx + 1}")
        claim_json = _format_claim_for_llm(claim)
        methods_json = _format_methods_for_llm(methods)

        try:
            loop = asyncio.get_event_loop()
            method_ids = await loop.run_in_executor(
                None, selector, claim_json, methods_json
            )
            logger.info(f"Selected {len(method_ids)} methods for claim {claim_idx + 1}")
            return method_ids
        except Exception as e:
            logger.error(f"Error selecting methods for claim {claim_idx + 1}: {e}")
            return []


async def select_methods_for_claims_async(
    claims: list[dict],
    methods: list[dict],
    max_concurrent: int = MAX_CONCURRENT_REQUESTS,
) -> list[list[str]]:
    """
    Select relevant methods for multiple claims concurrently.

    Args:
        claims: List of claim dicts with 'id', 'content', etc.
        methods: List of method dicts with 'id', 'content', etc.
        max_concurrent: Maximum concurrent LLM requests

    Returns:
        List of method ID lists, one per claim
    """
    semaphore = asyncio.Semaphore(max_concurrent)
    selector = MethodSelector()

    tasks = [
        _select_methods_for_claim(semaphore, selector, claim, methods, i)
        for i, claim in enumerate(claims)
    ]

    results = await asyncio.gather(*tasks)
    return list(results)


def select_methods_for_claims(
    claims: list[dict],
    methods: list[dict],
) -> list[list[str]]:
    """
    Synchronous wrapper for selecting relevant methods for claims.

    Args:
        claims: List of claim dicts
        methods: List of method dicts

    Returns:
        List of method ID lists, one per claim
    """
    return asyncio.run(select_methods_for_claims_async(claims, methods))
