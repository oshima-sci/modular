import type { NodeObject, LinkObject } from "react-force-graph-2d";

// Base node data (without force-graph positioning)
export interface NodeData {
  id: string;
  type: "claim" | "observation";
  displayText: string;
  rawContent: Record<string, unknown>;
  paperIds: string[];
  sourceElementIds: string[];
  observationType?: string;
  methodReference?: string;
  mergedNodeIds?: string[];
  isMerged?: boolean;
}

// Base link data (without force-graph source/target objects)
export interface LinkData {
  linkType: string;
  linkCategory: string;
  reasoning: string;
  strength: number | null;
}

// Force-graph enhanced types
export type Node = NodeObject<NodeData>;
export type Link = LinkObject<NodeData, LinkData>;

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
