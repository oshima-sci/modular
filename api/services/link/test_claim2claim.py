"""Test script for claim-to-claim linking.

Usage:
    cd api
    python -m services.link.test_claim2claim <library_id> [--threshold 0.75]
"""
import argparse
import os
import sys

# Add api directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import dspy
from dotenv import load_dotenv

load_dotenv()

from services.link.claim2claim import link_claims_in_library


def main():
    parser = argparse.ArgumentParser(description="Test claim-to-claim linking")
    parser.add_argument("library_id", help="UUID of the library to process")
    parser.add_argument("--threshold", type=float, default=0.75, help="Similarity threshold (default: 0.75)")
    args = parser.parse_args()

    # Configure DSPy with Claude (same as prod would do)
    lm = dspy.LM(
        model="anthropic/claude-sonnet-4-20250514",
        api_key=os.getenv("ANTHROPIC_API_KEY"),
        max_tokens=64000,
    )
    dspy.configure(lm=lm)

    # Run the linking function
    print(f"Linking claims in library: {args.library_id}")
    print(f"Similarity threshold: {args.threshold}\n")

    result = link_claims_in_library(args.library_id, similarity_threshold=args.threshold)

    # Print results
    print("=" * 80)
    print(f"LINKING RESULTS")
    print("=" * 80)
    print(f"Total claims: {result.total_claims}")
    print(f"Groups processed: {result.groups_processed}")
    print(f"Links found: {len(result.links)}")

    if result.links:
        print("\n" + "-" * 80)
        print("LINKS")
        print("-" * 80)

        for i, link in enumerate(result.links, 1):
            print(f"\n--- Link {i} ---")
            print(f"Type: {link.link_type.value}")
            print(f"Claim 1: {link.claim_id_1}")
            print(f"Claim 2: {link.claim_id_2}")
            print(f"Reasoning: {link.reasoning}")

    # Inspect DSPy history
    print("\n" + "=" * 80)
    print("DSPY HISTORY")
    print("=" * 80)
    dspy.inspect_history(n=1)


if __name__ == "__main__":
    main()
