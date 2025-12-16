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

    const result = transformLibraryToGraphData(libraryData);

    // Log stats for debugging
    const mergedCount = result.graphData.nodes.filter((n) => n.isMerged).length;
    const totalOriginal =
      libraryData.extracts.claims.length +
      libraryData.extracts.observations.length;
    console.log(
      `Merged ${totalOriginal} nodes into ${result.graphData.nodes.length} (${mergedCount} merged groups)`
    );
    console.log(
      `Links: ${result.graphData.links.length} (after removing duplicates and self-loops)`
    );

    // Log claim link types
    const claimLinkTypes: Record<string, number> = {};
    result.graphData.links
      .filter((l) => l.linkCategory === "claim_to_claim")
      .forEach((l) => {
        claimLinkTypes[l.linkType] = (claimLinkTypes[l.linkType] || 0) + 1;
      });
    console.log("Claim-to-claim link types:", claimLinkTypes);

    return result;
  }, [libraryData]);
}
