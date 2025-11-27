import * as React from "react";
import { useEffect, useRef, useState, useMemo } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import { motion, AnimatePresence } from "motion/react";

// Raw library.json types
interface LibraryData {
  data: {
    papers: Array<{
      id: string;
      title: string;
      filename: string;
      abstract: string | null;
    }>;
    extracts: {
      claims: Array<{
        id: string;
        paper_id: string;
        type: "claim";
        content: {
          rephrased_claim: string;
          reasoning: string;
        };
      }>;
      observations: Array<{
        id: string;
        paper_id: string;
        type: "observation";
        content: {
          observation_summary: string;
          observation_type: string;
        };
      }>;
    };
    links: Array<{
      id: string;
      from_id: string;
      to_id: string;
      content: {
        link_type: string;
        link_category: string;
        reasoning: string;
      };
    }>;
  };
}

// Internal graph types
interface Node {
  id: string;
  type: "claim" | "observation";
  displayText: string; // rephrased_claim or observation_summary
  rawContent: any; // full content object for details panel
  // For merged duplicate nodes
  mergedNodeIds?: string[]; // IDs of all nodes merged into this one
  isMerged?: boolean; // true if this is a virtual merged node
}

interface Link {
  source: string | Node;
  target: string | Node;
  linkType: string;
  linkCategory: string;
  reasoning: string;
}

interface GraphData {
  nodes: Node[];
  links: Link[];
}

export const KnowledgeGraph: React.FC = () => {
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [showClaims, setShowClaims] = useState<boolean>(true);
  const [showObservations, setShowObservations] = useState<boolean>(false);

  useEffect(() => {
    fetch("/library.json")
      .then((res) => res.json())
      .then((data: LibraryData) => {
        // Transform claims into nodes
        const claimNodes: Node[] = data.data.extracts.claims.map((claim) => ({
          id: claim.id,
          type: "claim" as const,
          displayText: claim.content.rephrased_claim,
          rawContent: claim.content,
        }));

        // Transform observations into nodes
        const observationNodes: Node[] = data.data.extracts.observations.map((obs) => ({
          id: obs.id,
          type: "observation" as const,
          displayText: obs.content.observation_summary,
          rawContent: obs.content,
        }));

        // Build initial node map
        const nodeMap = new Map<string, Node>();
        [...claimNodes, ...observationNodes].forEach((n) => nodeMap.set(n.id, n));

        // Find duplicate links and build union-find structure for merging
        const duplicateLinks = data.data.links.filter(
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
            // Create merged node
            const representativeNode = nodeMap.get(rootId)!;
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
              mergedNodeIds: memberIds,
              isMerged: true,
            };
            mergedNodes.push(mergedNode);
            memberIds.forEach((id) => idMapping.set(id, mergedNode.id));
          }
        });

        const mergedNodeIds = new Set(mergedNodes.map((n) => n.id));

        // Transform links, remapping IDs and removing duplicate-type links
        const nonDuplicateLinks = data.data.links.filter(
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
      })
      .catch((error) => console.error("Error loading library data:", error));
  }, []);


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

  // The "active" node for the panel: selectedNode takes priority, then hoveredNode
  const panelNode = selectedNode || hoveredNode;

  // Group neighbors of the panel node by type (uses full graphData so hidden nodes still show in panel)
  const panelGroupedNeighbors = useMemo(() => {
    const grouped = new Map<string, Node[]>();
    if (!graphData || !panelNode) return grouped;

    const neighbors = new Map<string, Node>();
    graphData.links.forEach((link) => {
      const src = typeof link.source === "object" ? link.source.id : link.source;
      const tgt = typeof link.target === "object" ? link.target.id : link.target;
      if (src === panelNode.id) {
        const n = graphData.nodes.find((x) => x.id === tgt);
        if (n) neighbors.set(n.id, n);
      } else if (tgt === panelNode.id) {
        const n = graphData.nodes.find((x) => x.id === src);
        if (n) neighbors.set(n.id, n);
      }
    });

    neighbors.forEach((n) => {
      const arr = grouped.get(n.type) || [];
      arr.push(n);
      grouped.set(n.type, arr);
    });

    return grouped;
  }, [graphData, panelNode]);

  // Helper to format type headings
  const formatTypeHeading = (type: string): string => {
    switch (type) {
      case "claim": return "CLAIMS";
      case "observation": return "OBSERVATIONS";
      default: return type.toUpperCase();
    }
  };

  // Force a refresh when the selected node or its neighbors change, so that node objects are updated
  useEffect(() => {
    (fgRef.current as any)?.refresh?.();
  }, [selectedNode, neighborNodeIds]);

  // Refresh on hover change to toggle label visibility instantly
  useEffect(() => {
    (fgRef.current as any)?.refresh?.();
  }, [hoveredNode]);

  // Configure link distances: variant links at 10% of default (30)
  useEffect(() => {
    if (fgRef.current) {
      const DEFAULT_DISTANCE = 30; // d3-force default
      fgRef.current.d3Force('link')?.distance((link: any) => {
        return link.linkType === 'variant' ? DEFAULT_DISTANCE * 0.05 : DEFAULT_DISTANCE;
      });
    }
  }, [filteredGraphData]);

  return (
    <div className="relative w-full h-screen bg-gray-50">
      {filteredGraphData ? (
        <ForceGraph2D
          ref={fgRef}
          graphData={filteredGraphData}
          nodeAutoColorBy="type"
          linkColor={(link: any) => {
            if (link.linkType === "variant") return "transparent";
            const src = typeof link.source === "object" ? link.source.id : link.source;
            const tgt = typeof link.target === "object" ? link.target.id : link.target;
            if (selectedNode) {
              if (src === selectedNode.id || tgt === selectedNode.id) return "#f00";
              return "#ddd";
            }
            if (link.type === "relationship") return "#1f77b4";
            if (link.type === "references") return "#ff7f0e";
            return "#aaa";
          }}
          nodeLabel={selectedNode ? (node: any) => getNodeLabelText(node as Node) : ""}
          onNodeClick={(node: any) => setSelectedNode(node as Node)}
          onNodeHover={(node: any) => {
            setHoveredNode(node as Node || null);
          }}
          onBackgroundClick={() => setSelectedNode(null)}
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
          linkWidth={1}
          nodeRelSize={6}
          linkDirectionalParticles={(link: any) => link.linkType === "premise" ? 1 : 0}
          linkDirectionalParticleWidth={2}
        />
      ) : (
        <div className="flex items-center justify-center w-full h-full">
          <div className="text-lg text-gray-600 font-medium">Loading graph...</div>
        </div>
      )}

      {/* Floating Panel for Claims / Observations */}
      <div className="fixed bottom-4 right-4 flex flex-col items-end gap-2">
        {/* Toggle Buttons for Node Types */}
        <div className="flex flex-col items-end gap-4">
          <motion.div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 font-medium">Claims</span>
            <motion.button
              onClick={() => setShowClaims(!showClaims)}
              className={`w-8 h-8 rounded-full shadow-lg border border-gray-200 flex items-center justify-center
                ${showClaims ? 'bg-orange-500' : 'bg-white'}`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <motion.div className={showClaims ? 'text-white' : 'text-orange-500'}>
                ●
              </motion.div>
            </motion.button>
          </motion.div>

          <motion.div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 font-medium">Observations</span>
            <motion.button
              onClick={() => setShowObservations(!showObservations)}
              className={`w-8 h-8 rounded-full shadow-lg border border-gray-200 flex items-center justify-center
                ${showObservations ? 'bg-green-600' : 'bg-white'}`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <motion.div className={showObservations ? 'text-white' : 'text-green-600'}>
                ●
              </motion.div>
            </motion.button>
          </motion.div>
        </div>

        <motion.div
          className="w-[28rem] h-[calc(100vh-12rem)] bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
          layout
        >
          <div className="p-4 h-full flex flex-col">
            {/* Header - shows selected or hovered node */}
            <div
              className={`h-10 flex justify-between items-center w-full px-4 rounded-xl ${
                selectedNode ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'
              }`}
            >
              <h4 className="text-md font-semibold text-gray-900 truncate">
                {panelNode
                  ? getNodeLabelText(panelNode)
                  : "Hover over a node"}
              </h4>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                {panelNode && (
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                    panelNode.type === 'claim'
                      ? 'text-orange-600 bg-orange-100'
                      : 'text-green-600 bg-green-100'
                  }`}>
                    {panelNode.type.toUpperCase()}
                  </span>
                )}
                {selectedNode && (
                  <button
                    onClick={() => setSelectedNode(null)}
                    className="text-[10px] font-medium px-2 py-0.5 rounded text-blue-600 bg-blue-100 hover:bg-blue-200"
                  >
                    PINNED ✕
                  </button>
                )}
              </div>
            </div>

            {/* Panel Node Content */}
            <AnimatePresence mode="wait">
              {panelNode ? (
                <motion.div
                  key={panelNode.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 mt-4 overflow-hidden flex flex-col"
                >
                  {/* Main node text */}
                  <div className={`w-full text-left p-3 text-sm rounded-lg leading-relaxed ${
                    panelNode.type === 'claim'
                      ? 'bg-orange-50 text-orange-900 border border-orange-200'
                      : 'bg-green-50 text-green-900 border border-green-200'
                  }`}>
                    {panelNode.displayText}
                  </div>

                  {/* Linked nodes */}
                  {panelGroupedNeighbors.size > 0 && (
                    <div className="mt-4 flex-1 overflow-y-auto">
                      {(() => {
                        const order = panelNode.type === 'claim'
                          ? ['observation', 'claim']
                          : ['claim', 'observation'];
                        return order
                          .filter((t) => panelGroupedNeighbors.has(t))
                          .map((t) => (
                            <div key={t} className="mb-4">
                              <h5 className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-2 px-1">
                                Linked {formatTypeHeading(t)}
                              </h5>
                              <div className="flex flex-col gap-2">
                                {panelGroupedNeighbors.get(t)!.map((n) => (
                                  <div
                                    key={n.id}
                                    className={`w-full text-left p-3 text-sm rounded-lg leading-relaxed ${
                                      n.type === 'claim'
                                        ? 'bg-orange-50 text-orange-800'
                                        : 'bg-green-50 text-green-800'
                                    }`}
                                  >
                                    {getNodeLabelText(n)}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ));
                      })()}
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 mt-4 flex items-center justify-center text-gray-400 text-sm"
                >
                  Hover over a node to see its details and connections
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default KnowledgeGraph;