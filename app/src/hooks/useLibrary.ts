import { useQuery } from "@tanstack/react-query";
import type { LinkCategory, LinkType } from "@/types/graph";

const API_URL = import.meta.env.VITE_API_URL;

// Types matching the API response
export interface LibraryPaper {
  id: string;
  title: string | null;
  filename: string;
  storage_path: string;
  abstract: string | null;
  authors: string[];
  year: string | null;
  journal: string | null;
  doi: string | null;
  added_at: string | null;
}

export interface SourceElement {
  source_element_id: string;
}

export interface Extract {
  id: string;
  paper_id: string;
  job_id: string | null;
  type: string;
  content: {
    rephrased_claim?: string;
    reasoning?: string;
    source_elements?: SourceElement[];
    observation_summary?: string;
    observation_type?: string;
    method_reference?: string;
    method_summary?: string;
    novel_method?: boolean;
  };
  created_at: string | null;
}

export interface ExtractLink {
  id: string;
  from_id: string;
  to_id: string;
  content: {
    link_type: LinkType | "duplicate";
    link_category: LinkCategory;
    reasoning: string;
    strength: number | null;
  };
  job_id: string | null;
  created_at: string | null;
}

export interface ExtractsByType {
  claims: Extract[];
  observations: Extract[];
  methods: Extract[];
}

export interface LibraryStats {
  total_papers: number;
  total_extracts: number;
  total_links: number;
}

export interface ProcessingStatus {
  papers_processing: number;
  library_linking: boolean;
}

export interface LibraryMetadata {
  id: string;
  owner_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
  stats: LibraryStats;
}

export interface LibraryData {
  papers: LibraryPaper[];
  extracts: ExtractsByType;
  links: ExtractLink[];
}

export interface LibraryFullResponse {
  status: string;
  message: string;
  metadata: LibraryMetadata;
  data: LibraryData;
  processing: ProcessingStatus;
}

async function fetchLibrary(libraryId: string): Promise<LibraryFullResponse> {
  const response = await fetch(`${API_URL}/library/${libraryId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch library: ${response.statusText}`);
  }
  return response.json();
}

export function useLibrary(libraryId: string | undefined) {
  return useQuery({
    queryKey: ["library", libraryId],
    queryFn: () => fetchLibrary(libraryId!),
    enabled: !!libraryId,
    refetchInterval: (query) => {
      // Poll every 5 seconds while processing is ongoing
      const data = query.state.data;
      if (!data) {
        return 5000;
      }
      const { processing } = data;
      if (processing.library_linking || processing.papers_processing > 0) {
        return 5000;
      }
      // Stop polling once library linking is done and no papers are processing
      return false;
    },
  });
}
