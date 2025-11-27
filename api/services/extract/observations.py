"""Extract observations from parsed paper TEI using DSPy."""
import json
import logging
import xml.etree.ElementTree as ET
from typing import Any

import dspy
from pydantic import BaseModel, Field

from db import PaperQueries, StorageQueries
from db.queries.extracts import ExtractQueries
from services.extract.utils import (
    TEI_NS,
    element_to_string,
    get_abstract_xml,
    get_first_body_div,
    get_body_divs,
    chunk_divs_by_size,
    divs_to_string,
)

logger = logging.getLogger(__name__)


# --- Pydantic Schemas for Observations ---

class SourceReference(BaseModel):
    """Reference to a source element in the TEI."""
    source_element_id: str = Field(description="The xml:id of the source element (e.g., 'd1-p2-s1')")

class Observation(BaseModel):
    """A single empirical observation extracted from a paper."""
    source_elements: list[SourceReference] = Field(description="References to TEI elements describing this observation")
    method_reference: str = Field(
        description="ID of the method or experiment that produced this observation or provided the context for it."
    )
    observation_summary: str = Field(description="""
        A clear, standalone summary of what was empirically observed.
        This should describe the actual finding/result, not the interpretation or claim.
        Must be understandable without context of the paper.
    """)
    observation_type: str = Field(description="""
        The type of observation (e.g., 'statistical result', 'qualitative finding',
        'measurement', 'experimental outcome', 'computational result').
    """)
    quantitative_details: str | None = Field(
        default=None,
        description="Any numerical values, statistics, p-values, effect sizes, etc. associated with this observation"
    )


class ObservationsExtractionResult(BaseModel):
    """Result of observations extraction from a paper."""
    paper_id: str
    observations: list[Observation] = Field(default_factory=list)
    skipped: bool = Field(default=False, description="True if extraction was skipped due to no methods")


# --- DSPy Signature ---

class ExtractObservations(dspy.Signature):
    """
    Extract empirical observations from the provided research paper.

    Observations are the concrete empirical findings that result from applying the methods.
    They are factual reports of what was measured, detected, or found - not interpretations or claims.
    This includes null results and observations of no effect or difference.

    For each observation, link it to the method or experiment that produced it/provided the context
    of the observation using the provided methods list.

    Good observations:
    - "Participants in the treatment group showed a 23% reduction in symptoms (p < 0.05)"
    - "The algorithm achieved 94.2% accuracy on the benchmark dataset"
    - "Expression of gene X was upregulated 3.5-fold in treated cells"
    - "There was no effect of intervention Y on target B"
    - "There was no differnece between experimental conditons 1 and 2"

    Do not extract:
    - Descriptive statistics and other sample descriptions -- We are looking for main empirical observations
    - Interpretations or conclusions drawn from observations
    - Statements about what the findings mean or suggest
    - Background information or literature citations
    """

    paper_content: str = dspy.InputField(desc="Parsed sections from the paper with element IDs")
    methods: str = dspy.InputField(desc="Previously extracted methods from this paper")
    observations: list[Observation] = dspy.OutputField(desc="List of extracted observations with source references")


# --- DSPy Module ---

class ObservationsExtractor(dspy.Module):
    """DSPy module for extracting observations from papers."""

    def __init__(self):
        super().__init__()
        self.extract = dspy.Predict(ExtractObservations)

    def forward(self, paper_content: str, methods: str) -> list[Observation]:
        """Extract observations from paper content."""
        result = self.extract(paper_content=paper_content, methods=methods)
        return result.observations


# --- Helper Functions ---

def _get_results_sections(root: ET.Element) -> list[ET.Element]:
    """
    Find all divs with head containing result-related keywords (case-insensitive).
    Returns list of matching div elements.
    """
    OBSERVATION_KEYWORDS = ["result", "finding", "observation", "analys", "outcome"]

    body = root.find(f".//{{{TEI_NS}}}body")
    if body is None:
        return []

    matches = []
    for div in body.findall(f"{{{TEI_NS}}}div"):
        head = div.find(f"{{{TEI_NS}}}head")
        if head is not None and head.text:
            head_text = head.text.lower()
            if any(kw in head_text for kw in OBSERVATION_KEYWORDS):
                matches.append(div)
    return matches


def _format_methods_for_input(method_extracts: list[dict]) -> str:
    """
    Format method extracts into a JSON string for the DSPy input.

    Adds the extract ID to each method's content and stringifies the result.

    Args:
        method_extracts: List of extract records from the database

    Returns:
        JSON string of methods with IDs
    """
    if not method_extracts:
        return "[]"

    methods_with_ids = []
    for extract in method_extracts:
        method_data = {
            "id": extract.get("id"),
            **extract.get("content", {}),
        }
        methods_with_ids.append(method_data)

    return json.dumps(methods_with_ids, indent=2)


NO_RESULTS_SECTION_INSTRUCTION = """
NOTE: No dedicated results section was found in this paper.
The full paper content (or part of it) is provided below. Please identify the empirical observations from the content.
"""


def build_observations_input(
    title: str | None,
    abstract_xml: str,
    body_xml: str,
    methods_str: str,
    has_results_section: bool,
    chunk_index: int = 0,
    total_chunks: int = 1,
) -> tuple[str, str]:
    """
    Build the input strings for observations extraction.

    Args:
        title: Paper title
        abstract_xml: Abstract as XML string
        body_xml: Body content as XML string (results section or full body chunk)
        methods_str: Formatted methods string
        has_results_section: True if body_xml is a dedicated results section
        chunk_index: Index of this chunk (0-based)
        total_chunks: Total number of chunks

    Returns:
        Tuple of (paper_content, methods) for the extractor
    """
    parts = ["Extract observations from this paper:"]

    # Add chunk info if chunked
    if total_chunks > 1:
        parts.append(f"\nNOTE: This is section {chunk_index + 1} of {total_chunks} from the paper body.")

    if title:
        parts.append(f"\nTITLE: {title}")

    parts.append(f"\nABSTRACT:\n{abstract_xml}")

    if has_results_section:
        parts.append(f"\nRESULTS:\n{body_xml}")
    else:
        parts.append(NO_RESULTS_SECTION_INSTRUCTION)
        parts.append(f"\nPAPER CONTENT:\n{body_xml}")

    paper_content = "\n".join(parts)
    return paper_content, methods_str


def extract_observations_from_paper(paper_id: str) -> ObservationsExtractionResult:
    """
    Extract observations from a parsed paper.

    Steps:
    1. Fetch paper record from DB
    2. Fetch method extracts for this paper - skip if none exist
    3. Fetch parsed TEI from storage
    4. Check for results section, or chunk full body if needed
    5. Run DSPy extraction module (potentially multiple times for chunks)
    6. Return structured observations

    Args:
        paper_id: UUID of the paper to extract from

    Returns:
        ObservationsExtractionResult with extracted observations
    """
    logger.info(f"Starting observations extraction for paper_id={paper_id}")

    # 1. Fetch paper record
    papers = PaperQueries()
    paper = papers.get_by_id(paper_id)

    if not paper:
        raise ValueError(f"Paper not found: {paper_id}")

    if not paper.get("parsed_path"):
        raise ValueError(f"Paper has not been parsed yet: {paper_id}")

    # 2. Fetch method extracts - skip if none exist
    extracts_db = ExtractQueries()
    method_extracts = extracts_db.get_latest_by_paper(paper_id, extract_type="method")

    if not method_extracts:
        logger.info(f"No method extracts found for paper_id={paper_id}, skipping observations extraction")
        return ObservationsExtractionResult(
            paper_id=paper_id,
            observations=[],
            skipped=True,
        )

    logger.info(f"Found {len(method_extracts)} method extracts")
    methods_str = _format_methods_for_input(method_extracts)

    # 3. Fetch parsed TEI
    storage = StorageQueries()
    tei_xml = storage.get_paper_tei(paper_id)
    logger.info(f"Fetched TEI ({len(tei_xml)} chars)")

    # 4. Parse TEI and get abstract
    root = ET.fromstring(tei_xml)
    title = paper.get("title")

    abstract_xml = get_abstract_xml(root)
    if abstract_xml is None:
        abstract_xml = get_first_body_div(root) or ""
        logger.info("No abstract found, using first body div")

    # 5. Check for results sections
    results_sections = _get_results_sections(root)
    extractor = ObservationsExtractor()

    if results_sections:
        # Single call with combined results sections
        logger.info(f"Found {len(results_sections)} results section(s)")
        body_xml = "\n".join(element_to_string(div) for div in results_sections)
        paper_content, methods = build_observations_input(
            title=title,
            abstract_xml=abstract_xml,
            body_xml=body_xml,
            methods_str=methods_str,
            has_results_section=True,
        )
        logger.info(f"Built observations input ({len(paper_content)} chars)")
        observations = extractor(paper_content=paper_content, methods=methods)
    else:
        # Chunk full body by divs
        logger.info("No results section found, chunking full body")
        divs = get_body_divs(root)
        chunks = chunk_divs_by_size(divs)
        total_chunks = len(chunks)
        logger.info(f"Split body into {total_chunks} chunk(s)")

        all_observations: list[Observation] = []
        for i, chunk_divs in enumerate(chunks):
            chunk_xml = divs_to_string(chunk_divs)
            paper_content, methods = build_observations_input(
                title=title,
                abstract_xml=abstract_xml,
                body_xml=chunk_xml,
                methods_str=methods_str,
                has_results_section=False,
                chunk_index=i,
                total_chunks=total_chunks,
            )
            logger.info(f"Processing chunk {i + 1}/{total_chunks} ({len(paper_content)} chars)")
            chunk_observations = extractor(paper_content=paper_content, methods=methods)
            all_observations.extend(chunk_observations)
            logger.info(f"Chunk {i + 1} yielded {len(chunk_observations)} observations")

        observations = all_observations

    logger.info(f"Extracted {len(observations)} total observations")

    # 6. Return result
    return ObservationsExtractionResult(
        paper_id=paper_id,
        observations=observations,
    )


# --- Job Handler ---

def handle_extract_observations(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Handler for extract_observations jobs.

    Payload:
        paper_id: UUID of the paper to extract observations from

    Returns:
        Dict with extraction results
    """
    paper_id = payload["paper_id"]

    result = extract_observations_from_paper(paper_id)

    return {
        "paper_id": result.paper_id,
        "observations_count": len(result.observations),
        "observations": [obs.model_dump() for obs in result.observations],
        "skipped": result.skipped,
    }
