"""Database queries for libraries and library_papers tables."""
from uuid import UUID

from db import get_supabase_client


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
