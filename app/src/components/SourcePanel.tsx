import * as React from "react";
import { X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import PdfViewer, { type BBox } from "@/components/PdfViewer";
import type { Paper } from "@/types/graph";
import { getPdfUrl } from "@/lib/pdf-utils";

interface SourcePanelProps {
  paperId: string;
  paper: Paper | undefined;
  bboxes: BBox[];
  highlightedBboxId: string | null;
  loading: boolean;
  onBboxClick: (id: string) => void;
  onClose: () => void;
}

export const SourcePanel: React.FC<SourcePanelProps> = ({
  paperId,
  paper,
  bboxes,
  highlightedBboxId,
  loading,
  onBboxClick,
  onClose,
}) => {
  return (
    <div className="h-full flex flex-col bg-white border-l border-gray-200">
      {/* Header */}
      <div className="p-3 border-b border-gray-200 flex items-start justify-between">
        <div className="flex flex-col">
          {paper?.title && (
            <p className="text-sm font-semibold text-gray-900">{paper.title}</p>
          )}
          {paper?.authors && (
            <p className="text-xs text-gray-500">
              {paper.authors[0]} et al. ({paper.year})
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* PDF Viewer */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-2 text-gray-500">
              <Loader2 className="animate-spin h-5 w-5" />
              <span>Loading source...</span>
            </div>
          </div>
        ) : (
          <PdfViewer
            pdfUrl={getPdfUrl(paperId)}
            bboxes={bboxes}
            highlightedId={highlightedBboxId}
            onBboxClick={onBboxClick}
          />
        )}
      </div>
    </div>
  );
};

export default SourcePanel;
