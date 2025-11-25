"""Extract claims from parsed paper TEI using DSPy."""
import logging
import xml.etree.ElementTree as ET
from typing import Any

import dspy
from pydantic import BaseModel, Field

from db import PaperQueries, StorageQueries

TEI_NS = "http://www.tei-c.org/ns/1.0"

logger = logging.getLogger(__name__)


# --- Pydantic Schemas for Claims ---

class SourceReference(BaseModel):
    """Reference to a source element in the TEI."""
    source_element_id: str = Field(description="The xml:id of the source element (e.g., 'd1-p2-s1')")
    


class Claim(BaseModel):
    """A single claim extracted from a paper."""
    source_elements: list[SourceReference] = Field(description="References to TEI elements supporting this claim")
    rephrased_claim: str = Field(description="""
        Summary of the core claim that can be understood without context of the paper.
        Make sure it includes the phenomena investigated in the paper as well as the
        proposed relationship between or novel understanding of them.
        If you wrote a sober-toned news article about the paper, this is how you would 
        phrase the claim so that readers understand the claim the paper is making without having
        to read the entire paper or understanding how they discovered this insight.
    """)
    original_claim_by_paper: bool = Field(description="""
        TRUE if the paper is making this claim and it's an original contribution.
        FALSE if this claim is restated with reference to another source that must have made this claim.
    """)
    reasoning: str = Field(description="One sentence on why this is a core claim of the paper.")


class ClaimsExtractionResult(BaseModel):
    """Result of claims extraction from a paper."""
    paper_id: str
    claims: list[Claim] = Field(default_factory=list)

# --- DSPy Signature ---

class ExtractClaims(dspy.Signature):
    """
    Extract the core scientific claims from the provided research paper.
    
    Core claims of a paper are the main contributions it makes in terms of establishing new relationships between
    or new understanding of phenomena. These are typically stated in the title, abstract and conclusion/discussion 
    section. A news article on this paper would list these core claims as what the paper is about.

    Claims are conclusive and interpretive and often generalizable. You can often identify some core claims by the authors saying
    that this paper "demonstrates," "reveals," or "suggests," something, indicating an original scientific contribution.
    
    Claims are not statements describing empirical observations. Do not extract those. We are only interested in the original 
    claims about the nature of the target phenomena of the paper that are being made here.

    A good claim would be:
    - "Insomnia is a significant problem among euthymic patients with bipolar disorder."
        -> Makes an assertion about the nature of a phenomenon. Is a general statement of proposed truth.
    - "Sleep deprivation involves the loss of top-down inhibitory control usually exerted by medial prefrontal cortex on amygdala."
        -> Makes an assertion about how something works, is a general statement of proposed truth. 

    Do not extract statements like these:
    - "Seventy percent of euthymic patients with bipolar disorder exhibited a clinically significant sleep disturbance."
        -> This is an empirical observation, not a conclusive statement. It is not a claim.
    - "This question needs to be investigated further."
        -> This is a statement indiciating need for further research. There is no insight about anything in here. Not a claim.

    Claims are usually found in the abstract and/or discussion/conclusion section of the paper.
    The title will also often give you a good hint at what the core insight of the paper is.
    """

    paper_content: str = dspy.InputField(desc="Parsed sectiond from the paper with element IDs")
    claims: list[Claim] = dspy.OutputField(desc="List of extracted claims with source references")


# --- DSPy Module ---

class ClaimsExtractor(dspy.Module):
    """DSPy module for extracting claims from papers."""

    def __init__(self):
        super().__init__()
        self.extract = dspy.Predict(ExtractClaims)

    def forward(self, paper_content: str) -> list[Claim]:
        """Extract claims from paper content."""
        result = self.extract(paper_content=paper_content)
        return result.claims


# --- Helper Functions ---

def _element_to_string(elem: ET.Element) -> str:
    """Convert an element to string preserving xml:id attributes."""
    return ET.tostring(elem, encoding="unicode")


def _get_abstract_xml(root: ET.Element) -> str | None:
    """Get abstract element as XML string, or None if not found."""
    abstract = root.find(f".//{{{TEI_NS}}}abstract")
    if abstract is not None:
        return _element_to_string(abstract)
    return None


def _get_first_body_div(root: ET.Element) -> str | None:
    """Get the first div from body as XML string."""
    body = root.find(f".//{{{TEI_NS}}}body")
    if body is not None:
        first_div = body.find(f"{{{TEI_NS}}}div")
        if first_div is not None:
            return _element_to_string(first_div)
    return None


def _get_conclusion_or_discussion(root: ET.Element) -> str | None:
    """
    Find div with head containing 'conclusion' or 'discussion' (case-insensitive).
    Returns the entire div as XML string.
"""
    body = root.find(f".//{{{TEI_NS}}}body")
    if body is None:
        return None

    for div in body.findall(f"{{{TEI_NS}}}div"):
        head = div.find(f"{{{TEI_NS}}}head")
        if head is not None and head.text:
            head_text = head.text.lower()
            if "conclusion" in head_text or "discussion" in head_text:
                return _element_to_string(div)
    return None


def _get_last_two_body_divs(root: ET.Element) -> str | None:
    """Get the last two divs from body as XML string."""
    body = root.find(f".//{{{TEI_NS}}}body")
    if body is None:
        return None

    divs = body.findall(f"{{{TEI_NS}}}div")
    if not divs:
        return None

    # Get last two divs
    last_divs = divs[-2:] if len(divs) >= 2 else divs
    return "\n".join(_element_to_string(div) for div in last_divs)


def build_claims_input(tei_xml: str, title: str | None = None) -> str:
    """
    Build the input string for claims extraction from TEI XML.

    Constructs a string with:
    - Title (from papers.title column, if available)
    - Abstract (from TEI, or first body div if no abstract)
    - Conclusion/Discussion (from TEI, or last two body divs if not found)

    All sections preserve xml:id attributes for source referencing.
    """
    root = ET.fromstring(tei_xml)

    # Get abstract or fallback to first div
    abstract_xml = _get_abstract_xml(root)
    if abstract_xml is None:
        abstract_xml = _get_first_body_div(root) or ""
        logger.info("No abstract found, using first body div")

    # Get conclusion/discussion or fallback to last two divs
    conclusion_xml = _get_conclusion_or_discussion(root)
    if conclusion_xml is None:
        conclusion_xml = _get_last_two_body_divs(root) or ""
        logger.info("No conclusion/discussion found, using last two body divs")

    # Build the prompt string
    parts = ["Extract claims from this paper:"]

    if title:
        parts.append(f"\nTITLE: {title}")

    parts.append(f"\nABSTRACT:\n{abstract_xml}")
    parts.append(f"\nEND OF PAPER:\n{conclusion_xml}")

    return "\n".join(parts)


def extract_claims_from_paper(paper_id: str) -> ClaimsExtractionResult:
    """
    Extract claims from a parsed paper.

    Steps:
    1. Fetch paper record from DB
    2. Fetch parsed TEI from storage
    3. Extract relevant content sections
    4. Run DSPy extraction module
    5. Return structured claims

    Args:
        paper_id: UUID of the paper to extract from

    Returns:
        ClaimsExtractionResult with extracted claims
    """
    logger.info(f"Starting claims extraction for paper_id={paper_id}")

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

    # 3. Build input content with title, abstract, and conclusion
    title = paper.get("title")
    content = build_claims_input(tei_xml, title=title)
    logger.info(f"Built claims input ({len(content)} chars)")

    # 4. Run DSPy extraction
    extractor = ClaimsExtractor()
    claims = extractor(paper_content=content)
    logger.info(f"Extracted {len(claims)} claims")

    # 5. Return result
    return ClaimsExtractionResult(
        paper_id=paper_id,
        claims=claims,
    )


# --- Job Handler ---

def handle_extract_claims(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Handler for extract_claims jobs.

    Payload:
        paper_id: UUID of the paper to extract claims from

    Returns:
        Dict with extraction results
    """
    paper_id = payload["paper_id"]

    result = extract_claims_from_paper(paper_id)

    return {
        "paper_id": result.paper_id,
        "claims_count": len(result.claims),
        "claims": [claim.model_dump() for claim in result.claims],
    }
