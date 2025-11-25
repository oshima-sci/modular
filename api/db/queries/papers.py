"""Database queries for papers table."""
from uuid import UUID

from db import get_supabase_client


class PaperQueries:
    """Centralized queries for the papers table."""

    def __init__(self):
        self.db = get_supabase_client()

    def get_by_id(self, paper_id: str | UUID) -> dict | None:
        """Get a paper by ID."""
        result = self.db.table("papers").select("*").eq("id", str(paper_id)).execute()
        return result.data[0] if result.data else None

    def get_by_sha256(self, sha256: str) -> dict | None:
        """Find paper by SHA256 hash."""
        result = self.db.table("papers").select("*").eq("sha256", sha256).execute()
        return result.data[0] if result.data else None

    def list_all(self, limit: int = 50) -> list[dict]:
        """List papers ordered by creation date."""
        result = (
            self.db.table("papers")
            .select("*")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data

    def list_parsed(self, limit: int = 50) -> list[dict]:
        """List papers that have been parsed (have parsed_path)."""
        result = (
            self.db.table("papers")
            .select("*")
            .not_.is_("parsed_path", "null")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data

    def list_unparsed(self, limit: int = 50) -> list[dict]:
        """List papers that haven't been parsed yet."""
        result = (
            self.db.table("papers")
            .select("*")
            .is_("parsed_path", "null")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data

    def update(self, paper_id: str | UUID, updates: dict) -> dict | None:
        """Update a paper record."""
        result = (
            self.db.table("papers")
            .update(updates)
            .eq("id", str(paper_id))
            .execute()
        )
        return result.data[0] if result.data else None

    def set_parsed_path(self, paper_id: str | UUID, parsed_path: str) -> dict | None:
        """Set the parsed_path for a paper."""
        return self.update(paper_id, {"parsed_path": parsed_path})
