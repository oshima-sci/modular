import type { LibraryData } from "@/hooks/useLibrary";
import type { Node, Link, GraphData, Paper, Method } from "@/types/graph";

/**
 * Transform library data into graph data with merged duplicate nodes.
 * Uses union-find to group duplicates and deduplicates links.
 */
export function transformLibraryToGraphData(libraryData: LibraryData): {
  graphData: GraphData;
  papersMap: Map<string, Paper>;
  methodsMap: Map<string, Method>;
} {
  // Build papers map
  const papersMap = new Map<string, Paper>();
  libraryData.papers.forEach((p) => papersMap.set(p.id, p));

  // Build methods map
  const methodsMap = new Map<string, Method>();
  libraryData.extracts.methods?.forEach((m) =>
    methodsMap.set(m.id, {
      id: m.id,
      paper_id: m.paper_id,
      type: "method",
      content: {
        method_summary: m.content.method_summary,
        novel_method: m.content.novel_method,
      },
    })
  );

  // Transform claims into nodes
  const claimNodes: Node[] = libraryData.extracts.claims.map((claim) => ({
    id: claim.id,
    type: "claim" as const,
    displayText: claim.content.rephrased_claim || "",
    rawContent: claim.content,
    paperIds: [claim.paper_id],
    sourceElementIds:
      claim.content.source_elements?.map((s) => s.source_element_id) || [],
  }));

  // Transform observations into nodes
  const observationNodes: Node[] = libraryData.extracts.observations.map(
    (obs) => ({
      id: obs.id,
      type: "observation" as const,
      displayText: obs.content.observation_summary || "",
      rawContent: obs.content,
      paperIds: [obs.paper_id],
      sourceElementIds:
        obs.content.source_elements?.map((s) => s.source_element_id) || [],
      observationType: obs.content.observation_type,
      methodReference: obs.content.method_reference,
    })
  );

  // Build initial node map
  const nodeMap = new Map<string, Node>();
  [...claimNodes, ...observationNodes].forEach((n) => nodeMap.set(n.id, n));

  // Find duplicate links and build union-find structure for merging
  const duplicateLinks = libraryData.links.filter(
    (link) => link.content.link_type === "duplicate"
  );

  // Union-Find to group duplicates
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    if (!parent.has(id)) parent.set(id, id);
    if (parent.get(id) !== id) {
      parent.set(id, find(parent.get(id)!));
    }
    return parent.get(id)!;
  };
  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent.set(rootB, rootA);
    }
  };

  // Union all duplicate pairs
  duplicateLinks.forEach((link) => {
    if (nodeMap.has(link.from_id) && nodeMap.has(link.to_id)) {
      union(link.from_id, link.to_id);
    }
  });

  // Group nodes by their root
  const groups = new Map<string, string[]>();
  nodeMap.forEach((_, id) => {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(id);
  });

  // Create merged nodes and mapping from old IDs to new IDs
  const mergedNodes: Node[] = [];
  const idMapping = new Map<string, string>();

  groups.forEach((memberIds, rootId) => {
    if (memberIds.length === 1) {
      // No merge needed, keep original node
      const node = nodeMap.get(memberIds[0])!;
      mergedNodes.push(node);
      idMapping.set(memberIds[0], memberIds[0]);
    } else {
      // Create merged node
      const representativeNode = nodeMap.get(rootId)!;
      const allPaperIds = new Set<string>();
      const allSourceElementIds = new Set<string>();
      memberIds.forEach((id) => {
        const n = nodeMap.get(id)!;
        n.paperIds.forEach((pid) => allPaperIds.add(pid));
        n.sourceElementIds.forEach((sid) => allSourceElementIds.add(sid));
      });

      const mergedNode: Node = {
        id: `merged-${rootId}`,
        type: representativeNode.type,
        displayText: representativeNode.displayText,
        rawContent: {
          ...representativeNode.rawContent,
          mergedFrom: memberIds.map((id) => ({
            id,
            displayText: nodeMap.get(id)!.displayText,
            rawContent: nodeMap.get(id)!.rawContent,
          })),
        },
        paperIds: Array.from(allPaperIds),
        sourceElementIds: Array.from(allSourceElementIds),
        observationType: representativeNode.observationType,
        methodReference: representativeNode.methodReference,
        mergedNodeIds: memberIds,
        isMerged: true,
      };
      mergedNodes.push(mergedNode);
      memberIds.forEach((id) => idMapping.set(id, mergedNode.id));
    }
  });

  const mergedNodeIds = new Set(mergedNodes.map((n) => n.id));

  // Transform links, remapping IDs and removing duplicate-type links
  const nonDuplicateLinks = libraryData.links.filter(
    (link) => link.content.link_type !== "duplicate"
  );

  const linksWithRemappedIds: Link[] = nonDuplicateLinks
    .map((link) => ({
      source: idMapping.get(link.from_id) || link.from_id,
      target: idMapping.get(link.to_id) || link.to_id,
      linkType: link.content.link_type,
      linkCategory: link.content.link_category,
      reasoning: link.content.reasoning,
      strength: link.content.strength ?? null,
    }))
    .filter((link) => {
      const src = link.source as string;
      const tgt = link.target as string;
      // Remove self-loops and ensure both nodes exist
      return src !== tgt && mergedNodeIds.has(src) && mergedNodeIds.has(tgt);
    });

  // Deduplicate links (same source-target pair AND same link type)
  const linkKey = (l: Link) => {
    const src = typeof l.source === "string" ? l.source : l.source.id;
    const tgt = typeof l.target === "string" ? l.target : l.target.id;
    return `${src}->${tgt}:${l.linkType}`;
  };
  const seenLinks = new Set<string>();
  const dedupedLinks: Link[] = [];
  linksWithRemappedIds.forEach((link) => {
    const key = linkKey(link);
    const src = typeof link.source === "string" ? link.source : link.source.id;
    const tgt = typeof link.target === "string" ? link.target : link.target.id;
    const reverseKey = `${tgt}->${src}:${link.linkType}`;
    if (!seenLinks.has(key) && !seenLinks.has(reverseKey)) {
      seenLinks.add(key);
      dedupedLinks.push(link);
    }
  });

  return {
    graphData: { nodes: mergedNodes, links: dedupedLinks },
    papersMap,
    methodsMap,
  };
}

/**
 * Check if a link is a contradiction type (either claim-to-claim or claim-to-observation).
 */
export function isContradictionLink(link: Link): boolean {
  return link.linkType === "contradiction" || link.linkType === "contradicts";
}

/**
 * Extract source and target IDs from a link (handles both string and object forms).
 */
export function getLinkEndpoints(link: Link): { src: string; tgt: string } {
  const src = typeof link.source === "object" ? link.source.id : link.source;
  const tgt = typeof link.target === "object" ? link.target.id : link.target;
  return { src: src as string, tgt: tgt as string };
}

/**
 * Graph colors (hex values matching Tailwind palette for canvas rendering).
 * Keep in sync with Tailwind classes used in ElementPanel.tsx.
 */
export const GRAPH_COLORS = {
  // Node types
  claim: "#f97316",        // orange-500 (bg-orange-50, text-orange-900 in UI)
  observation: "#3b82f6",  // blue-500 (bg-blue-50, text-blue-900 in UI)

  // Link types
  contradiction: "#ef4444", // red-500
  supports: "#22c55e",      // green-500
  active: "#3b82f6",        // blue-500 (selected/hovered link)

  // States
  muted: "#ddd",            // inactive when something else is active
  default: "#aaa",          // gray-400, default link color
  badge: "#6b7280",         // gray-500, evidence badge background

  // Background
  canvas: "#f8fafc",        // slate-50
} as const;

/**
 * Get the color for a node based on its type.
 */
export function getNodeColor(node: Node): string {
  if (node.type === "claim") return GRAPH_COLORS.claim;
  if (node.type === "observation") return GRAPH_COLORS.observation;
  return GRAPH_COLORS.default;
}

/**
 * Get display text for a node.
 */
export function getNodeLabelText(node: Node): string {
  return node.displayText || node.id;
}

/**
 * Compute counts for nodes and link types.
 */
export function computeGraphCounts(graphData: GraphData) {
  const claims = graphData.nodes.filter((n) => n.type === "claim").length;
  const observations = graphData.nodes.filter(
    (n) => n.type === "observation"
  ).length;

  let premiseLinks = 0;
  let variantLinks = 0;
  let claimContradictsLinks = 0;
  let supportsLinks = 0;
  let contradictsLinks = 0;
  let contextualizesLinks = 0;

  graphData.links.forEach((link) => {
    if (link.linkCategory === "claim_to_claim") {
      if (link.linkType === "premise") premiseLinks++;
      else if (link.linkType === "variant") variantLinks++;
      else if (link.linkType === "contradiction") claimContradictsLinks++;
    } else if (link.linkCategory === "claim_to_observation") {
      if (link.linkType === "supports") supportsLinks++;
      else if (link.linkType === "contradicts") contradictsLinks++;
      else if (link.linkType === "contextualizes") contextualizesLinks++;
    }
  });

  return {
    claims,
    observations,
    premiseLinks,
    variantLinks,
    claimContradictsLinks,
    supportsLinks,
    contradictsLinks,
    contextualizesLinks,
  };
}

/**
 * Compute evidence count for each claim node.
 */
export function computeClaimEvidenceCounts(
  graphData: GraphData
): Map<string, number> {
  const counts = new Map<string, number>();

  graphData.links.forEach((link) => {
    if (link.linkCategory !== "claim_to_observation") return;
    const src = typeof link.source === "object" ? link.source.id : link.source;
    const tgt = typeof link.target === "object" ? link.target.id : link.target;

    const srcNode = graphData.nodes.find((n) => n.id === src);
    const tgtNode = graphData.nodes.find((n) => n.id === tgt);

    if (srcNode?.type === "claim") {
      counts.set(src, (counts.get(src) || 0) + 1);
    }
    if (tgtNode?.type === "claim") {
      counts.set(tgt, (counts.get(tgt) || 0) + 1);
    }
  });

  return counts;
}

/**
 * Compute node IDs involved in contradiction links.
 */
export function computeContradictionNodeIds(
  graphData: GraphData
): Set<string> {
  const nodeIds = new Set<string>();

  graphData.links.forEach((link) => {
    if (isContradictionLink(link)) {
      const src = typeof link.source === "object" ? link.source.id : link.source;
      const tgt = typeof link.target === "object" ? link.target.id : link.target;
      nodeIds.add(src);
      nodeIds.add(tgt);
    }
  });

  return nodeIds;
}

/**
 * Compute observation IDs linked to a specific claim.
 */
export function computeEvidenceObservationIds(
  graphData: GraphData,
  claimId: string
): Set<string> {
  const obsIds = new Set<string>();

  graphData.links.forEach((link) => {
    if (link.linkCategory !== "claim_to_observation") return;
    const src = typeof link.source === "object" ? link.source.id : link.source;
    const tgt = typeof link.target === "object" ? link.target.id : link.target;

    if (src === claimId) obsIds.add(tgt);
    else if (tgt === claimId) obsIds.add(src);
  });

  return obsIds;
}

/**
 * Compute neighbor IDs of a node.
 */
export function computeNeighborNodeIds(
  graphData: GraphData,
  nodeId: string
): Set<string> {
  const neighbors = new Set<string>();

  graphData.links.forEach((link) => {
    const src = typeof link.source === "object" ? link.source.id : link.source;
    const tgt = typeof link.target === "object" ? link.target.id : link.target;
    if (src === nodeId) neighbors.add(tgt);
    if (tgt === nodeId) neighbors.add(src);
  });

  return neighbors;
}