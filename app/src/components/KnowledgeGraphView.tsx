import * as React from "react";
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useLibrary } from "@/hooks/useLibrary";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { KnowledgeGraph } from "./KnowledgeGraph";
import PdfViewer, { type BBox } from "@/components/PdfViewer";

// Raw library.json types (shared)
export interface Paper {
  id: string;
  title: string;
  filename: string;
  abstract: string | null;
}

export interface Method {
  id: string;
  paper_id: string;
  type: "method";
  content: {
    method_summary: string;
    novel_method?: boolean;
  };
}

export interface Node {
  id: string;
  type: "claim" | "observation";
  displayText: string;
  rawContent: any;
  paperIds: string[];
  sourceElementIds: string[];
  observationType?: string;
  methodReference?: string;
  mergedNodeIds?: string[];
  isMerged?: boolean;
}

export interface Link {
  source: string | Node;
  target: string | Node;
  linkType: string;
  linkCategory: string;
  reasoning: string;
}

export interface GraphData {
  nodes: Node[];
  links: Link[];
}

export interface SelectionState {
  selectedNode: Node | null;
  hoveredNode: Node | null;
  selectedLink: Link | null;
  hoveredLink: Link | null;
}

export const KnowledgeGraphView: React.FC = () => {
  const { libraryId } = useParams<{ libraryId: string }>();
  const { data: library, isLoading, error } = useLibrary(libraryId);

  const [pdfPanelOpen, setPdfPanelOpen] = useState(false);
  const [teiBboxes, setTeiBboxes] = useState<BBox[]>([]);
  const [highlightedBboxId, setHighlightedBboxId] = useState<string | null>(null);

  // Selection state lifted to wrapper
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [selectedLink, setSelectedLink] = useState<Link | null>(null);
  const [hoveredLink, setHoveredLink] = useState<Link | null>(null);

  // Load and parse TEI file for bounding boxes
  useEffect(() => {
    fetch("/parsed (1).tei")
      .then((res) => res.text())
      .then((teiXml) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(teiXml, "text/xml");
        const bboxes: BBox[] = [];

        const elementsWithCoords = doc.querySelectorAll("[coords]");
        elementsWithCoords.forEach((el, index) => {
          const coordsAttr = el.getAttribute("coords");
          if (!coordsAttr) return;

          const segments = coordsAttr.split(";");
          const firstSegment = segments[0];
          const parts = firstSegment.split(",").map(Number);

          if (parts.length >= 5) {
            const [page, x, y, width, height] = parts;
            bboxes.push({
              id: `tei-${index}`,
              page,
              x,
              y,
              width,
              height,
            });
          }
        });

        setTeiBboxes(bboxes);
        console.log(`Parsed ${bboxes.length} bounding boxes from TEI`);
      })
      .catch((err) => console.error("Failed to load TEI:", err));
  }, []);

  const handlePaperClick = (_paperId: string) => {
    // Pick a random bbox to highlight
    if (teiBboxes.length > 0) {
      const randomIndex = Math.floor(Math.random() * teiBboxes.length);
      setHighlightedBboxId(teiBboxes[randomIndex].id);
    }
    setPdfPanelOpen(true);
  };

  const handleViewSource = (_nodeId: string) => {
    // Pick a random bbox to highlight (demo behavior)
    if (teiBboxes.length > 0) {
      const randomIndex = Math.floor(Math.random() * teiBboxes.length);
      setHighlightedBboxId(teiBboxes[randomIndex].id);
    }
    setPdfPanelOpen(true);
  };

  const handleClearSelection = () => {
    setSelectedNode(null);
    setSelectedLink(null);
  };

  return (
    <div className="w-full h-screen">
      <ResizablePanelGroup direction="horizontal">
        {/* Main graph + details panel */}
        <ResizablePanel defaultSize={pdfPanelOpen ? 65 : 100} minSize={40}>
          <KnowledgeGraph
            libraryData={library?.data}
            selectedNode={selectedNode}
            hoveredNode={hoveredNode}
            selectedLink={selectedLink}
            hoveredLink={hoveredLink}
            onNodeSelect={setSelectedNode}
            onNodeHover={setHoveredNode}
            onLinkSelect={setSelectedLink}
            onLinkHover={setHoveredLink}
            onClearSelection={handleClearSelection}
            onPaperClick={handlePaperClick}
            onViewSource={handleViewSource}
          />
        </ResizablePanel>

        {/* PDF Panel - only rendered when open */}
        {pdfPanelOpen && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={35} minSize={20}>
              <div className="h-full flex flex-col bg-white border-l border-gray-200">
                {/* Header */}
                <div className="p-3 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">Source Document</h3>
                  <button
                    onClick={() => setPdfPanelOpen(false)}
                    className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {/* PDF Viewer */}
                <div className="flex-1 min-h-0">
                  <PdfViewer
                    pdfUrl="/original.pdf"
                    bboxes={teiBboxes}
                    highlightedId={highlightedBboxId}
                    onBboxClick={(id) => setHighlightedBboxId(id)}
                  />
                </div>
              </div>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
};

export default KnowledgeGraphView;
