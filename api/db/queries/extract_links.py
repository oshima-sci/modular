"""Database queries for extract_links table."""
from typing import Any
from uuid import UUID

from db import get_supabase_client


class ExtractLinkQueries:
    """Centralized queries for the extract_links table."""

    def __init__(self):
        self.db = get_supabase_client()

    def create(
        self,
        from_id: str | UUID,
        to_id: str | UUID,
        content: dict[str, Any],
        job_id: str | UUID | None = None,
    ) -> dict | None:
        """
        Create a single link between two extracts.

        Uses upsert to ignore duplicates (same from_id, to_id pair).

        Args:
            from_id: UUID of the source extract
            to_id: UUID of the target extract
            content: Link metadata (link_type, reasoning, etc.)
            job_id: Optional UUID of the job that created this link

        Returns:
            The created/existing link record, or None if failed
        """
        data = {
            "from_id": str(from_id),
            "to_id": str(to_id),
            "content": content,
        }
        if job_id:
            data["job_id"] = str(job_id)

        result = (
            self.db.table("extract_links")
            .upsert(data, on_conflict="from_id,to_id", ignore_duplicates=True)
            .execute()
        )
        return result.data[0] if result.data else None

    def create_many(
        self,
        links: list[dict],
        job_id: str | UUID | None = None,
    ) -> list[dict]:
        """
        Bulk insert multiple link records.

        Uses upsert to ignore duplicates. Each dict should have:
        - from_id: UUID of source extract
        - to_id: UUID of target extract
        - content: Link metadata dict

        Args:
            links: List of link dicts
            job_id: Optional job_id to attach to all links

        Returns:
            List of created link records (excludes duplicates that were skipped)
        """
        if not links:
            return []

        # Normalize to strings and add job_id
        normalized = []
        for link in links:
            record = {
                "from_id": str(link["from_id"]),
                "to_id": str(link["to_id"]),
                "content": link["content"],
            }
            if job_id:
                record["job_id"] = str(job_id)
            elif link.get("job_id"):
                record["job_id"] = str(link["job_id"])
            normalized.append(record)

        result = (
            self.db.table("extract_links")
            .upsert(normalized, on_conflict="from_id,to_id", ignore_duplicates=True)
            .execute()
        )
        return result.data

    def get_by_from_id(self, from_id: str | UUID) -> list[dict]:
        """Get all links originating from an extract."""
        result = (
            self.db.table("extract_links")
            .select("*")
            .eq("from_id", str(from_id))
            .execute()
        )
        return result.data

    def get_by_to_id(self, to_id: str | UUID) -> list[dict]:
        """Get all links pointing to an extract."""
        result = (
            self.db.table("extract_links")
            .select("*")
            .eq("to_id", str(to_id))
            .execute()
        )
        return result.data

    def get_by_job_id(self, job_id: str | UUID) -> list[dict]:
        """Get all links created by a specific job."""
        result = (
            self.db.table("extract_links")
            .select("*")
            .eq("job_id", str(job_id))
            .execute()
        )
        return result.data

    def get_links_for_extract(self, extract_id: str | UUID) -> list[dict]:
        """Get all links where this extract is either source or target."""
        from_links = self.get_by_from_id(extract_id)
        to_links = self.get_by_to_id(extract_id)
        return from_links + to_links
