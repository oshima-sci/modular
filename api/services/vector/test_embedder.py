"""Test script for embedding service.

Usage:
    cd api
    python -m services.embed.test_embedder
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from dotenv import load_dotenv

load_dotenv()

from services.embed import embed_texts, embed_text


def main():
    # Test single embedding
    print("Testing single text embedding...")
    text = "Insomnia is a significant problem among euthymic patients with bipolar disorder."
    embedding = embed_text(text)
    print(f"  Text: {text[:50]}...")
    print(f"  Embedding dimensions: {len(embedding)}")
    print(f"  First 5 values: {embedding[:5]}")

    print()

    # Test batch embedding
    print("Testing batch embedding...")
    texts = [
        "Sleep deprivation impairs prefrontal cortex function.",
        "Chronic insomnia correlates with increased amygdala activity.",
        "Cognitive behavioral therapy improves sleep quality in bipolar patients.",
    ]
    embeddings = embed_texts(texts)
    print(f"  Embedded {len(embeddings)} texts")
    for i, (t, e) in enumerate(zip(texts, embeddings)):
        print(f"  [{i}] {t[:40]}... -> dim={len(e)}")

    print()

    # Test similarity (simple cosine)
    print("Testing similarity between embeddings...")
    import math

    def cosine_similarity(a: list[float], b: list[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(x * x for x in b))
        return dot / (norm_a * norm_b)

    # Embed two similar and one different claim
    claims = [
        "Sleep disorders are common in bipolar disorder.",
        "Insomnia frequently occurs in patients with bipolar disorder.",
        "Machine learning improves protein folding predictions.",
    ]
    claim_embeddings = embed_texts(claims)

    print(f"  Claim 0 vs 1 (similar): {cosine_similarity(claim_embeddings[0], claim_embeddings[1]):.4f}")
    print(f"  Claim 0 vs 2 (different): {cosine_similarity(claim_embeddings[0], claim_embeddings[2]):.4f}")
    print(f"  Claim 1 vs 2 (different): {cosine_similarity(claim_embeddings[1], claim_embeddings[2]):.4f}")

    print()
    print("All tests passed!")


if __name__ == "__main__":
    main()
