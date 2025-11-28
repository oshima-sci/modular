"""Database queries for extracts table."""
from datetime import datetime
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

    def get_by_job_id(self, job_id: str | UUID) -> list[dict]:
        """
        Get extracts created by a specific job (used to check if job already ran).

        Args:
            job_id: UUID of the job

        Returns:
            List of extract records for that job (only IDs for efficiency)
        """
        result = (
            self.db.table("extracts")
            .select("id")
            .eq("job_id", str(job_id))
            .limit(1)
            .execute()
        )
        return result.data

    def get_by_paper(
        self,
        paper_id: str | UUID,
        extract_type: str | None = None,
    ) -> list[dict]:
        """
        Get all extracts for a paper, optionally filtered by type.

        Args:
            paper_id: UUID of the paper
            extract_type: Optional filter by type ('claim', 'method', 'observation')
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

        Args:
            paper_id: UUID of the paper
            extract_type: Type of extract ('claim', 'method', 'observation')
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

    def get_claims_by_library(
        self,
        library_id: str | UUID,
    ) -> list[dict]:
        """
        Get all claim extracts for papers in a library (latest job only per paper).

        For each paper, only returns claims from the most recent extraction job.

        Args:
            library_id: UUID of the library

        Returns:
            List of extract records with type='claim'
        """
        return self._get_extracts_by_library(library_id, "claim")

    def get_observations_by_library(
        self,
        library_id: str | UUID,
    ) -> list[dict]:
        """
        Get all observation extracts for papers in a library (latest job only per paper).

        For each paper, only returns observations from the most recent extraction job.

        Args:
            library_id: UUID of the library

        Returns:
            List of extract records with type='observation'
        """
        return self._get_extracts_by_library(library_id, "observation")

    def get_methods_by_library(
        self,
        library_id: str | UUID,
    ) -> list[dict]:
        """
        Get all method extracts for papers in a library (latest job only per paper).

        For each paper, only returns methods from the most recent extraction job.

        Args:
            library_id: UUID of the library

        Returns:
            List of extract records with type='method'
        """
        return self._get_extracts_by_library(library_id, "method")

    def get_all_extracts_by_library(
        self,
        library_id: str | UUID,
    ) -> dict[str, list[dict]]:
        """
        Get all extracts for a library, grouped by type (latest job only per paper/type).

        Single query fetches all extracts, then filters in Python to keep only
        extracts from the most recent job per paper/type combination.

        Args:
            library_id: UUID of the library

        Returns:
            Dict with keys 'claims', 'observations', 'methods', each containing list of extracts
        """
        # Get paper_ids from library_papers
        library_papers = (
            self.db.table("library_papers")
            .select("paper_id")
            .eq("library_id", str(library_id))
            .execute()
        )

        paper_ids = [row["paper_id"] for row in library_papers.data]

        if not paper_ids:
            return {"claims": [], "observations": [], "methods": []}

        # Single query for all extracts across all papers
        result = (
            self.db.table("extracts")
            .select("*")
            .in_("paper_id", paper_ids)
            .order("created_at", desc=True)
            .execute()
        )

        # Group by (paper_id, type) and find latest job_id for each
        # Then filter to only include extracts from that job
        latest_job_per_paper_type: dict[tuple[str, str], str | None] = {}
        for extract in result.data:
            key = (extract["paper_id"], extract["type"])
            if key not in latest_job_per_paper_type:
                # First extract we see is the latest (ordered by created_at desc)
                latest_job_per_paper_type[key] = extract["job_id"]

        # Filter extracts to only those from the latest job per paper/type
        filtered: dict[str, list[dict]] = {"claims": [], "observations": [], "methods": []}
        type_to_key = {"claim": "claims", "observation": "observations", "method": "methods"}

        for extract in result.data:
            key = (extract["paper_id"], extract["type"])
            if extract["job_id"] == latest_job_per_paper_type.get(key):
                output_key = type_to_key.get(extract["type"])
                if output_key:
                    filtered[output_key].append(extract)

        return filtered

    def _get_extracts_by_library(
        self,
        library_id: str | UUID,
        extract_type: str,
    ) -> list[dict]:
        """
        Get extracts of a given type for all papers in a library (latest job only per paper).

        For each paper, finds the latest job_id and only returns extracts from that job.

        Args:
            library_id: UUID of the library
            extract_type: Type of extract ('claim', 'method', 'observation')

        Returns:
            List of extract records
        """
        type_to_key = {"claim": "claims", "observation": "observations", "method": "methods"}
        all_extracts = self.get_all_extracts_by_library(library_id)
        return all_extracts.get(type_to_key.get(extract_type, ""), [])

    def get_unlinked_claims_for_library(
        self,
        library_id: str | UUID,
        cutoff: datetime | None = None,
    ) -> list[dict]:
        """
        Get claims that are "new" to this library - not yet processed by previous linking jobs.

        A claim is "new" if either:
        - extract.created_at > cutoff (claim didn't exist during last linking)
        - library_papers.added_at > cutoff (paper wasn't in library during last linking)

        If cutoff is None, returns all claims (new library case).

        Args:
            library_id: UUID of the library
            cutoff: Timestamp cutoff - claims newer than this are returned.
                    If None, all claims are returned.

        Returns:
            List of claim extract records that need to be linked
        """
        # Get paper_ids and their added_at timestamps from library_papers
        library_papers = (
            self.db.table("library_papers")
            .select("paper_id, added_at")
            .eq("library_id", str(library_id))
            .execute()
        )

        if not library_papers.data:
            return []

        # If no cutoff, return all claims (new library)
        if cutoff is None:
            return self.get_claims_by_library(library_id)

        cutoff_str = cutoff.isoformat()

        # Build a map of paper_id -> added_at
        paper_added_at = {
            row["paper_id"]: row["added_at"]
            for row in library_papers.data
        }
        paper_ids = list(paper_added_at.keys())

        # Get latest claims for each paper, then filter by cutoff
        unlinked_claims = []
        for paper_id in paper_ids:
            claims = self.get_latest_by_paper(paper_id, "claim")
            added_at = paper_added_at[paper_id]

            for claim in claims:
                # Include if claim was created after cutoff
                # OR if paper was added to library after cutoff
                claim_created = claim.get("created_at", "")
                if claim_created > cutoff_str or (added_at and added_at > cutoff_str):
                    unlinked_claims.append(claim)

        return unlinked_claims
