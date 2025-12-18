import * as React from "react";
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
      <div className="p-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex flex-col">
          <h3 className="text-xs text-gray-500">Source paper</h3>
          {paper?.title && (
            <p className="text-sm font-semibold text-gray-900">{paper.title}</p>
          )}
          {paper?.authors && (
            <p className="text-xs text-gray-500">
              {paper.authors[0]} et al. ({paper.year})
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* PDF Viewer */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-2 text-gray-500">
              <svg
                className="animate-spin h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
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
