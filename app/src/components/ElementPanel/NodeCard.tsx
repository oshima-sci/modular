import * as React from "react";
import { cn } from "@/lib/utils";

export type NodeCardVariant = "claim" | "observation" | "supports" | "contradicts" | "contextualizes" | "variant";

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

export const NodeCard: React.FC<NodeCardProps> = ({
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
