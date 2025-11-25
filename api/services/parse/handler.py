"""Handler for parse_paper jobs."""
import logging
from typing import Any

from db import get_supabase_client
from services.parse.grobid import GrobidParser
from services.parse.tei_processor import add_element_ids
from services.parse.screenshots import extract_figure_screenshots, save_screenshots_to_bucket
from services.parse.metadata_extractor import extract_metadata

logger = logging.getLogger(__name__)

BUCKET_NAME = "papers"


def handle_parse_paper(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Parse a paper PDF using Grobid.

    Steps:
    1. Fetch PDF from bucket using paper's storage_path
    2. Send to Grobid for parsing
    3. Save TEI XML to bucket at {paper_id}/parsed.tei
    4. Update paper record with parsed_path

    Payload:
        paper_id: UUID of the paper to parse

    Returns:
        parsed_path: Storage path of the TEI file
    """
    paper_id = payload["paper_id"]
    logger.info(f"Starting parse_paper job for paper_id={paper_id}")

    db = get_supabase_client()

    # 1. Get paper record
    result = db.table("papers").select("*").eq("id", paper_id).execute()
    if not result.data:
        raise ValueError(f"Paper not found: {paper_id}")

    paper = result.data[0]
    storage_path = paper["storage_path"]
    logger.info(f"Fetching PDF from {storage_path}")

    # 2. Download PDF from bucket
    pdf_response = db.storage.from_(BUCKET_NAME).download(storage_path)
    pdf_content = pdf_response

    # 3. Parse with Grobid
    logger.info("Sending PDF to Grobid")
    parser = GrobidParser()
    tei_xml = parser.parse_pdf(pdf_content, paper["filename"])
    logger.info(f"Received TEI XML ({len(tei_xml)} chars)")

    # 4. Add hierarchical IDs to body elements
    logger.info("Adding element IDs to TEI")
    tei_xml = add_element_ids(tei_xml)

    # 5. Save TEI to bucket
    parsed_path = f"{paper_id}/parsed.tei"
    logger.info(f"Saving TEI to {parsed_path}")

    db.storage.from_(BUCKET_NAME).upload(
        path=parsed_path,
        file=tei_xml.encode("utf-8"),
        file_options={"content-type": "application/xml"}
    )

    # 6. Extract figure/table screenshots
    logger.info("Extracting figure screenshots")
    screenshots = extract_figure_screenshots(pdf_content, tei_xml)
    figure_paths = []
    if screenshots:
        figure_paths = save_screenshots_to_bucket(db, paper_id, screenshots, BUCKET_NAME)
        logger.info(f"Saved {len(figure_paths)} figure screenshots")

    # 7. Extract metadata (title, abstract, references)
    logger.info("Extracting metadata from TEI")
    metadata = extract_metadata(tei_xml)
    parsed_title = metadata.get("title")
    logger.info(f"Extracted title: {parsed_title}, abstract: {bool(metadata.get('abstract'))}, refs: {len(metadata.get('references', []))}")

    # 8. Update paper record with parsed_path, title, and metadata
    update_data = {
        "parsed_path": parsed_path,
        "metadata": {
            "abstract": metadata.get("abstract"),
            "references": metadata.get("references", []),
        }
    }
    if parsed_title:
        update_data["title"] = parsed_title

    db.table("papers").update(update_data).eq("id", paper_id).execute()
    logger.info(f"Updated paper {paper_id} with parsed_path and metadata")

    # TODO: Fix worker DSPy config, then uncomment this
    # # 9. Create paper_extract job to run extractions
    # logger.info("Creating paper_extract job")
    # queue = JobQueue()
    # extract_job = queue.create_job_by_type(
    #     JobType.PAPER_EXTRACT,
    #     payload={"paper_id": paper_id},
    # )
    # logger.info(f"Created paper_extract job: {extract_job.id}")

    return {
        "paper_id": paper_id,
        "parsed_path": parsed_path,
        "tei_size": len(tei_xml),
        "figures_extracted": len(figure_paths),
        "title": parsed_title,
        "references_count": len(metadata.get("references", [])),
    }
