"""Database queries for libraries and library_papers tables."""
from uuid import UUID

from db import get_supabase_client
from db.queries.extracts import ExtractQueries


class LibraryQueries:
    """Centralized queries for libraries and paper linking."""

    def __init__(self):
        self.db = get_supabase_client()

    def create(self, title: str, owner_id: str | UUID | None = None) -> dict:
        """Create a new library."""
        data = {"title": title}
        if owner_id:
            data["owner_id"] = str(owner_id)
        result = self.db.table("libraries").insert(data).execute()
        return result.data[0] if result.data else None

    def get_by_id(self, library_id: str | UUID) -> dict | None:
        """Get a library by ID."""
        result = (
            self.db.table("libraries")
            .select("*")
            .eq("id", str(library_id))
            .execute()
        )
        return result.data[0] if result.data else None

    def list_by_owner(self, owner_id: str | UUID | None, limit: int = 50) -> list[dict]:
        """List libraries by owner. If owner_id is None, returns unowned libraries."""
        query = self.db.table("libraries").select("*")
        if owner_id:
            query = query.eq("owner_id", str(owner_id))
        else:
            query = query.is_("owner_id", "null")
        result = query.order("created_at", desc=True).limit(limit).execute()
        return result.data

    def update(self, library_id: str | UUID, updates: dict) -> dict | None:
        """Update a library record."""
        result = (
            self.db.table("libraries")
            .update(updates)
            .eq("id", str(library_id))
            .execute()
        )
        return result.data[0] if result.data else None

    def delete(self, library_id: str | UUID) -> bool:
        """Delete a library (cascade deletes library_papers links)."""
        result = (
            self.db.table("libraries")
            .delete()
            .eq("id", str(library_id))
            .execute()
        )
        return len(result.data) > 0

    def add_papers(
        self, library_id: str | UUID, paper_ids: list[str | UUID]
    ) -> list[dict]:
        """Link multiple papers to a library. Ignores duplicates."""
        if not paper_ids:
            return []

        rows = [
            {"library_id": str(library_id), "paper_id": str(pid)}
            for pid in paper_ids
        ]
        result = (
            self.db.table("library_papers")
            .upsert(rows, on_conflict="library_id,paper_id")
            .execute()
        )
        return result.data

    def remove_papers(
        self, library_id: str | UUID, paper_ids: list[str | UUID]
    ) -> bool:
        """Unlink papers from a library."""
        if not paper_ids:
            return True

        result = (
            self.db.table("library_papers")
            .delete()
            .eq("library_id", str(library_id))
            .in_("paper_id", [str(pid) for pid in paper_ids])
            .execute()
        )
        return True

    def get_papers(self, library_id: str | UUID) -> list[dict]:
        """Get all papers in a library (with paper details)."""
        result = (
            self.db.table("library_papers")
            .select("paper_id, added_at, papers(*)")
            .eq("library_id", str(library_id))
            .execute()
        )
        return result.data

    def get_library_with_papers(self, library_id: str | UUID) -> dict | None:
        """Get a library with all its papers."""
        library = self.get_by_id(library_id)
        if not library:
            return None

        papers_data = self.get_papers(library_id)
        library["papers"] = [
            {**item["papers"], "added_at": item["added_at"]}
            for item in papers_data
            if item.get("papers")
        ]
        return library

    def get_libraries_for_paper(self, paper_id: str | UUID) -> list[dict]:
        """Get all libraries that contain a given paper."""
        result = (
            self.db.table("library_papers")
            .select("library_id, added_at, libraries(*)")
            .eq("paper_id", str(paper_id))
            .execute()
        )
        return [
            {**item["libraries"], "added_at": item["added_at"]}
            for item in result.data
            if item.get("libraries")
        ]

    def get_links_for_extracts(self, extract_ids: list[str | UUID]) -> list[dict]:
        """Get all links where from_id is in the given extract IDs."""
        if not extract_ids:
            return []

        # Batch to avoid PostgREST URL length limits
        BATCH_SIZE = 500
        all_links = []

        for i in range(0, len(extract_ids), BATCH_SIZE):
            batch = extract_ids[i : i + BATCH_SIZE]
            result = (
                self.db.table("extract_links")
                .select("*")
                .in_("from_id", [str(eid) for eid in batch])
                .execute()
            )
            all_links.extend(result.data)

        return all_links

    def get_full_library(self, library_id: str | UUID) -> dict | None:
        """Get a library with all papers, extracts (latest per paper), and links."""
        library = self.get_by_id(library_id)
        if not library:
            return None

        # Get papers with added_at
        papers_data = self.get_papers(library_id)
        papers = []
        paper_ids = []
        for item in papers_data:
            if item.get("papers"):
                paper = item["papers"]
                paper_ids.append(paper["id"])
                # Extract fields from metadata jsonb
                metadata = paper.get("metadata") or {}
                papers.append({
                    "id": paper["id"],
                    "title": paper.get("title"),
                    "filename": paper["filename"],
                    "storage_path": paper["storage_path"],
                    "abstract": metadata.get("abstract"),
                    "authors": metadata.get("authors", []),
                    "year": metadata.get("year"),
                    "journal": metadata.get("journal"),
                    "doi": metadata.get("doi"),
                    "added_at": item["added_at"],
                })

        # Get all extracts in a single query, grouped by type
        extract_queries = ExtractQueries()
        extracts_by_type = extract_queries.get_all_extracts_by_library(library_id)
        claims = extracts_by_type["claims"]
        observations = extracts_by_type["observations"]
        methods = extracts_by_type["methods"]

        all_extracts = claims + observations + methods
        extract_ids = [e["id"] for e in all_extracts]

        # Get links for these extracts
        links = self.get_links_for_extracts(extract_ids)

        return {
            "library": library,
            "papers": papers,
            "extracts": {
                "claims": claims,
                "observations": observations,
                "methods": methods,
            },
            "links": links,
            "stats": {
                "total_papers": len(papers),
                "total_extracts": len(all_extracts),
                "total_links": len(links),
            },
            "processing": self.get_processing_status(library_id, paper_ids),
        }

    def get_processing_status(
        self, library_id: str | UUID, paper_ids: list[str] | None = None
    ) -> dict:
        """
        Get the processing status for a library.

        Returns count of papers with pending/running jobs and whether
        the library itself has a pending/running link job.

        Args:
            library_id: UUID of the library
            paper_ids: Optional list of paper IDs (to avoid re-fetching)

        Returns:
            dict with papers_processing (int) and library_linking (bool)
        """
        # Get paper IDs if not provided
        if paper_ids is None:
            library_papers = (
                self.db.table("library_papers")
                .select("paper_id")
                .eq("library_id", str(library_id))
                .execute()
            )
            paper_ids = [lp["paper_id"] for lp in library_papers.data] if library_papers.data else []

        papers_processing = 0
        processing_types = ["parse_paper", "extract_elements"]
        active_statuses = ["pending", "running"]

        # Single query to get all active jobs for papers in this library
        if paper_ids:
            paper_id_strs = [str(pid) for pid in paper_ids]
            result = (
                self.db.table("jobs")
                .select("payload->>paper_id")
                .in_("job_type", processing_types)
                .in_("status", active_statuses)
                .in_("payload->>paper_id", paper_id_strs)
                .execute()
            )
            # Count unique papers with active jobs
            papers_with_jobs = set(row["paper_id"] for row in result.data if row.get("paper_id"))
            papers_processing = len(papers_with_jobs)

        # Check if library has a pending/running link_library job
        link_result = (
            self.db.table("jobs")
            .select("id")
            .eq("job_type", "link_library")
            .in_("status", active_statuses)
            .eq("payload->>library_id", str(library_id))
            .limit(1)
            .execute()
        )
        library_linking = len(link_result.data) > 0

        return {
            "papers_processing": papers_processing,
            "library_linking": library_linking,
        }
