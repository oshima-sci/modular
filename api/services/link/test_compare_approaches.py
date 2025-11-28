"""Compare batch vs pairwise claim linking approaches.

Measures token usage, cost, and duration for both approaches.
Results are written to CSV for analysis.

Usage:
    cd api
    python -m services.link.test_compare_approaches <library_id> [--threshold 0.35] [--limit 20]
"""
import argparse
import csv
import os
import sys
import time
from datetime import datetime
from pathlib import Path

# sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import dspy
from dotenv import load_dotenv

load_dotenv()

from services.link.claim2claim import link_claims_in_library, _fetch_claims_with_embeddings
from services.link.claim2claim_pairwise import link_claims_in_library_pairwise, UsageStats


# Output file
RESULTS_FILE = Path(__file__).parent / "linking_comparison_results.csv"


def get_batch_usage(lm) -> UsageStats:
    """Extract usage stats from LM history."""
    stats = UsageStats()
    for entry in lm.history:
        usage = entry.get("usage", {})
        cost = entry.get("cost", 0.0)
        stats.add(usage, cost)
    return stats


def write_result_to_csv(row: dict):
    """Append a result row to the CSV file."""
    file_exists = RESULTS_FILE.exists()

    fieldnames = [
        "timestamp",
        "approach",
        "library_id",
        "total_claims",
        "threshold",
        "groups_or_pairs",  # groups for batch, pairs for pairwise
        "llm_calls",
        "links_found",
        "input_tokens",
        "output_tokens",
        "total_tokens",
        "cost_usd",
        "duration_sec",
    ]

    with open(RESULTS_FILE, "a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if not file_exists:
            writer.writeheader()
        writer.writerow(row)


def write_links_to_csv(links: list, approach: str, library_id: str, timestamp: str, claims_lookup: dict):
    """Write all links to a separate CSV for inspection."""
    links_file = Path(__file__).parent / f"links_{approach}_{timestamp.replace(':', '-')}.csv"

    fieldnames = ["approach", "library_id", "link_type", "claim_1_text", "claim_2_text", "reasoning", "claim_id_1", "claim_id_2"]

    with open(links_file, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for link in links:
            claim_1 = claims_lookup.get(link.claim_id_1, {})
            claim_2 = claims_lookup.get(link.claim_id_2, {})
            claim_1_text = claim_1.get("content", {}).get("rephrased_claim", "")
            claim_2_text = claim_2.get("content", {}).get("rephrased_claim", "")

            writer.writerow({
                "approach": approach,
                "library_id": library_id,
                "link_type": link.link_type.value,
                "claim_1_text": claim_1_text,
                "claim_2_text": claim_2_text,
                "reasoning": link.reasoning,
                "claim_id_1": link.claim_id_1,
                "claim_id_2": link.claim_id_2,
            })

    print(f"Links written to: {links_file}")


def main():
    parser = argparse.ArgumentParser(description="Compare batch vs pairwise linking")
    parser.add_argument("library_id", help="UUID of the library to process")
    parser.add_argument("--threshold", type=float, default=0.35, help="Similarity threshold")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of claims for testing")
    parser.add_argument("--pairwise-only", action="store_true", help="Only run pairwise approach")
    parser.add_argument("--batch-only", action="store_true", help="Only run batch approach")
    args = parser.parse_args()

    # Configure DSPy
    lm = dspy.LM(
        model="anthropic/claude-sonnet-4-5-20250929",
        api_key=os.getenv("ANTHROPIC_API_KEY"),
        max_tokens=8000,
        cache=False,  # Disable cache to get accurate token counts
    )
    dspy.configure(lm=lm)

    print(f"Library: {args.library_id}")
    print(f"Threshold: {args.threshold}")
    print(f"Results will be written to: {RESULTS_FILE}")
    print()

    # Preview data
    claims = _fetch_claims_with_embeddings(args.library_id)
    total_claims = len(claims)

    # Build lookup for claim text
    claims_lookup = {c["id"]: c for c in claims}

    if args.limit and args.limit < len(claims):
        print(f"Limited to {args.limit} claims for testing")
        total_claims = args.limit

    print(f"Total claims: {total_claims}")
    print()

    # --- Run Batch Approach ---
    if not args.pairwise_only:
        print("=" * 80)
        print("BATCH APPROACH (current)")
        print("=" * 80)

        lm.history.clear()
        start_time = time.time()

        batch_result = link_claims_in_library(args.library_id, similarity_threshold=args.threshold)

        duration = time.time() - start_time
        batch_stats = get_batch_usage(lm)

        print(f"Groups processed: {batch_result.groups_processed}")
        print(f"Links found: {len(batch_result.links)}")
        print(f"LLM calls: {batch_stats.total_calls}")
        print(f"Input tokens: {batch_stats.total_input_tokens:,}")
        print(f"Output tokens: {batch_stats.total_output_tokens:,}")
        print(f"Total tokens: {batch_stats.total_input_tokens + batch_stats.total_output_tokens:,}")
        print(f"Estimated cost: ${batch_stats.total_cost:.4f}")
        print(f"Duration: {duration:.1f}s")
        print()

        # Write to CSV
        write_result_to_csv({
            "timestamp": datetime.now().isoformat(),
            "approach": "batch",
            "library_id": args.library_id,
            "total_claims": total_claims,
            "threshold": args.threshold,
            "groups_or_pairs": batch_result.groups_processed,
            "llm_calls": batch_stats.total_calls,
            "links_found": len(batch_result.links),
            "input_tokens": batch_stats.total_input_tokens,
            "output_tokens": batch_stats.total_output_tokens,
            "total_tokens": batch_stats.total_input_tokens + batch_stats.total_output_tokens,
            "cost_usd": round(batch_stats.total_cost, 6),
            "duration_sec": round(duration, 2),
        })

        # Write links detail
        batch_timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        write_links_to_csv(batch_result.links, "batch", args.library_id, batch_timestamp, claims_lookup)

        if batch_result.links:
            print("Sample links:")
            for link in batch_result.links[:3]:
                print(f"  - {link.link_type.value}: {link.claim_id_1[:8]}... <-> {link.claim_id_2[:8]}...")
        print()

    # --- Run Pairwise Approach ---
    if not args.batch_only:
        print("=" * 80)
        print("PAIRWISE APPROACH (new)")
        print("=" * 80)

        lm.history.clear()
        start_time = time.time()

        pairwise_result = link_claims_in_library_pairwise(args.library_id, similarity_threshold=args.threshold)

        duration = time.time() - start_time
        stats = pairwise_result.stats

        print(f"Pairs processed: {pairwise_result.result.groups_processed}")
        print(f"Links found: {len(pairwise_result.result.links)}")
        print(f"LLM calls: {stats.total_calls}")
        print(f"Input tokens: {stats.total_input_tokens:,}")
        print(f"Output tokens: {stats.total_output_tokens:,}")
        print(f"Total tokens: {stats.total_input_tokens + stats.total_output_tokens:,}")
        print(f"Estimated cost: ${stats.total_cost:.4f}")
        print(f"Duration: {duration:.1f}s")
        print()

        # Write to CSV
        write_result_to_csv({
            "timestamp": datetime.now().isoformat(),
            "approach": "pairwise",
            "library_id": args.library_id,
            "total_claims": total_claims,
            "threshold": args.threshold,
            "groups_or_pairs": pairwise_result.result.groups_processed,
            "llm_calls": stats.total_calls,
            "links_found": len(pairwise_result.result.links),
            "input_tokens": stats.total_input_tokens,
            "output_tokens": stats.total_output_tokens,
            "total_tokens": stats.total_input_tokens + stats.total_output_tokens,
            "cost_usd": round(stats.total_cost, 6),
            "duration_sec": round(duration, 2),
        })

        # Write links detail
        pairwise_timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        write_links_to_csv(pairwise_result.result.links, "pairwise", args.library_id, pairwise_timestamp, claims_lookup)

        if pairwise_result.result.links:
            print("Sample links:")
            for link in pairwise_result.result.links[:3]:
                print(f"  - {link.link_type.value}: {link.claim_id_1[:8]}... <-> {link.claim_id_2[:8]}...")
        print()

    # --- Comparison ---
    if not args.pairwise_only and not args.batch_only:
        print("=" * 80)
        print("COMPARISON")
        print("=" * 80)

        batch_total = batch_stats.total_input_tokens + batch_stats.total_output_tokens
        pairwise_total = stats.total_input_tokens + stats.total_output_tokens

        if batch_total > 0:
            print(f"Token difference: {pairwise_total - batch_total:+,} ({(pairwise_total/batch_total - 1)*100:+.1f}%)")
        print(f"Cost difference: ${stats.total_cost - batch_stats.total_cost:+.4f}")
        print(f"Call difference: {stats.total_calls - batch_stats.total_calls:+d}")

        # Link quality comparison
        batch_link_ids = {(l.claim_id_1, l.claim_id_2, l.link_type) for l in batch_result.links}
        pairwise_link_ids = {(l.claim_id_1, l.claim_id_2, l.link_type) for l in pairwise_result.result.links}

        common = batch_link_ids & pairwise_link_ids
        only_batch = batch_link_ids - pairwise_link_ids
        only_pairwise = pairwise_link_ids - batch_link_ids

        print()
        print(f"Links in common: {len(common)}")
        print(f"Only in batch: {len(only_batch)}")
        print(f"Only in pairwise: {len(only_pairwise)}")

    print()
    print(f"Results appended to: {RESULTS_FILE}")


if __name__ == "__main__":
    main()
