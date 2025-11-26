"""Test script for claim-to-observation linking.

Usage:
    cd api
    python -m services.link.test_claim2observation <library_id>
    python -m services.link.test_claim2observation <library_id> --num-claims 10
"""
import argparse
import os
import random
import sys

# Add api directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import dspy
from dotenv import load_dotenv

load_dotenv()

from db import ExtractQueries
from services.link.claim2observation import (
    link_observations_to_claim,
    _fetch_observations_with_embeddings,
    _fetch_methods,
    _build_observation_lookups,
    _deduplicate_links,
    EvidenceLink,
)


def main():
    parser = argparse.ArgumentParser(description="Test claim-to-observation linking")
    parser.add_argument("library_id", help="UUID of the library to process")
    parser.add_argument("--num-claims", type=int, default=5, help="Number of random claims to test (default: 5)")
    args = parser.parse_args()

    # Configure DSPy with Claude
    lm = dspy.LM(
        model="anthropic/claude-sonnet-4-20250514",
        api_key=os.getenv("ANTHROPIC_API_KEY"),
        max_tokens=64000,
    )
    dspy.configure(lm=lm)

    print(f"Running claim-to-observation linking for library: {args.library_id}")

    # Fetch all claims and sample
    extracts = ExtractQueries()
    all_claims = extracts.get_claims_by_library(args.library_id)
    print(f"Found {len(all_claims)} total claims in library")

    if not all_claims:
        print("No claims found. Exiting.")
        return

    num_claims = min(args.num_claims, len(all_claims))
    sample_claims = random.sample(all_claims, num_claims)
    print(f"Sampling {num_claims} random claims\n")

    # Print sampled claims
    print("=" * 80)
    print("SAMPLED CLAIMS")
    print("=" * 80)
    for i, claim in enumerate(sample_claims, 1):
        claim_text = claim["content"].get("rephrased_claim", "No claim text")
        print(f"\n{i}. [{claim['id'][:8]}...] (paper: {claim['paper_id'][:8]}...)")
        print(f"   {claim_text[:200]}..." if len(claim_text) > 200 else f"   {claim_text}")

    # Fetch observations and methods (all from library)
    observations = _fetch_observations_with_embeddings(args.library_id)
    print(f"\nFetched {len(observations)} observations with embeddings")

    methods = _fetch_methods(args.library_id)
    print(f"Fetched {len(methods)} methods for preselection")

    if not observations:
        print("No observations found. Exiting.")
        return

    # Build lookups
    methods_lookup = {m["id"]: m for m in methods}
    observations_by_method, observations_by_paper = _build_observation_lookups(observations)

    # Process each claim
    print("\n" + "=" * 80)
    print("PROCESSING CLAIMS")
    print("=" * 80)

    all_links: list[EvidenceLink] = []
    for i, claim in enumerate(sample_claims, 1):
        claim_text = claim["content"].get("rephrased_claim", "")[:100]
        print(f"\n--- Claim {i}/{num_claims}: {claim_text}...")

        links = link_observations_to_claim(
            claim=claim,
            observations=observations,
            methods=methods,
            methods_lookup=methods_lookup,
            observations_by_method=observations_by_method,
            observations_by_paper=observations_by_paper,
        )
        all_links.extend(links)
        print(f"    Found {len(links)} links")

    unique_links = _deduplicate_links(all_links)

    # Print results
    print("\n" + "=" * 80)
    print("RESULTS")
    print("=" * 80)
    print(f"Total claims processed: {num_claims}")
    print(f"Total observations: {len(observations)}")
    print(f"Links found: {len(unique_links)}")

    if unique_links:
        print("\n" + "-" * 80)
        print("EVIDENCE LINKS")
        print("-" * 80)

        for i, link in enumerate(unique_links, 1):
            print(f"\n--- Link {i} ---")
            print(f"Type: {link.link_type.value}")
            print(f"Claim: {link.claim_id}")
            print(f"Observation: {link.observation_id}")
            print(f"Reasoning: {link.reasoning}")

    # Inspect DSPy history
    print("\n" + "=" * 80)
    print("DSPY HISTORY (last 5 calls)")
    print("=" * 80)
    dspy.inspect_history(n=5)


if __name__ == "__main__":
    main()
