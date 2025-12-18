import type { BBox } from "@/components/PdfViewer";

// Supabase storage URL for public bucket access
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const STORAGE_BUCKET = "papers";

export function getPdfUrl(paperId: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${paperId}/original.pdf`;
}

export function getTeiUrl(paperId: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${paperId}/parsed.tei`;
}

/**
 * Parse TEI XML and extract bboxes for specific element IDs.
 * Each element can have multiple line segments, so we create one bbox per segment.
 */
export function parseTeiForElements(teiXml: string, elementIds: string[]): BBox[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(teiXml, "text/xml");
  const bboxes: BBox[] = [];
  const elementIdSet = new Set(elementIds);

  // Find elements with xml:id matching our target IDs
  const allElements = doc.querySelectorAll("[*|id]");
  allElements.forEach((el) => {
    const xmlId =
      el.getAttributeNS("http://www.w3.org/XML/1998/namespace", "id") ||
      el.getAttribute("xml:id");
    if (!xmlId || !elementIdSet.has(xmlId)) return;

    const coordsAttr = el.getAttribute("coords");
    if (!coordsAttr) return;

    // coords can have multiple segments separated by ";" (one per line of text)
    const segments = coordsAttr.split(";");
    segments.forEach((segment, index) => {
      const parts = segment.split(",").map(Number);
      if (parts.length >= 5) {
        const [page, x, y, width, height] = parts;
        bboxes.push({
          id: `${xmlId}-${index}`,
          page,
          x,
          y,
          width,
          height,
        });
      }
    });
  });

  return bboxes;
}

/**
 * Parse TEI XML and extract ALL bboxes from the document.
 * Used when loading a paper to avoid re-fetching when switching between nodes.
 */
export function parseAllTeiBboxes(teiXml: string): BBox[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(teiXml, "text/xml");
  const bboxes: BBox[] = [];

  // Find all elements with xml:id that have coords
  const allElements = doc.querySelectorAll("[*|id]");
  allElements.forEach((el) => {
    const xmlId =
      el.getAttributeNS("http://www.w3.org/XML/1998/namespace", "id") ||
      el.getAttribute("xml:id");
    if (!xmlId) return;

    const coordsAttr = el.getAttribute("coords");
    if (!coordsAttr) return;

    // coords can have multiple segments separated by ";" (one per line of text)
    const segments = coordsAttr.split(";");
    segments.forEach((segment, index) => {
      const parts = segment.split(",").map(Number);
      if (parts.length >= 5) {
        const [page, x, y, width, height] = parts;
        bboxes.push({
          id: `${xmlId}-${index}`,
          page,
          x,
          y,
          width,
          height,
        });
      }
    });
  });

  return bboxes;
}
