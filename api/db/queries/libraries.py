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
        result = (
            self.db.table("extract_links")
            .select("*")
            .in_("from_id", [str(eid) for eid in extract_ids])
            .execute()
        )
        return result.data

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
                # Extract abstract from metadata jsonb
                metadata = paper.get("metadata") or {}
                papers.append({
                    "id": paper["id"],
                    "title": paper.get("title"),
                    "filename": paper["filename"],
                    "storage_path": paper["storage_path"],
                    "abstract": metadata.get("abstract"),
                    "added_at": item["added_at"],
                })

        # Get latest extracts by type using ExtractQueries
        extract_queries = ExtractQueries()
        claims = extract_queries.get_claims_by_library(library_id)
        observations = extract_queries.get_observations_by_library(library_id)
        methods = extract_queries.get_methods_by_library(library_id)

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
        }
