import * as React from "react";
import { useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useLibrary, type LibraryPaper } from "@/hooks/useLibrary";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { KnowledgeGraph } from "./KnowledgeGraph";
import PdfViewer, { type BBox } from "@/components/PdfViewer";
import PaperUploader from "./PaperUploader";
import { Link } from "react-router-dom";

// Supabase storage URL for public bucket access
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const STORAGE_BUCKET = "papers";

function getPdfUrl(paperId: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${paperId}/original.pdf`;
}

function getTeiUrl(paperId: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${paperId}/parsed.tei`;
}

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

// Parse TEI XML and extract bboxes for specific element IDs
// Each element can have multiple line segments, so we create one bbox per segment
function parseTeiForElements(teiXml: string, elementIds: string[]): BBox[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(teiXml, "text/xml");
  const bboxes: BBox[] = [];
  const elementIdSet = new Set(elementIds);

  // Find elements with xml:id matching our target IDs
  const allElements = doc.querySelectorAll("[*|id]");
  allElements.forEach((el) => {
    const xmlId = el.getAttributeNS("http://www.w3.org/XML/1998/namespace", "id") || el.getAttribute("xml:id");
    if (!xmlId || !elementIdSet.has(xmlId)) return;

    const coordsAttr = el.getAttribute("coords");
    if (!coordsAttr) return;

    // coords can have multiple segments separated by ";" (one per line of text)
    // Create a bbox for each segment
    const segments = coordsAttr.split(";");
    segments.forEach((segment, index) => {
      const parts = segment.split(",").map(Number);
      if (parts.length >= 5) {
        const [page, x, y, width, height] = parts;
        bboxes.push({
          id: `${xmlId}-${index}`, // Unique ID per segment
          page,
          x,
          y,
          width,
          height,
        });
      }
    });
  });

  return bboxes;
}

export const KnowledgeGraphView: React.FC = () => {
  const { libraryId } = useParams<{ libraryId: string }>();
  const { data: library } = useLibrary(libraryId);

  // Add papers dialog state
  const [addPapersOpen, setAddPapersOpen] = useState(false);

  // PDF viewer state
  const [pdfPanelOpen, setPdfPanelOpen] = useState(false);
  const [currentPaperId, setCurrentPaperId] = useState<string | null>(null);
  const [teiBboxes, setTeiBboxes] = useState<BBox[]>([]);
  const [highlightedBboxId, setHighlightedBboxId] = useState<string | null>(null);
  const [loadingSource, setLoadingSource] = useState(false);

  // Selection state lifted to wrapper
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [selectedLink, setSelectedLink] = useState<Link | null>(null);
  const [hoveredLink, setHoveredLink] = useState<Link | null>(null);

  // Build a map of papers for quick lookup
  const papersMap = React.useMemo(() => {
    const map = new Map<string, LibraryPaper>();
    library?.data.papers.forEach((p) => map.set(p.id, p));
    return map;
  }, [library?.data.papers]);

  // Load TEI and extract bboxes for specific element IDs
  const loadSourceForElements = useCallback(async (paperId: string, elementIds: string[], highlightElementId?: string) => {
    setLoadingSource(true);
    try {
      const teiUrl = getTeiUrl(paperId);
      const res = await fetch(teiUrl);
      if (!res.ok) throw new Error(`Failed to fetch TEI: ${res.statusText}`);

      const teiXml = await res.text();
      const bboxes = parseTeiForElements(teiXml, elementIds);

      setCurrentPaperId(paperId);
      setTeiBboxes(bboxes);
      setHighlightedBboxId(highlightElementId || (bboxes.length > 0 ? bboxes[0].id : null));
      setPdfPanelOpen(true);

      console.log(`Loaded ${bboxes.length} bboxes for elements: ${elementIds.join(", ")}`);
    } catch (err) {
      console.error("Failed to load source:", err);
    } finally {
      setLoadingSource(false);
    }
  }, []);

  // Handle "View Source" click from paper citation - show all source elements for that paper
  const handlePaperClick = useCallback((paperId: string) => {
    const activeNode = selectedNode || hoveredNode;
    if (!activeNode) return;

    // Get source element IDs that belong to this paper
    // For now, show all source elements for the node (they should all be from this paper for single-paper nodes)
    const elementIds = activeNode.sourceElementIds;
    if (elementIds.length === 0) {
      console.warn("No source elements for this node");
      return;
    }

    loadSourceForElements(paperId, elementIds, elementIds[0]);
  }, [selectedNode, hoveredNode, loadSourceForElements]);

  // Handle "View Source" click from observation evidence - show that specific observation's source
  const handleViewSource = useCallback((nodeId: string) => {
    // Find the node in the graph data
    const allNodes = [...(library?.data.extracts.claims || []), ...(library?.data.extracts.observations || [])];
    const extract = allNodes.find((e) => e.id === nodeId);

    if (!extract) {
      console.warn(`Could not find extract with id: ${nodeId}`);
      return;
    }

    const elementIds = extract.content.source_elements?.map((s) => s.source_element_id) || [];
    if (elementIds.length === 0) {
      console.warn("No source elements for this extract");
      return;
    }

    loadSourceForElements(extract.paper_id, elementIds, elementIds[0]);
  }, [library?.data.extracts, loadSourceForElements]);

  const handleClearSelection = () => {
    setSelectedNode(null);
    setSelectedLink(null);
  };

  const processing = library?.processing;

  return (
    <div className="w-full h-screen">
      <div className="fixed z-50 flex items-center gap-3">
        <Link to={`/`}>
          <div className="uppercase p-2 text-black font-semibold">Modular</div>
        </Link>
        <Dialog open={addPapersOpen} onOpenChange={setAddPapersOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add Papers
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add papers to library</DialogTitle>
            </DialogHeader>
            {libraryId && (
              <PaperUploader
                mode="add-to-library"
                libraryId={libraryId}
                onSuccess={() => setAddPapersOpen(false)}
              />
            )}
          </DialogContent>
        </Dialog>
        {processing && processing.papers_processing > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-full text-sm text-blue-700">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>{processing.papers_processing} paper{processing.papers_processing > 1 ? 's' : ''} processing...</span>
          </div>
        )}
        {processing?.library_linking && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-full text-sm text-purple-700">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Identifying links...</span>
            </div>
          </div>
        )}
        {processing?.library_linking && <p className="text-xs text-gray-600">This might take a few minutes</p>}
      </div>
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
        {pdfPanelOpen && currentPaperId && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={35} minSize={20}>
              <div className="h-full flex flex-col bg-white border-l border-gray-200">
                {/* Header */}
                <div className="p-3 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex flex-col">
                    <h3 className="text-xs text-gray-500">Source paper</h3>
                    {papersMap.get(currentPaperId)?.title && (
                      <p className="text-sm font-semibold text-gray-900">
                        {papersMap.get(currentPaperId)?.title}
                      </p>
                    )}
                    {papersMap.get(currentPaperId)?.authors && (
                      <p className="text-xs text-gray-500">
                        {papersMap.get(currentPaperId)?.authors[0]} et al. ({papersMap.get(currentPaperId)?.year})
                      </p>
                    )}
                  </div>
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
                  {loadingSource ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="flex items-center gap-2 text-gray-500">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span>Loading source...</span>
                      </div>
                    </div>
                  ) : (
                    <PdfViewer
                      pdfUrl={getPdfUrl(currentPaperId)}
                      bboxes={teiBboxes}
                      highlightedId={highlightedBboxId}
                      onBboxClick={(id) => setHighlightedBboxId(id)}
                    />
                  )}
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
