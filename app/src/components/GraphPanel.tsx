import * as React from "react";
import { useState, useMemo } from "react";
import { KnowledgeGraph } from "./KnowledgeGraph";
import { FilterPanel } from "./FilterPanel";
import type { GraphData, Node, Link, GraphFilterState, GraphCounts } from "@/types/graph";
import {
  computeGraphCounts,
  computeContradictionNodeIds,
  computeEvidenceObservationIds,
  getLinkEndpoints,
} from "@/lib/graph-utils";

interface GraphPanelProps {
  graphData: GraphData | null;
  selectedNode: Node | null;
  selectedLink: Link | null;
  hoveredLink: Link | null;
  showEvidenceForClaimId: string | null;
  showObservations: boolean;
  onNodeSelect: (node: Node | null) => void;
  onNodeHover: (node: Node | null) => void;
  onLinkSelect: (link: Link | null) => void;
  onLinkHover: (link: Link | null) => void;
  onClearSelection: () => void;
  onToggleEvidence: (claimId: string | null) => void;
  onToggleObservations: (show: boolean) => void;
}

export const GraphPanel: React.FC<GraphPanelProps> = ({
  graphData,
  selectedNode,
  selectedLink,
  hoveredLink,
  showEvidenceForClaimId,
  showObservations,
  onNodeSelect,
  onNodeHover,
  onLinkSelect,
  onLinkHover,
  onClearSelection,
  onToggleEvidence,
  onToggleObservations,
}) => {
  // Filter state (local to GraphPanel)
  const [showClaims, setShowClaims] = useState(true);
  const [showPremiseLinks, setShowPremiseLinks] = useState(true);
  const [showVariantLinks] = useState(true);
  const [showClaimContradictsLinks, setShowClaimContradictsLinks] = useState(true);
  const [showSupportsLinks, setShowSupportsLinks] = useState(true);
  const [showContradictsLinks, setShowContradictsLinks] = useState(true);
  const [showContextualizesLinks, setShowContextualizesLinks] = useState(true);
  const [highlightContradictions, setHighlightContradictions] = useState(false);

  // Compute counts
  const counts: GraphCounts = useMemo(() => {
    if (!graphData) {
      return {
        claims: 0,
        observations: 0,
        premiseLinks: 0,
        variantLinks: 0,
        claimContradictsLinks: 0,
        supportsLinks: 0,
        contradictsLinks: 0,
        contextualizesLinks: 0,
      };
    }
    return computeGraphCounts(graphData);
  }, [graphData]);

  // Compute contradiction node IDs
  const contradictionNodeIds = useMemo(() => {
    if (!graphData) return new Set<string>();
    return computeContradictionNodeIds(graphData);
  }, [graphData]);

  // Compute evidence observation IDs for specific claim
  const evidenceObservationIds = useMemo(() => {
    if (!graphData || !showEvidenceForClaimId) return new Set<string>();
    return computeEvidenceObservationIds(graphData, showEvidenceForClaimId);
  }, [graphData, showEvidenceForClaimId]);

  // Filter graph data based on visibility toggles
  const filteredGraphData: GraphData | null = useMemo(() => {
    if (!graphData) return null;

    const filteredNodes = graphData.nodes.filter((node) => {
      if (node.type === "claim" && !showClaims) return false;
      if (node.type === "observation") {
        if (highlightContradictions && contradictionNodeIds.has(node.id)) {
          return true;
        }
        if (showEvidenceForClaimId) {
          return evidenceObservationIds.has(node.id);
        }
        if (!showObservations) return false;
      }
      return true;
    });

    const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));

    const filteredLinks = graphData.links.filter((link) => {
      const { src, tgt } = getLinkEndpoints(link);
      return filteredNodeIds.has(src) && filteredNodeIds.has(tgt);
    });

    return { nodes: filteredNodes, links: filteredLinks };
  }, [
    graphData,
    showClaims,
    showObservations,
    showEvidenceForClaimId,
    evidenceObservationIds,
    highlightContradictions,
    contradictionNodeIds,
  ]);

  const filterState: GraphFilterState = {
    showClaims,
    showObservations,
    showPremiseLinks,
    showVariantLinks,
    showClaimContradictsLinks,
    showSupportsLinks,
    showContradictsLinks,
    showContextualizesLinks,
    highlightContradictions,
    showEvidenceForClaimId,
  };

  // Handle node click - reset evidence landscape if selecting different node
  const handleNodeSelect = (node: Node | null) => {
    onNodeSelect(node);
    if (showEvidenceForClaimId && node && showEvidenceForClaimId !== node.id) {
      onToggleEvidence(null);
    }
  };

  // Handle background click - clear selection and evidence landscape
  const handleClearSelection = () => {
    onClearSelection();
    onToggleEvidence(null);
  };

  return (
    <div className="h-full relative bg-gray-50 overflow-hidden">
      <KnowledgeGraph
        graphData={filteredGraphData}
        rawGraphData={graphData}
        selectedNode={selectedNode}
        selectedLink={selectedLink}
        hoveredLink={hoveredLink}
        filterState={filterState}
        contradictionNodeIds={contradictionNodeIds}
        onNodeSelect={handleNodeSelect}
        onNodeHover={onNodeHover}
        onLinkSelect={onLinkSelect}
        onLinkHover={onLinkHover}
        onClearSelection={handleClearSelection}
      />

      <FilterPanel
        counts={counts}
        showClaims={showClaims}
        showObservations={showObservations}
        showPremiseLinks={showPremiseLinks}
        showClaimContradictsLinks={showClaimContradictsLinks}
        showSupportsLinks={showSupportsLinks}
        showContradictsLinks={showContradictsLinks}
        showContextualizesLinks={showContextualizesLinks}
        highlightContradictions={highlightContradictions}
        onToggleClaims={() => setShowClaims(!showClaims)}
        onToggleObservations={() => onToggleObservations(!showObservations)}
        onTogglePremiseLinks={() => setShowPremiseLinks(!showPremiseLinks)}
        onToggleClaimContradictsLinks={() => setShowClaimContradictsLinks(!showClaimContradictsLinks)}
        onToggleSupportsLinks={() => setShowSupportsLinks(!showSupportsLinks)}
        onToggleContradictsLinks={() => setShowContradictsLinks(!showContradictsLinks)}
        onToggleContextualizesLinks={() => setShowContextualizesLinks(!showContextualizesLinks)}
        onToggleHighlightContradictions={() => setHighlightContradictions(!highlightContradictions)}
        onReset={() => window.location.reload()}
/>
    </div>
  );
};

export default GraphPanel;
