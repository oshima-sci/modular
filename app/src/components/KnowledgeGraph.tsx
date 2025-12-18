import { useEffect, useRef, useState, useMemo } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import type { GraphData, Node, Link, GraphFilterState } from "@/types/graph";
import {
  GRAPH_COLORS,
  getNodeColor,
  getNodeLabelText,
  computeClaimEvidenceCounts,
  computeNeighborNodeIds,
  isContradictionLink,
} from "@/lib/graph-utils";

type GraphRef = ForceGraphMethods<Node, Link>;

// Link distance constants
const DEFAULT_LINK_DISTANCE = 60;
const VARIANT_DISTANCE_MULTIPLIER = 0.05;
const STRONG_PREMISE_DISTANCE_MULTIPLIER = 0.15;
const WEAK_PREMISE_DISTANCE_MULTIPLIER = 1.5;

// Linear interpolation helper
function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

// Extract source/target IDs from a link (handles both string and object forms)
function getLinkEndpoints(link: Link): { src: string; tgt: string } {
  const src = typeof link.source === "object" ? link.source.id : link.source;
  const tgt = typeof link.target === "object" ? link.target.id : link.target;
  return { src: src as string, tgt: tgt as string };
}

// Check if a link matches the given active link
function isActiveLink(link: Link, activeLink: Link | null): boolean {
  if (!activeLink) return false;
  const { src, tgt } = getLinkEndpoints(link);
  const { src: activeSrc, tgt: activeTgt } = getLinkEndpoints(activeLink);
  return src === activeSrc && tgt === activeTgt;
}

// Compute node size based on selected state
function getNodeVal(node: Node, selectedNodeId: string | null): number {
  return selectedNodeId && node.id === selectedNodeId ? 4.5 : 1;
}

// Check if a link is filtered out by the current filter toggles
function isLinkFilteredOut(link: Link, filterState: GraphFilterState): boolean {
  if (link.linkCategory === "claim_to_claim") {
    if (link.linkType === "premise" && !filterState.showPremiseLinks) return true;
    if (link.linkType === "variant" && !filterState.showVariantLinks) return true;
    if (link.linkType === "contradiction" && !filterState.showClaimContradictsLinks) return true;
  } else if (link.linkCategory === "claim_to_observation") {
    if (link.linkType === "supports" && !filterState.showSupportsLinks) return true;
    if (link.linkType === "contradicts" && !filterState.showContradictsLinks) return true;
    if (link.linkType === "contextualizes" && !filterState.showContextualizesLinks) return true;
  }
  return false;
}

// Canvas rendering options for nodes
interface NodeRenderOptions {
  isSelected: boolean;
  isRelated: boolean;
  evidenceCount: number;
}

// Draw evidence badge on claim nodes
function drawEvidenceBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  nodeSize: number,
  count: number
) {
  const label = `${count} EV`;
  const fontSize = 4;
  ctx.font = `bold ${fontSize}px Sans-Serif`;
  const textWidth = ctx.measureText(label).width;

  const paddingX = 3;
  const paddingY = 2;
  const badgeWidth = textWidth + paddingX * 2;
  const badgeHeight = fontSize + paddingY * 2;
  const offsetX = nodeSize * 0.5;
  const offsetY = nodeSize * 0.5;
  const badgeX = x + offsetX;
  const badgeY = y + offsetY - badgeHeight / 2;

  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, badgeHeight / 2);
  ctx.fillStyle = GRAPH_COLORS.badge;
  ctx.fill();

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  ctx.fillText(label, badgeX + paddingX, y + offsetY);
}

// Draw a node on the canvas
function drawNode(
  node: Node,
  ctx: CanvasRenderingContext2D,
  options: NodeRenderOptions
) {
  const nodeSize = options.isSelected ? 9 : 6;

  ctx.globalAlpha = options.isRelated ? 1 : 0.5;
  ctx.fillStyle = options.isRelated ? getNodeColor(node) : GRAPH_COLORS.muted;

  ctx.beginPath();
  ctx.arc(node.x!, node.y!, nodeSize, 0, 2 * Math.PI);
  ctx.fill();

  if (node.type === "claim" && options.evidenceCount > 0) {
    drawEvidenceBadge(ctx, node.x!, node.y!, nodeSize, options.evidenceCount);
  }

  ctx.globalAlpha = 1;
}

// Draw node hit area for pointer events
function drawNodePointerArea(
  node: Node,
  ctx: CanvasRenderingContext2D,
  color: string,
  isSelected: boolean
) {
  const nodeSize = isSelected ? 9 : 6;
  ctx.beginPath();
  ctx.arc(node.x!, node.y!, nodeSize, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
}

interface KnowledgeGraphProps {
  graphData: GraphData | null; // Filtered graph data
  rawGraphData: GraphData | null; // Unfiltered for evidence counts
  selectedNode: Node | null;
  selectedLink: Link | null;
  hoveredLink: Link | null;
  filterState: GraphFilterState;
  contradictionNodeIds: Set<string>;
  onNodeSelect: (node: Node | null) => void;
  onNodeHover: (node: Node | null) => void;
  onLinkSelect: (link: Link | null) => void;
  onLinkHover: (link: Link | null) => void;
  onClearSelection: () => void;
}

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({
  graphData,
  rawGraphData,
  selectedNode,
  selectedLink,
  hoveredLink,
  filterState,
  contradictionNodeIds,
  onNodeSelect,
  onNodeHover,
  onLinkSelect,
  onLinkHover,
  onClearSelection,
}) => {
  const fgRef = useRef<GraphRef | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Track container size
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

  // Compute evidence counts from raw graph data
  const claimEvidenceCounts = useMemo(() => {
    if (!rawGraphData) return new Map<string, number>();
    return computeClaimEvidenceCounts(rawGraphData);
  }, [rawGraphData]);

  // Compute neighbor IDs of selected node
  const neighborNodeIds = useMemo(() => {
    if (!graphData || !selectedNode) return new Set<string>();
    return computeNeighborNodeIds(graphData, selectedNode.id);
  }, [graphData, selectedNode]);

  // Configure link distances
  useEffect(() => {
    if (fgRef.current) {
      const linkForce = fgRef.current.d3Force("link");
      // d3 force link.distance accepts a function with the link as argument
      (linkForce as { distance?: (fn: (link: Link) => number) => void })?.distance?.((link: Link) => {
        if (link.linkType === "variant") {
          return DEFAULT_LINK_DISTANCE * VARIANT_DISTANCE_MULTIPLIER;
        }

        if (
          link.linkType === "premise" &&
          link.linkCategory === "claim_to_claim"
        ) {
          const strength = link.strength;
          if (strength !== null && strength !== undefined) {
            // Stronger links (strength=1) are closer, weaker links (strength=0) are farther
            const multiplier = lerp(WEAK_PREMISE_DISTANCE_MULTIPLIER, STRONG_PREMISE_DISTANCE_MULTIPLIER, strength);
            return DEFAULT_LINK_DISTANCE * multiplier;
          }
        }

        return DEFAULT_LINK_DISTANCE;
      });
    }
  }, [graphData]);

  // Event handlers
  const handleNodeClick = (node: Node) => {
    if (
      filterState.highlightContradictions &&
      !contradictionNodeIds.has(node.id)
    ) {
      return;
    }
    onNodeSelect(node);
    onLinkSelect(null);
  };

  const handleLinkClick = (link: Link) => {
    if (filterState.highlightContradictions && !isContradictionLink(link)) return;
    onLinkSelect(link);
    onNodeSelect(null);
  };

  const handleNodeHover = (node: Node | null) => {
    if (filterState.highlightContradictions && node && !contradictionNodeIds.has(node.id)) return;
    onNodeHover(node);
    if (node) onLinkHover(null);
  };

  const handleLinkHover = (link: Link | null) => {
    if (filterState.highlightContradictions && link && !isContradictionLink(link)) return;
    onLinkHover(link);
    if (link) onNodeHover(null);
  };

  // Single source of truth: is this link visible?
  const linkVisibility = (link: Link): boolean => {
    if (isLinkFilteredOut(link, filterState)) return false;
    if (filterState.highlightContradictions) return isContradictionLink(link);
    if (selectedNode) {
      const { src, tgt } = getLinkEndpoints(link);
      return src === selectedNode.id || tgt === selectedNode.id;
    }
    return true;
  };

  // Link color - only handles colors, visibility is separate
  const linkColor = (link: Link): string => {
    const activeLink = selectedLink || hoveredLink;

    const getBaseColor = () => {
      if (isContradictionLink(link)) return GRAPH_COLORS.contradiction;
      if (link.linkType === "supports") return GRAPH_COLORS.supports;
      return GRAPH_COLORS.default;
    };

    if (isActiveLink(link, activeLink)) return GRAPH_COLORS.active;
    if (activeLink) return GRAPH_COLORS.muted;
    if (selectedNode && link.linkCategory === "claim_to_claim") return GRAPH_COLORS.claim;

    return getBaseColor();
  };

  // Link width function
  const linkWidth = (link: Link): number => {
    const activeLink = selectedLink || hoveredLink;
    const { src, tgt } = getLinkEndpoints(link);

    if (isActiveLink(link, activeLink)) return 3;
    if (filterState.highlightContradictions && isContradictionLink(link)) return 2.5;

    if (filterState.showEvidenceForClaimId && link.linkCategory === "claim_to_observation") {
      if (src === filterState.showEvidenceForClaimId || tgt === filterState.showEvidenceForClaimId) {
        return 2.5;
      }
    }

    if (selectedNode && link.linkCategory === "claim_to_claim") {
      if (src === selectedNode.id || tgt === selectedNode.id) return 2.5;
    }

    return 1;
  };

  // Determine if a node is "related" to current selection/mode
  const getIsRelated = (node: Node): boolean => {
    if (filterState.highlightContradictions) return contradictionNodeIds.has(node.id);
    if (selectedNode) return node.id === selectedNode.id || neighborNodeIds.has(node.id);
    return true;
  };

  const nodeCanvasObject = (node: Node, ctx: CanvasRenderingContext2D) => {
    drawNode(node, ctx, {
      isSelected: selectedNode?.id === node.id,
      isRelated: getIsRelated(node),
      evidenceCount: claimEvidenceCounts.get(node.id) || 0,
    });
  };

  const nodePointerAreaPaint = (node: Node, color: string, ctx: CanvasRenderingContext2D) => {
    drawNodePointerArea(node, ctx, color, selectedNode?.id === node.id);
  };

  if (!graphData) {
    return (
      <div
        ref={containerRef}
        className="h-full flex items-center justify-center"
      >
        <div className="text-lg text-gray-600 font-medium">Loading graph...</div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full w-full">
      <ForceGraph2D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        nodeAutoColorBy="type"
        linkColor={linkColor}
        linkWidth={linkWidth}
        nodeLabel={getNodeLabelText}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onLinkClick={handleLinkClick}
        onLinkHover={handleLinkHover}
        onBackgroundClick={onClearSelection}
        nodeColor={(node: Node) => getNodeColor(node)}
        nodeVal={(node: Node) => getNodeVal(node, selectedNode?.id ?? null)}
        backgroundColor={GRAPH_COLORS.canvas}
        nodeRelSize={6}
        linkDirectionalArrowLength={(link: Link) =>
          link.linkType === "premise" || link.linkType === "contradiction"
            ? 5
            : 0
        }
        linkDirectionalArrowRelPos={1}
        nodeCanvasObject={nodeCanvasObject}
        nodePointerAreaPaint={nodePointerAreaPaint}
        linkVisibility={linkVisibility}
      />
    </div>
  );
};

export default KnowledgeGraph;
