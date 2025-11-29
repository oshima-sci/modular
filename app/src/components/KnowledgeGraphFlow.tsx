import * as React from "react";
import { useEffect, useState, useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node as RFNode,
  type Edge as RFEdge,
  Handle,
  Position,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
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

// Internal node type
interface GraphNode {
  id: string;
  type: "claim" | "observation";
  displayText: string;
  rawContent: any;
  mergedNodeIds?: string[];
  isMerged?: boolean;
}

// Internal link type
interface GraphLink {
  source: string;
  target: string;
  linkType: string;
  linkCategory: string;
  reasoning: string;
}

// d3-force simulation types
interface SimNode extends SimulationNodeDatum {
  id: string;
  type: "claim" | "observation";
  displayText: string;
  rawContent: any;
  mergedNodeIds?: string[];
  isMerged?: boolean;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  linkType: string;
  linkCategory: string;
  reasoning: string;
}

// Link type colors for claim_to_observation
const LINK_TYPE_COLORS: Record<string, string> = {
  supports: "#22c55e",      // green
  contextualizes: "#3b82f6", // blue
  premise: "#a855f7",        // purple
};

// Pie chart ring badge component
const PieRingBadge = ({ linkCounts }: { linkCounts: Record<string, number> }) => {
  const total = Object.values(linkCounts).reduce((sum, n) => sum + n, 0);
  if (total === 0) return null;

  const size = 24;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Calculate segments
  const segments: { color: string; dashArray: string; dashOffset: number }[] = [];
  let offset = 0;

  Object.entries(linkCounts).forEach(([type, count]) => {
    if (count === 0) return;
    const ratio = count / total;
    const length = ratio * circumference;
    segments.push({
      color: LINK_TYPE_COLORS[type] || "#999",
      dashArray: `${length} ${circumference - length}`,
      dashOffset: -offset,
    });
    offset += length;
  });

  return (
    <div className="absolute -bottom-2 -right-2 bg-white rounded-full shadow-md flex items-center justify-center"
         style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute">
        {segments.map((seg, i) => (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeDasharray={seg.dashArray}
            strokeDashoffset={seg.dashOffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ))}
      </svg>
      <span className="text-[8px] font-bold text-gray-700 z-10">{total}</span>
    </div>
  );
};

// Custom node component
const ClaimNode = ({ data, selected }: { data: any; selected: boolean }) => (
  <div className="relative">
    <div
      className={`px-3 py-2 rounded-lg border-2 bg-orange-50 max-w-[200px] text-xs leading-relaxed transition-all ${
        selected ? "border-orange-500 shadow-lg" : "border-orange-200"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-orange-400" />
      <div className="text-orange-800">{data.label}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-orange-400" />
    </div>
    {data.observationLinkCounts && <PieRingBadge linkCounts={data.observationLinkCounts} />}
  </div>
);

const ObservationNode = ({ data, selected }: { data: any; selected: boolean }) => (
  <div
    className={`px-3 py-2 rounded-lg border-2 bg-green-50 max-w-[200px] text-xs leading-relaxed transition-all ${
      selected ? "border-green-500 shadow-lg" : "border-green-200"
    }`}
  >
    <Handle type="target" position={Position.Top} className="!bg-green-400" />
    <div className="text-green-800">{data.label}</div>
    <Handle type="source" position={Position.Bottom} className="!bg-green-400" />
  </div>
);

const nodeTypes = {
  claim: ClaimNode,
  observation: ObservationNode,
};

// Custom edge with hover tooltip
const HoverEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  markerEnd,
}: EdgeProps) => {
  const edgeData = data as { linkType?: string; reasoning?: string } | undefined;
  const [isHovered, setIsHovered] = useState(false);
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <g
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Invisible wider path for easier hover */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ cursor: 'pointer' }}
      />
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={style?.stroke as string || "#aaa"}
        strokeWidth={style?.strokeWidth as number || 1}
        {...(markerEnd ? { markerEnd: String(markerEnd) } : {})}
      />
      {isHovered && edgeData?.reasoning && (
        <EdgeLabelRenderer>
          <div
            className="absolute bg-white/95 backdrop-blur-sm px-3 py-2 rounded-lg shadow-lg border border-gray-200 max-w-[300px] text-xs text-gray-700 leading-relaxed pointer-events-none z-50"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            <div className="font-medium text-gray-500 mb-1 text-[10px] uppercase tracking-wide">
              {edgeData.linkType}
            </div>
            {edgeData.reasoning}
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  );
};

const edgeTypes = {
  hover: HoverEdge,
};

export const KnowledgeGraphFlow: React.FC = () => {
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphLink[] } | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<RFEdge>([]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [panelTab, setPanelTab] = useState<"claims" | "observations">("claims");
  const [showClaims, setShowClaims] = useState<boolean>(true);
  const [showObservations, setShowObservations] = useState<boolean>(false);

  // Load and transform data
  useEffect(() => {
    fetch("/library.json")
      .then((res) => res.json())
      .then((data: LibraryData) => {
        // Transform claims into nodes
        const claimNodes: GraphNode[] = data.data.extracts.claims.map((claim) => ({
          id: claim.id,
          type: "claim" as const,
          displayText: claim.content.rephrased_claim,
          rawContent: claim.content,
        }));

        // Transform observations into nodes
        const observationNodes: GraphNode[] = data.data.extracts.observations.map((obs) => ({
          id: obs.id,
          type: "observation" as const,
          displayText: obs.content.observation_summary,
          rawContent: obs.content,
        }));

        // Build initial node map
        const nodeMap = new Map<string, GraphNode>();
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
        const mergedNodes: GraphNode[] = [];
        const idMapping = new Map<string, string>();

        groups.forEach((memberIds, rootId) => {
          if (memberIds.length === 1) {
            const node = nodeMap.get(memberIds[0])!;
            mergedNodes.push(node);
            idMapping.set(memberIds[0], memberIds[0]);
          } else {
            const representativeNode = nodeMap.get(rootId)!;
            const mergedNode: GraphNode = {
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

        // Transform links
        const nonDuplicateLinks = data.data.links.filter(
          (link) => link.content.link_type !== "duplicate"
        );

        const linksWithRemappedIds: GraphLink[] = nonDuplicateLinks
          .map((link) => ({
            source: idMapping.get(link.from_id) || link.from_id,
            target: idMapping.get(link.to_id) || link.to_id,
            linkType: link.content.link_type,
            linkCategory: link.content.link_category,
            reasoning: link.content.reasoning,
          }))
          .filter((link) => {
            return link.source !== link.target && mergedNodeIds.has(link.source) && mergedNodeIds.has(link.target);
          });

        // Deduplicate links
        const seenLinks = new Set<string>();
        const dedupedLinks: GraphLink[] = [];
        linksWithRemappedIds.forEach((link) => {
          const key = `${link.source}->${link.target}`;
          const reverseKey = `${link.target}->${link.source}`;
          if (!seenLinks.has(key) && !seenLinks.has(reverseKey)) {
            seenLinks.add(key);
            dedupedLinks.push(link);
          }
        });

        console.log(`Loaded ${mergedNodes.length} nodes and ${dedupedLinks.length} links`);

        // Log claim_to_obs link types
        const claimToObsLinkTypes: Record<string, number> = {};
        dedupedLinks
          .filter((l) => l.linkCategory === "claim_to_observation")
          .forEach((l) => {
            claimToObsLinkTypes[l.linkType] = (claimToObsLinkTypes[l.linkType] || 0) + 1;
          });
        console.log("Claim-to-obs link types:", claimToObsLinkTypes);

        setGraphData({ nodes: mergedNodes, links: dedupedLinks });
      })
      .catch((error) => console.error("Error loading library data:", error));
  }, []);

  // Filter data based on visibility toggles
  const filteredData = useMemo(() => {
    if (!graphData) return null;

    const filteredNodes = graphData.nodes.filter((node) => {
      if (node.type === "claim" && !showClaims) return false;
      if (node.type === "observation" && !showObservations) return false;
      return true;
    });

    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredLinks = graphData.links.filter(
      (link) => nodeIds.has(link.source) && nodeIds.has(link.target)
    );

    return { nodes: filteredNodes, links: filteredLinks };
  }, [graphData, showClaims, showObservations]);

  // Run d3-force simulation and convert to React Flow format
  useEffect(() => {
    if (!filteredData || filteredData.nodes.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    // Create simulation nodes
    const simNodes: SimNode[] = filteredData.nodes.map((n) => ({
      ...n,
      x: undefined,
      y: undefined,
    }));

    // Create simulation links
    const simLinks: SimLink[] = filteredData.links.map((l) => ({
      source: l.source,
      target: l.target,
      linkType: l.linkType,
      linkCategory: l.linkCategory,
      reasoning: l.reasoning,
    }));

    // Run simulation
    const simulation = forceSimulation<SimNode>(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance((d) => (d.linkType === "variant" ? 30 : 150))
      )
      .force("charge", forceManyBody().strength(-300))
      .force("center", forceCenter(0, 0))
      .force("collide", forceCollide(50));

    // Run to completion
    simulation.tick(300);
    simulation.stop();

    // Compute observation link counts per claim node (from full graph data, not filtered)
    const observationLinkCountsMap = new Map<string, Record<string, number>>();
    graphData?.links
      .filter((l) => l.linkCategory === "claim_to_observation")
      .forEach((l) => {
        // The claim is the source for claim_to_observation links
        const claimId = l.source;
        if (!observationLinkCountsMap.has(claimId)) {
          observationLinkCountsMap.set(claimId, {});
        }
        const counts = observationLinkCountsMap.get(claimId)!;
        counts[l.linkType] = (counts[l.linkType] || 0) + 1;
      });

    // Convert to React Flow nodes
    const rfNodes: RFNode[] = simNodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: { x: n.x || 0, y: n.y || 0 },
      data: {
        label: n.displayText,
        rawContent: n.rawContent,
        mergedNodeIds: n.mergedNodeIds,
        isMerged: n.isMerged,
        observationLinkCounts: observationLinkCountsMap.get(n.id),
      },
      selected: selectedNode?.id === n.id,
    }));

    // Convert to React Flow edges
    const rfEdges: RFEdge[] = simLinks
      .filter((l) => (l as any).linkType !== "variant")
      .map((l, i) => ({
        id: `e-${i}`,
        source: String(typeof l.source === "object" ? l.source.id : l.source),
        target: String(typeof l.target === "object" ? l.target.id : l.target),
        type: "hover",
        animated: (l as any).linkType === "premise",
        style: { stroke: "#aaa", strokeWidth: 1 },
        data: { linkType: (l as any).linkType, reasoning: (l as any).reasoning },
      }));

    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [filteredData, graphData, selectedNode, setNodes, setEdges]);

  // Handle node click
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: RFNode) => {
      const graphNode = filteredData?.nodes.find((n) => n.id === node.id);
      setSelectedNode(graphNode || null);
    },
    [filteredData]
  );

  // Handle pane click (deselect)
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // Compute lists for panel
  const allClaims = useMemo(() => {
    if (!filteredData) return [];
    return filteredData.nodes.filter((n) => n.type === "claim");
  }, [filteredData]);

  const allObservations = useMemo(() => {
    if (!filteredData) return [];
    return filteredData.nodes.filter((n) => n.type === "observation");
  }, [filteredData]);

  // Compute neighbors of selected node
  const groupedNeighbors = useMemo(() => {
    const grouped = new Map<string, GraphNode[]>();
    if (!filteredData || !selectedNode) return grouped;

    const neighborIds = new Set<string>();
    filteredData.links.forEach((link) => {
      if (link.source === selectedNode.id) neighborIds.add(link.target);
      if (link.target === selectedNode.id) neighborIds.add(link.source);
    });

    neighborIds.forEach((id) => {
      const node = filteredData.nodes.find((n) => n.id === id);
      if (node) {
        const arr = grouped.get(node.type) || [];
        arr.push(node);
        grouped.set(node.type, arr);
      }
    });

    return grouped;
  }, [filteredData, selectedNode]);

  const formatTypeHeading = (type: string): string => {
    switch (type) {
      case "claim":
        return "CLAIMS";
      case "observation":
        return "OBSERVATIONS";
      default:
        return type.toUpperCase();
    }
  };

  const getNodeLabelText = (node: GraphNode): string => {
    return node.displayText || node.id;
  };

  return (
    <div className="relative w-full h-screen bg-gray-50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor={(node) => (node.type === "claim" ? "#f97316" : "#22c55e")}
          maskColor="rgba(248, 250, 252, 0.8)"
        />
      </ReactFlow>

      {/* Floating Panel */}
      <div className="fixed bottom-4 right-4 flex flex-col items-end gap-2">
        {/* Toggle Buttons */}
        <div className="flex flex-col items-end gap-4">
          <motion.div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 font-medium">Claims</span>
            <motion.button
              onClick={() => setShowClaims(!showClaims)}
              className={`w-8 h-8 rounded-full shadow-lg border border-gray-200 flex items-center justify-center ${
                showClaims ? "bg-orange-500" : "bg-white"
              }`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <motion.div className={showClaims ? "text-white" : "text-orange-500"}>●</motion.div>
            </motion.button>
          </motion.div>

          <motion.div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 font-medium">Observations</span>
            <motion.button
              onClick={() => setShowObservations(!showObservations)}
              className={`w-8 h-8 rounded-full shadow-lg border border-gray-200 flex items-center justify-center ${
                showObservations ? "bg-green-600" : "bg-white"
              }`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <motion.div className={showObservations ? "text-white" : "text-green-600"}>●</motion.div>
            </motion.button>
          </motion.div>
        </div>

        <motion.div
          className="w-[28rem] h-[calc(100vh-12rem)] bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
          layout
        >
          <div className="p-4 h-full flex flex-col">
            {/* Header */}
            <motion.button
              className="h-10 flex justify-between items-center w-full px-4 rounded-xl bg-gray-50 hover:bg-gray-100"
              onClick={() => {
                if (selectedNode) {
                  setSelectedNode(null);
                }
              }}
              layout
            >
              <h4 className="text-md font-semibold text-gray-900">
                {selectedNode ? `${getNodeLabelText(selectedNode)}` : "Select a Node"}
              </h4>
              {selectedNode && (
                <span className="text-[10px] font-medium text-gray-500 px-2 py-0.5 bg-gray-100 rounded">
                  {selectedNode.type.toUpperCase()}
                </span>
              )}
            </motion.button>

            {/* Connections or Browsing */}
            {selectedNode ? (
              <AnimatePresence>
                {groupedNeighbors.size > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="h-[200px] mt-4 px-2 overflow-y-auto"
                  >
                    <div className="flex flex-col gap-4">
                      {["observation", "claim"]
                        .filter((t) => groupedNeighbors.has(t))
                        .map((t) => (
                          <div key={t} className="grid grid-cols-[120px_1fr] gap-2">
                            <span className="text-[10px] font-medium text-gray-500 tracking-wider px-2 py-1 bg-gray-100 rounded whitespace-nowrap">
                              {formatTypeHeading(t)}
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {groupedNeighbors.get(t)!.map((n) => (
                                <motion.button
                                  key={n.id}
                                  onClick={() => setSelectedNode(n)}
                                  className={`px-2 py-1 text-xs rounded hover:opacity-80 ${
                                    n.type === "claim"
                                      ? "bg-orange-50 text-orange-600"
                                      : "bg-green-50 text-green-600"
                                  }`}
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                >
                                  {getNodeLabelText(n)}
                                </motion.button>
                              ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            ) : (
              <div className="mt-4 flex-1 overflow-hidden flex flex-col">
                <div className="flex items-center gap-2 px-2">
                  <button
                    onClick={() => setPanelTab("claims")}
                    className={`px-3 py-1.5 text-xs rounded-lg border ${
                      panelTab === "claims"
                        ? "bg-orange-500 text-white border-orange-500"
                        : "bg-white text-orange-700 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    Claims ({allClaims.length})
                  </button>
                  <button
                    onClick={() => setPanelTab("observations")}
                    className={`px-3 py-1.5 text-xs rounded-lg border ${
                      panelTab === "observations"
                        ? "bg-green-600 text-white border-green-600"
                        : "bg-white text-green-700 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    Observations ({allObservations.length})
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-2 mt-2">
                  {(panelTab === "claims" ? allClaims : allObservations).map((n) => (
                    <motion.button
                      key={n.id}
                      onClick={() => setSelectedNode(n)}
                      className={`w-full text-left p-3 text-sm my-1.5 rounded-lg transition-colors ${
                        panelTab === "claims"
                          ? "bg-orange-50 hover:bg-orange-100 text-orange-900"
                          : "bg-green-50 hover:bg-green-100 text-green-900"
                      }`}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      {getNodeLabelText(n)}
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {/* Details */}
            <AnimatePresence>
              {selectedNode && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 mt-4 overflow-hidden flex flex-col"
                  layout
                >
                  <h5 className="sticky top-0 text-[10px] uppercase tracking-widest font-bold text-gray-900 mb-2 px-2 bg-gray-50 py-1">
                    Details
                  </h5>
                  <motion.div className="flex-1 overflow-y-auto px-2">
                    <div className="w-full text-left p-3 text-sm my-1.5 rounded-lg bg-gray-100 text-gray-700 leading-relaxed">
                      {selectedNode.displayText}
                    </div>
                    {selectedNode.rawContent?.reasoning && (
                      <div className="w-full text-left p-3 text-xs my-1.5 rounded-lg bg-gray-50 text-gray-500 leading-relaxed">
                        <span className="font-medium text-gray-600">Reasoning: </span>
                        {selectedNode.rawContent.reasoning}
                      </div>
                    )}
                    {selectedNode.rawContent?.observation_type && (
                      <div className="w-full text-left p-3 text-xs my-1.5 rounded-lg bg-gray-50 text-gray-500 leading-relaxed">
                        <span className="font-medium text-gray-600">Type: </span>
                        {selectedNode.rawContent.observation_type}
                      </div>
                    )}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default KnowledgeGraphFlow;
