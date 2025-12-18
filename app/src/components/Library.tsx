import { useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useLibrary } from "@/hooks/useLibrary";
import { useGraphData } from "@/hooks/useGraphData";
import { useSourceLoader } from "@/hooks/useSourceLoader";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { GraphPanel } from "./GraphPanel";
import { ElementPanel } from "./ElementPanel";
import { SourcePanel } from "./SourcePanel";
import Metadata from "./Metadata";
import type { Node, Link as GraphLink } from "@/types/graph";

export default function Library() {
  const { libraryId } = useParams<{ libraryId: string }>();
  const { data: library } = useLibrary(libraryId);

  // Transform library data to graph data
  const { graphData, papersMap, methodsMap } = useGraphData(library?.data);

  // Source loader for PDF viewing
  const {
    loading: sourceLoading,
    bboxes,
    currentPaperId,
    highlightedBboxId,
    setHighlightedBboxId,
    loadSourceForPaper,
    clearSource,
  } = useSourceLoader();

  // Selection state
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [selectedLink, setSelectedLink] = useState<GraphLink | null>(null);
  const [hoveredLink, setHoveredLink] = useState<GraphLink | null>(null);

  // Filter state shared between GraphPanel and ElementPanel
  const [showObservations, setShowObservations] = useState(false);
  const [showEvidenceForClaimId, setShowEvidenceForClaimId] = useState<
    string | null
  >(null);

  // Handle "View Source" click
  const handleViewSource = useCallback(
    (nodeId: string) => {
      if (!library?.data) return;

      const allNodes = [
        ...(library.data.extracts.claims || []),
        ...(library.data.extracts.observations || []),
      ];
      const extract = allNodes.find((e) => e.id === nodeId);

      if (!extract) {
        console.warn(`Could not find extract with id: ${nodeId}`);
        return;
      }

      const elementIds =
        extract.content.source_elements?.map((s) => s.source_element_id) || [];
      if (elementIds.length === 0) {
        console.warn("No source elements for this extract");
        return;
      }

      // If same paper is already loaded, just update the highlight
      if (extract.paper_id === currentPaperId) {
        setHighlightedBboxId(`${elementIds[0]}-0`);
        return;
      }

      // Different paper - load all bboxes for the new paper
      loadSourceForPaper(extract.paper_id, elementIds[0]);
    },
    [library?.data, currentPaperId, setHighlightedBboxId, loadSourceForPaper]
  );

  // Clear all selection
  const handleClearSelection = useCallback(() => {
    setSelectedNode(null);
    setSelectedLink(null);
    setShowEvidenceForClaimId(null);
  }, []);

  // Close source panel
  const handleCloseSource = useCallback(() => {
    clearSource();
  }, [clearSource]);

  const processing = library?.processing;
  const sourcePanelOpen = currentPaperId !== null;

  return (
    <div className="w-full h-screen">
      <Metadata libraryId={libraryId} processing={processing} />

      {/* Main Layout */}
      <ResizablePanelGroup direction="horizontal">
        {/* Graph Panel */}
        <ResizablePanel defaultSize={sourcePanelOpen ? 45 : 65} minSize={30}>
          <GraphPanel
            graphData={graphData}
            selectedNode={selectedNode}
            selectedLink={selectedLink}
            hoveredLink={hoveredLink}
            showEvidenceForClaimId={showEvidenceForClaimId}
            showObservations={showObservations}
            onNodeSelect={setSelectedNode}
            onNodeHover={setHoveredNode}
            onLinkSelect={setSelectedLink}
            onLinkHover={setHoveredLink}
            onClearSelection={handleClearSelection}
            onToggleEvidence={setShowEvidenceForClaimId}
            onToggleObservations={setShowObservations}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Element Panel */}
        <ResizablePanel defaultSize={sourcePanelOpen ? 25 : 35} minSize={15}>
          <ElementPanel
            selectedNode={selectedNode}
            hoveredNode={hoveredNode}
            selectedLink={selectedLink}
            hoveredLink={hoveredLink}
            graphData={graphData}
            papersMap={papersMap}
            methodsMap={methodsMap}
            showObservations={showObservations}
            showEvidenceForClaimId={showEvidenceForClaimId}
            onClearSelection={handleClearSelection}
            onViewSource={handleViewSource}
            onNodeSelect={setSelectedNode}
            onToggleEvidence={setShowEvidenceForClaimId}
          />
        </ResizablePanel>

        {/* Source Panel - only shown when viewing source */}
        {sourcePanelOpen && currentPaperId && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={30} minSize={20}>
              <SourcePanel
                paperId={currentPaperId}
                paper={papersMap.get(currentPaperId)}
                bboxes={bboxes}
                highlightedBboxId={highlightedBboxId}
                loading={sourceLoading}
                onBboxClick={setHighlightedBboxId}
                onClose={handleCloseSource}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}
