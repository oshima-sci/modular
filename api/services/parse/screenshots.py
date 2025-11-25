"""Extract screenshots of figures and tables from PDFs using TEI coordinates."""
import logging
import re
from io import BytesIO
from xml.etree import ElementTree as ET

import fitz  # PyMuPDF

logger = logging.getLogger(__name__)

# TEI namespace
TEI_NS = "http://www.tei-c.org/ns/1.0"
XML_NS = "http://www.w3.org/XML/1998/namespace"


def parse_coords(coords_str: str) -> list[dict]:
    """
    Parse TEI coords string into list of region dicts.

    Format: "page,x,y,width,height;page,x,y,width,height;..."

    Returns list of {page, x, y, width, height} dicts.
    """
    regions = []
    for region in coords_str.split(";"):
        parts = region.strip().split(",")
        if len(parts) >= 5:
            regions.append({
                "page": int(parts[0]) - 1,  # Convert to 0-indexed
                "x": float(parts[1]),
                "y": float(parts[2]),
                "width": float(parts[3]),
                "height": float(parts[4])
            })
    return regions


def get_bounding_box(regions: list[dict]) -> dict | None:
    """
    Get the bounding box that encompasses all regions.

    Returns {page, x, y, width, height} or None if regions span multiple pages.
    """
    if not regions:
        return None

    # Check if all regions are on the same page
    pages = set(r["page"] for r in regions)
    if len(pages) > 1:
        # For multi-page figures, just use the first region
        logger.warning("Figure spans multiple pages, using first region only")
        regions = [r for r in regions if r["page"] == min(pages)]

    page = regions[0]["page"]

    # Calculate bounding box
    min_x = min(r["x"] for r in regions)
    min_y = min(r["y"] for r in regions)
    max_x = max(r["x"] + r["width"] for r in regions)
    max_y = max(r["y"] + r["height"] for r in regions)

    return {
        "page": page,
        "x": min_x,
        "y": min_y,
        "width": max_x - min_x,
        "height": max_y - min_y
    }


def extract_figure_screenshots(
    pdf_content: bytes,
    tei_xml: str,
    dpi: int = 150
) -> list[dict]:
    """
    Extract screenshots of all figures and tables from a PDF.

    Args:
        pdf_content: Raw PDF bytes
        tei_xml: TEI XML string with figure/table coords
        dpi: Resolution for screenshots (default 150)

    Returns:
        List of {id, type, image_bytes, filename} dicts
    """
    # Parse TEI XML
    root = ET.fromstring(tei_xml)

    # Find all figures (includes tables with type="table")
    figures = root.findall(f".//{{{TEI_NS}}}figure")

    if not figures:
        logger.info("No figures found in TEI")
        return []

    # Open PDF
    pdf_doc = fitz.open(stream=pdf_content, filetype="pdf")

    screenshots = []
    zoom = dpi / 72  # PDF default is 72 DPI

    for fig in figures:
        # Get xml:id
        fig_id = fig.get(f"{{{XML_NS}}}id")
        if not fig_id:
            continue

        # Get coords attribute
        coords_str = fig.get("coords")
        if not coords_str:
            # Try to get coords from nested graphic element
            graphic = fig.find(f"{{{TEI_NS}}}graphic")
            if graphic is not None:
                coords_str = graphic.get("coords")

        if not coords_str:
            logger.warning(f"No coords found for {fig_id}")
            continue

        # Parse coordinates
        regions = parse_coords(coords_str)
        bbox = get_bounding_box(regions)

        if not bbox:
            continue

        page_num = bbox["page"]
        if page_num < 0 or page_num >= len(pdf_doc):
            logger.warning(f"Invalid page number {page_num} for {fig_id}")
            continue

        # Get the page
        page = pdf_doc[page_num]

        # Create clip rectangle (fitz uses top-left origin)
        clip = fitz.Rect(
            bbox["x"],
            bbox["y"],
            bbox["x"] + bbox["width"],
            bbox["y"] + bbox["height"]
        )

        # Render the clipped region
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat, clip=clip)

        # Convert to PNG bytes
        image_bytes = pix.tobytes("png")

        # Determine type
        fig_type = fig.get("type", "figure")

        screenshots.append({
            "id": fig_id,
            "type": fig_type,
            "image_bytes": image_bytes,
            "filename": f"{fig_id}.png",
            "page": page_num + 1,  # Back to 1-indexed for display
            "bbox": bbox
        })

        logger.info(f"Extracted screenshot for {fig_id} ({fig_type}) from page {page_num + 1}")

    pdf_doc.close()

    return screenshots


def save_screenshots_to_bucket(
    db,
    paper_id: str,
    screenshots: list[dict],
    bucket_name: str = "papers"
) -> list[str]:
    """
    Save extracted screenshots to Supabase bucket.

    Saves to: {paper_id}/figures/{fig_id}.png

    Returns list of storage paths.
    """
    paths = []

    for shot in screenshots:
        storage_path = f"{paper_id}/figures/{shot['filename']}"

        try:
            db.storage.from_(bucket_name).upload(
                path=storage_path,
                file=shot["image_bytes"],
                file_options={"content-type": "image/png"}
            )
            paths.append(storage_path)
            logger.info(f"Saved {storage_path}")

        except Exception as e:
            logger.error(f"Failed to save {storage_path}: {e}")

    return paths
