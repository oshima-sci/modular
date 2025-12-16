import { useState, useCallback } from "react";
import type { BBox } from "@/components/PdfViewer";
import { getTeiUrl, parseAllTeiBboxes } from "@/lib/graph-utils";

interface UseSourceLoaderResult {
  loading: boolean;
  bboxes: BBox[];
  currentPaperId: string | null;
  highlightedBboxId: string | null;
  setHighlightedBboxId: (id: string | null) => void;
  loadSourceForPaper: (paperId: string, highlightElementId?: string) => Promise<void>;
  clearSource: () => void;
}

/**
 * Hook to manage TEI source loading and bbox extraction.
 * Loads all bboxes for a paper upfront so switching nodes doesn't require refetching.
 */
export function useSourceLoader(): UseSourceLoaderResult {
  const [loading, setLoading] = useState(false);
  const [bboxes, setBboxes] = useState<BBox[]>([]);
  const [currentPaperId, setCurrentPaperId] = useState<string | null>(null);
  const [highlightedBboxId, setHighlightedBboxId] = useState<string | null>(
    null
  );

  const loadSourceForPaper = useCallback(
    async (paperId: string, highlightElementId?: string) => {
      setLoading(true);
      try {
        const teiUrl = getTeiUrl(paperId);
        const res = await fetch(teiUrl);
        if (!res.ok) throw new Error(`Failed to fetch TEI: ${res.statusText}`);

        const teiXml = await res.text();
        const parsedBboxes = parseAllTeiBboxes(teiXml);

        setCurrentPaperId(paperId);
        setBboxes(parsedBboxes);
        setHighlightedBboxId(
          highlightElementId
            ? `${highlightElementId}-0`
            : parsedBboxes.length > 0
              ? parsedBboxes[0].id
              : null
        );

        console.log(
          `Loaded ${parsedBboxes.length} bboxes for paper: ${paperId}`
        );
      } catch (err) {
        console.error("Failed to load source:", err);
        setCurrentPaperId(null);
        setBboxes([]);
        setHighlightedBboxId(null);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const clearSource = useCallback(() => {
    setCurrentPaperId(null);
    setBboxes([]);
    setHighlightedBboxId(null);
  }, []);

  return {
    loading,
    bboxes,
    currentPaperId,
    highlightedBboxId,
    setHighlightedBboxId,
    loadSourceForPaper,
    clearSource,
  };
}
