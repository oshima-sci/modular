"""Embedding utilities using OpenAI's embedding API."""
import logging
import os
from typing import Sequence

import openai

logger = logging.getLogger(__name__)

# OpenAI embedding model config
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536


def _get_client() -> openai.OpenAI:
    """Get OpenAI client, using OPENAI_API_KEY from environment."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY environment variable is required")
    return openai.OpenAI(api_key=api_key)


def embed_texts(texts: Sequence[str]) -> list[list[float]]:
    """
    Embed multiple texts in a single batch API call.

    Args:
        texts: List of texts to embed

    Returns:
        List of embedding vectors (each is a list of floats)
    """
    if not texts:
        return []

    client = _get_client()

    logger.info(f"Embedding {len(texts)} texts with {EMBEDDING_MODEL}")

    response = client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=list(texts),
        dimensions=EMBEDDING_DIMENSIONS,
    )

    # Sort by index to ensure order matches input
    sorted_embeddings = sorted(response.data, key=lambda x: x.index)
    embeddings = [item.embedding for item in sorted_embeddings]

    logger.info(f"Embedded {len(embeddings)} texts successfully")
    return embeddings


def embed_text(text: str) -> list[float]:
    """
    Embed a single text.

    Args:
        text: Text to embed

    Returns:
        Embedding vector as list of floats
    """
    result = embed_texts([text])
    return result[0]
