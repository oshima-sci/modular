"""Extract metadata from parsed TEI XML."""
import logging
import xml.etree.ElementTree as ET
from typing import TypedDict

logger = logging.getLogger(__name__)

TEI_NS = {"tei": "http://www.tei-c.org/ns/1.0"}


class BiblReference(TypedDict):
    """A bibliographic reference from the paper."""
    id: str
    title: str | None
    authors: list[str]
    year: str | None
    journal: str | None
    doi: str | None


class PaperMetadata(TypedDict):
    """Extracted metadata from a parsed paper."""
    title: str | None
    abstract: str | None
    references: list[BiblReference]


def extract_title(root: ET.Element) -> str | None:
    """Extract title from titleStmt (not other title tags)."""
    title_elem = root.find(".//tei:teiHeader//tei:titleStmt/tei:title", TEI_NS)
    if title_elem is not None and title_elem.text:
        return title_elem.text.strip()
    return None


def extract_abstract(root: ET.Element) -> str | None:
    """Extract abstract text, combining all paragraph/sentence content."""
    abstract_elem = root.find(".//tei:abstract", TEI_NS)
    if abstract_elem is None:
        return None

    # Collect all text from the abstract element and its children
    texts = []
    for elem in abstract_elem.iter():
        if elem.text:
            texts.append(elem.text.strip())
        if elem.tail:
            texts.append(elem.tail.strip())

    # Filter empty strings and join
    text_parts = [t for t in texts if t]
    if not text_parts:
        return None

    return " ".join(text_parts)


def extract_references(root: ET.Element) -> list[BiblReference]:
    """Extract bibliographic references from listBibl."""
    references = []

    list_bibl = root.find(".//tei:listBibl", TEI_NS)
    if list_bibl is None:
        return references

    for bibl_struct in list_bibl.findall("tei:biblStruct", TEI_NS):
        ref_id = bibl_struct.get("{http://www.w3.org/XML/1998/namespace}id", "")

        # Extract title from analytic (article) or monogr (book/journal)
        title = None
        title_elem = bibl_struct.find(".//tei:analytic/tei:title", TEI_NS)
        if title_elem is None:
            title_elem = bibl_struct.find(".//tei:monogr/tei:title", TEI_NS)
        if title_elem is not None and title_elem.text:
            title = title_elem.text.strip()

        # Extract authors
        authors = []
        for author in bibl_struct.findall(".//tei:author/tei:persName", TEI_NS):
            name_parts = []
            forename = author.find("tei:forename", TEI_NS)
            surname = author.find("tei:surname", TEI_NS)
            if forename is not None and forename.text:
                name_parts.append(forename.text.strip())
            if surname is not None and surname.text:
                name_parts.append(surname.text.strip())
            if name_parts:
                authors.append(" ".join(name_parts))

        # Extract year
        year = None
        date_elem = bibl_struct.find(".//tei:date[@type='published']", TEI_NS)
        if date_elem is not None:
            year = date_elem.get("when", date_elem.text)
            if year:
                year = year[:4]  # Just the year portion

        # Extract journal
        journal = None
        journal_elem = bibl_struct.find(".//tei:monogr/tei:title[@level='j']", TEI_NS)
        if journal_elem is not None and journal_elem.text:
            journal = journal_elem.text.strip()

        # Extract DOI
        doi = None
        doi_elem = bibl_struct.find(".//tei:idno[@type='DOI']", TEI_NS)
        if doi_elem is not None and doi_elem.text:
            doi = doi_elem.text.strip()

        references.append(BiblReference(
            id=ref_id,
            title=title,
            authors=authors,
            year=year,
            journal=journal,
            doi=doi,
        ))

    return references


def extract_metadata(tei_xml: str) -> PaperMetadata:
    """
    Extract title, abstract, and references from TEI XML.

    Args:
        tei_xml: The TEI XML content as a string

    Returns:
        PaperMetadata with title, abstract, and references
    """
    root = ET.fromstring(tei_xml)

    title = extract_title(root)
    abstract = extract_abstract(root)
    references = extract_references(root)

    logger.info(f"Extracted metadata: title={bool(title)}, abstract={bool(abstract)}, refs={len(references)}")

    return PaperMetadata(
        title=title,
        abstract=abstract,
        references=references,
    )
