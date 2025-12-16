// Graph node types
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
  // Force graph positioning (added by react-force-graph)
  x?: number;
  y?: number;
}

export interface Link {
  source: string | Node;
  target: string | Node;
  linkType: string;
  linkCategory: string;
  reasoning: string;
  strength: number | null;
}

export interface GraphData {
  nodes: Node[];
  links: Link[];
}

// Selection state
export interface SelectionState {
  selectedNode: Node | null;
  hoveredNode: Node | null;
  selectedLink: Link | null;
  hoveredLink: Link | null;
}

// Paper type (display)
export interface Paper {
  id: string;
  title: string | null;
  filename: string;
  abstract: string | null;
  authors: string[];
  year: string | null;
  journal: string | null;
  doi: string | null;
}

// Method type (display)
export interface Method {
  id: string;
  paper_id: string;
  type: "method";
  content: {
    method_summary?: string;
    novel_method?: boolean;
  };
}

// Evidence types for claim details
export interface EvidenceItem {
  node: Node;
  linkType: string;
  reasoning: string;
}

export interface EvidenceData {
  counts: {
    supports: number;
    contradicts: number;
    contextualizes: number;
    total: number;
  };
  grouped: Map<string, Map<string, EvidenceItem[]>>;
  methodCount: number;
  methodPaperCount: number;
  methodPaperIds: Set<string>;
}

// Variant type for claim details
export interface VariantItem {
  node: Node;
  reasoning: string;
}

// Filter state for graph visualization
export interface GraphFilterState {
  showClaims: boolean;
  showObservations: boolean;
  showPremiseLinks: boolean;
  showVariantLinks: boolean;
  showClaimContradictsLinks: boolean;
  showSupportsLinks: boolean;
  showContradictsLinks: boolean;
  showContextualizesLinks: boolean;
  highlightContradictions: boolean;
  showEvidenceForClaimId: string | null;
}

// Graph counts for filter panel
export interface GraphCounts {
  claims: number;
  observations: number;
  premiseLinks: number;
  variantLinks: number;
  claimContradictsLinks: number;
  supportsLinks: number;
  contradictsLinks: number;
  contextualizesLinks: number;
}

// Source panel state
export interface SourceState {
  paperId: string | null;
  elementIds: string[];
  highlightedElementId: string | null;
}
