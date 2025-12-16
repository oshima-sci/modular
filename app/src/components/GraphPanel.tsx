import * as React from "react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { KnowledgeGraph } from "./KnowledgeGraph";
import type { GraphData, Node, Link, GraphFilterState, GraphCounts } from "@/types/graph";
import {
  computeGraphCounts,
  computeContradictionNodeIds,
  computeEvidenceObservationIds,
} from "@/lib/graph-utils";

interface GraphPanelProps {
  graphData: GraphData | null;
  selectedNode: Node | null;
  hoveredNode: Node | null;
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
  hoveredNode,
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
      const src = typeof link.source === "object" ? link.source.id : link.source;
      const tgt = typeof link.target === "object" ? link.target.id : link.target;
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
        hoveredNode={hoveredNode}
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

      {/* Filter panel */}
      <div className="absolute bottom-4 left-4 flex flex-col gap-3 bg-white rounded-lg p-4 shadow-lg border border-gray-200 min-w-[220px]">
        {/* Header with counts */}
        <div className="text-sm text-gray-600">
          {counts.claims} claims and {counts.observations} evidence Nodes
        </div>

        {/* Highlight contradictions button */}
        {counts.claimContradictsLinks + counts.contradictsLinks > 0 && (
          <Button
            size="sm"
            variant={highlightContradictions ? "default" : "destructive"}
            onClick={() => setHighlightContradictions(!highlightContradictions)}
            className="w-full"
          >
            {highlightContradictions
              ? "Highlighting Contradictions"
              : "Highlight Contradictions"}{" "}
            ({counts.claimContradictsLinks + counts.contradictsLinks})
          </Button>
        )}

        {/* Filter section */}
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium text-gray-700">
            Filter your graph
          </div>

          {/* Claims checkbox */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showClaims}
              onChange={() => setShowClaims(!showClaims)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              Claims ({counts.claims})
            </span>
          </label>

          {/* Claims sub-options */}
          <div className="ml-6 flex flex-col gap-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showPremiseLinks}
                onChange={() => setShowPremiseLinks(!showPremiseLinks)}
                disabled={!showClaims || highlightContradictions}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
              />
              <span
                className={`text-sm ${!showClaims || highlightContradictions ? "text-gray-400" : "text-gray-600"}`}
              >
                Premise connections ({counts.premiseLinks})
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showClaimContradictsLinks}
                onChange={() =>
                  setShowClaimContradictsLinks(!showClaimContradictsLinks)
                }
                disabled={!showClaims || highlightContradictions}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
              />
              <span
                className={`text-sm ${!showClaims || highlightContradictions ? "text-gray-400" : "text-gray-600"}`}
              >
                Contradiction connections ({counts.claimContradictsLinks})
              </span>
            </label>
          </div>

          {/* Evidence checkbox */}
          <label className="flex items-center gap-2 cursor-pointer mt-2">
            <input
              type="checkbox"
              checked={showObservations}
              onChange={() => onToggleObservations(!showObservations)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              Evidence ({counts.observations})
            </span>
          </label>

          {/* Evidence sub-options */}
          <div className="ml-6 flex flex-col gap-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showSupportsLinks}
                onChange={() => setShowSupportsLinks(!showSupportsLinks)}
                disabled={!showObservations || highlightContradictions}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
              />
              <span
                className={`text-sm ${!showObservations || highlightContradictions ? "text-gray-400" : "text-gray-600"}`}
              >
                Supports ({counts.supportsLinks})
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showContradictsLinks}
                onChange={() => setShowContradictsLinks(!showContradictsLinks)}
                disabled={!showObservations || highlightContradictions}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
              />
              <span
                className={`text-sm ${!showObservations || highlightContradictions ? "text-gray-400" : "text-gray-600"}`}
              >
                Contradicts ({counts.contradictsLinks})
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showContextualizesLinks}
                onChange={() =>
                  setShowContextualizesLinks(!showContextualizesLinks)
                }
                disabled={!showObservations || highlightContradictions}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
              />
              <span
                className={`text-sm ${!showObservations || highlightContradictions ? "text-gray-400" : "text-gray-600"}`}
              >
                Contextualizes ({counts.contextualizesLinks})
              </span>
            </label>
          </div>
        </div>

        {/* Reset button */}
        <Button
          size="sm"
          variant="outline"
          onClick={() => window.location.reload()}
          className="w-full"
        >
          Reset Graph
        </Button>
      </div>
    </div>
  );
};

export default GraphPanel;
