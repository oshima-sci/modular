"""Test script for method selector.

Usage:
    cd api
    python -m services.link.test_method_selector <library_id>
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

from db import get_supabase_client
from services.link.method_selector import (
    select_methods_for_claims,
    _format_claim_for_llm,
    _format_methods_for_llm,
)


def get_methods_by_library(library_id: str) -> list[dict]:
    """Fetch all method extracts for papers in a library."""
    db = get_supabase_client()

    # Get paper_ids from library_papers
    library_papers = (
        db.table("library_papers")
        .select("paper_id")
        .eq("library_id", library_id)
        .execute()
    )

    paper_ids = [row["paper_id"] for row in library_papers.data]

    if not paper_ids:
        return []

    # Fetch methods for all papers in library
    result = (
        db.table("extracts")
        .select("*")
        .in_("paper_id", paper_ids)
        .eq("type", "method")
        .execute()
    )

    return result.data


def get_claims_by_library(library_id: str) -> list[dict]:
    """Fetch all claim extracts for papers in a library."""
    db = get_supabase_client()

    # Get paper_ids from library_papers
    library_papers = (
        db.table("library_papers")
        .select("paper_id")
        .eq("library_id", library_id)
        .execute()
    )

    paper_ids = [row["paper_id"] for row in library_papers.data]

    if not paper_ids:
        return []

    # Fetch claims for all papers in library
    result = (
        db.table("extracts")
        .select("*")
        .in_("paper_id", paper_ids)
        .eq("type", "claim")
        .execute()
    )

    return result.data


def main():
    parser = argparse.ArgumentParser(description="Test method selector")
    parser.add_argument("library_id", help="UUID of the library to process")
    parser.add_argument("--num-claims", type=int, default=5, help="Number of random claims to test (default: 5)")
    args = parser.parse_args()

    # Configure DSPy with Claude
    lm = dspy.LM(
        model="anthropic/claude-sonnet-4-5-20250929",
        api_key=os.getenv("ANTHROPIC_API_KEY"),
        max_tokens=64000,
    )
    dspy.configure(lm=lm)

    # Fetch data
    print(f"Fetching methods from library: {args.library_id}")
    methods = get_methods_by_library(args.library_id)
    print(f"Found {len(methods)} methods")

    print(f"\nFetching claims from library: {args.library_id}")
    all_claims = get_claims_by_library(args.library_id)
    print(f"Found {len(all_claims)} claims")

    if not methods:
        print("No methods found in library. Exiting.")
        return

    if not all_claims:
        print("No claims found in library. Exiting.")
        return

    # Select random sample of claims
    num_claims = min(args.num_claims, len(all_claims))
    sample_claims = random.sample(all_claims, num_claims)
    print(f"\nSelected {num_claims} random claims for testing")

    # Print methods summary
    print("\n" + "=" * 80)
    print("METHODS IN LIBRARY")
    print("=" * 80)
    for i, method in enumerate(methods, 1):
        summary = method["content"].get("summary", "No summary")
        print(f"\n{i}. [{method['id'][:8]}...] (paper: {method['paper_id'][:8]}...)")
        print(f"   {summary[:200]}..." if len(summary) > 200 else f"   {summary}")

    # Print sample claims
    print("\n" + "=" * 80)
    print("SAMPLE CLAIMS")
    print("=" * 80)
    for i, claim in enumerate(sample_claims, 1):
        claim_text = claim["content"].get("rephrased_claim", "No claim text")
        print(f"\n{i}. [{claim['id'][:8]}...] (paper: {claim['paper_id'][:8]}...)")
        print(f"   {claim_text[:200]}..." if len(claim_text) > 200 else f"   {claim_text}")

    # Run method selection
    print("\n" + "=" * 80)
    print("RUNNING METHOD SELECTION")
    print("=" * 80)

    results = select_methods_for_claims(sample_claims, methods)

    # Print results
    print("\n" + "=" * 80)
    print("RESULTS")
    print("=" * 80)

    # Build method lookup for display
    method_lookup = {m["id"]: m for m in methods}

    for i, (claim, selection) in enumerate(zip(sample_claims, results), 1):
        claim_text = claim["content"].get("rephrased_claim", "No claim text")
        print(f"\n--- Claim {i} ---")
        print(f"ID: {claim['id']}")
        print(f"Text: {claim_text[:150]}..." if len(claim_text) > 150 else f"Text: {claim_text}")

        # Handle both old (MethodSelection) and new (list[str]) return types
        if isinstance(selection, list):
            method_ids = selection
        else:
            method_ids = selection.method_ids
            if hasattr(selection, 'reasoning') and selection.reasoning:
                print(f"Reasoning: {selection.reasoning}")

        print(f"Selected methods ({len(method_ids)}):")

        if not method_ids:
            print("   (none)")
        else:
            for method_id in method_ids:
                method = method_lookup.get(method_id)
                if method:
                    summary = method["content"].get("summary", "No summary")
                    print(f"   - [{method_id[:8]}...] {summary[:100]}...")
                else:
                    print(f"   - [{method_id[:8]}...] (method not found in lookup)")

    # Inspect DSPy history
    print("\n" + "=" * 80)
    print("DSPY HISTORY (last call)")
    print("=" * 80)
    dspy.inspect_history(n=1)


if __name__ == "__main__":
    main()
