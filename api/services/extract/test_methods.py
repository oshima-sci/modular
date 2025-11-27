"""Test script for methods extraction.

Usage:
    cd api
    python -m services.extract.test_methods <paper_id>
"""
import os
import sys

# Add api directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import dspy
from dotenv import load_dotenv

load_dotenv()

from services.extract.methods import extract_methods_from_paper


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m services.extract.test_methods <paper_id>")
        sys.exit(1)

    paper_id = sys.argv[1]

    # Configure DSPy with Claude (same as prod would do)
    lm = dspy.LM(
        model="anthropic/claude-sonnet-4-5-20250929",
        api_key=os.getenv("ANTHROPIC_API_KEY"),
        max_tokens=64000,
    )
    dspy.configure(lm=lm)

    # Run the actual extraction function
    print(f"Extracting methods from paper: {paper_id}\n")
    result = extract_methods_from_paper(paper_id)

    # Print results
    print("=" * 80)
    print(f"EXTRACTED {len(result.methods)} METHODS")
    print("=" * 80)

    for i, method in enumerate(result.methods, 1):
        print(f"\n--- Method {i} ---")
        print(f"Source elements: {[s.source_element_id for s in method.source_elements]}")
        print(f"Novel method: {method.novel_method}")
        print(f"Summary: {method.method_summary}")
        desc = method.structured_method_description
        print(f"Study design/method class: {desc.study_design_or_method_class}")
        print(f"Study subject: {desc.study_subject}")
        print(f"Manipulated conditions: {desc.manipulated_conditions}")
        print(f"Observed outcomes: {desc.observed_outcomes}")
        print(f"Control/reference point: {desc.control_or_reference_point}")

    # Inspect DSPy history
    print("\n" + "=" * 80)
    print("DSPY HISTORY")
    print("=" * 80)
    dspy.inspect_history(n=1)


if __name__ == "__main__":
    main()
