#!/usr/bin/env python3
"""Interactive script to test cosine similarity between two text inputs."""

import sys
sys.path.insert(0, "/Users/carlaostmann/code/modular/api")

from dotenv import load_dotenv
load_dotenv()

import numpy as np
from services.vector.embedder import embed_texts


def cosine_similarity(embeddings: np.ndarray) -> float:
    """Compute cosine similarity between two embeddings."""
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    normalized = embeddings / norms
    similarity_matrix = normalized @ normalized.T
    return similarity_matrix[0, 1]


def main():
    print("=" * 60)
    print("Cosine Similarity Playground")
    print("=" * 60)
    print("Enter two texts to compare their semantic similarity.")
    print("Type 'quit' to exit.\n")

    while True:
        print("-" * 40)
        text1 = input("Text 1: ").strip()
        if text1.lower() == "quit":
            break

        text2 = input("Text 2: ").strip()
        if text2.lower() == "quit":
            break

        if not text1 or not text2:
            print("Please enter both texts.\n")
            continue

        print("\nComputing embeddings...")
        embeddings = embed_texts([text1, text2])
        embeddings_array = np.array(embeddings)

        similarity = cosine_similarity(embeddings_array)

        print(f"\n>>> Similarity: {similarity:.4f}")
        print(f"    (Range: -1 to 1, where 1 = identical meaning)\n")


if __name__ == "__main__":
    main()
