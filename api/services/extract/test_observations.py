"""Test script for observations extraction.

Usage:
    cd api
    python -m services.extract.test_observations <paper_id>
"""
import os
import sys

# Add api directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import dspy
from dotenv import load_dotenv

load_dotenv()

from services.extract.observations import extract_observations_from_paper


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m services.extract.test_observations <paper_id>")
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
    print(f"Extracting observations from paper: {paper_id}\n")
    result = extract_observations_from_paper(paper_id)

    # Print results
    print("=" * 80)
    if result.skipped:
        print("SKIPPED - No methods found for this paper")
    else:
        print(f"EXTRACTED {len(result.observations)} OBSERVATIONS")
    print("=" * 80)

    for i, obs in enumerate(result.observations, 1):
        print(f"\n--- Observation {i} ---")
        print(f"Source elements: {[s.source_element_id for s in obs.source_elements]}")
        print(f"Method reference: {obs.method_reference}")
        print(f"Type: {obs.observation_type}")
        print(f"Summary: {obs.observation_summary}")
        if obs.quantitative_details:
            print(f"Quantitative details: {obs.quantitative_details}")

    # Inspect DSPy history
    print("\n" + "=" * 80)
    print("DSPY HISTORY")
    print("=" * 80)
    dspy.inspect_history(n=1)


if __name__ == "__main__":
    main()
