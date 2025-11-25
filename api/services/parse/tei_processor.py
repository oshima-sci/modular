"""Post-process TEI XML to add hierarchical IDs to body elements."""
import re
from xml.etree import ElementTree as ET


# TEI namespace
TEI_NS = "http://www.tei-c.org/ns/1.0"
XML_NS = "http://www.w3.org/XML/1998/namespace"

# Register namespaces to preserve them in output
ET.register_namespace("", TEI_NS)
ET.register_namespace("xml", XML_NS)
ET.register_namespace("xlink", "http://www.w3.org/1999/xlink")
ET.register_namespace("xsi", "http://www.w3.org/2001/XMLSchema-instance")


def _add_ids_to_div(div, div_id: str) -> None:
    """Add IDs to heads, paragraphs, and sentences within a div."""
    # Only add ID if not already present
    if f"{{{XML_NS}}}id" not in div.attrib:
        div.set(f"{{{XML_NS}}}id", div_id)

    head_counter = 0
    p_counter = 0

    for child in div:
        tag = child.tag.replace(f"{{{TEI_NS}}}", "")

        if tag == "head":
            head_counter += 1
            head_id = f"{div_id}-h{head_counter}"
            if f"{{{XML_NS}}}id" not in child.attrib:
                child.set(f"{{{XML_NS}}}id", head_id)

        elif tag == "p":
            p_counter += 1
            p_id = f"{div_id}-p{p_counter}"
            if f"{{{XML_NS}}}id" not in child.attrib:
                child.set(f"{{{XML_NS}}}id", p_id)

            # Process sentences within paragraph
            s_counter = 0
            for s in child.findall(f"{{{TEI_NS}}}s"):
                s_counter += 1
                s_id = f"{p_id}-s{s_counter}"
                if f"{{{XML_NS}}}id" not in s.attrib:
                    s.set(f"{{{XML_NS}}}id", s_id)


def add_element_ids(tei_xml: str) -> str:
    """
    Add hierarchical IDs to elements in the TEI abstract and body.

    ID schema:
    - abstract divs: abs-d1, abs-d2... (or abs if no divs)
    - body divs: d1, d2, d3...
    - head inside div: d1-h1, d1-h2...
    - p inside div: d1-p1, d1-p2...
    - s inside p: d1-p1-s1, d1-p1-s2...

    Existing xml:id attributes (e.g., on figures, tables) are preserved.
    """
    # Parse XML
    root = ET.fromstring(tei_xml)

    # Process abstract
    abstract = root.find(f".//{{{TEI_NS}}}abstract")
    if abstract is not None:
        # Check if abstract has divs
        abstract_divs = abstract.findall(f"{{{TEI_NS}}}div")
        if abstract_divs:
            # Process each div in abstract
            for i, div in enumerate(abstract_divs, 1):
                _add_ids_to_div(div, f"abs-d{i}")
        else:
            # Abstract has no divs, treat the abstract itself as a container
            # Add IDs to paragraphs and sentences directly in abstract
            p_counter = 0
            for child in abstract:
                tag = child.tag.replace(f"{{{TEI_NS}}}", "")
                if tag == "p":
                    p_counter += 1
                    p_id = f"abs-p{p_counter}"
                    if f"{{{XML_NS}}}id" not in child.attrib:
                        child.set(f"{{{XML_NS}}}id", p_id)

                    # Process sentences within paragraph
                    s_counter = 0
                    for s in child.findall(f"{{{TEI_NS}}}s"):
                        s_counter += 1
                        s_id = f"{p_id}-s{s_counter}"
                        if f"{{{XML_NS}}}id" not in s.attrib:
                            s.set(f"{{{XML_NS}}}id", s_id)

    # Find body element
    body = root.find(f".//{{{TEI_NS}}}body")
    if body is not None:
        # Process divs in body
        div_counter = 0
        for div in body.findall(f"{{{TEI_NS}}}div"):
            div_counter += 1
            _add_ids_to_div(div, f"d{div_counter}")

    # Convert back to string
    output = ET.tostring(root, encoding="unicode")

    # Add XML declaration back
    output = '<?xml version="1.0" encoding="UTF-8"?>\n' + output

    return output


def extract_element_by_id(tei_xml: str, element_id: str) -> str | None:
    """
    Extract the text content of an element by its ID.

    Useful for retrieving source text when LLM references an element ID.
    """
    root = ET.fromstring(tei_xml)

    # Search for element with matching xml:id
    for elem in root.iter():
        if elem.get(f"{{{XML_NS}}}id") == element_id:
            # Get all text content including nested elements
            return "".join(elem.itertext()).strip()

    return None


def list_element_ids(tei_xml: str) -> list[dict]:
    """
    List all elements with IDs and their text preview.

    Returns list of {id, tag, text_preview} dicts.
    """
    root = ET.fromstring(tei_xml)
    elements = []

    for elem in root.iter():
        elem_id = elem.get(f"{{{XML_NS}}}id")
        if elem_id:
            text = "".join(elem.itertext()).strip()
            text_preview = text[:100] + "..." if len(text) > 100 else text

            elements.append({
                "id": elem_id,
                "tag": elem.tag.replace(f"{{{TEI_NS}}}", ""),
                "text_preview": text_preview
            })

    return elements
