import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface ViewSourceButtonProps {
  onClick: () => void;
  size?: "sm" | "default";
  className?: string;
}

export const ViewSourceButton: React.FC<ViewSourceButtonProps> = ({
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
