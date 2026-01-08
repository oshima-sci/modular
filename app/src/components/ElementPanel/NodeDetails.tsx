import * as React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { Node, Paper, Method, EvidenceData, VariantItem } from "@/types/graph";
import { NodeCard, type NodeCardVariant } from "./NodeCard";
import { ViewSourceButton } from "./ViewSourceButton";
import { EvidenceLandscape } from "./EvidenceLandscape";
import { ConnectedClaims, type ClaimItem } from "./ConnectedClaims";

interface NodeDetailsProps {
  node: Node;
  papersMap: Map<string, Paper>;
  methodsMap: Map<string, Method>;
  evidenceData: EvidenceData | null;
  connectedClaimsData: Map<string, ClaimItem[]> | null;
  variantItems: VariantItem[];
  isShowingEvidence: boolean;
  allObservationsVisible: boolean;
  onViewSource?: (nodeId: string) => void;
  onNodeSelect?: (node: Node) => void;
  onToggleEvidence?: (claimId: string | null) => void;
  getLinkTypeHeader: (linkType: string, context: 'evidence' | 'claims') => { text: string; colorClass: string };
}

export const NodeDetails: React.FC<NodeDetailsProps> = ({
  node,
  papersMap,
  methodsMap,
  evidenceData,
  connectedClaimsData,
  variantItems,
  isShowingEvidence,
  allObservationsVisible,
  onViewSource,
  onNodeSelect,
  onToggleEvidence,
  getLinkTypeHeader,
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
          getLinkTypeHeader={getLinkTypeHeader}
        />
      )}

      {/* For Observations: Connected Claims */}
      {node.type === "observation" && connectedClaimsData && (
        <ConnectedClaims
          claimsByType={connectedClaimsData}
          onViewSource={onViewSource}
          onNodeSelect={onNodeSelect}
          getLinkTypeHeader={getLinkTypeHeader}
        />
      )}
    </div>
  );
};
