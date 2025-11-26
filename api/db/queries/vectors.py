"""Database queries for extract_vectors table."""
from typing import Any
from uuid import UUID

from db import get_supabase_client


class VectorQueries:
    """Centralized queries for the extract_vectors table."""

    def __init__(self):
        self.db = get_supabase_client()

    def create(
        self,
        extract_id: str | UUID,
        embedding: list[float],
    ) -> dict:
        """Create a single vector record for an extract."""
        data = {
            "extract_id": str(extract_id),
            "embedding": embedding,
        }
        result = self.db.table("extract_vectors").insert(data).execute()
        return result.data[0]

    def create_many(
        self,
        vectors: list[dict[str, Any]],
    ) -> list[dict]:
        """
        Bulk insert multiple vector records.

        Each dict should have: extract_id, embedding
        """
        normalized = [
            {
                "extract_id": str(v["extract_id"]),
                "embedding": v["embedding"],
            }
            for v in vectors
        ]
        result = self.db.table("extract_vectors").insert(normalized).execute()
        return result.data

    def get_by_extract_id(self, extract_id: str | UUID) -> dict | None:
        """Get vector for a specific extract."""
        result = (
            self.db.table("extract_vectors")
            .select("*")
            .eq("extract_id", str(extract_id))
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None

    def get_by_extract_ids(self, extract_ids: list[str | UUID]) -> list[dict]:
        """Get vectors for multiple extracts."""
        if not extract_ids:
            return []

        ids = [str(eid) for eid in extract_ids]
        result = (
            self.db.table("extract_vectors")
            .select("*")
            .in_("extract_id", ids)
            .execute()
        )
        return result.data

    def delete_by_extract_id(self, extract_id: str | UUID) -> None:
        """Delete vector for a specific extract."""
        self.db.table("extract_vectors").delete().eq(
            "extract_id", str(extract_id)
        ).execute()

    def get_similar_claims(
        self,
        query_embedding: list[float],
        library_id: str | UUID,
        match_threshold: float = 0.7,
        match_count: int = 20,
    ) -> list[dict]:
        """
        Find similar claims within a library using the RPC function.

        Args:
            query_embedding: The embedding vector to compare against
            library_id: UUID of the library to search within
            match_threshold: Minimum similarity score (0-1, default 0.7)
            match_count: Maximum number of results (default 20)

        Returns:
            List of matching claims with similarity scores
        """
        result = self.db.rpc(
            "get_similar_claims",
            {
                "query_embedding": query_embedding,
                "target_library_id": str(library_id),
                "match_threshold": match_threshold,
                "match_count": match_count,
            },
        ).execute()
        return result.data
