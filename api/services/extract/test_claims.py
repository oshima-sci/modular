"""Test script for claims extraction.

Usage:
    cd api
    python -m services.extract.test_claims <paper_id>
"""
import os
import sys

# Add api directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import dspy
from dotenv import load_dotenv

load_dotenv()

from services.extract.claims import extract_claims_from_paper


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m services.extract.test_claims <paper_id>")
        sys.exit(1)

    paper_id = sys.argv[1]

    # Configure DSPy with Claude (same as prod would do)
    lm = dspy.LM(
        model="anthropic/claude-sonnet-4-20250514",
        api_key=os.getenv("ANTHROPIC_API_KEY"),
        max_tokens=64000,
    )
    dspy.configure(lm=lm)

    # Run the actual extraction function
    print(f"Extracting claims from paper: {paper_id}\n")
    result = extract_claims_from_paper(paper_id)

    # Print results
    print("=" * 80)
    print(f"EXTRACTED {len(result.claims)} CLAIMS")
    print("=" * 80)

    for i, claim in enumerate(result.claims, 1):
        print(f"\n--- Claim {i} ---")
        print(f"Rephrased: {claim.rephrased_claim}")
        print(f"Original by paper: {claim.original_claim_by_paper}")
        print(f"Reasoning: {claim.reasoning}")
        print(f"Source elements: {[s.source_element_id for s in claim.source_elements]}")

    # Inspect DSPy history
    print("\n" + "=" * 80)
    print("DSPY HISTORY")
    print("=" * 80)
    dspy.inspect_history(n=1)


if __name__ == "__main__":
    main()
