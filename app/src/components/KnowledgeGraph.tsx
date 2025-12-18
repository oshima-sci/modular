import { useEffect, useRef, useState, useMemo } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import type { GraphData, Node, Link, GraphFilterState } from "@/types/graph";

type GraphRef = ForceGraphMethods<Node, Link>;
import {
  getNodeColor,
  getNodeLabelText,
  computeClaimEvidenceCounts,
  computeNeighborNodeIds,
} from "@/lib/graph-utils";

// Link distance constants
const DEFAULT_LINK_DISTANCE = 60;
const VARIANT_DISTANCE_MULTIPLIER = 0.05;
const STRONG_PREMISE_DISTANCE_MULTIPLIER = 0.15;
const WEAK_PREMISE_DISTANCE_MULTIPLIER = 1.5;

interface KnowledgeGraphProps {
  graphData: GraphData | null; // Filtered graph data
  rawGraphData: GraphData | null; // Unfiltered for evidence counts
  selectedNode: Node | null;
  hoveredNode: Node | null;
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
            const multiplier =
              STRONG_PREMISE_DISTANCE_MULTIPLIER +
              (1 - strength) *
                (WEAK_PREMISE_DISTANCE_MULTIPLIER -
                  STRONG_PREMISE_DISTANCE_MULTIPLIER);
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
    if (
      filterState.highlightContradictions &&
      link.linkType !== "contradiction" &&
      link.linkType !== "contradicts"
    ) {
      return;
    }
    onLinkSelect(link);
    onNodeSelect(null);
  };

  const handleNodeHover = (node: Node | null) => {
    if (
      filterState.highlightContradictions &&
      node &&
      !contradictionNodeIds.has(node.id)
    ) {
      return;
    }
    onNodeHover(node);
    if (node) onLinkHover(null);
  };

  const handleLinkHover = (link: Link | null) => {
    if (
      filterState.highlightContradictions &&
      link &&
      link.linkType !== "contradiction" &&
      link.linkType !== "contradicts"
    ) {
      return;
    }
    onLinkHover(link);
    if (link) onNodeHover(null);
  };

  // Link color function
  const linkColor = (link: Link) => {
    // Check if link type is hidden
    if (link.linkCategory === "claim_to_claim") {
      if (link.linkType === "premise" && !filterState.showPremiseLinks)
        return "transparent";
      if (link.linkType === "variant" && !filterState.showVariantLinks)
        return "transparent";
      if (
        link.linkType === "contradiction" &&
        !filterState.showClaimContradictsLinks
      )
        return "transparent";
    } else if (link.linkCategory === "claim_to_observation") {
      if (link.linkType === "supports" && !filterState.showSupportsLinks)
        return "transparent";
      if (link.linkType === "contradicts" && !filterState.showContradictsLinks)
        return "transparent";
      if (
        link.linkType === "contextualizes" &&
        !filterState.showContextualizesLinks
      )
        return "transparent";
    }

    const src = typeof link.source === "object" ? link.source.id : link.source;
    const tgt = typeof link.target === "object" ? link.target.id : link.target;
    const isContradictionLink =
      link.linkType === "contradiction" || link.linkType === "contradicts";

    const getDefaultLinkColor = () => {
      if (isContradictionLink) return "#ef4444";
      if (link.linkType === "supports") return "#22c55e";
      return "#aaa";
    };

    // Highlight contradictions mode
    if (filterState.highlightContradictions) {
      if (!isContradictionLink) return "transparent";

      if (selectedLink || hoveredLink) {
        const activeLink = selectedLink || hoveredLink;
        const activeSrc =
          typeof activeLink!.source === "object"
            ? activeLink!.source.id
            : activeLink!.source;
        const activeTgt =
          typeof activeLink!.target === "object"
            ? activeLink!.target.id
            : activeLink!.target;
        if (src === activeSrc && tgt === activeTgt) return "#3b82f6";
      }
      return "#ef4444";
    }

    // Normal mode: highlight selected/hovered link
    if (selectedLink || hoveredLink) {
      const activeLink = selectedLink || hoveredLink;
      const activeSrc =
        typeof activeLink!.source === "object"
          ? activeLink!.source.id
          : activeLink!.source;
      const activeTgt =
        typeof activeLink!.target === "object"
          ? activeLink!.target.id
          : activeLink!.target;
      if (src === activeSrc && tgt === activeTgt) return "#3b82f6";
      // If a node is selected, hide links outside its neighborhood
      if (selectedNode && src !== selectedNode.id && tgt !== selectedNode.id) {
        return "transparent";
      }
      return "#ddd";
    }

    if (selectedNode) {
      if (src === selectedNode.id || tgt === selectedNode.id) {
        if (link.linkCategory === "claim_to_claim") return "#f97316";
        return getDefaultLinkColor();
      }
      return "transparent";
    }

    return getDefaultLinkColor();
  };

  // Link width function
  const linkWidth = (link: Link) => {
    const src = typeof link.source === "object" ? link.source.id : link.source;
    const tgt = typeof link.target === "object" ? link.target.id : link.target;

    if (selectedLink || hoveredLink) {
      const activeLink = selectedLink || hoveredLink;
      const activeSrc =
        typeof activeLink!.source === "object"
          ? activeLink!.source.id
          : activeLink!.source;
      const activeTgt =
        typeof activeLink!.target === "object"
          ? activeLink!.target.id
          : activeLink!.target;
      if (src === activeSrc && tgt === activeTgt) return 3;
    }

    if (
      filterState.highlightContradictions &&
      (link.linkType === "contradiction" || link.linkType === "contradicts")
    ) {
      return 2.5;
    }

    if (
      filterState.showEvidenceForClaimId &&
      link.linkCategory === "claim_to_observation"
    ) {
      if (
        src === filterState.showEvidenceForClaimId ||
        tgt === filterState.showEvidenceForClaimId
      )
        return 2.5;
    }

    if (selectedNode && link.linkCategory === "claim_to_claim") {
      if (src === selectedNode.id || tgt === selectedNode.id) return 2.5;
    }

    return 1;
  };

  // Node canvas rendering
  const nodeCanvasObject = (node: Node, ctx: CanvasRenderingContext2D) => {
    const nodeSize = selectedNode && node.id === selectedNode.id ? 9 : 6;

    let isRelated = true;
    if (filterState.highlightContradictions) {
      isRelated = contradictionNodeIds.has(node.id);
    } else if (selectedNode) {
      isRelated = node.id === selectedNode.id || neighborNodeIds.has(node.id);
    }

    ctx.globalAlpha = isRelated ? 1 : 0.5;
    const color = isRelated ? getNodeColor(node) : "#ddd";

    // Draw main node circle
    ctx.beginPath();
    ctx.arc(node.x!, node.y!, nodeSize, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();

    // For claim nodes with evidence, draw pill badge
    if (node.type === "claim") {
      const evidenceCount = claimEvidenceCounts.get(node.id) || 0;
      if (evidenceCount > 0) {
        const label = `${evidenceCount} EV`;
        const fontSize = 4;
        ctx.font = `bold ${fontSize}px Sans-Serif`;
        const textWidth = ctx.measureText(label).width;

        const paddingX = 3;
        const paddingY = 2;
        const badgeWidth = textWidth + paddingX * 2;
        const badgeHeight = fontSize + paddingY * 2;
        const offsetX = nodeSize * 0.5;
        const offsetY = nodeSize * 0.5;
        const badgeX = node.x! + offsetX;
        const badgeY = node.y! + offsetY - badgeHeight / 2;
        const borderRadius = badgeHeight / 2;

        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, borderRadius);
        ctx.fillStyle = "#6b7280";
        ctx.fill();

        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#fff";
        ctx.fillText(label, badgeX + paddingX, node.y! + offsetY);
      }
    }

    ctx.globalAlpha = 1;
  };

  // Node pointer area
  const nodePointerAreaPaint = (
    node: Node,
    color: string,
    ctx: CanvasRenderingContext2D
  ) => {
    const nodeSize = selectedNode && node.id === selectedNode.id ? 9 : 6;
    ctx.beginPath();
    ctx.arc(node.x!, node.y!, nodeSize, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  };

  // Link pointer area
  const linkPointerAreaPaint = (
    link: Link,
    invisibleColor: string,
    ctx: CanvasRenderingContext2D
  ) => {
    // Don't paint pointer area for hidden link types
    if (link.linkCategory === "claim_to_claim") {
      if (link.linkType === "premise" && !filterState.showPremiseLinks) return;
      if (link.linkType === "variant" && !filterState.showVariantLinks) return;
      if (
        link.linkType === "contradiction" &&
        !filterState.showClaimContradictsLinks
      )
        return;
    } else if (link.linkCategory === "claim_to_observation") {
      if (link.linkType === "supports" && !filterState.showSupportsLinks)
        return;
      if (link.linkType === "contradicts" && !filterState.showContradictsLinks)
        return;
      if (
        link.linkType === "contextualizes" &&
        !filterState.showContextualizesLinks
      )
        return;
    }

    // Don't paint pointer area for links outside selected neighborhood
    if (selectedNode) {
      const src = typeof link.source === "object" ? link.source.id : link.source;
      const tgt = typeof link.target === "object" ? link.target.id : link.target;
      const srcInNeighborhood = src === selectedNode.id || neighborNodeIds.has(src as string);
      const tgtInNeighborhood = tgt === selectedNode.id || neighborNodeIds.has(tgt as string);
      // Only paint if both ends are in the neighborhood AND at least one is the selected node
      if (!(srcInNeighborhood && tgtInNeighborhood && (src === selectedNode.id || tgt === selectedNode.id))) return;
    }

    const start = link.source;
    const end = link.target;
    if (typeof start !== "object" || typeof end !== "object") return;
    if (start.x === undefined || start.y === undefined) return;
    if (end.x === undefined || end.y === undefined) return;

    ctx.strokeStyle = invisibleColor;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
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
        nodeLabel={selectedNode ? (node: Node) => getNodeLabelText(node) : ""}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onLinkClick={handleLinkClick}
        onLinkHover={handleLinkHover}
        onBackgroundClick={onClearSelection}
        nodeColor={(node: Node) => getNodeColor(node)}
        nodeVal={(node: Node) => {
          if (selectedNode && node.id === selectedNode.id) {
            return 4.5;
          }
          return 1;
        }}
        backgroundColor="#f8fafc"
        nodeRelSize={6}
        linkDirectionalArrowLength={(link: Link) =>
          link.linkType === "premise" || link.linkType === "contradiction"
            ? 5
            : 0
        }
        linkDirectionalArrowRelPos={1}
        nodeCanvasObject={nodeCanvasObject}
        nodePointerAreaPaint={nodePointerAreaPaint}
        linkPointerAreaPaint={linkPointerAreaPaint}
      />
    </div>
  );
};

export default KnowledgeGraph;
