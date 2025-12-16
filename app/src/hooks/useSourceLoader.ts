import { useState, useCallback } from "react";
import type { BBox } from "@/components/PdfViewer";
import { getTeiUrl, parseTeiForElements } from "@/lib/graph-utils";

interface UseSourceLoaderResult {
  loading: boolean;
  bboxes: BBox[];
  highlightedBboxId: string | null;
  setHighlightedBboxId: (id: string | null) => void;
  loadSourceForElements: (
    paperId: string,
    elementIds: string[],
    highlightElementId?: string
  ) => Promise<void>;
  clearSource: () => void;
}

/**
 * Hook to manage TEI source loading and bbox extraction.
 */
export function useSourceLoader(): UseSourceLoaderResult {
  const [loading, setLoading] = useState(false);
  const [bboxes, setBboxes] = useState<BBox[]>([]);
  const [highlightedBboxId, setHighlightedBboxId] = useState<string | null>(
    null
  );

  const loadSourceForElements = useCallback(
    async (
      paperId: string,
      elementIds: string[],
      highlightElementId?: string
    ) => {
      setLoading(true);
      try {
        const teiUrl = getTeiUrl(paperId);
        const res = await fetch(teiUrl);
        if (!res.ok) throw new Error(`Failed to fetch TEI: ${res.statusText}`);

        const teiXml = await res.text();
        const parsedBboxes = parseTeiForElements(teiXml, elementIds);

        setBboxes(parsedBboxes);
        setHighlightedBboxId(
          highlightElementId ||
            (parsedBboxes.length > 0 ? parsedBboxes[0].id : null)
        );

        console.log(
          `Loaded ${parsedBboxes.length} bboxes for elements: ${elementIds.join(", ")}`
        );
      } catch (err) {
        console.error("Failed to load source:", err);
        setBboxes([]);
        setHighlightedBboxId(null);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const clearSource = useCallback(() => {
    setBboxes([]);
    setHighlightedBboxId(null);
  }, []);

  return {
    loading,
    bboxes,
    highlightedBboxId,
    setHighlightedBboxId,
    loadSourceForElements,
    clearSource,
  };
}
