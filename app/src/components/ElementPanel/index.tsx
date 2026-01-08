import * as React from "react";
import { useMemo } from "react";
import { getLinkEndpoints } from "@/lib/graph-utils";
import type {
  Node,
  Link,
  GraphData,
  Paper,
  Method,
  EvidenceData,
  EvidenceItem,
  VariantItem,
} from "@/types/graph";
import { NodeDetails } from "./NodeDetails";
import { EdgeDetails } from "./EdgeDetails";
import type { ClaimItem } from "./ConnectedClaims";

// ============ Shared Helper ============
const getLinkTypeHeader = (linkType: string, context: 'evidence' | 'claims') => {
  const baseHeaders: Record<string, { evidence: { text: string; colorClass: string }, claims: { text: string; colorClass: string } }> = {
    supports: {
      evidence: { text: "Supporting Evidence", colorClass: "text-green-600" },
      claims: { text: "Supported Claims", colorClass: "text-green-600" },
    },
    contradicts: {
      evidence: { text: "Contradicting Evidence", colorClass: "text-red-600" },
      claims: { text: "Contradicted Claims", colorClass: "text-red-600" },
    },
    contextualizes: {
      evidence: { text: "Contextual Evidence", colorClass: "text-gray-500" },
      claims: { text: "Contextualized Claims", colorClass: "text-gray-500" },
    },
  };

  return baseHeaders[linkType]?.[context] || { text: "Other", colorClass: "text-gray-500" };
};

// ============ Main ElementPanel Component ============
interface ElementPanelProps {
  selectedNode: Node | null;
  hoveredNode: Node | null;
  selectedLink: Link | null;
  hoveredLink: Link | null;
  graphData: GraphData | null;
  papersMap: Map<string, Paper>;
  methodsMap: Map<string, Method>;
  showObservations: boolean;
  showEvidenceForClaimId: string | null;
  onClearSelection: () => void;
  onViewSource?: (nodeId: string) => void;
  onNodeSelect?: (node: Node | null) => void;
  onToggleEvidence?: (claimId: string | null) => void;
}

const ElementPanel: React.FC<ElementPanelProps> = ({
  selectedNode,
  hoveredNode,
  selectedLink,
  hoveredLink,
  graphData,
  papersMap,
  methodsMap,
  showObservations,
  showEvidenceForClaimId,
  onClearSelection,
  onViewSource,
  onNodeSelect,
  onToggleEvidence,
}) => {
  const panelNode = selectedNode || hoveredNode;
  const panelLink = selectedLink || hoveredLink;

  // Compute evidence data for claims
  const evidenceData = useMemo((): EvidenceData | null => {
    if (!graphData || !panelNode || panelNode.type !== "claim") {
      return null;
    }

    const evidence: EvidenceItem[] = [];
    graphData.links.forEach((link) => {
      if (link.linkCategory !== "claim_to_observation") return;

      const { src, tgt } = getLinkEndpoints(link);

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

    const counts = {
      supports: evidence.filter((e) => e.linkType === "supports").length,
      contradicts: evidence.filter((e) => e.linkType === "contradicts").length,
      contextualizes: evidence.filter((e) => e.linkType === "contextualizes")
        .length,
      total: evidence.length,
    };

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

    return {
      counts,
      grouped,
      methodCount: uniqueMethods.size,
      methodPaperCount: uniqueMethodPapers.size,
      methodPaperIds: uniqueMethodPapers,
    };
  }, [graphData, panelNode, methodsMap]);

  // Compute variant items
  const variantItems = useMemo((): VariantItem[] => {
    if (!graphData || !panelNode) return [];

    const variants: VariantItem[] = [];
    graphData.links.forEach((link) => {
      if (link.linkType !== "variant") return;

      const { src, tgt } = getLinkEndpoints(link);

      let variantId: string | null = null;
      if (src === panelNode.id) variantId = tgt;
      else if (tgt === panelNode.id) variantId = src;

      if (variantId) {
        const variantNode = graphData.nodes.find((n) => n.id === variantId);
        if (variantNode) {
          variants.push({ node: variantNode, reasoning: link.reasoning });
        }
      }
    });

    return variants;
  }, [graphData, panelNode]);

  // Compute connected claims for observations
  const connectedClaimsData = useMemo((): Map<string, ClaimItem[]> | null => {
    if (!graphData || !panelNode || panelNode.type !== "observation") {
      return null;
    }

    const claims: ClaimItem[] = [];
    graphData.links.forEach((link) => {
      if (link.linkCategory !== "claim_to_observation") return;

      const { src, tgt } = getLinkEndpoints(link);

      let claimId: string | null = null;
      if (src === panelNode.id) claimId = tgt;
      else if (tgt === panelNode.id) claimId = src;

      if (claimId) {
        const claimNode = graphData.nodes.find((n) => n.id === claimId);
        if (claimNode && claimNode.type === "claim") {
          claims.push({
            node: claimNode,
            linkType: link.linkType,
            reasoning: link.reasoning,
          });
        }
      }
    });

    const claimsByType: Map<string, ClaimItem[]> = new Map();
    const linkOrder = ["supports", "contradicts", "contextualizes"];

    linkOrder.forEach((lt) => {
      const claimsOfType = claims.filter((c) => c.linkType === lt);
      if (claimsOfType.length > 0) {
        claimsByType.set(lt, claimsOfType);
      }
    });

    return claimsByType;
  }, [graphData, panelNode]);

  return (
    <div className="h-full bg-white border-l border-gray-200 flex flex-col">
      <div className="p-4 flex-1 flex flex-col overflow-hidden">
        {(selectedNode || selectedLink) && (
          <button
            onClick={onClearSelection}
            className="text-[10px] font-medium px-2 py-0.5 rounded text-blue-600 bg-blue-100 hover:bg-blue-200 self-start"
          >
            PINNED ✕
          </button>
        )}

        {/* Panel Content */}
        {panelLink && graphData ? (
          <div className="flex-1 mt-4 overflow-y-auto">
            <EdgeDetails
              link={panelLink}
              graphData={graphData}
              onViewSource={onViewSource}
            />
          </div>
        ) : panelNode ? (
          <div className="flex-1 mt-4 overflow-y-auto">
            <NodeDetails
              node={panelNode}
              papersMap={papersMap}
              methodsMap={methodsMap}
              evidenceData={evidenceData}
              connectedClaimsData={connectedClaimsData}
              variantItems={variantItems}
              isShowingEvidence={showEvidenceForClaimId === panelNode.id}
              allObservationsVisible={showObservations}
              onViewSource={onViewSource}
              onNodeSelect={onNodeSelect}
              onToggleEvidence={onToggleEvidence}
              getLinkTypeHeader={getLinkTypeHeader}
            />
          </div>
        ) : (
          <div className="flex-1 mt-4 flex items-center justify-center text-gray-600 text-center">
            Hover over a node or edge to see details. Click on it to pin them
            here.
          </div>
        )}
      </div>
    </div>
  );
};

export { ElementPanel };
export default ElementPanel;
