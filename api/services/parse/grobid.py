import os

import requests


class GrobidParser:
    """Service for parsing PDFs using Grobid."""

    def __init__(self):
        self.base_url = os.getenv("PARSER_URL", "http://localhost:8070")

    def parse_pdf(self, pdf_content: bytes, filename: str = "document.pdf") -> str:
        """
        Send a PDF to Grobid and return the TEI XML.

        Args:
            pdf_content: Raw PDF bytes
            filename: Original filename (for the multipart form)

        Returns:
            TEI XML string from Grobid

        Raises:
            requests.HTTPError: If Grobid returns an error
        """
        files = {
            "input": (filename, pdf_content, "application/pdf")
        }

        data = {
            "segmentSentences": "1",
            "teiCoordinates": ["s", "figure", "ref", "biblStruct"],
            "consolidateCitations": "0",
            "consolidateHeader": "0"
        }

        response = requests.post(
            f"{self.base_url}/api/processFulltextDocument",
            files=files,
            data=data
        )

        response.raise_for_status()

        return response.text
