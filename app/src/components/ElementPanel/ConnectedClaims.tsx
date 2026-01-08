import * as React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import type { Node } from "@/types/graph";
import { NodeCard } from "./NodeCard";
import { ViewSourceButton } from "./ViewSourceButton";

export interface ClaimItem {
  node: Node;
  linkType: string;
  reasoning: string;
}

interface ConnectedClaimsProps {
  claimsByType: Map<string, ClaimItem[]>;
  onViewSource?: (nodeId: string) => void;
  onNodeSelect?: (node: Node) => void;
  getLinkTypeHeader: (linkType: string, context: 'evidence' | 'claims') => { text: string; colorClass: string };
}

export const ConnectedClaims: React.FC<ConnectedClaimsProps> = ({
  claimsByType,
  onViewSource,
  onNodeSelect,
  getLinkTypeHeader,
}) => {
  if (claimsByType.size === 0) return null;

  return (
    <div>
      <h5 className="mb-2">Connected Claims</h5>
      <Accordion type="multiple" defaultValue={Array.from(claimsByType.keys())} className="flex flex-col gap-3">
        {Array.from(claimsByType.entries()).map(([linkType, claims]) => {
          const header = getLinkTypeHeader(linkType, 'claims');
          return (
            <AccordionItem key={linkType} value={linkType} className="border-0">
              <AccordionTrigger className={cn("text-sm font-semibold hover:no-underline py-0 pb-2", header.colorClass)}>
                {header.text} ({claims.length})
              </AccordionTrigger>
              <AccordionContent>
                <Accordion type="multiple" className="flex flex-col gap-2">
                  {claims.map((item) => (
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
                        <ViewSourceButton size="sm" onClick={() => onViewSource?.(item.node.id)} />
                      </div>
                      <AccordionContent className="px-1 pb-2 pt-0 text-[11px] text-gray-600">
                        {item.reasoning}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
};
