"""Backfill embeddings for extracts that don't have them.

Usage:
    cd api
    python -m scripts.backfill_embeddings <library_id>
"""
import argparse
import logging
import os
import sys

# Add api directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

from db import ExtractQueries, VectorQueries
from services.vector import embed_texts

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def get_text_for_extract(extract: dict) -> str | None:
    """
    Get the text to embed for an extract based on its type.

    - claim: rephrased_claim
    - method: method_summary
    - observation: observation_summary
    """
    content = extract.get("content", {})
    extract_type = extract.get("type")

    if extract_type == "claim":
        return content.get("rephrased_claim")
    elif extract_type == "method":
        return content.get("method_summary")
    elif extract_type == "observation":
        return content.get("observation_summary")
    else:
        logger.warning(f"Unknown extract type: {extract_type}")
        return None


def backfill_embeddings_for_library(library_id: str, batch_size: int = 100) -> dict:
    """
    Backfill embeddings for all extracts in a library that don't have them.

    Args:
        library_id: UUID of the library
        batch_size: Number of extracts to embed per batch (OpenAI limit considerations)

    Returns:
        Dict with summary of what was done
    """
    extracts_db = ExtractQueries()
    vectors_db = VectorQueries()

    # Get all papers in the library
    from db import get_supabase_client

    db = get_supabase_client()
    library_papers = (
        db.table("library_papers")
        .select("paper_id")
        .eq("library_id", library_id)
        .execute()
    )
    paper_ids = [row["paper_id"] for row in library_papers.data]

    if not paper_ids:
        logger.info(f"No papers found in library {library_id}")
        return {"library_id": library_id, "papers": 0, "extracts_checked": 0, "embeddings_created": 0}

    logger.info(f"Found {len(paper_ids)} papers in library")

    # Get all extracts for these papers
    all_extracts = (
        db.table("extracts")
        .select("*")
        .in_("paper_id", paper_ids)
        .execute()
    )
    extracts = all_extracts.data

    if not extracts:
        logger.info("No extracts found for papers in library")
        return {"library_id": library_id, "papers": len(paper_ids), "extracts_checked": 0, "embeddings_created": 0}

    logger.info(f"Found {len(extracts)} total extracts")

    # Get existing embeddings
    extract_ids = [e["id"] for e in extracts]
    existing_vectors = vectors_db.get_by_extract_ids(extract_ids)
    existing_ids = {v["extract_id"] for v in existing_vectors}

    logger.info(f"Found {len(existing_ids)} existing embeddings")

    # Filter to extracts without embeddings
    extracts_needing_embeddings = [e for e in extracts if e["id"] not in existing_ids]

    if not extracts_needing_embeddings:
        logger.info("All extracts already have embeddings")
        return {
            "library_id": library_id,
            "papers": len(paper_ids),
            "extracts_checked": len(extracts),
            "embeddings_created": 0,
            "already_had_embeddings": len(existing_ids),
        }

    logger.info(f"Need to create embeddings for {len(extracts_needing_embeddings)} extracts")

    # Process in batches
    total_created = 0
    skipped = 0

    for i in range(0, len(extracts_needing_embeddings), batch_size):
        batch = extracts_needing_embeddings[i : i + batch_size]
        logger.info(f"Processing batch {i // batch_size + 1} ({len(batch)} extracts)")

        # Get texts to embed
        texts_and_extracts = []
        for extract in batch:
            text = get_text_for_extract(extract)
            if text:
                texts_and_extracts.append((text, extract))
            else:
                logger.warning(f"Extract {extract['id']} has no embeddable text, skipping")
                skipped += 1

        if not texts_and_extracts:
            continue

        texts = [t for t, _ in texts_and_extracts]
        extracts_to_save = [e for _, e in texts_and_extracts]

        # Embed batch
        embeddings = embed_texts(texts)

        # Save to DB
        vector_records = [
            {
                "extract_id": extract["id"],
                "embedding": embedding,
            }
            for extract, embedding in zip(extracts_to_save, embeddings)
        ]
        vectors_db.create_many(vector_records)

        total_created += len(vector_records)
        logger.info(f"Created {len(vector_records)} embeddings (total: {total_created})")

    result = {
        "library_id": library_id,
        "papers": len(paper_ids),
        "extracts_checked": len(extracts),
        "already_had_embeddings": len(existing_ids),
        "embeddings_created": total_created,
        "skipped_no_text": skipped,
    }

    logger.info(f"Backfill complete: {result}")
    return result


def main():
    parser = argparse.ArgumentParser(description="Backfill embeddings for extracts in a library")
    parser.add_argument("library_id", help="UUID of the library to backfill")
    parser.add_argument("--batch-size", type=int, default=100, help="Batch size for embedding (default: 100)")
    args = parser.parse_args()

    result = backfill_embeddings_for_library(args.library_id, batch_size=args.batch_size)

    print("\n" + "=" * 60)
    print("BACKFILL RESULTS")
    print("=" * 60)
    for key, value in result.items():
        print(f"  {key}: {value}")


if __name__ == "__main__":
    main()
