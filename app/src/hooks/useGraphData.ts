import { useMemo } from "react";
import type { LibraryData } from "@/hooks/useLibrary";
import type { GraphData, Paper, Method } from "@/types/graph";
import { transformLibraryToGraphData } from "@/lib/graph-utils";

interface UseGraphDataResult {
  graphData: GraphData | null;
  papersMap: Map<string, Paper>;
  methodsMap: Map<string, Method>;
}

/**
 * Hook to transform library data into graph data.
 * Memoizes the expensive union-find computation.
 */
export function useGraphData(
  libraryData: LibraryData | undefined
): UseGraphDataResult {
  return useMemo(() => {
    if (!libraryData) {
      return {
        graphData: null,
        papersMap: new Map(),
        methodsMap: new Map(),
      };
    }

    return transformLibraryToGraphData(libraryData);
  }, [libraryData]);
}
