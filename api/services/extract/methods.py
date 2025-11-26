"""Extract methods from parsed paper TEI using DSPy."""
import logging
import xml.etree.ElementTree as ET
from typing import Any

import dspy
from pydantic import BaseModel, Field

from db import PaperQueries, StorageQueries
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


# --- Pydantic Schemas for Methods ---

class SourceReference(BaseModel):
    """Reference to a source element in the TEI."""
    source_element_id: str = Field(description="The xml:id of the source element (e.g., 'd1-p2-s1')")

class StructuredMethodDescription(BaseModel):
    """
        Cleanly extracted or interpreted information about the study design or method applied here.
        If any of these does not apply to the method or design you're extracting, set it to N/A.
    """
    study_design_or_method_class: str = Field(description="""
        The generic class name for this kind of study design or type of method.
        If this is a new method introduced in the paper, give it a intelligent category name.
    """)
    study_subject: str = Field(description="""
        The subset of reality being investigated here. 
        This might be a (sub)population, a material, an algorithm, a cell line, a phenomenon.
        Be as specific as possible.
    """)
    manipulated_conditions: str = Field(description="""
        The experimental condition or core variable manipulated in this method or study design. 
        What is being changed to create an effect on the study_subject?
        In classical experiments, this will be the independent variable or intervention.
    """)
    observed_outcomes: str = Field(description="""
        What is being measured or observed in this design? What is expected to change after the manipulation?
        In classical experiments, this is the dependent variable.
    """)
    control_or_reference_point: str = Field(description="""
        What are we comparing against to determine if there is an effect?
        In classical experiments, this is the control group.
        In other designs, it may be the baseline measurement, an alternative method or paradigm, a different condition, etc.
    """)


class Method(BaseModel):
    """A single method or study design extracted from a paper."""
    source_elements: list[SourceReference] = Field(description="References to TEI elements describing this method")
    structured_method_description: StructuredMethodDescription = Field(description="standardized description of the method or study design")
    method_summary: str = Field(description="""
        Rephrased version of the method or study design.
        This would be how you would summarize this method/design in the abstract of the paper,
        stating its general setup (Between-subjects design testing the effect of A on B).
        This summary needs to be interpretable without context of the paper.
    """)
    novel_method: bool = Field(description="""
        TRUE only if the paper introduces a new method as a core novel contribution to the field.
        FALSE in most cases: when a classic experimental setup or a know methodology is used or altered.
    """)


class MethodsExtractionResult(BaseModel):
    """Result of methods extraction from a paper."""
    paper_id: str
    methods: list[Method] = Field(default_factory=list)


# --- DSPy Signature ---

class ExtractMethods(dspy.Signature):
    """
    Extract the study designs or core methods from the provided research paper (if any).
    Return an empty list if this is not empirical work.

    For most classicaly empirical papers, this will be the study designs used in the experiments
    run for this paper, producing the main results.
    Sometimes papers introduce a new method as the paper's core contributions. In those cases
    also extract the method and make sure to set novel_method to TRUE. This is pretty rare.
    In some fields, there may not be classical study designs or experiments, but they will tend
    to *do something* to underpin the paper's core claims. What did they do that yields empirical observations?

    Focus on empirical research designs - ignore purely theoretical or review content.

    Do not extract:
    - Literature review methodology (we want empirical study designs or methods)
    - Statistical analysis plans (unless they define the core experimental design)
    - Secondary or descriptive analyses of existing data (unless it's a distinct empirical contribution)
    """

    paper_content: str = dspy.InputField(desc="Parsed sections from the paper with element IDs")
    methods: list[Method] = dspy.OutputField(desc="List of extracted methods with source references")


# --- DSPy Module ---

class MethodsExtractor(dspy.Module):
    """DSPy module for extracting methods from papers."""

    def __init__(self):
        super().__init__()
        self.extract = dspy.Predict(ExtractMethods)

    def forward(self, paper_content: str) -> list[Method]:
        """Extract methods from paper content."""
        result = self.extract(paper_content=paper_content)
        return result.methods


# --- Helper Functions ---

NO_METHODS_SECTION_INSTRUCTION = """
NOTE: No dedicated methods/experiment section was found in this paper.
The full paper content (or part of it) is provided below. Please identify the methods or study designs from the content.
There may not be any in this paper.
"""


def _get_methods_or_experiment_section(root: ET.Element) -> ET.Element | None:
    """
    Find div with head containing 'method' or 'experiment' (case-insensitive).
    Returns the div element, or None if not found.
    """
    body = root.find(f".//{{{TEI_NS}}}body")
    if body is None:
        return None

    for div in body.findall(f"{{{TEI_NS}}}div"):
        head = div.find(f"{{{TEI_NS}}}head")
        if head is not None and head.text:
            head_text = head.text.lower()
            if "method" in head_text or "experiment" in head_text:
                return div
    return None


def build_methods_input(
    title: str | None,
    abstract_xml: str,
    body_xml: str,
    has_methods_section: bool,
    chunk_index: int = 0,
    total_chunks: int = 1,
) -> str:
    """
    Build the input string for methods extraction.

    Args:
        title: Paper title
        abstract_xml: Abstract as XML string
        body_xml: Body content as XML string (methods section or full body chunk)
        has_methods_section: True if body_xml is a dedicated methods section
        chunk_index: Index of this chunk (0-based)
        total_chunks: Total number of chunks

    Returns:
        Formatted input string for the extractor
    """
    parts = ["Extract methods from this paper:"]

    # Add chunk info if chunked
    if total_chunks > 1:
        parts.append(f"\nNOTE: This is section {chunk_index + 1} of {total_chunks} from the paper body.")

    if title:
        parts.append(f"\nTITLE: {title}")

    parts.append(f"\nABSTRACT:\n{abstract_xml}")

    if has_methods_section:
        parts.append(f"\nMETHODS:\n{body_xml}")
    else:
        parts.append(NO_METHODS_SECTION_INSTRUCTION)
        parts.append(f"\nPAPER CONTENT:\n{body_xml}")

    return "\n".join(parts)


def extract_methods_from_paper(paper_id: str) -> MethodsExtractionResult:
    """
    Extract methods from a parsed paper.

    Steps:
    1. Fetch paper record from DB
    2. Fetch parsed TEI from storage
    3. Check for methods section, or chunk full body if needed
    4. Run DSPy extraction module (potentially multiple times for chunks)
    5. Return structured methods

    Args:
        paper_id: UUID of the paper to extract from

    Returns:
        MethodsExtractionResult with extracted methods
    """
    logger.info(f"Starting methods extraction for paper_id={paper_id}")

    # 1. Fetch paper record
    papers = PaperQueries()
    paper = papers.get_by_id(paper_id)

    if not paper:
        raise ValueError(f"Paper not found: {paper_id}")

    if not paper.get("parsed_path"):
        raise ValueError(f"Paper has not been parsed yet: {paper_id}")

    # 2. Fetch parsed TEI
    storage = StorageQueries()
    tei_xml = storage.get_paper_tei(paper_id)
    logger.info(f"Fetched TEI ({len(tei_xml)} chars)")

    # 3. Parse TEI and get abstract
    root = ET.fromstring(tei_xml)
    title = paper.get("title")

    abstract_xml = get_abstract_xml(root)
    if abstract_xml is None:
        abstract_xml = get_first_body_div(root) or ""
        logger.info("No abstract found, using first body div")

    # 4. Check for methods section
    methods_section = _get_methods_or_experiment_section(root)
    extractor = MethodsExtractor()

    if methods_section is not None:
        # Single call with methods section
        logger.info("Found methods/experiment section")
        body_xml = element_to_string(methods_section)
        content = build_methods_input(
            title=title,
            abstract_xml=abstract_xml,
            body_xml=body_xml,
            has_methods_section=True,
        )
        logger.info(f"Built methods input ({len(content)} chars)")
        methods = extractor(paper_content=content)
    else:
        # Chunk full body by divs
        logger.info("No methods section found, chunking full body")
        divs = get_body_divs(root)
        chunks = chunk_divs_by_size(divs)
        total_chunks = len(chunks)
        logger.info(f"Split body into {total_chunks} chunk(s)")

        all_methods: list[Method] = []
        for i, chunk_divs in enumerate(chunks):
            chunk_xml = divs_to_string(chunk_divs)
            content = build_methods_input(
                title=title,
                abstract_xml=abstract_xml,
                body_xml=chunk_xml,
                has_methods_section=False,
                chunk_index=i,
                total_chunks=total_chunks,
            )
            logger.info(f"Processing chunk {i + 1}/{total_chunks} ({len(content)} chars)")
            chunk_methods = extractor(paper_content=content)
            all_methods.extend(chunk_methods)
            logger.info(f"Chunk {i + 1} yielded {len(chunk_methods)} methods")

        methods = all_methods

    logger.info(f"Extracted {len(methods)} total methods")

    # 5. Return result
    return MethodsExtractionResult(
        paper_id=paper_id,
        methods=methods,
    )


# --- Job Handler ---

def handle_extract_methods(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Handler for extract_methods jobs.

    Payload:
        paper_id: UUID of the paper to extract methods from

    Returns:
        Dict with extraction results
    """
    paper_id = payload["paper_id"]

    result = extract_methods_from_paper(paper_id)

    return {
        "paper_id": result.paper_id,
        "methods_count": len(result.methods),
        "methods": [method.model_dump() for method in result.methods],
    }
