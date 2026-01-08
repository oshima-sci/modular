import * as React from "react";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLinkEndpoints } from "@/lib/graph-utils";
import type { Link, GraphData, Node } from "@/types/graph";
import { NodeCard, type NodeCardVariant } from "./NodeCard";
import { ViewSourceButton } from "./ViewSourceButton";

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

export const EdgeDetails: React.FC<EdgeDetailsProps> = ({
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
