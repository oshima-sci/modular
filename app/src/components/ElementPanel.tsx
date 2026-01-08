import * as React from "react";
import { useMemo } from "react";
import { FileText, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { getLinkEndpoints } from "@/lib/graph-utils";
import { cn } from "@/lib/utils";
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

// ============ ViewSourceButton Component ============
interface ViewSourceButtonProps {
  onClick: () => void;
  size?: "sm" | "default";
  className?: string;
}

const ViewSourceButton: React.FC<ViewSourceButtonProps> = ({
  onClick,
  size = "default",
  className,
}) => {
  const isSmall = size === "sm";
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-blue-500 hover:text-blue-700 flex items-center gap-1 transition-colors",
        isSmall ? "text-[10px]" : "text-sm bg-gray-50 px-2 py-1 rounded hover:bg-blue-50",
        className
      )}
    >
      <FileText className={isSmall ? "w-3 h-3" : "w-4 h-4"} />
      View Source
    </button>
  );
};

// ============ NodeCard Component ============
type NodeCardVariant = "claim" | "observation" | "supports" | "contradicts" | "contextualizes" | "variant";

const nodeCardStyles: Record<NodeCardVariant, string> = {
  claim: "bg-orange-50 text-orange-900 border-orange-200 sticky top-0",
  observation: "bg-blue-50 text-blue-900 border-blue-200",
  supports: "bg-green-50 text-green-800 border-green-200",
  contradicts: "bg-red-50 text-red-800 border-red-200",
  contextualizes: "bg-gray-50 text-gray-700 border-gray-200",
  variant: "bg-purple-50 text-purple-900 border-purple-200",
};

const nodeCardBadgeStyles: Record<NodeCardVariant, string> = {
  claim: "bg-orange-100 text-orange-700",
  observation: "bg-blue-100 text-blue-700",
  supports: "bg-green-100 text-green-700",
  contradicts: "bg-red-100 text-red-700",
  contextualizes: "bg-gray-200 text-gray-600",
  variant: "bg-purple-100 text-purple-700",
};

interface NodeCardProps {
  children: React.ReactNode;
  variant: NodeCardVariant;
  badge?: string;
  onClick?: () => void;
  className?: string;
  size?: "sm" | "default";
}

const NodeCard: React.FC<NodeCardProps> = ({
  children,
  variant,
  badge,
  onClick,
  className,
  size = "default",
}) => {
  const Component = onClick ? "button" : "div";
  const isSmall = size === "sm";

  return (
    <Component
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg leading-relaxed border",
        isSmall ? "p-2 text-xs" : "p-3 text-sm",
        nodeCardStyles[variant],
        onClick && "hover:opacity-80 transition-colors cursor-pointer",
        className
      )}
    >
      {badge ? (
        <div className="flex items-start gap-2">
          <span className="flex-1">{children}</span>
          <span
            className={cn(
              "text-[9px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap flex-shrink-0",
              nodeCardBadgeStyles[variant]
            )}
          >
            {badge}
          </span>
        </div>
      ) : (
        children
      )}
    </Component>
  );
};

// ============ EvidenceDistributionBar Component ============
interface EvidenceDistributionBarProps {
  counts: {
    supports: number;
    contradicts: number;
    contextualizes: number;
    total: number;
  };
}

const EvidenceDistributionBar: React.FC<EvidenceDistributionBarProps> = ({ counts }) => {
  if (counts.total === 0) return null;

  return (
    <div className="flex-1 flex flex-col gap-1">
      <div className="flex flex-row gap-2 items-center">

        {/* Total count badge */}
        <div className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded">
            {counts.total}
        </div>

        {/* Distribution Bar */}
        <div className="w-full h-2 rounded-full overflow-hidden flex">
          {counts.supports > 0 && (
            <div
              className="bg-green-500 h-full"
              style={{ width: `${(counts.supports / counts.total) * 100}%` }}
            />
          )}
          {counts.contradicts > 0 && (
            <div
              className="bg-red-500 h-full"
              style={{ width: `${(counts.contradicts / counts.total) * 100}%` }}
            />
          )}
          {counts.contextualizes > 0 && (
            <div
              className="bg-gray-400 h-full"
              style={{ width: `${(counts.contextualizes / counts.total) * 100}%` }}
            />
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 ml-1 text-[10px] text-gray-500">
        {counts.supports > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            {counts.supports} supporting
          </span>
        )}
        {counts.contradicts > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            {counts.contradicts} contradicting
          </span>
        )}
        {counts.contextualizes > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-gray-400" />
            {counts.contextualizes} context
          </span>
        )}
      </div>
    </div>
  );
};

// ============ EvidenceLandscape Component ============
interface EvidenceLandscapeProps {
  node: Node;
  evidenceData: EvidenceData;
  methodsMap: Map<string, Method>;
  isShowingEvidence: boolean;
  allObservationsVisible: boolean;
  onViewSource?: (nodeId: string) => void;
  onToggleEvidence?: (claimId: string | null) => void;
}

const EvidenceLandscape: React.FC<EvidenceLandscapeProps> = ({
  node,
  evidenceData,
  methodsMap,
  isShowingEvidence,
  allObservationsVisible,
  onViewSource,
  onToggleEvidence,
}) => {
  const getLinkTypeHeader = (linkType: string) => {
    switch (linkType) {
      case "supports":
        return { text: "Supporting Evidence", colorClass: "text-green-600" };
      case "contradicts":
        return { text: "Contradicting Evidence", colorClass: "text-red-600" };
      default:
        return { text: "Contextual Evidence", colorClass: "text-gray-500" };
    }
  };

  // Compute paper source copy
  const paperSourceCopy = (() => {
    if (evidenceData.methodCount === 0) return null;

    const { methodPaperCount, methodPaperIds } = evidenceData;
    const claimPaperIds = new Set(node.paperIds);
    const allFromSamePaper = methodPaperCount === 1 &&
      Array.from(methodPaperIds).every(id => claimPaperIds.has(id));

    if (allFromSamePaper) {
      return "from the same paper";
    } else if (methodPaperCount === 1) {
      return "from 1 paper";
    } else {
      return `across ${methodPaperCount} papers`;
    }
  })();

  return (
    <>
      {/* Evidence Landscape Stats */}
      <div>
        <h5 className="mb-2">Evidence Landscape</h5>
        <EvidenceDistributionBar counts={evidenceData.counts} />
        {evidenceData.methodCount > 0 && (
          <p className="mt-2 text-xs text-gray-500">
            from {evidenceData.methodCount}{" "}
            {evidenceData.methodCount === 1 ? "method" : "methods"}{" "}
            <span className="font-semibold text-gray-800">{paperSourceCopy}</span>
          </p>
        )}
        {evidenceData.counts.total > 0 && !allObservationsVisible && (
          <Button
            size="sm"
            variant={isShowingEvidence ? "default" : "secondary"}
            className="mt-2"
            onClick={() => onToggleEvidence?.(isShowingEvidence ? null : node.id)}
          >
            {isShowingEvidence ? "Hide Evidence Landscape" : "Show Evidence Landscape for Claim"}
          </Button>
        )}
      </div>

      {/* Grouped Evidence */}
      {evidenceData.grouped.size > 0 && (
        <Accordion type="multiple" defaultValue={Array.from(evidenceData.grouped.keys())} className="flex flex-col gap-3">
          {Array.from(evidenceData.grouped.entries()).map(([linkType, byMethod]) => {
            const header = getLinkTypeHeader(linkType);
            const totalItems = Array.from(byMethod.values()).reduce((sum, items) => sum + items.length, 0);
            return (
              <AccordionItem key={linkType} value={linkType} className="border-0">
                <AccordionTrigger className={cn("text-sm font-semibold hover:no-underline py-0 pb-2", header.colorClass)}>
                  {header.text} ({totalItems})
                </AccordionTrigger>
                <AccordionContent>
                  {Array.from(byMethod.entries()).map(([methodRef, items]) => {
                    const method = methodRef !== "no_method" ? methodsMap.get(methodRef) : null;
                    return (
                      <div key={methodRef} className="mb-3">
                        <div className="text-xs text-gray-600 mb-1.5 leading-relaxed">
                          <span className="font-semibold">Source method: </span>
                          {method?.content.method_summary || "Unknown method"}
                        </div>
                        <Accordion type="multiple" className="flex flex-col gap-2 pl-2">
                          {items.map((item) => (
                            <AccordionItem key={item.node.id} value={item.node.id} className="border-0">
                              <NodeCard
                                variant={linkType as NodeCardVariant}
                                badge={item.node.observationType}
                                size="sm"
                              >
                                {item.node.displayText}
                              </NodeCard>
                              <div className="flex items-center gap-2 py-1 px-1">
                                <AccordionTrigger className="text-[10px] text-gray-500 hover:text-gray-700 hover:no-underline [&>svg]:size-3 py-0">
                                  Reasoning
                                </AccordionTrigger>
                                <ViewSourceButton size="sm" onClick={() => onViewSource?.(item.node.id)} />
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
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </>
  );
};

// ============ NodeDetails Component ============
interface NodeDetailsProps {
  node: Node;
  papersMap: Map<string, Paper>;
  methodsMap: Map<string, Method>;
  evidenceData: EvidenceData | null;
  variantItems: VariantItem[];
  isShowingEvidence: boolean;
  allObservationsVisible: boolean;
  onViewSource?: (nodeId: string) => void;
  onNodeSelect?: (node: Node) => void;
  onToggleEvidence?: (claimId: string | null) => void;
}

const NodeDetails: React.FC<NodeDetailsProps> = ({
  node,
  papersMap,
  methodsMap,
  evidenceData,
  variantItems,
  isShowingEvidence,
  allObservationsVisible,
  onViewSource,
  onNodeSelect,
  onToggleEvidence,
}) => {
  return (
    <div className="flex flex-col gap-4">
      {/* Main node card */}
      <NodeCard variant={node.type as NodeCardVariant}>
        {node.displayText}
      </NodeCard>

      {/* Source Papers */}
      <div>
        <h5 className="mb-2">Source {node.paperIds.length > 1 ? "Papers" : "Paper"}</h5>
        <div className="flex flex-col gap-1">
          {node.paperIds.map((paperId) => {
            const paper = papersMap.get(paperId);
            const firstAuthorLastName = paper?.authors?.[0]?.split(" ").pop() || null;
            const citation =
              firstAuthorLastName && paper?.year
                ? `${firstAuthorLastName} et al. (${paper.year})`
                : firstAuthorLastName
                  ? `${firstAuthorLastName} et al.`
                  : paper?.year
                    ? `(${paper.year})`
                    : "null";
            return (
              <div key={paperId}>
                <p className="text-xs font-semibold text-gray-700 mb-0.5">
                  {paper?.title || paperId}
                </p>
                {citation && <p className="text-xs text-gray-700">{citation}</p>}
                <ViewSourceButton size="sm" onClick={() => onViewSource?.(node.id)} className="mt-1" />
              </div>
            );
          })}
        </div>
      </div>

      {/* Variant Claims */}
      {variantItems.length > 0 && (
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="variants" className="border-0">
            <AccordionTrigger className="text-[10px] uppercase tracking-widest font-bold text-gray-500 hover:no-underline py-0 [&>svg]:size-3 justify-start">
              Variant Claims ({variantItems.length})
            </AccordionTrigger>
            <AccordionContent className="pt-2">
              <Accordion type="multiple" className="flex flex-col gap-2">
                {variantItems.map((item) => (
                  <AccordionItem key={item.node.id} value={item.node.id} className="border-0">
                    <NodeCard
                      variant="claim"
                      size="sm"
                      onClick={() => onNodeSelect?.(item.node)}
                    >
                      {item.node.displayText}
                    </NodeCard>
                    <div className="flex items-center gap-2 py-1 px-1">
                      <AccordionTrigger className="text-[10px] text-gray-500 hover:text-gray-700 hover:no-underline [&>svg]:size-3 py-0">
                        Reasoning
                      </AccordionTrigger>
                    </div>
                    <AccordionContent className="px-1 pb-2 pt-0 text-[11px] text-gray-600">
                      {item.reasoning}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {/* For Claims: Evidence Landscape */}
      {node.type === "claim" && evidenceData && (
        <EvidenceLandscape
          node={node}
          evidenceData={evidenceData}
          methodsMap={methodsMap}
          isShowingEvidence={isShowingEvidence}
          allObservationsVisible={allObservationsVisible}
          onViewSource={onViewSource}
          onToggleEvidence={onToggleEvidence}
        />
      )}
    </div>
  );
};

// ============ EdgeDetails Component ============
interface EdgeDetailsProps {
  link: Link;
  graphData: GraphData;
  onViewSource?: (nodeId: string) => void;
}

const linkTypeBadgeStyles: Record<string, string> = {
  supports: "text-green-600 bg-green-100",
  contradicts: "text-red-600 bg-red-100",
  premise: "text-blue-600 bg-blue-100",
  variant: "text-purple-600 bg-purple-100",
};

const EdgeDetails: React.FC<EdgeDetailsProps> = ({
  link,
  graphData,
  onViewSource,
}) => {
  const { src: sourceId, tgt: targetId } = getLinkEndpoints(link);

  const sourceNode = graphData.nodes.find((n) => n.id === sourceId);
  const targetNode = graphData.nodes.find((n) => n.id === targetId);

  // For claim_to_observation, show claim first with "To" label, observation second with "From" label
  const isClaimToObs = link.linkCategory === "claim_to_observation";
  const firstNode = isClaimToObs
    ? sourceNode?.type === "claim"
      ? sourceNode
      : targetNode
    : sourceNode;
  const secondNode = isClaimToObs
    ? sourceNode?.type === "observation"
      ? sourceNode
      : targetNode
    : targetNode;
  const firstLabel = isClaimToObs ? "To" : "From";
  const secondLabel = isClaimToObs ? "From" : "To";

  const getNodeVariant = (node: Node | undefined): NodeCardVariant => {
    if (!node) return "contextualizes"; // fallback gray style
    return node.type as NodeCardVariant;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* First Node */}
      <div>
        <h5 className="mb-2">{firstLabel}</h5>
        <NodeCard
          variant={getNodeVariant(firstNode)}
          badge={firstNode?.type.toUpperCase()}
        >
          {firstNode?.displayText || sourceId}
        </NodeCard>
        {firstNode && (
          <ViewSourceButton
            size="sm"
            onClick={() => onViewSource?.(firstNode.id)}
            className="mt-1"
          />
        )}
      </div>

      {/* Arrow indicator with link type badge */}
      <div className="flex justify-center items-center gap-2">
        {link.linkType === "variant" ? (
          <ArrowUpDown className="w-5 h-5 text-gray-900" />
        ) : isClaimToObs ? (
          <ArrowUp className="w-5 h-5 text-gray-900" />
        ) : (
          <ArrowDown className="w-5 h-5 text-gray-900" />
        )}
        <span
          className={cn(
            "text-xs font-medium px-2 py-1 rounded",
            linkTypeBadgeStyles[link.linkType] || "text-gray-600 bg-gray-100"
          )}
        >
          {link.linkType.toUpperCase()}
        </span>
      </div>

      {/* Second Node */}
      <div>
        <h5 className="mb-2">{secondLabel}</h5>
        <NodeCard
          variant={getNodeVariant(secondNode)}
          badge={secondNode?.type.toUpperCase()}
        >
          {secondNode?.displayText || targetId}
        </NodeCard>
        {secondNode && (
          <ViewSourceButton
            size="sm"
            onClick={() => onViewSource?.(secondNode.id)}
            className="mt-1"
          />
        )}
      </div>

      {/* Reasoning */}
      {link.reasoning && (
        <div>
          <h5 className="mb-2">Reasoning</h5>
          <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg leading-relaxed border border-gray-200">
            {link.reasoning}
          </div>
        </div>
      )}
    </div>
  );
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

export const ElementPanel: React.FC<ElementPanelProps> = ({
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
              variantItems={variantItems}
              isShowingEvidence={showEvidenceForClaimId === panelNode.id}
              allObservationsVisible={showObservations}
              onViewSource={onViewSource}
              onNodeSelect={onNodeSelect}
              onToggleEvidence={onToggleEvidence}
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

export default ElementPanel;
