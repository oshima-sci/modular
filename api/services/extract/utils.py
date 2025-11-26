"""Shared utilities for extraction modules."""
import copy
import xml.etree.ElementTree as ET

TEI_NS = "http://www.tei-c.org/ns/1.0"

# Max characters per chunk (~100k tokens, safe margin under 200k limit)
MAX_CHUNK_CHARS = 400_000


def strip_coords(elem: ET.Element) -> None:
    """Recursively remove 'coords' attribute from element and all descendants."""
    if "coords" in elem.attrib:
        del elem.attrib["coords"]
    for child in elem:
        strip_coords(child)


def element_to_string(elem: ET.Element, strip_coords_attr: bool = True) -> str:
    """Convert an element to string, optionally stripping coords attributes."""
    if strip_coords_attr:
        elem = copy.deepcopy(elem)
        strip_coords(elem)
    return ET.tostring(elem, encoding="unicode")


def get_abstract_xml(root: ET.Element) -> str | None:
    """Get abstract element as XML string, or None if not found."""
    abstract = root.find(f".//{{{TEI_NS}}}abstract")
    if abstract is not None:
        return element_to_string(abstract)
    return None


def get_first_body_div(root: ET.Element) -> str | None:
    """Get the first div from body as XML string."""
    body = root.find(f".//{{{TEI_NS}}}body")
    if body is not None:
        first_div = body.find(f"{{{TEI_NS}}}div")
        if first_div is not None:
            return element_to_string(first_div)
    return None


def get_body_divs(root: ET.Element) -> list[ET.Element]:
    """Get all divs from body as list of elements."""
    body = root.find(f".//{{{TEI_NS}}}body")
    if body is None:
        return []
    return body.findall(f"{{{TEI_NS}}}div")


def chunk_divs_by_size(
    divs: list[ET.Element],
    max_chars: int = MAX_CHUNK_CHARS,
) -> list[list[ET.Element]]:
    """
    Group divs into chunks that fit under max_chars.
    Each chunk is a list of consecutive divs.

    Args:
        divs: List of div elements to chunk
        max_chars: Maximum characters per chunk

    Returns:
        List of chunks, where each chunk is a list of div elements
    """
    if not divs:
        return []

    chunks: list[list[ET.Element]] = []
    current_chunk: list[ET.Element] = []
    current_size = 0

    for div in divs:
        div_str = element_to_string(div)
        div_size = len(div_str)

        # If single div exceeds limit, it gets its own chunk
        if div_size > max_chars:
            if current_chunk:
                chunks.append(current_chunk)
                current_chunk = []
                current_size = 0
            chunks.append([div])
            continue

        # If adding this div would exceed limit, start new chunk
        if current_size + div_size > max_chars:
            if current_chunk:
                chunks.append(current_chunk)
            current_chunk = [div]
            current_size = div_size
        else:
            current_chunk.append(div)
            current_size += div_size

    # Don't forget last chunk
    if current_chunk:
        chunks.append(current_chunk)

    return chunks


def divs_to_string(divs: list[ET.Element]) -> str:
    """Convert a list of div elements to a single XML string."""
    return "\n".join(element_to_string(div) for div in divs)
