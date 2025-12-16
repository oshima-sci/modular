import * as React from "react";
import { useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
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
      {/* Main node text */}
      <div
        className={`w-full text-left p-3 text-sm rounded-lg leading-relaxed ${
          node.type === "claim"
            ? "bg-orange-50 text-orange-900 border border-orange-200"
            : "bg-blue-50 text-blue-900 border border-blue-200"
        }`}
      >
        {node.displayText}
      </div>

      {/* Source Papers */}
      <div>
        <h5 className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-2">
          Source {node.paperIds.length > 1 ? "Papers" : "Paper"}
        </h5>
        <div className="flex flex-col gap-1">
          {node.paperIds.map((paperId) => {
            const paper = papersMap.get(paperId);
            const firstAuthorLastName =
              paper?.authors?.[0]?.split(" ").pop() || null;
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
                {citation && (
                  <p className="text-xs text-gray-700 ">{citation}</p>
                )}

                <button
                  onClick={() => onViewSource?.(node.id)}
                  className="text-sm text-gray-700 bg-gray-50 px-2 py-1 rounded text-left hover:bg-blue-50 hover:text-blue-700 transition-colors cursor-pointer flex items-center gap-2 mt-1"
                >
                  <svg
                    className="w-4 h-4 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  View Source
                </button>
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
                  <AccordionItem
                    key={item.node.id}
                    value={item.node.id}
                    className="border-0"
                  >
                    {/* Variant card */}
                    <button
                      onClick={() => onNodeSelect?.(item.node)}
                      className="w-full text-left p-2 text-xs rounded-lg leading-relaxed bg-purple-50 text-purple-900 border border-purple-200 hover:bg-purple-100 transition-colors cursor-pointer"
                    >
                      {item.node.displayText}
                    </button>
                    {/* Reasoning accordion trigger */}
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
                      style={{
                        width: `${(evidenceData.counts.supports / evidenceData.counts.total) * 100}%`,
                      }}
                    />
                  )}
                  {evidenceData.counts.contradicts > 0 && (
                    <div
                      className="bg-red-500 h-full"
                      style={{
                        width: `${(evidenceData.counts.contradicts / evidenceData.counts.total) * 100}%`,
                      }}
                    />
                  )}
                  {evidenceData.counts.contextualizes > 0 && (
                    <div
                      className="bg-gray-400 h-full"
                      style={{
                        width: `${(evidenceData.counts.contextualizes / evidenceData.counts.total) * 100}%`,
                      }}
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
              <p className="mt-2 text-xs text-gray-500">
                from {evidenceData.methodCount}{" "}
                {evidenceData.methodCount === 1 ? "method" : "methods"}
                {evidenceData.methodPaperCount > 1 ? (
                  <>
                    {" "}
                    <span className="font-semibold text-gray-800">
                      across {evidenceData.methodPaperCount} papers
                    </span>
                  </>
                ) : evidenceData.methodPaperCount === 1 &&
                  node.paperIds.length === 1 &&
                  evidenceData.methodPaperIds.has(node.paperIds[0]) ? (
                  <>
                    {" "}
                    from the{" "}
                    <span className="font-semibold">
                      same paper as the claim
                    </span>
                  </>
                ) : null}
              </p>
            )}
            {evidenceData.counts.total > 0 && !allObservationsVisible && (
              <Button
                size="sm"
                variant={isShowingEvidence ? "default" : "secondary"}
                className="mt-2"
                onClick={() =>
                  onToggleEvidence?.(isShowingEvidence ? null : node.id)
                }
              >
                {isShowingEvidence
                  ? "Hide Evidence Landscape"
                  : "Show Evidence Landscape for Claim"}
              </Button>
            )}
          </div>

          {/* Grouped Evidence */}
          {evidenceData.grouped.size > 0 && (
            <div className="flex flex-col gap-3">
              {Array.from(evidenceData.grouped.entries()).map(
                ([linkType, byMethod]) => (
                  <div key={linkType}>
                    <h5
                      className={`text-[10px] uppercase tracking-widest font-bold mb-2 ${
                        linkType === "supports"
                          ? "text-green-600"
                          : linkType === "contradicts"
                            ? "text-red-600"
                            : "text-gray-500"
                      }`}
                    >
                      {linkType === "supports"
                        ? "Supporting Evidence"
                        : linkType === "contradicts"
                          ? "Contradicting Evidence"
                          : "Contextual Evidence"}
                    </h5>
                    {Array.from(byMethod.entries()).map(([methodRef, items]) => {
                      const method =
                        methodRef !== "no_method"
                          ? methodsMap.get(methodRef)
                          : null;
                      return (
                        <div key={methodRef} className="mb-3">
                          <div className="text-xs text-gray-600 mb-1.5 px-1 leading-relaxed">
                            {method?.content.method_summary || "Unknown method"}
                          </div>
                          <Accordion
                            type="multiple"
                            className="flex flex-col gap-2"
                          >
                            {items.map((item) => (
                              <AccordionItem
                                key={item.node.id}
                                value={item.node.id}
                                className="border-0"
                              >
                                {/* Observation card */}
                                <div
                                  className={`w-full text-left p-2 text-xs rounded-lg leading-relaxed ${
                                    linkType === "supports"
                                      ? "bg-green-50 text-green-800 border border-green-200"
                                      : linkType === "contradicts"
                                        ? "bg-red-50 text-red-800 border border-red-200"
                                        : "bg-gray-50 text-gray-700 border border-gray-200"
                                  }`}
                                >
                                  <div className="flex items-start gap-2">
                                    <span className="flex-1">
                                      {item.node.displayText}
                                    </span>
                                    {item.node.observationType && (
                                      <span
                                        className={`text-[9px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap flex-shrink-0 ${
                                          linkType === "supports"
                                            ? "bg-green-100 text-green-700"
                                            : linkType === "contradicts"
                                              ? "bg-red-100 text-red-700"
                                              : "bg-gray-200 text-gray-600"
                                        }`}
                                      >
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
                                    <svg
                                      className="w-3 h-3"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                      />
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
                )
              )}
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
  onViewSource?: (nodeId: string) => void;
}

const EdgeDetails: React.FC<EdgeDetailsProps> = ({
  link,
  graphData,
  onViewSource,
}) => {
  const sourceId =
    typeof link.source === "object" ? link.source.id : link.source;
  const targetId =
    typeof link.target === "object" ? link.target.id : link.target;

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

  const getLinkTypeColor = (linkType: string) => {
    switch (linkType) {
      case "supports":
        return "text-green-600 bg-green-100";
      case "contradicts":
        return "text-red-600 bg-red-100";
      case "premise":
        return "text-blue-600 bg-blue-100";
      case "variant":
        return "text-purple-600 bg-purple-100";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };

  const getNodeStyle = (node: Node | undefined) => {
    if (!node) return "bg-gray-50 text-gray-700 border border-gray-200";
    return node.type === "claim"
      ? "bg-orange-50 text-orange-900 border border-orange-200"
      : "bg-blue-50 text-blue-900 border border-blue-200";
  };

  return (
    <div className="flex flex-col gap-4">
      {/* First Node */}
      <div>
        <h5 className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-2">
          {firstLabel}
        </h5>
        <div
          className={`w-full text-left p-3 text-sm rounded-lg leading-relaxed ${getNodeStyle(firstNode)}`}
        >
          <div className="flex items-start gap-2">
            <span className="flex-1">
              {firstNode?.displayText || sourceId}
            </span>
            {firstNode && (
              <span
                className={`text-[9px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap flex-shrink-0 ${
                  firstNode.type === "claim"
                    ? "bg-orange-100 text-orange-700"
                    : "bg-blue-100 text-blue-700"
                }`}
              >
                {firstNode.type.toUpperCase()}
              </span>
            )}
          </div>
        </div>
        {firstNode && (
          <button
            onClick={() => onViewSource?.(firstNode.id)}
            className="mt-1 text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-1"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            View Source
          </button>
        )}
      </div>

      {/* Arrow indicator with link type badge */}
      <div className="flex justify-center items-center gap-2">
        <svg
          className="text-gray-900"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          {link.linkType === "variant" ? (
            <>
              <path d="M12 5v14" />
              <path d="M5 9l7-4 7 4" />
              <path d="M5 15l7 4 7-4" />
            </>
          ) : isClaimToObs ? (
            <path d="M12 19V5M5 12l7-7 7 7" />
          ) : (
            <path d="M12 5v14M5 12l7 7 7-7" />
          )}
        </svg>
        <span
          className={`text-xs font-medium px-2 py-1 rounded ${getLinkTypeColor(link.linkType)}`}
        >
          {link.linkType.toUpperCase()}
        </span>
      </div>

      {/* Second Node */}
      <div>
        <h5 className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-2">
          {secondLabel}
        </h5>
        <div
          className={`w-full text-left p-3 text-sm rounded-lg leading-relaxed ${getNodeStyle(secondNode)}`}
        >
          <div className="flex items-start gap-2">
            <span className="flex-1">
              {secondNode?.displayText || targetId}
            </span>
            {secondNode && (
              <span
                className={`text-[9px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap flex-shrink-0 ${
                  secondNode.type === "claim"
                    ? "bg-orange-100 text-orange-700"
                    : "bg-blue-100 text-blue-700"
                }`}
              >
                {secondNode.type.toUpperCase()}
              </span>
            )}
          </div>
        </div>
        {secondNode && (
          <button
            onClick={() => onViewSource?.(secondNode.id)}
            className="mt-1 text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-1"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            View Source
          </button>
        )}
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

      const src =
        typeof link.source === "object" ? link.source.id : link.source;
      const tgt =
        typeof link.target === "object" ? link.target.id : link.target;

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

      const src =
        typeof link.source === "object" ? link.source.id : link.source;
      const tgt =
        typeof link.target === "object" ? link.target.id : link.target;

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
        <AnimatePresence mode="wait">
          {panelLink && graphData ? (
            <motion.div
              key={`link-${typeof panelLink.source === "object" ? panelLink.source.id : panelLink.source}-${typeof panelLink.target === "object" ? panelLink.target.id : panelLink.target}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 mt-4 overflow-y-auto"
            >
              <EdgeDetails
                link={panelLink}
                graphData={graphData}
                onViewSource={onViewSource}
              />
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
                variantItems={variantItems}
                isShowingEvidence={showEvidenceForClaimId === panelNode.id}
                allObservationsVisible={showObservations}
                onViewSource={onViewSource}
                onNodeSelect={onNodeSelect}
                onToggleEvidence={onToggleEvidence}
              />
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 mt-4 flex items-center justify-center text-gray-600 text-center"
            >
              Hover over a node or edge to see details. Click on it to pin them
              here.
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ElementPanel;
