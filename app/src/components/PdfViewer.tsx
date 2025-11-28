import '@/lib/pdfSetup';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Document, Page } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

export interface BBox {
  id: string;
  page: number; // 1-indexed
  x: number;    // PDF points from left
  y: number;    // PDF points from top (we'll handle bottom-origin conversion)
  width: number;
  height: number;
}

interface PdfViewerProps {
  pdfUrl: string;
  bboxes?: BBox[];
  highlightedId?: string | null;
  onBboxClick?: (id: string) => void;
}

export default function PdfViewer({ pdfUrl, bboxes = [], highlightedId, onBboxClick }: PdfViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [pageDimensions, setPageDimensions] = useState<Map<number, { width: number; height: number }>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Measure container width
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth - 16);
      }
    };
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  }, []);

  const onPageLoadSuccess = useCallback((page: any) => {
    const vp = page.getViewport({ scale: 1 });
    setPageDimensions(prev => new Map(prev).set(page.pageNumber, { width: vp.width, height: vp.height }));
  }, []);

  // Auto-scroll to highlighted bbox when it changes or when the page loads
  useEffect(() => {
    if (!highlightedId || !containerRef.current) return;

    const highlightedBbox = bboxes.find(b => b.id === highlightedId);
    if (!highlightedBbox) return;

    // Wait for the page to render
    const targetPage = highlightedBbox.page;
    const dims = pageDimensions.get(targetPage);
    if (!dims || !containerWidth) return;

    // Find the page element and scroll to it
    const pageEl = containerRef.current.querySelector(`[data-page="${targetPage}"]`);
    if (!pageEl) return;

    // Calculate the bbox position within the page
    const scale = (containerWidth - 16) / dims.width;
    const bboxTop = highlightedBbox.y * scale;

    // Scroll the page into view, then adjust for the bbox position
    requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;

      const pageRect = (pageEl as HTMLElement).offsetTop;
      const scrollTarget = pageRect + bboxTop - container.clientHeight / 3;

      container.scrollTo({
        top: Math.max(0, scrollTarget),
        behavior: 'smooth',
      });
    });
  }, [highlightedId, bboxes, pageDimensions, containerWidth]);

  const pageWidth = containerWidth > 0 ? containerWidth : undefined;

  return (
    <div ref={containerRef} className="h-full overflow-y-auto bg-gray-100 p-2">
      <Document
        file={pdfUrl}
        onLoadSuccess={onDocumentLoadSuccess}
        loading={<div className="text-center p-4">Loading PDF...</div>}
        error={<div className="text-center p-4 text-red-600">Failed to load PDF</div>}
      >
        {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNumber => {
          const dims = pageDimensions.get(pageNumber);
          const pageBoxes = bboxes.filter(b => b.page === pageNumber);

          return (
            <div key={pageNumber} className="relative mb-4 bg-white shadow" data-page={pageNumber}>
              <Page
                pageNumber={pageNumber}
                width={pageWidth}
                onLoadSuccess={onPageLoadSuccess}
                renderTextLayer
                renderAnnotationLayer
              />
              {dims && pageWidth && pageBoxes.map(bbox => {
                const scale = pageWidth / dims.width;
                // Assuming y is from top (if from bottom, use: dims.height - bbox.y - bbox.height)
                const style = {
                  left: bbox.x * scale,
                  top: bbox.y * scale,
                  width: bbox.width * scale,
                  height: bbox.height * scale,
                };
                const isHighlighted = bbox.id === highlightedId;

                return (
                  <div
                    key={bbox.id}
                    className={`absolute border-2 cursor-pointer transition-colors ${
                      isHighlighted
                        ? 'border-yellow-500 bg-yellow-200/30'
                        : 'border-blue-400 bg-blue-200/20 hover:bg-blue-200/40'
                    }`}
                    style={style}
                    onClick={() => onBboxClick?.(bbox.id)}
                  />
                );
              })}
            </div>
          );
        })}
      </Document>
    </div>
  );
}
