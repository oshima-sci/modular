import * as React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Node, Method, EvidenceData } from "@/types/graph";
import { NodeCard, type NodeCardVariant } from "./NodeCard";
import { ViewSourceButton } from "./ViewSourceButton";
import { EvidenceDistributionBar } from "./EvidenceDistributionBar";

interface EvidenceLandscapeProps {
  node: Node;
  evidenceData: EvidenceData;
  methodsMap: Map<string, Method>;
  isShowingEvidence: boolean;
  allObservationsVisible: boolean;
  onViewSource?: (nodeId: string) => void;
  onToggleEvidence?: (claimId: string | null) => void;
  getLinkTypeHeader: (linkType: string, context: 'evidence' | 'claims') => { text: string; colorClass: string };
}

export const EvidenceLandscape: React.FC<EvidenceLandscapeProps> = ({
  node,
  evidenceData,
  methodsMap,
  isShowingEvidence,
  allObservationsVisible,
  onViewSource,
  onToggleEvidence,
  getLinkTypeHeader,
}) => {
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
            const header = getLinkTypeHeader(linkType, 'evidence');
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
