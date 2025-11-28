import * as React from "react";
import { useEffect, useRef, useState, useMemo } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import { motion, AnimatePresence } from "motion/react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import type { LibraryData } from "@/hooks/useLibrary";

// Internal types for display
interface Paper {
  id: string;
  title: string | null;
  filename: string;
  abstract: string | null;
}

interface Method {
  id: string;
  paper_id: string;
  type: "method";
  content: {
    method_summary?: string;
    novel_method?: boolean;
  };
}

// Internal graph types
export interface Node {
  id: string;
  type: "claim" | "observation";
  displayText: string; // rephrased_claim or observation_summary
  rawContent: any; // full content object for details panel
  paperIds: string[]; // paper IDs this node comes from
  sourceElementIds: string[]; // source element IDs
  observationType?: string; // for observations: "statistical result", "computational result", etc.
  methodReference?: string; // for observations: reference to method extract ID
  // For merged duplicate nodes
  mergedNodeIds?: string[]; // IDs of all nodes merged into this one
  isMerged?: boolean; // true if this is a virtual merged node
}

export interface Link {
  source: string | Node;
  target: string | Node;
  linkType: string;
  linkCategory: string;
  reasoning: string;
}

export interface GraphData {
  nodes: Node[];
  links: Link[];
}

// Evidence item for claim details
interface EvidenceItem {
  node: Node;
  linkType: string;
  reasoning: string;
}

interface EvidenceData {
  counts: {
    supports: number;
    contradicts: number;
    contextualizes: number;
    total: number;
  };
  grouped: Map<string, Map<string, EvidenceItem[]>>;
  methodCount: number;
  methodPaperCount: number;
}

// ============ NodeDetails Component ============
interface NodeDetailsProps {
  node: Node;
  papersMap: Map<string, Paper>;
  methodsMap: Map<string, Method>;
  evidenceData: EvidenceData | null;
  onPaperClick?: (paperId: string) => void;
  onViewSource?: (nodeId: string) => void;
}

const NodeDetails: React.FC<NodeDetailsProps> = ({ node, papersMap, methodsMap, evidenceData, onPaperClick, onViewSource }) => {
  return (
    <div className="flex flex-col gap-4">
      {/* Main node text */}
      <div className={`w-full text-left p-3 text-sm rounded-lg leading-relaxed ${
        node.type === 'claim'
          ? 'bg-orange-50 text-orange-900 border border-orange-200'
          : 'bg-green-50 text-green-900 border border-green-200'
      }`}>
        {node.displayText}
      </div>

      {/* Source Papers */}
      <div>
        <h5 className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-2">
          Source {node.paperIds.length > 1 ? 'Papers' : 'Paper'}
        </h5>
        <div className="flex flex-col gap-1">
          {node.paperIds.map((paperId) => {
            const paper = papersMap.get(paperId);
            return (
              <button
                key={paperId}
                onClick={() => onPaperClick?.(paperId)}
                className="text-sm text-gray-700 bg-gray-50 px-2 py-1 rounded text-left hover:bg-blue-50 hover:text-blue-700 transition-colors cursor-pointer flex items-center gap-2"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="truncate">{paper?.title || paperId}</span>
              </button>
            );
          })}
        </div>
        {node.sourceElementIds.length > 0 && (
          <div className="mt-2 text-[10px] text-gray-400">
            Elements: {node.sourceElementIds.join(', ')}
          </div>
        )}
      </div>

      {/* For Claims: Evidence Landscape */}
      {node.type === 'claim' && evidenceData && (
        <>
          {/* Evidence Landscape Stats */}
          <div>
            <h5 className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-2">
              Evidence Landscape
            </h5>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded">
                {evidenceData.counts.total}
              </span>
              {evidenceData.counts.total > 0 && (
                <div className="flex-1 h-2 rounded-full overflow-hidden flex">
                  {evidenceData.counts.supports > 0 && (
                    <div
                      className="bg-green-500 h-full"
                      style={{ width: `${(evidenceData.counts.supports / evidenceData.counts.total) * 100}%` }}
                    />
                  )}
                  {evidenceData.counts.contradicts > 0 && (
                    <div
                      className="bg-red-500 h-full"
                      style={{ width: `${(evidenceData.counts.contradicts / evidenceData.counts.total) * 100}%` }}
                    />
                  )}
                  {evidenceData.counts.contextualizes > 0 && (
                    <div
                      className="bg-gray-400 h-full"
                      style={{ width: `${(evidenceData.counts.contextualizes / evidenceData.counts.total) * 100}%` }}
                    />
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-4 mt-1 text-[10px] text-gray-500">
              {evidenceData.counts.supports > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  {evidenceData.counts.supports} supporting
                </span>
              )}
              {evidenceData.counts.contradicts > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  {evidenceData.counts.contradicts} contradicting
                </span>
              )}
              {evidenceData.counts.contextualizes > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-gray-400" />
                  {evidenceData.counts.contextualizes} context
                </span>
              )}
            </div>
            {evidenceData.methodCount > 0 && (
              <div className="mt-2 text-xs text-gray-500">
                from {evidenceData.methodCount} {evidenceData.methodCount === 1 ? 'method' : 'methods'}
                {evidenceData.methodPaperCount > 0 && (
                  <> across {evidenceData.methodPaperCount} {evidenceData.methodPaperCount === 1 ? 'paper' : 'papers'}</>
                )}
              </div>
            )}
          </div>

          {/* Grouped Evidence */}
          {evidenceData.grouped.size > 0 && (
            <div className="flex flex-col gap-3">
              {Array.from(evidenceData.grouped.entries()).map(([linkType, byMethod]) => (
                <div key={linkType}>
                  <h5 className={`text-[10px] uppercase tracking-widest font-bold mb-2 ${
                    linkType === 'supports' ? 'text-green-600' :
                    linkType === 'contradicts' ? 'text-red-600' : 'text-gray-500'
                  }`}>
                    {linkType === 'supports' ? 'Supporting Evidence' :
                     linkType === 'contradicts' ? 'Contradicting Evidence' : 'Contextual Evidence'}
                  </h5>
                  {Array.from(byMethod.entries()).map(([methodRef, items]) => {
                    const method = methodRef !== 'no_method' ? methodsMap.get(methodRef) : null;
                    return (
                      <div key={methodRef} className="mb-3">
                        <div className="text-xs text-gray-600 mb-1.5 px-1 leading-relaxed">
                          {method?.content.method_summary || 'Unknown method'}
                        </div>
                        <Accordion type="multiple" className="flex flex-col gap-2">
                          {items.map((item) => (
                            <AccordionItem
                              key={item.node.id}
                              value={item.node.id}
                              className="border-0"
                            >
                              {/* Observation card */}
                              <div
                                className={`w-full text-left p-2 text-xs rounded-lg leading-relaxed ${
                                  linkType === 'supports' ? 'bg-green-50 text-green-800 border border-green-200' :
                                  linkType === 'contradicts' ? 'bg-red-50 text-red-800 border border-red-200' :
                                  'bg-gray-50 text-gray-700 border border-gray-200'
                                }`}
                              >
                                <div className="flex items-start gap-2">
                                  <span className="flex-1">{item.node.displayText}</span>
                                  {item.node.observationType && (
                                    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap flex-shrink-0 ${
                                      linkType === 'supports' ? 'bg-green-100 text-green-700' :
                                      linkType === 'contradicts' ? 'bg-red-100 text-red-700' :
                                      'bg-gray-200 text-gray-600'
                                    }`}>
                                      {item.node.observationType}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {/* Actions below the card */}
                              <div className="flex items-center gap-2 py-1 px-1">
                                <AccordionTrigger className="text-[10px] text-gray-500 hover:text-gray-700 hover:no-underline [&>svg]:size-3 py-0">
                                  Reasoning
                                </AccordionTrigger>
                                <button
                                  onClick={() => onViewSource?.(item.node.id)}
                                  className="text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-1"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  View Source
                                </button>
                              </div>
                              <AccordionContent className="px-1 pb-2 pt-0 text-[11px] text-gray-600">
                                {item.reasoning}
                              </AccordionContent>
                            </AccordionItem>
                          ))}
                        </Accordion>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ============ EdgeDetails Component ============
interface EdgeDetailsProps {
  link: Link;
  graphData: GraphData;
}

const EdgeDetails: React.FC<EdgeDetailsProps> = ({ link, graphData }) => {
  const sourceId = typeof link.source === "object" ? link.source.id : link.source;
  const targetId = typeof link.target === "object" ? link.target.id : link.target;

  const sourceNode = graphData.nodes.find((n) => n.id === sourceId);
  const targetNode = graphData.nodes.find((n) => n.id === targetId);

  // For claim_to_observation, show claim first with "To" label, observation second with "From" label
  // (observation supports/contradicts/contextualizes the claim)
  const isClaimToObs = link.linkCategory === "claim_to_observation";
  const firstNode = isClaimToObs ? (sourceNode?.type === 'claim' ? sourceNode : targetNode) : sourceNode;
  const secondNode = isClaimToObs ? (sourceNode?.type === 'observation' ? sourceNode : targetNode) : targetNode;
  const firstLabel = isClaimToObs ? "To" : "From";
  const secondLabel = isClaimToObs ? "From" : "To";

  const getLinkTypeColor = (linkType: string) => {
    switch (linkType) {
      case 'supports': return 'text-green-600 bg-green-100';
      case 'contradicts': return 'text-red-600 bg-red-100';
      case 'premise': return 'text-blue-600 bg-blue-100';
      case 'variant': return 'text-purple-600 bg-purple-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getNodeStyle = (node: Node | undefined) => {
    if (!node) return 'bg-gray-50 text-gray-700 border border-gray-200';
    return node.type === 'claim'
      ? 'bg-orange-50 text-orange-900 border border-orange-200'
      : 'bg-green-50 text-green-900 border border-green-200';
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Link Type Badge */}
      <div className="flex items-center gap-2">
        <span className={`text-xs font-medium px-2 py-1 rounded ${getLinkTypeColor(link.linkType)}`}>
          {link.linkType.toUpperCase()}
        </span>
        <span className="text-xs text-gray-400">
          {link.linkCategory.replace(/_/g, ' ')}
        </span>
      </div>

      {/* First Node (Claim for claim_to_obs, Source otherwise) */}
      <div>
        <h5 className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-2">
          {firstLabel}
        </h5>
        <div className={`w-full text-left p-3 text-sm rounded-lg leading-relaxed ${getNodeStyle(firstNode)}`}>
          <div className="flex items-start gap-2">
            <span className="flex-1">{firstNode?.displayText || sourceId}</span>
            {firstNode && (
              <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap flex-shrink-0 ${
                firstNode.type === 'claim' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
              }`}>
                {firstNode.type.toUpperCase()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Arrow indicator - points up for claim_to_obs (from observation to claim) */}
      <div className="flex justify-center text-gray-400">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {isClaimToObs ? (
            <path d="M12 19V5M5 12l7-7 7 7" />
          ) : (
            <path d="M12 5v14M5 12l7 7 7-7" />
          )}
        </svg>
      </div>

      {/* Second Node (Observation for claim_to_obs, Target otherwise) */}
      <div>
        <h5 className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-2">
          {secondLabel}
        </h5>
        <div className={`w-full text-left p-3 text-sm rounded-lg leading-relaxed ${getNodeStyle(secondNode)}`}>
          <div className="flex items-start gap-2">
            <span className="flex-1">{secondNode?.displayText || targetId}</span>
            {secondNode && (
              <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap flex-shrink-0 ${
                secondNode.type === 'claim' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
              }`}>
                {secondNode.type.toUpperCase()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Reasoning */}
      {link.reasoning && (
        <div>
          <h5 className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-2">
            Reasoning
          </h5>
          <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg leading-relaxed border border-gray-200">
            {link.reasoning}
          </div>
        </div>
      )}
    </div>
  );
};

// ============ Main KnowledgeGraph Component ============
interface KnowledgeGraphProps {
  libraryData: LibraryData | undefined;
  selectedNode: Node | null;
  hoveredNode: Node | null;
  selectedLink: Link | null;
  hoveredLink: Link | null;
  onNodeSelect: (node: Node | null) => void;
  onNodeHover: (node: Node | null) => void;
  onLinkSelect: (link: Link | null) => void;
  onLinkHover: (link: Link | null) => void;
  onClearSelection: () => void;
  onPaperClick?: (paperId: string) => void;
  onViewSource?: (nodeId: string) => void;
}

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({
  libraryData,
  selectedNode,
  hoveredNode,
  selectedLink,
  hoveredLink,
  onNodeSelect,
  onNodeHover,
  onLinkSelect,
  onLinkHover,
  onClearSelection,
  onPaperClick,
  onViewSource,
}) => {
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [showClaims, setShowClaims] = useState<boolean>(true);
  const [showObservations, setShowObservations] = useState<boolean>(false);

  // Track container size for ForceGraph2D
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    updateDimensions();

    const observer = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Store papers and methods maps for lookup
  const [papersMap, setPapersMap] = useState<Map<string, Paper>>(new Map());
  const [methodsMap, setMethodsMap] = useState<Map<string, Method>>(new Map());

  useEffect(() => {
    if (!libraryData) return;

    // Build papers map
    const papers = new Map<string, Paper>();
    libraryData.papers.forEach((p) => papers.set(p.id, p));
    setPapersMap(papers);

    // Build methods map
    const methods = new Map<string, Method>();
    libraryData.extracts.methods?.forEach((m) => methods.set(m.id, {
      id: m.id,
      paper_id: m.paper_id,
      type: "method",
      content: {
        method_summary: m.content.method_summary,
        novel_method: m.content.novel_method,
      },
    }));
    setMethodsMap(methods);

    // Transform claims into nodes
    const claimNodes: Node[] = libraryData.extracts.claims.map((claim) => ({
      id: claim.id,
      type: "claim" as const,
      displayText: claim.content.rephrased_claim || "",
      rawContent: claim.content,
      paperIds: [claim.paper_id],
      sourceElementIds: claim.content.source_elements?.map((s) => s.source_element_id) || [],
    }));

    // Transform observations into nodes
    const observationNodes: Node[] = libraryData.extracts.observations.map((obs) => ({
      id: obs.id,
      type: "observation" as const,
      displayText: obs.content.observation_summary || "",
      rawContent: obs.content,
      paperIds: [obs.paper_id],
      sourceElementIds: obs.content.source_elements?.map((s) => s.source_element_id) || [],
      observationType: obs.content.observation_type,
      methodReference: obs.content.method_reference,
    }));

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
    const idMapping = new Map<string, string>(); // old id -> new merged id

    groups.forEach((memberIds, rootId) => {
      if (memberIds.length === 1) {
        // No merge needed, keep original node
        const node = nodeMap.get(memberIds[0])!;
        mergedNodes.push(node);
        idMapping.set(memberIds[0], memberIds[0]);
      } else {
        // Create merged node - collect all paperIds and sourceElementIds from members
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
      }))
      .filter((link) => {
        const src = link.source as string;
        const tgt = link.target as string;
        // Remove self-loops and ensure both nodes exist
        return src !== tgt && mergedNodeIds.has(src) && mergedNodeIds.has(tgt);
      });

    // Deduplicate links (same source-target pair)
    const linkKey = (l: Link) => {
      const src = typeof l.source === "string" ? l.source : l.source.id;
      const tgt = typeof l.target === "string" ? l.target : l.target.id;
      return `${src}->${tgt}`;
    };
    const seenLinks = new Set<string>();
    const dedupedLinks: Link[] = [];
    linksWithRemappedIds.forEach((link) => {
      const key = linkKey(link);
      const src = typeof link.source === "string" ? link.source : link.source.id;
      const tgt = typeof link.target === "string" ? link.target : link.target.id;
      const reverseKey = `${tgt}->${src}`;
      if (!seenLinks.has(key) && !seenLinks.has(reverseKey)) {
        seenLinks.add(key);
        dedupedLinks.push(link);
      }
    });

    // Log stats
    const mergedCount = mergedNodes.filter((n) => n.isMerged).length;
    const totalOriginal = claimNodes.length + observationNodes.length;
    console.log(`Merged ${totalOriginal} nodes into ${mergedNodes.length} (${mergedCount} merged groups)`);
    console.log(`Links: ${dedupedLinks.length} (after removing duplicates and self-loops)`);

    // Log claim link types
    const claimLinkTypes: Record<string, number> = {};
    dedupedLinks
      .filter((l) => l.linkCategory === "claim_to_claim")
      .forEach((l) => {
        claimLinkTypes[l.linkType] = (claimLinkTypes[l.linkType] || 0) + 1;
      });
    console.log("Claim-to-claim link types:", claimLinkTypes);

    setGraphData({ nodes: mergedNodes, links: dedupedLinks });
  }, [libraryData]);


  const getNodeColor = (node: Node) => {
    if (node.type === "claim") return "#f97316"; // Orange for claims
    if (node.type === "observation") return "#22c55e"; // Green for observations
    return "#aaa";
  };

  // Determine human-friendly label text per node type
  const getNodeLabelText = (node: Node): string => {
    return node.displayText || node.id;
  };

  // Filter nodes based on visibility toggles
  const filteredGraphData: GraphData | null = useMemo(() => {
    if (!graphData) return null;

    const filteredNodes = graphData.nodes.filter((node) => {
      if (node.type === "claim" && !showClaims) return false;
      if (node.type === "observation" && !showObservations) return false;
      return true;
    });

    const filteredLinks = graphData.links.filter((link) => {
      const src = typeof link.source === "object" ? link.source.id : link.source;
      const tgt = typeof link.target === "object" ? link.target.id : link.target;

      // Check if both source and target nodes exist in filtered nodes
      const sourceExists = filteredNodes.some(n => n.id === src);
      const targetExists = filteredNodes.some(n => n.id === tgt);

      return sourceExists && targetExists;
    });

    return { nodes: filteredNodes, links: filteredLinks };
  }, [graphData, showClaims, showObservations]);


  // Compute neighbor IDs of the selected node (using the filtered data).
  const neighborNodeIds = useMemo(() => {
    const neighbors = new Set<string>();
    if (filteredGraphData && selectedNode) {
      filteredGraphData.links.forEach((link) => {
        const src = typeof link.source === "object" ? link.source.id : link.source;
        const tgt = typeof link.target === "object" ? link.target.id : link.target;
        if (src === selectedNode.id) neighbors.add(tgt);
        if (tgt === selectedNode.id) neighbors.add(src);
      });
    }
    return neighbors;
  }, [filteredGraphData, selectedNode]);

  // Compute evidence count for each claim node
  const claimEvidenceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!graphData) return counts;

    graphData.links.forEach((link) => {
      if (link.linkCategory !== "claim_to_observation") return;
      const src = typeof link.source === "object" ? link.source.id : link.source;
      const tgt = typeof link.target === "object" ? link.target.id : link.target;

      // Find which one is the claim
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
  }, [graphData]);

  // The "active" node for the panel: selectedNode takes priority, then hoveredNode
  const panelNode = selectedNode || hoveredNode;
  // The "active" link for the panel: selectedLink takes priority, then hoveredLink
  const panelLink = selectedLink || hoveredLink;

  // For claims: compute evidence landscape and grouped evidence
  const evidenceData = useMemo((): EvidenceData | null => {
    if (!graphData || !panelNode || panelNode.type !== "claim") {
      return null;
    }

    // Find all claim_to_observation links for this claim
    const evidence: EvidenceItem[] = [];
    graphData.links.forEach((link) => {
      if (link.linkCategory !== "claim_to_observation") return;

      const src = typeof link.source === "object" ? link.source.id : link.source;
      const tgt = typeof link.target === "object" ? link.target.id : link.target;

      let obsId: string | null = null;
      if (src === panelNode.id) obsId = tgt;
      else if (tgt === panelNode.id) obsId = src;

      if (obsId) {
        const obsNode = graphData.nodes.find((n) => n.id === obsId);
        if (obsNode && obsNode.type === "observation") {
          evidence.push({
            node: obsNode,
            linkType: link.linkType,
            reasoning: link.reasoning,
          });
        }
      }
    });

    // Count by link type
    const counts = {
      supports: evidence.filter((e) => e.linkType === "supports").length,
      contradicts: evidence.filter((e) => e.linkType === "contradicts").length,
      contextualizes: evidence.filter((e) => e.linkType === "contextualizes").length,
      total: evidence.length,
    };

    // Count unique methods and their source papers across all evidence
    const uniqueMethods = new Set<string>();
    const uniqueMethodPapers = new Set<string>();
    evidence.forEach((e) => {
      if (e.node.methodReference) {
        uniqueMethods.add(e.node.methodReference);
        const method = methodsMap.get(e.node.methodReference);
        if (method?.paper_id) {
          uniqueMethodPapers.add(method.paper_id);
        }
      }
    });
    const methodCount = uniqueMethods.size;
    const methodPaperCount = uniqueMethodPapers.size;

    // Group by linkType then by methodReference
    const grouped: Map<string, Map<string, EvidenceItem[]>> = new Map();
    const linkOrder = ["supports", "contradicts", "contextualizes"];

    linkOrder.forEach((lt) => {
      const itemsOfType = evidence.filter((e) => e.linkType === lt);
      if (itemsOfType.length > 0) {
        const byMethod = new Map<string, EvidenceItem[]>();
        itemsOfType.forEach((item) => {
          const methodRef = item.node.methodReference || "no_method";
          if (!byMethod.has(methodRef)) byMethod.set(methodRef, []);
          byMethod.get(methodRef)!.push(item);
        });
        grouped.set(lt, byMethod);
      }
    });

    return { counts, grouped, methodCount, methodPaperCount };
  }, [graphData, panelNode, methodsMap]);

  // Force a refresh when the selected node or its neighbors change, so that node objects are updated
  useEffect(() => {
    (fgRef.current as any)?.refresh?.();
  }, [selectedNode, neighborNodeIds, selectedLink]);

  // Refresh on hover change to toggle label visibility instantly
  useEffect(() => {
    (fgRef.current as any)?.refresh?.();
  }, [hoveredNode, hoveredLink]);

  // Configure link distances: variant links at 10% of default (30)
  useEffect(() => {
    if (fgRef.current) {
      const DEFAULT_DISTANCE = 30; // d3-force default
      fgRef.current.d3Force('link')?.distance((link: any) => {
        return link.linkType === 'variant' ? DEFAULT_DISTANCE * 0.05 : DEFAULT_DISTANCE;
      });
    }
  }, [filteredGraphData]);

  // Clear link selection when node is selected
  const handleNodeClick = (node: any) => {
    onNodeSelect(node as Node);
    onLinkSelect(null);
  };

  // Clear node selection when link is selected
  const handleLinkClick = (link: any) => {
    onLinkSelect(link as Link);
    onNodeSelect(null);
  };

  const handleBackgroundClick = () => {
    onClearSelection();
  };

  // Determine what to show in panel header
  const getPanelHeaderText = () => {
    if (panelLink) {
      return `${panelLink.linkType} link`;
    }
    if (panelNode) {
      return getNodeLabelText(panelNode);
    }
    return "Hover over a node or edge";
  };

  const getPanelHeaderBadge = () => {
    if (panelLink) {
      return (
        <span className="text-[10px] font-medium px-2 py-0.5 rounded text-blue-600 bg-blue-100">
          EDGE
        </span>
      );
    }
    if (panelNode) {
      return (
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${
          panelNode.type === 'claim'
            ? 'text-orange-600 bg-orange-100'
            : 'text-green-600 bg-green-100'
        }`}>
          {panelNode.type.toUpperCase()}
        </span>
      );
    }
    return null;
  };

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      {/* Graph Canvas */}
      <ResizablePanel defaultSize={65} minSize={30}>
        <div ref={containerRef} className="h-full relative bg-gray-50 overflow-hidden">
          {filteredGraphData ? (
            <ForceGraph2D
              ref={fgRef}
              width={dimensions.width}
              height={dimensions.height}
              graphData={filteredGraphData}
              nodeAutoColorBy="type"
              linkColor={(link: any) => {
                if (link.linkType === "variant") return "transparent";
                const src = typeof link.source === "object" ? link.source.id : link.source;
                const tgt = typeof link.target === "object" ? link.target.id : link.target;

                // Highlight selected/hovered link
                if (selectedLink || hoveredLink) {
                  const activeLink = selectedLink || hoveredLink;
                  const activeSrc = typeof activeLink!.source === "object" ? activeLink!.source.id : activeLink!.source;
                  const activeTgt = typeof activeLink!.target === "object" ? activeLink!.target.id : activeLink!.target;
                  if (src === activeSrc && tgt === activeTgt) return "#3b82f6"; // blue
                  return "#ddd";
                }

                if (selectedNode) {
                  if (src === selectedNode.id || tgt === selectedNode.id) return "#f00";
                  return "#ddd";
                }
                if (link.type === "relationship") return "#1f77b4";
                if (link.type === "references") return "#ff7f0e";
                return "#aaa";
              }}
              linkWidth={(link: any) => {
                const src = typeof link.source === "object" ? link.source.id : link.source;
                const tgt = typeof link.target === "object" ? link.target.id : link.target;

                if (selectedLink || hoveredLink) {
                  const activeLink = selectedLink || hoveredLink;
                  const activeSrc = typeof activeLink!.source === "object" ? activeLink!.source.id : activeLink!.source;
                  const activeTgt = typeof activeLink!.target === "object" ? activeLink!.target.id : activeLink!.target;
                  if (src === activeSrc && tgt === activeTgt) return 3;
                }
                return 1;
              }}
              nodeLabel={selectedNode ? (node: any) => getNodeLabelText(node as Node) : ""}
              onNodeClick={handleNodeClick}
              onNodeHover={(node: any) => {
                onNodeHover(node as Node || null);
                if (node) onLinkHover(null); // Clear link hover when hovering node
              }}
              onLinkClick={handleLinkClick}
              onLinkHover={(link: any) => {
                onLinkHover(link as Link || null);
                if (link) onNodeHover(null); // Clear node hover when hovering link
              }}
              onBackgroundClick={handleBackgroundClick}
              nodeColor={(node: any) => {
                const n = node as Node;
                if (selectedNode) {
                  if (n.id === selectedNode.id || neighborNodeIds.has(n.id)) {
                    return getNodeColor(n);
                  }
                  return "#ddd";
                }
                return getNodeColor(n);
              }}
              nodeVal={(node: any) => {
                const n = node as Node;
                if (selectedNode && n.id === selectedNode.id) {
                  return 4.5; // Selected node is 1.5x larger
                }
                return 1;
              }}
              backgroundColor="#f8fafc"
              nodeRelSize={6}
              linkDirectionalParticles={(link: any) => link.linkType === "premise" ? 1 : 0}
              linkDirectionalParticleWidth={2}
              nodeCanvasObject={(node: any, ctx) => {
                const n = node as Node;
                const nodeSize = selectedNode && n.id === selectedNode.id ? 9 : 6;

                // Determine node color based on selection state
                let color = getNodeColor(n);
                if (selectedNode && n.id !== selectedNode.id && !neighborNodeIds.has(n.id)) {
                  color = "#ddd";
                }

                // Draw main node circle
                ctx.beginPath();
                ctx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI);
                ctx.fillStyle = color;
                ctx.fill();

                // For claim nodes with evidence, draw pill badge
                if (n.type === "claim") {
                  const evidenceCount = claimEvidenceCounts.get(n.id) || 0;
                  if (evidenceCount > 0) {
                    const label = `${evidenceCount} obs`;
                    const fontSize = 4;
                    ctx.font = `bold ${fontSize}px Sans-Serif`;
                    const textWidth = ctx.measureText(label).width;

                    const paddingX = 3;
                    const paddingY = 2;
                    const badgeWidth = textWidth + paddingX * 2;
                    const badgeHeight = fontSize + paddingY * 2;
                    const badgeX = node.x + nodeSize + 2;
                    const badgeY = node.y - badgeHeight / 2;
                    const borderRadius = badgeHeight / 2;

                    // Badge background (pill shape)
                    ctx.beginPath();
                    ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, borderRadius);
                    ctx.fillStyle = "#6b7280"; // gray
                    ctx.fill();

                    // Badge text
                    ctx.textAlign = "left";
                    ctx.textBaseline = "middle";
                    ctx.fillStyle = "#fff";
                    ctx.fillText(label, badgeX + paddingX, node.y);
                  }
                }
              }}
              nodePointerAreaPaint={(node: any, color, ctx) => {
                const n = node as Node;
                const nodeSize = selectedNode && n.id === selectedNode.id ? 9 : 6;
                ctx.beginPath();
                ctx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI);
                ctx.fillStyle = color;
                ctx.fill();
              }}
            />
          ) : (
            <div className="flex items-center justify-center w-full h-full">
              <div className="text-lg text-gray-600 font-medium">Loading graph...</div>
            </div>
          )}
          {/* Reset button */}
          <Button
            variant="outline"
            size="sm"
            className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm"
            onClick={() => window.location.reload()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            Reset Layout
          </Button>
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Right Side Panel */}
      <ResizablePanel defaultSize={35} minSize={20}>
        <div className="h-full bg-white border-l border-gray-200 flex flex-col">
          {/* Toggle Buttons for Node Types */}
          <div className="p-4 border-b border-gray-200 flex gap-4">
            <motion.button
              onClick={() => setShowClaims(!showClaims)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${showClaims ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className={`w-2 h-2 rounded-full ${showClaims ? 'bg-white' : 'bg-orange-500'}`} />
              Claims
            </motion.button>

            <motion.button
              onClick={() => setShowObservations(!showObservations)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${showObservations ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className={`w-2 h-2 rounded-full ${showObservations ? 'bg-white' : 'bg-green-600'}`} />
              Observations
            </motion.button>
          </div>

          <div className="p-4 flex-1 flex flex-col overflow-hidden">
            {/* Header - shows selected or hovered item */}
            <div
              className={`h-10 flex justify-between items-center w-full px-4 rounded-xl ${
                (selectedNode || selectedLink) ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'
              }`}
            >
              <h4 className="text-md font-semibold text-gray-900 truncate">
                {getPanelHeaderText()}
              </h4>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                {getPanelHeaderBadge()}
                {(selectedNode || selectedLink) && (
                  <button
                    onClick={handleBackgroundClick}
                    className="text-[10px] font-medium px-2 py-0.5 rounded text-blue-600 bg-blue-100 hover:bg-blue-200"
                  >
                    PINNED ✕
                  </button>
                )}
              </div>
            </div>

            {/* Panel Content */}
            <AnimatePresence mode="wait">
              {panelLink && graphData ? (
                <motion.div
                  key={`link-${typeof panelLink.source === 'object' ? panelLink.source.id : panelLink.source}-${typeof panelLink.target === 'object' ? panelLink.target.id : panelLink.target}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 mt-4 overflow-y-auto"
                >
                  <EdgeDetails link={panelLink} graphData={graphData} />
                </motion.div>
              ) : panelNode ? (
                <motion.div
                  key={panelNode.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 mt-4 overflow-y-auto"
                >
                  <NodeDetails
                    node={panelNode}
                    papersMap={papersMap}
                    methodsMap={methodsMap}
                    evidenceData={evidenceData}
                    onPaperClick={onPaperClick}
                    onViewSource={onViewSource}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 mt-4 flex items-center justify-center text-gray-400 text-sm"
                >
                  Hover over a node or edge to see details
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};

export default KnowledgeGraph;
