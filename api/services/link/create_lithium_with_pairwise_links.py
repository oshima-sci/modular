#!/usr/bin/env python3
"""
One-off script to create a new lithium.json with links from the pairwise CSV.
"""

import csv
import json
import uuid
from pathlib import Path

# Paths
CSV_PATH = Path(__file__).parent / "links_pairwise_20251128_123758.csv"
ORIGINAL_JSON_PATH = Path(__file__).parent.parent.parent.parent / "app" / "public" / "lithium.json"
OUTPUT_JSON_PATH = Path(__file__).parent / "lithium_pairwise.json"


def main():
    # Load original JSON
    with open(ORIGINAL_JSON_PATH, "r") as f:
        data = json.load(f)

    # Read CSV and create links
    links = []
    with open(CSV_PATH, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            link = {
                "id": str(uuid.uuid4()),
                "from_id": row["claim_id_1"],
                "to_id": row["claim_id_2"],
                "content": {
                    "link_type": row["link_type"],
                    "reasoning": row["reasoning"],
                    "link_category": "claim_to_claim"
                }
            }
            links.append(link)

    # Replace links in data
    data["data"]["links"] = links

    # Update metadata count
    data["metadata"]["stats"]["total_links"] = len(links)

    # Write output
    with open(OUTPUT_JSON_PATH, "w") as f:
        json.dump(data, f, indent=2)

    print(f"Created {OUTPUT_JSON_PATH}")
    print(f"Total links: {len(links)}")


if __name__ == "__main__":
    main()
