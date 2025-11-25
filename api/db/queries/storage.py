"""Storage bucket queries."""
from db import get_supabase_client


BUCKET_PAPERS = "papers"


class StorageQueries:
    """Centralized queries for Supabase storage buckets."""

    def __init__(self, bucket: str = BUCKET_PAPERS):
        self.db = get_supabase_client()
        self.bucket = bucket

    def download(self, path: str) -> bytes:
        """Download a file from the bucket."""
        return self.db.storage.from_(self.bucket).download(path)

    def download_text(self, path: str) -> str:
        """Download a file and decode as UTF-8 text."""
        content = self.download(path)
        return content.decode("utf-8")

    def upload(self, path: str, content: bytes | str, content_type: str = "application/octet-stream") -> None:
        """Upload a file to the bucket."""
        if isinstance(content, str):
            content = content.encode("utf-8")

        self.db.storage.from_(self.bucket).upload(
            path=path,
            file=content,
            file_options={"content-type": content_type}
        )

    def upload_text(self, path: str, content: str, content_type: str = "text/plain") -> None:
        """Upload text content to the bucket."""
        self.upload(path, content.encode("utf-8"), content_type)

    def upload_xml(self, path: str, content: str) -> None:
        """Upload XML content to the bucket."""
        self.upload(path, content.encode("utf-8"), "application/xml")

    def upload_image(self, path: str, content: bytes) -> None:
        """Upload an image to the bucket."""
        self.upload(path, content, "image/png")

    def delete(self, paths: list[str]) -> None:
        """Delete files from the bucket."""
        self.db.storage.from_(self.bucket).remove(paths)

    def list_files(self, folder: str) -> list[dict]:
        """List files in a folder."""
        return self.db.storage.from_(self.bucket).list(folder)

    # --- Convenience methods for papers bucket ---

    def get_paper_pdf(self, paper_id: str) -> bytes:
        """Get the original PDF for a paper."""
        return self.download(f"{paper_id}/original.pdf")

    def get_paper_tei(self, paper_id: str) -> str:
        """Get the parsed TEI XML for a paper."""
        return self.download_text(f"{paper_id}/parsed.tei")

    def get_figure(self, paper_id: str, figure_id: str) -> bytes:
        """Get a figure image for a paper."""
        return self.download(f"{paper_id}/figures/{figure_id}.png")
