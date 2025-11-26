"""Database queries for extracts table."""
from typing import Any
from uuid import UUID

from db import get_supabase_client


class ExtractQueries:
    """Centralized queries for the extracts table."""

    def __init__(self):
        self.db = get_supabase_client()

    def create(
        self,
        paper_id: str | UUID,
        job_id: str | UUID | None,
        extract_type: str,
        content: dict[str, Any],
    ) -> dict:
        """Create a single extract record."""
        data = {
            "paper_id": str(paper_id),
            "type": extract_type,
            "content": content,
        }
        if job_id:
            data["job_id"] = str(job_id)

        result = self.db.table("extracts").insert(data).execute()
        return result.data[0]

    def create_many(self, extracts: list[dict]) -> list[dict]:
        """
        Bulk insert multiple extract records.

        Each dict should have: paper_id, job_id (optional), type, content
        """
        # Normalize UUIDs to strings
        normalized = []
        for e in extracts:
            record = {
                "paper_id": str(e["paper_id"]),
                "type": e["type"],
                "content": e["content"],
            }
            if e.get("job_id"):
                record["job_id"] = str(e["job_id"])
            normalized.append(record)

        result = self.db.table("extracts").insert(normalized).execute()
        return result.data

    def get_by_paper(
        self,
        paper_id: str | UUID,
        extract_type: str | None = None,
    ) -> list[dict]:
        """
        Get all extracts for a paper, optionally filtered by type.
        """
        query = self.db.table("extracts").select("*").eq("paper_id", str(paper_id))

        if extract_type:
            query = query.eq("type", extract_type)

        result = query.order("created_at", desc=True).execute()
        return result.data

    def get_latest_by_paper(
        self,
        paper_id: str | UUID,
        extract_type: str,
    ) -> list[dict]:
        """
        Get all extracts of a given type for a paper from the most recent job.

        Finds the latest job_id by created_at, then returns all extracts
        matching that job_id.
        """
        # First, get the most recent extract to find latest job_id
        latest = (
            self.db.table("extracts")
            .select("job_id")
            .eq("paper_id", str(paper_id))
            .eq("type", extract_type)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )

        if not latest.data:
            return []

        latest_job_id = latest.data[0]["job_id"]

        # Now get all extracts from that job
        query = (
            self.db.table("extracts")
            .select("*")
            .eq("paper_id", str(paper_id))
            .eq("type", extract_type)
        )

        # Handle null job_id case
        if latest_job_id is None:
            query = query.is_("job_id", "null")
        else:
            query = query.eq("job_id", latest_job_id)

        result = query.order("created_at", desc=True).execute()

        return result.data
